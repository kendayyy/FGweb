import {cryptoSchemaAvailable} from './crypto-schema-readiness.js';
import {Injectable,OnModuleInit,OnModuleDestroy,ConflictException,HttpException,Logger,ServiceUnavailableException} from '@nestjs/common';
import {Pool,PoolClient} from 'pg';
import {randomUUID,createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {CryptoProtocolWakeSignalSchema,SocketCryptoSyncAvailableSchema,type CryptoProtocolWakeSignal} from '@fg/contracts';
import {CryptoConversationStateSchema,QueryCryptoKeysSchema,ClaimCryptoKeysSchema,CryptoKeysResponseSchema,CryptoClaimResponseSchema,CryptoDeviceSchema,SendCryptoVerificationSchema,SendCryptoToDeviceSchema,CryptoSyncQuerySchema,CryptoSyncResponseSchema,AckCryptoEventsSchema,SendEncryptedMessageSchema,EncryptedMessageSchema,EncryptedUploadRequestSchema,LegacyEncryptedUploadRequestSchema,EncryptedAttachmentSchema,IMAGE_DRAFT_TTL_MS,ErrorCode,DMNotificationDataSchema,MentionNotificationDataSchema} from '@fg/contracts';
import {ChatService,ChatActor,chatError} from '../chat/chat.service.js';
import {matrixUserId,matrixRoomId,matrixBase64,canonicalSignedPayload} from './matrix-signatures.js';
import {CryptoObjectStore,lockCryptoObjectWrite} from './crypto-object-store.js';
import {CryptoSweepLoop} from './crypto-sweep-loop.js';
import {ensurePrivateCryptoState} from './crypto-membership.js';
type DbRow=Record<string,unknown>;
type QueueRow=DbRow&{created_at:Date};
@Injectable()
export class CryptoRelayService implements OnModuleInit,OnModuleDestroy{
 private schemaReady=false;private pool!:Pool;
 private cleanupActive?:Promise<void>;
 private readonly objects=new CryptoObjectStore();
 private readonly logger=new Logger(CryptoRelayService.name);
 private readonly sweeps=new CryptoSweepLoop(()=>this.cleanup(),()=>this.logger.warn('Encrypted cleanup unavailable; retained for retry'));
 constructor(private readonly chat:ChatService){}
 async onModuleInit(){
  this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:8,connectionTimeoutMillis:5000,statement_timeout:10000});
  this.schemaReady=await cryptoSchemaAvailable(this.pool);if(this.schemaReady){await this.objects.initialize();this.sweeps.start();}
 }
 async onModuleDestroy(){await this.sweeps.stop();await this.cleanupActive?.catch(()=>{});try{await this.objects.closeScan();}finally{await this.pool?.end();}}
 /** Bounded sweep; the row lock serializes with message attachment claims.
  * Remove bytes before metadata. If commit fails, ENOENT makes retry safe.
  * Consumed messages/reports and their session tombstones are never swept.
  * Prepared candidate images retain bytes before any metadata/FK deletion.
  * Protocol queues keep even acknowledged rows until expiry for retry dedup.
  * Each queue deletes at most 100 unlocked expired rows per transaction. */
 async cleanup(){
  if(!this.schemaReady)return;
  if(this.cleanupActive)return this.cleanupActive;
  const active=this.sweep();this.cleanupActive=active;
  try{await active;}finally{if(this.cleanupActive===active)this.cleanupActive=undefined;}
 }
 private async sweep(){
  const db=await this.pool.connect();
  try{
   // Reference lookup after a released writer lock must observe its new commit.
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
   const rows=(await db.query(`SELECT id,object_key FROM chat_crypto_upload_drafts WHERE consumed_at IS NULL AND message_id IS NULL AND report_evidence_id IS NULL AND NOT EXISTS(SELECT 1 FROM chat_crypto_legacy_candidate_images ci WHERE ci.draft_id=chat_crypto_upload_drafts.id) AND expires_at<=now() ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED`)).rows;
   for(const row of rows){await this.objects.remove(row.object_key);await db.query(`DELETE FROM chat_crypto_upload_drafts WHERE id=$1`,[row.id]);}
   for(const table of ['chat_crypto_to_device_events','chat_crypto_protocol_events']){
    await db.query(`DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE expires_at<=now() ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED)`);
   }
   // The lock precedes reference lookup, so uncommitted writers cannot lose bytes.
   for(const key of await this.objects.scanCandidates()){
    const lock=(await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended(json_build_array('fg_crypto_object',current_schema(),$1::text)::text,0::bigint)) AS acquired",[key])).rows[0];
    if(!lock.acquired)continue;
    if(!(await db.query('SELECT 1 FROM chat_crypto_upload_drafts WHERE object_key=$1 LIMIT 1',[key])).rowCount)await this.objects.remove(key);
   }
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 private parse<T>(schema:z.ZodType<T>,input:unknown):T{const result=schema.safeParse(input);if(!result.success)chatError(ErrorCode.INVALID_INPUT,'Invalid crypto request');return result.data;}
 private async transaction<T>(actor:ChatActor,action:(db:PoolClient,userId:string)=>Promise<T>){
  if(!actor)chatError(ErrorCode.LOGIN_REQUIRED,'Login required');if(!this.schemaReady)throw new ServiceUnavailableException('Chat crypto schema unavailable');const db=await this.pool.connect();let completed:unknown;
  try{await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');const session=await db.query(`SELECT id FROM "session" WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE`,[actor.sessionId,actor.userId]);if(!session.rowCount)chatError(ErrorCode.LOGIN_REQUIRED,'Session revoked');
   const ban=(await db.query(`SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1`,[actor.userId])).rows[0];if(ban?.action==='BAN')chatError(ErrorCode.FORBIDDEN,'Account banned');
   const result=await action(db,actor.userId);completed=result;
   // Epoch/device/IO waits can outlive the session or a newly committed ban.
   const current=(await db.query(`SELECT s.id,COALESCE((SELECT a.action='BAN' FROM admin_actions a WHERE a.target_user_id=s.user_id AND a.action IN ('BAN','UNBAN') ORDER BY a.created_at DESC,a.id DESC LIMIT 1),false) AS banned FROM "session" s WHERE s.id=$1 AND s.user_id=$2 AND s.expires_at>clock_timestamp() FOR SHARE OF s`,[actor.sessionId,actor.userId])).rows[0];
   if(!current)chatError(ErrorCode.LOGIN_REQUIRED,'Session expired or revoked');if(current.banned)chatError(ErrorCode.FORBIDDEN,'Account banned');
   await db.query('COMMIT');return result;
  }catch(error){if(Buffer.isBuffer(completed))completed.fill(0);await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 private async stateRow(db:PoolClient,actor:ChatActor,id:string,revision?:number){
  await this.chat.authorize(id,actor,db,true);
  const state=await ensurePrivateCryptoState(db,id);
  if(!state)chatError(ErrorCode.FORBIDDEN,'Conversation crypto migration required');
  if(state.mode!=='E2EE')chatError(ErrorCode.INVALID_INPUT,'Private crypto route requires private conversation');
  if(revision!==undefined&&Number(state.membership_revision)!==revision)throw new ConflictException('Membership revision changed');return state;
 }
 private async member(db:PoolClient,conversationId:string,userId:string){
  const row=(await db.query(`SELECT 1 FROM conversations c WHERE c.id=$1 AND (c.user1_id=$2 OR c.user2_id=$2 OR EXISTS(SELECT 1 FROM rooms r JOIN room_members rm ON rm.room_id=r.id WHERE r.conversation_id=c.id AND rm.user_id=$2) OR (NOT EXISTS(SELECT 1 FROM rooms r WHERE r.conversation_id=c.id) AND EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.user_id=$2))) AND NOT COALESCE((SELECT a.action='BAN' FROM admin_actions a WHERE a.target_user_id=$2 AND a.action IN ('BAN','UNBAN') ORDER BY a.created_at DESC,a.id DESC LIMIT 1),false)`,[conversationId,userId])).rows[0];
  if(!row)chatError(ErrorCode.FORBIDDEN,'Recipient is not an eligible member');
 }
 // Conversation state is the epoch serialization boundary. Taking a device
 // row lock after it would invert revoke's device -> state lock order.
 // A read of an uncommitted revocation linearizes before its epoch commit;
 // requests after that commit see either the new revision or the tombstone.
 private async device(db:PoolClient,userId:string,deviceId:string){const row=(await db.query(`SELECT * FROM chat_crypto_devices WHERE user_id=$1 AND device_id=$2`,[userId,deviceId])).rows[0];if(!row||row.revoked_at)chatError(ErrorCode.FORBIDDEN,'Device unavailable');return row;}
 private deviceDto(row:DbRow){return CryptoDeviceSchema.parse({deviceId:row.device_id,deviceKeys:row.device_keys,createdAt:(row.created_at as Date).toISOString(),revokedAt:null});}
 private async protocolCohort(db:PoolClient,actor:ChatActor,id:string,state:DbRow,cohortId?:string){
  if(state.migration_state==='RECONCILED'){if(cohortId!==undefined)chatError(ErrorCode.FORBIDDEN,'Migration protocol closed');return null;}
  if(!actor||!cohortId||state.history_status!=='KNOWN'||!['LEGACY_PENDING','MIGRATING'].includes(String(state.migration_state)))chatError(ErrorCode.FORBIDDEN,'Historical protocol context required');
  const eligible=(await db.query(`SELECT h.id FROM chat_crypto_history_cohorts h JOIN chat_crypto_cohort_members m ON m.cohort_id=h.id AND m.conversation_id=h.conversation_id WHERE h.id=$1 AND h.conversation_id=$2 AND m.user_id=$3 AND h.verified_at<=clock_timestamp() AND EXISTS(SELECT 1 FROM chat_crypto_legacy_migrations lm WHERE lm.cohort_id=h.id AND lm.conversation_id=h.conversation_id AND lm.state='PREPARED') FOR SHARE OF h,m`,[cohortId,id,actor.userId])).rowCount;
  if(!eligible)chatError(ErrorCode.FORBIDDEN,'Historical protocol access denied');return cohortId;
 }
 private async protocolMember(db:PoolClient,id:string,userId:string,cohortId:string|null){
  await this.member(db,id,userId);if(cohortId&&!((await db.query('SELECT 1 FROM chat_crypto_cohort_members WHERE cohort_id=$1 AND conversation_id=$2 AND user_id=$3 FOR SHARE',[cohortId,id,userId])).rowCount))chatError(ErrorCode.FORBIDDEN,'Historical recipient denied');
 }
 private async protocolDevice(db:PoolClient,userId:string,deviceId:string,cohortId:string|null){
  const device=await this.device(db,userId,deviceId);if(cohortId&&!((await db.query('SELECT 1 FROM chat_crypto_devices d JOIN chat_crypto_history_cohorts h ON h.id=$3 WHERE d.user_id=$1 AND d.device_id=$2 AND d.created_at<=h.verified_at AND d.revoked_at IS NULL',[userId,deviceId,cohortId])).rowCount))chatError(ErrorCode.FORBIDDEN,'Historical device denied');return device;
 }
 async state(actor:ChatActor,id:string){return this.transaction(actor,async(db,userId)=>{
  const state=await this.stateRow(db,actor,id),devices=(await db.query(`SELECT device_id FROM chat_crypto_devices WHERE user_id=$1 AND revoked_at IS NULL ORDER BY device_id`,[userId])).rows;
  return CryptoConversationStateSchema.parse({conversationId:id,matrixRoomId:matrixRoomId(id),matrixUserId:matrixUserId(userId),mode:state.mode,membershipRevision:Number(state.membership_revision),migrationState:state.migration_state,historyStatus:state.history_status,eligibleDeviceIds:devices.map(d=>d.device_id)});
 });}
 async queryKeys(actor:ChatActor,input:unknown){const parsed=this.parse(QueryCryptoKeysSchema,input);return this.transaction(actor,async(db)=>{
  const state=await this.stateRow(db,actor,parsed.conversationId,parsed.membershipRevision),cohortId=await this.protocolCohort(db,actor,parsed.conversationId,state,parsed.cohortId);const users=[];
  for(const userId of [...new Set(parsed.userIds)].sort()){
   await this.protocolMember(db,parsed.conversationId,userId,cohortId);
   const devices=(await db.query(`SELECT d.* FROM chat_crypto_devices d WHERE d.user_id=$1 AND d.revoked_at IS NULL AND ($2::text IS NULL OR EXISTS(SELECT 1 FROM chat_crypto_history_cohorts h WHERE h.id=$2 AND d.created_at<=h.verified_at)) ORDER BY d.device_id LIMIT 100`,[userId,cohortId])).rows;
   const identity=(await db.query(`SELECT public_keys FROM chat_crypto_identity_keys WHERE user_id=$1`,[userId])).rows[0];
   users.push({userId,matrixUserId:matrixUserId(userId),devices:devices.map(d=>this.deviceDto(d)),identityKeys:identity?.public_keys??null});
  }
  await this.chat.authorize(parsed.conversationId,actor,db,true);await this.protocolCohort(db,actor,parsed.conversationId,state,parsed.cohortId);for(const user of users)await this.protocolMember(db,parsed.conversationId,user.userId,cohortId);
  return CryptoKeysResponseSchema.parse({membershipRevision:parsed.membershipRevision,users});
 });}
 async claimKeys(actor:ChatActor,input:unknown){const parsed=this.parse(ClaimCryptoKeysSchema,input);return this.transaction(actor,async(db,userId)=>{
  const state=await this.stateRow(db,actor,parsed.conversationId,parsed.membershipRevision),cohortId=await this.protocolCohort(db,actor,parsed.conversationId,state,parsed.cohortId);await this.protocolDevice(db,userId,parsed.deviceId,cohortId);
  const unique=new Set(parsed.targets.map(t=>JSON.stringify([t.userId,t.deviceId])));if(unique.size!==parsed.targets.length)chatError(ErrorCode.INVALID_INPUT,'Duplicate prekey target');
  const keys=[];
  for(const target of [...parsed.targets].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))){
   await this.protocolMember(db,parsed.conversationId,target.userId,cohortId);await this.protocolDevice(db,target.userId,target.deviceId,cohortId);
   const key=(await db.query(`SELECT key_id,signed_key FROM chat_crypto_one_time_keys WHERE user_id=$1 AND device_id=$2 AND claimed_at IS NULL ORDER BY created_at,key_id LIMIT 1 FOR UPDATE SKIP LOCKED`,[target.userId,target.deviceId])).rows[0];
   if(!key)throw new ConflictException('Device has no available signed prekeys');
   await db.query(`UPDATE chat_crypto_one_time_keys SET claimed_at=now() WHERE user_id=$1 AND device_id=$2 AND key_id=$3`,[target.userId,target.deviceId,key.key_id]);
   keys.push({...target,keyId:key.key_id,signedKey:key.signed_key});
  }
  await this.chat.authorize(parsed.conversationId,actor,db,true);await this.protocolCohort(db,actor,parsed.conversationId,state,parsed.cohortId);await this.protocolDevice(db,userId,parsed.deviceId,cohortId);for(const target of parsed.targets){await this.protocolMember(db,parsed.conversationId,target.userId,cohortId);await this.protocolDevice(db,target.userId,target.deviceId,cohortId);}
  return CryptoClaimResponseSchema.parse({membershipRevision:parsed.membershipRevision,keys});
 });}
 async verification(actor:ChatActor,input:unknown){const event=this.parse(SendCryptoVerificationSchema,input);return this.transaction(actor,async(db,userId)=>{
  const state=await this.stateRow(db,actor,event.conversationId,event.membershipRevision),cohortId=await this.protocolCohort(db,actor,event.conversationId,state,event.cohortId);await this.protocolDevice(db,userId,event.deviceId,cohortId);await this.protocolMember(db,event.conversationId,event.recipientUserId,cohortId);await this.protocolDevice(db,event.recipientUserId,event.recipientDeviceId,cohortId);
  const payload={eventType:event.eventType,content:event.content};
  const existing=(await db.query(`SELECT conversation_id,membership_revision,cohort_id,event FROM chat_crypto_protocol_events WHERE sender_user_id=$1 AND sender_device_id=$2 AND transaction_id=$3 AND recipient_user_id=$4 AND recipient_device_id=$5`,[userId,event.deviceId,event.transactionId,event.recipientUserId,event.recipientDeviceId])).rows[0];
  if(existing){if(existing.conversation_id!==event.conversationId||Number(existing.membership_revision)!==event.membershipRevision||existing.cohort_id!==cohortId||!this.sameJson(existing.event,payload))throw new ConflictException('Crypto transaction conflicts');}
  else{
   const id=randomUUID();await db.query(`INSERT INTO chat_crypto_protocol_events(id,conversation_id,membership_revision,sender_user_id,sender_device_id,recipient_user_id,recipient_device_id,transaction_id,event,expires_at,cohort_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '10 minutes',$10)`,[id,event.conversationId,event.membershipRevision,userId,event.deviceId,event.recipientUserId,event.recipientDeviceId,event.transactionId,payload,cohortId]);
   await db.query(`INSERT INTO chat_crypto_protocol_outbox(id,verification_event_id) VALUES($1,$2)`,[randomUUID(),id]);
  }
  await this.chat.authorize(event.conversationId,actor,db,true);await this.protocolCohort(db,actor,event.conversationId,state,event.cohortId);await this.protocolDevice(db,userId,event.deviceId,cohortId);await this.protocolMember(db,event.conversationId,event.recipientUserId,cohortId);await this.protocolDevice(db,event.recipientUserId,event.recipientDeviceId,cohortId);
  return {success:true as const};
 });}
 private sameJson(a:unknown,b:unknown):boolean{if(a===b)return true;if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>this.sameJson(v,b[i]));const x=a as DbRow,y=b as DbRow;return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.hasOwn(y,k)&&this.sameJson(x[k],y[k]));}
 async toDevice(actor:ChatActor,input:unknown){const parsed=this.parse(SendCryptoToDeviceSchema,input);return this.transaction(actor,async(db,userId)=>{
  const state=await this.stateRow(db,actor,parsed.conversationId,parsed.membershipRevision),cohortId=await this.protocolCohort(db,actor,parsed.conversationId,state,parsed.cohortId),sender=await this.protocolDevice(db,userId,parsed.deviceId,cohortId);
  for(const target of parsed.recipients){
   await this.protocolMember(db,parsed.conversationId,target.userId,cohortId);const recipient=await this.protocolDevice(db,target.userId,target.deviceId,cohortId);
   if(target.content.sender_key!==sender.curve25519_key||Object.keys(target.content.ciphertext).length!==1||!target.content.ciphertext[recipient.curve25519_key])chatError(ErrorCode.INVALID_INPUT,'Olm routing identity mismatch');
   const existing=(await db.query(`SELECT conversation_id,membership_revision,cohort_id,content FROM chat_crypto_to_device_events WHERE sender_user_id=$1 AND sender_device_id=$2 AND transaction_id=$3 AND recipient_user_id=$4 AND recipient_device_id=$5`,[userId,parsed.deviceId,parsed.transactionId,target.userId,target.deviceId])).rows[0];
   if(existing){if(existing.conversation_id!==parsed.conversationId||Number(existing.membership_revision)!==parsed.membershipRevision||existing.cohort_id!==cohortId||!this.sameJson(existing.content,target.content))throw new ConflictException('Crypto transaction conflicts');}
   else{
    const id=randomUUID();await db.query(`INSERT INTO chat_crypto_to_device_events(id,conversation_id,membership_revision,sender_user_id,sender_device_id,recipient_user_id,recipient_device_id,transaction_id,content,expires_at,cohort_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '1 day',$10)`,[id,parsed.conversationId,parsed.membershipRevision,userId,parsed.deviceId,target.userId,target.deviceId,parsed.transactionId,target.content,cohortId]);
    await db.query(`INSERT INTO chat_crypto_protocol_outbox(id,to_device_event_id) VALUES($1,$2)`,[randomUUID(),id]);
   }
  }
  await this.chat.authorize(parsed.conversationId,actor,db,true);await this.protocolCohort(db,actor,parsed.conversationId,state,parsed.cohortId);await this.protocolDevice(db,userId,parsed.deviceId,cohortId);for(const target of parsed.recipients){await this.protocolMember(db,parsed.conversationId,target.userId,cohortId);await this.protocolDevice(db,target.userId,target.deviceId,cohortId);}
  return {success:true as const};
 });}
 private cursor(userId:string,deviceId:string,kind:string,row?:DbRow){if(!row)return null;const data=Buffer.from(JSON.stringify([userId,deviceId,kind,row.cursor_time,row.id])).toString('base64url');return data+'.'+createHmac('sha256',process.env.BETTER_AUTH_SECRET!).update(data).digest('base64url');}
 private decodeCursor(cursor:string|undefined,userId:string,deviceId:string,kind:string){
  if(!cursor)return null;try{const [data,signature,...extra]=cursor.split('.');const expected=createHmac('sha256',process.env.BETTER_AUTH_SECRET!).update(data).digest(),supplied=Buffer.from(signature,'base64url');if(extra.length||supplied.length!==expected.length||!timingSafeEqual(expected,supplied))throw new Error();const [owner,device,type,time,id]=JSON.parse(Buffer.from(data,'base64url').toString());if(owner!==userId||device!==deviceId||type!==kind||typeof time!=='string'||!Number.isFinite(Date.parse(time))||typeof id!=='string')throw new Error();return {time,id};}catch{chatError(ErrorCode.INVALID_INPUT,'Invalid crypto cursor');}
 }
 private async readable(db:PoolClient,row:DbRow,state:DbRow|null|undefined,actor:ChatActor,allowAcknowledged=false){try{
  if(!actor||!state||row.recipient_user_id!==actor.userId||Number(state.membership_revision)!==Number(row.membership_revision))return false;
  const id=String(row.conversation_id),cohortId=await this.protocolCohort(db,actor,id,state,row.cohort_id===null||row.cohort_id===undefined?undefined:String(row.cohort_id));
  await this.protocolMember(db,id,String(row.sender_user_id),cohortId);await this.protocolDevice(db,String(row.sender_user_id),String(row.sender_device_id),cohortId);await this.protocolMember(db,id,actor.userId,cohortId);await this.protocolDevice(db,actor.userId,String(row.recipient_device_id),cohortId);
  const table=Object.hasOwn(row,'content')?'chat_crypto_to_device_events':'chat_crypto_protocol_events';return Boolean((await db.query(`SELECT 1 FROM ${table} WHERE id=$1 AND ($2::boolean OR acknowledged_at IS NULL) AND expires_at>clock_timestamp()`,[row.id,allowAcknowledged])).rowCount);
 }catch(error){if(error instanceof ConflictException||(typeof error==='object'&&error&&'getStatus'in error))return false;throw error;}}
 async sync(actor:ChatActor,input:unknown){const parsed=this.parse(CryptoSyncQuerySchema,input);return this.transaction(actor,async(db,userId)=>{
  await this.device(db,userId,parsed.deviceId);
  const read=async(kind:'encrypted'|'verification',cursor:string|undefined)=>{
   const after=this.decodeCursor(cursor,userId,parsed.deviceId,kind),table=kind==='encrypted'?'chat_crypto_to_device_events':'chat_crypto_protocol_events';
   const rows=(await db.query<QueueRow>(`SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM ${table} WHERE recipient_user_id=$1 AND recipient_device_id=$2 AND acknowledged_at IS NULL AND expires_at>now() ${after?'AND (created_at,id)>($4::timestamptz,$5::text)':''} ORDER BY created_at,id LIMIT $3`,after?[userId,parsed.deviceId,parsed.limit+1,after.time,after.id]:[userId,parsed.deviceId,parsed.limit+1])).rows;
   const selected=rows.slice(0,parsed.limit);
   return {selected,items:[] as QueueRow[],hasMore:rows.length>parsed.limit,cursor:this.cursor(userId,parsed.deviceId,kind,selected.at(-1))};
  };
  const encrypted=await read('encrypted',parsed.after),verification=await read('verification',parsed.verificationAfter);
  // Queue timestamps differ for each recipient. Acquire all conversation/epoch
  // locks in the database's canonical order before filtering either queue.
  // This also matches the device service's multi-conversation epoch ordering.
  const ids=[...new Set([...encrypted.selected,...verification.selected].map(row=>String(row.conversation_id)))];
  const ordered=(await db.query(`SELECT DISTINCT unnest($1::text[]) AS conversation_id ORDER BY conversation_id`,[ids])).rows;
  const states=new Map<string,DbRow|null>();
  for(const row of ordered){const id=String(row.conversation_id);try{states.set(id,await this.stateRow(db,actor,id));}catch(error){if(typeof error==='object'&&error&&'getStatus'in error)states.set(id,null);else throw error;}}
  await this.device(db,userId,parsed.deviceId);
  for(const page of [encrypted,verification])for(const row of page.selected)if(await this.readable(db,row,states.get(String(row.conversation_id)),actor))page.items.push(row);
  for(const id of new Set([...encrypted.items,...verification.items].map(row=>String(row.conversation_id))))await this.chat.authorize(id,actor,db,true);await this.device(db,userId,parsed.deviceId);if(!(await db.query('SELECT id FROM "session" WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE',[actor?.sessionId,userId])).rowCount)chatError(ErrorCode.LOGIN_REQUIRED,'Session expired or revoked');
  return CryptoSyncResponseSchema.parse({encrypted:{items:encrypted.items.map(r=>({id:r.id,conversationId:r.conversation_id,membershipRevision:Number(r.membership_revision),...(r.cohort_id?{cohortId:r.cohort_id}:{}),senderUserId:r.sender_user_id,senderDeviceId:r.sender_device_id,content:r.content,createdAt:r.created_at.toISOString()})),hasMore:encrypted.hasMore,nextCursor:encrypted.cursor},verification:verification.items.map(r=>({id:r.id,...(r.cohort_id?{cohortId:r.cohort_id}:{}),senderUserId:r.sender_user_id,senderDeviceId:r.sender_device_id,event:r.event,createdAt:r.created_at.toISOString()})),verificationCursor:verification.cursor});
 });}
 async acknowledge(actor:ChatActor,input:unknown){const parsed=this.parse(AckCryptoEventsSchema,input);return this.transaction(actor,async(db,userId)=>{
  await this.device(db,userId,parsed.deviceId);
  const query=`SELECT to_jsonb(e) AS event FROM chat_crypto_to_device_events e WHERE id=ANY($1::text[]) UNION ALL SELECT to_jsonb(e) AS event FROM chat_crypto_protocol_events e WHERE id=ANY($1::text[])`;
  const events=(await db.query(query,[parsed.eventIds])).rows.map(r=>r.event as DbRow);
  if(events.length!==new Set(parsed.eventIds).size||events.some(e=>e.recipient_user_id!==userId||e.recipient_device_id!==parsed.deviceId))chatError(ErrorCode.FORBIDDEN,'Event acknowledgement denied');
  const ids=[...new Set(events.map(row=>String(row.conversation_id)))],ordered=(await db.query(`SELECT DISTINCT unnest($1::text[]) AS conversation_id ORDER BY conversation_id`,[ids])).rows,states=new Map<string,DbRow>();
  for(const row of ordered)states.set(String(row.conversation_id),await this.stateRow(db,actor,String(row.conversation_id)));
  // Lock queues only after canonical conversation/epoch locks. JSON preserves
  // their distinct payload columns, so each check uses its authoritative queue.
  const locked:DbRow[]=[];
  for(const table of ['chat_crypto_to_device_events','chat_crypto_protocol_events'])locked.push(...(await db.query(`SELECT * FROM ${table} WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE`,[parsed.eventIds])).rows);
  if(locked.length!==events.length)chatError(ErrorCode.FORBIDDEN,'Event acknowledgement denied');
  for(const row of locked)if(row.recipient_user_id!==userId||row.recipient_device_id!==parsed.deviceId||!await this.readable(db,row,states.get(String(row.conversation_id)),actor,true))chatError(ErrorCode.FORBIDDEN,'Event acknowledgement denied');
  for(const table of ['chat_crypto_to_device_events','chat_crypto_protocol_events'])await db.query(`UPDATE ${table} SET acknowledged_at=COALESCE(acknowledged_at,clock_timestamp()) WHERE id=ANY($1::text[]) AND recipient_user_id=$2 AND recipient_device_id=$3`,[parsed.eventIds,userId,parsed.deviceId]);
  for(const row of locked)if(!await this.readable(db,row,states.get(String(row.conversation_id)),actor,true))chatError(ErrorCode.FORBIDDEN,'Event acknowledgement denied');
  for(const id of ids)await this.chat.authorize(id,actor,db,true);await this.device(db,userId,parsed.deviceId);if(!(await db.query('SELECT id FROM "session" WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE',[actor?.sessionId,userId])).rowCount)chatError(ErrorCode.LOGIN_REQUIRED,'Session expired or revoked');
  return {success:true as const};
 });}
 private async importedBinding(db:PoolClient,message:DbRow){
  const current=(await db.query(`SELECT 1 FROM messages WHERE id=$1 AND conversation_id=$2 AND encryption_mode='E2EE' AND content='' AND crypto_revision=$3 AND crypto_envelope=$4::jsonb AND sender_id=$5 AND client_message_id=$6 AND to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')=$7`,[message.id,message.conversation_id,message.crypto_revision,message.crypto_envelope,message.sender_id,message.client_message_id,message.created_iso])).rowCount;if(!current)throw new ConflictException('Imported source changed');
  const candidates=(await db.query(`SELECT c.*,ss.stage_id FROM chat_crypto_legacy_migrations lm JOIN chat_crypto_legacy_candidates c ON c.message_id=lm.message_id AND c.conversation_id=lm.conversation_id AND c.cohort_id=lm.cohort_id AND c.original_sha256=lm.original_sha256 JOIN chat_crypto_legacy_stage_sources ss ON ss.candidate_id=c.id AND ss.message_id=c.message_id AND ss.conversation_id=c.conversation_id AND ss.cohort_id=c.cohort_id AND ss.membership_revision=c.membership_revision AND ss.original_sha256=c.original_sha256 AND ss.envelope_sha256=c.envelope_sha256 JOIN chat_crypto_legacy_stages st ON st.id=ss.stage_id AND st.conversation_id=c.conversation_id AND st.membership_revision=c.membership_revision JOIN chat_crypto_state cs ON cs.conversation_id=c.conversation_id WHERE lm.message_id=$1 AND lm.state='RECONCILED' AND lm.reconciled_at IS NOT NULL AND st.phase='RECONCILED' AND cs.migration_state='RECONCILED' AND cs.membership_revision>=st.next_live_revision AND c.membership_revision=$2`,[message.id,message.crypto_revision])).rows;
  if(candidates.length!==1)throw new ConflictException('Imported history binding unavailable');const candidate=candidates[0];
  const session=(await db.query(`SELECT 1 FROM chat_crypto_outbound_sessions WHERE session_id=rtrim($1,'=') AND conversation_id=$2 AND sender_user_id=$3 AND sender_device_id=$4 AND membership_revision=$5`,[(message.crypto_envelope as {event:{session_id:string}}).event.session_id,message.conversation_id,candidate.importer_user_id,candidate.importer_device_id,candidate.membership_revision])).rowCount;
  let digest:string;try{digest=createHash('sha256').update(canonicalSignedPayload(candidate.envelope)).digest('base64').replace(/=+$/,'');}catch{throw new ConflictException('Imported envelope unavailable');}
  if(!session||message.content!==''||!this.sameJson(candidate.envelope,message.crypto_envelope)||digest!==candidate.envelope_sha256)throw new ConflictException('Imported history binding changed');
  const attachments=(await db.query(`SELECT * FROM attachments WHERE message_id=$1 ORDER BY id`,[message.id])).rows;
  const images=(await db.query(`SELECT ci.*,d.object_key,d.ciphertext_size,d.ciphertext_sha256 AS object_sha256,d.uploader_id,d.device_id,d.conversation_id,d.cohort_id,d.membership_revision,d.encryption_mode,d.envelope,d.message_id AS consumed_message_id,d.report_evidence_id,so.cleanup_state,so.plaintext_sha256 AS staged_plaintext_sha256,so.ciphertext_sha256 AS staged_ciphertext_sha256 FROM chat_crypto_legacy_candidate_images ci JOIN chat_crypto_upload_drafts d ON d.id=ci.draft_id JOIN chat_crypto_legacy_stage_objects so ON so.stage_id=$2 AND so.message_id=$3 AND so.candidate_id=ci.candidate_id AND so.attachment_id=ci.attachment_id AND so.draft_id=ci.draft_id WHERE ci.candidate_id=$1 ORDER BY ci.attachment_id`,[candidate.id,candidate.stage_id,message.id])).rows;
  const mappedCount=Number((await db.query('SELECT count(*) AS count FROM chat_crypto_legacy_candidate_images WHERE candidate_id=$1',[candidate.id])).rows[0].count);
  if(images.length!==mappedCount||images.length!==attachments.length||images.length>4||images.some((image,index)=>{const attachment=attachments[index];return image.attachment_id!==attachment.id||attachment.conversation_id!==message.conversation_id||attachment.encryption_mode!=='E2EE'||attachment.crypto_envelope||attachment.file_name!==''||attachment.mime_type!=='application/octet-stream'||attachment.file_size!==image.ciphertext_size||image.encryption_mode!=='E2EE'||image.envelope||image.report_evidence_id||(image.consumed_message_id!==null&&image.consumed_message_id!==message.id)||image.uploader_id!==candidate.importer_user_id||image.device_id!==candidate.importer_device_id||image.conversation_id!==candidate.conversation_id||image.cohort_id!==candidate.cohort_id||Number(image.membership_revision)!==Number(candidate.membership_revision)||image.object_sha256!==image.ciphertext_sha256||image.staged_ciphertext_sha256!==image.ciphertext_sha256||image.staged_plaintext_sha256!==image.plaintext_sha256||image.cleanup_state!=='REMOVED';}))throw new ConflictException('Imported image binding changed');
  return {candidate,images};
 }

 /** Reuse the caller transaction; selected report access never opens a nested pool. */
 async authorizeImportedReport(db:PoolClient,actor:NonNullable<ChatActor>,id:string,messageId:string){
  if(!this.schemaReady)throw new ServiceUnavailableException('Chat crypto schema unavailable');
  await this.chat.authorize(id,actor,db,true);
  const message=(await db.query(`SELECT m.*,to_char(m.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM messages m WHERE m.id=$1 AND m.conversation_id=$2 AND m.encryption_mode='E2EE' FOR SHARE OF m`,[messageId,id])).rows[0];if(!message)chatError(ErrorCode.FORBIDDEN,'Report source unavailable');
  const {candidate}=await this.importedBinding(db,message);if(!(await db.query('SELECT 1 FROM chat_crypto_cohort_members WHERE cohort_id=$1 AND conversation_id=$2 AND user_id=$3 FOR SHARE',[candidate.cohort_id,id,actor.userId])).rowCount)chatError(ErrorCode.FORBIDDEN,'Report source unavailable');
 }
 private async messageDto(db:PoolClient,id:string){
  const row=(await db.query(`SELECT m.*,s.sender_device_id,to_char(m.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso,EXISTS(SELECT 1 FROM chat_crypto_legacy_migrations lm WHERE lm.message_id=m.id) AS legacy FROM messages m JOIN chat_crypto_outbound_sessions s ON s.session_id=rtrim(m.crypto_envelope->'event'->>'session_id','=') WHERE m.id=$1 AND m.encryption_mode='E2EE'`,[id])).rows[0];
  if(!row)chatError(ErrorCode.NOT_FOUND,'Encrypted message not found');
  const fields={id:row.id,conversationId:row.conversation_id,senderId:row.sender_id,clientMessageId:row.client_message_id,deviceId:row.sender_device_id,membershipRevision:Number(row.crypto_revision),envelope:row.crypto_envelope,createdAt:row.legacy?row.created_iso:row.created_at.toISOString()};
  if(row.legacy){const {candidate,images}=await this.importedBinding(db,row);return EncryptedMessageSchema.parse({...fields,deviceId:candidate.importer_device_id,attachmentIds:images.map(image=>image.attachment_id),origin:'LEGACY_IMPORT',importProvenance:{candidateId:candidate.id,cohortId:candidate.cohort_id,originalSha256:candidate.original_sha256,importerUserId:candidate.importer_user_id,importerDeviceId:candidate.importer_device_id}});}
  const attachments=(await db.query(`SELECT id FROM chat_crypto_upload_drafts WHERE message_id=$1 ORDER BY id`,[id])).rows,mentionedUserIds=(await db.query('SELECT mentioned_user_id FROM mentions WHERE message_id=$1 ORDER BY mentioned_user_id',[id])).rows.map(row=>String(row.mentioned_user_id));return EncryptedMessageSchema.parse({...fields,attachmentIds:attachments.map(a=>a.id),origin:'LIVE',...(mentionedUserIds.length?{mentionedUserIds}:{})});
 }
 async realtimeSubscription(actor:ChatActor,id:string,deviceId:string,cohortId?:string){return this.transaction(actor,async(db,userId)=>{
  const state=await this.stateRow(db,actor,id),context=await this.protocolCohort(db,actor,id,state,cohortId);await this.protocolDevice(db,userId,deviceId,context);
  await this.chat.authorize(id,actor,db,true);await this.protocolCohort(db,actor,id,state,cohortId);await this.protocolDevice(db,userId,deviceId,context);
  return {ok:true as const,conversationId:id,deviceId,membershipRevision:Number(state.membership_revision)};
 });}
 /** Only committed ciphertext metadata is loaded for choosing the transport.
  * Actual delivery uses a separate recipient authorization transaction. */
 /** Source queues remain authoritative. Publishing may repeat after a commit
  * failure; the client only receives a bounded metadata hint and uses REST. */
 async dispatchProtocol(publish:(signal:CryptoProtocolWakeSignal)=>Promise<void>){
  if(!this.schemaReady)return;
  const db=await this.pool.connect();try{
   await db.query('BEGIN');
   const jobs=(await db.query(`SELECT id,to_device_event_id,verification_event_id FROM chat_crypto_protocol_outbox WHERE delivered_at IS NULL ORDER BY created_at,id LIMIT 25 FOR UPDATE SKIP LOCKED`)).rows;
   for(const job of jobs){
    const queue=job.to_device_event_id?'ENCRYPTED':'VERIFICATION',eventId=String(job.to_device_event_id??job.verification_event_id),table=queue==='ENCRYPTED'?'chat_crypto_to_device_events':'chat_crypto_protocol_events';
    const active=(await db.query(`SELECT 1 FROM ${table} WHERE id=$1 AND acknowledged_at IS NULL AND expires_at>clock_timestamp()`,[eventId])).rowCount;
    if(active)await publish(CryptoProtocolWakeSignalSchema.parse({kind:'PROTOCOL_WAKE',queue,eventId}));
    await db.query(`UPDATE chat_crypto_protocol_outbox SET delivered_at=clock_timestamp() WHERE id=$1`,[job.id]);
   }
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async committedProtocolConversation(signal:CryptoProtocolWakeSignal){
  if(!this.schemaReady)return null;
  const parsed=CryptoProtocolWakeSignalSchema.parse(signal),table=parsed.queue==='ENCRYPTED'?'chat_crypto_to_device_events':'chat_crypto_protocol_events';
  const row=(await this.pool.query(`SELECT conversation_id FROM ${table} WHERE id=$1 AND acknowledged_at IS NULL AND expires_at>clock_timestamp()`,[parsed.eventId])).rows[0];return row?String(row.conversation_id):null;
 }
 async protocolWakeup(actor:ChatActor,deviceId:string,input:unknown,cohortId?:string){
  const signal=this.parse(CryptoProtocolWakeSignalSchema,input);return this.transaction(actor,async(db,userId)=>{
   await this.device(db,userId,deviceId);const table=signal.queue==='ENCRYPTED'?'chat_crypto_to_device_events':'chat_crypto_protocol_events';
   const query=`SELECT * FROM ${table} WHERE id=$1 AND recipient_user_id=$2 AND recipient_device_id=$3 AND acknowledged_at IS NULL AND expires_at>clock_timestamp()`;
   const args=[signal.eventId,userId,deviceId],row=(await db.query(query,args)).rows[0];if(!row)return null;
   const state=await this.stateRow(db,actor,String(row.conversation_id));if(row.cohort_id!==(cohortId??null)||!await this.readable(db,row,state,actor))return null;
   // Recheck after the state lock: ACK/expiry and auth can change while waiting.
   if(!(await db.query(query,args)).rowCount||!await this.readable(db,row,state,actor))return null;
   await this.chat.authorize(String(row.conversation_id),actor,db,true);await this.device(db,userId,deviceId);
   return SocketCryptoSyncAvailableSchema.parse({conversationId:row.conversation_id,deviceId,membershipRevision:Number(state.membership_revision)});
  });
 }
 async committedCiphertext(id:string){
  if(!this.schemaReady)return null;
  const db=await this.pool.connect();try{
   const encrypted=(await db.query(`SELECT 1 FROM messages WHERE id=$1 AND encryption_mode='E2EE'`,[id])).rowCount;
   return encrypted?await this.messageDto(db,id):null;
  }finally{db.release();}
 }
 async realtimeMessage(actor:ChatActor,deviceId:string,messageId:string,cohortId?:string){return this.transaction(actor,async(db,userId)=>{
  const message=await this.messageDto(db,messageId),state=await this.stateRow(db,actor,message.conversationId);await this.device(db,userId,deviceId);
  if(state.migration_state!=='RECONCILED')chatError(ErrorCode.FORBIDDEN,'Realtime history unavailable');await this.protocolCohort(db,actor,message.conversationId,state,cohortId);
  // An authorized new member may encounter an older outbox event. Filter it
  // without invalidating their subscription to subsequent eligible messages.
  if(message.origin!=='LIVE'||!(await db.query(`SELECT 1 FROM chat_crypto_membership_intervals WHERE conversation_id=$1 AND user_id=$2 AND start_revision<=$3 AND (end_revision IS NULL OR $3<end_revision)`,[message.conversationId,userId,message.membershipRevision])).rowCount)return null;
  return message;
 });}
 private async mentionTargets(db:PoolClient,id:string,senderId:string,revision:number,targets:string[]){
  if(!targets.length)return;const eligible=(await db.query(`SELECT u.id FROM unnest($1::text[]) AS t(id) JOIN "user" u ON u.id=t.id JOIN conversations c ON c.id=$2
   WHERE u.id<>$3 AND (c.user1_id=u.id OR c.user2_id=u.id OR EXISTS(SELECT 1 FROM rooms r JOIN room_members rm ON rm.room_id=r.id WHERE r.conversation_id=c.id AND rm.user_id=u.id) OR (NOT EXISTS(SELECT 1 FROM rooms r WHERE r.conversation_id=c.id) AND EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.user_id=u.id)))
   AND EXISTS(SELECT 1 FROM chat_crypto_membership_intervals i WHERE i.conversation_id=c.id AND i.user_id=u.id AND i.start_revision<=$4 AND (i.end_revision IS NULL OR $4<i.end_revision))
   AND NOT COALESCE((SELECT a.action='BAN' FROM admin_actions a WHERE a.target_user_id=u.id AND a.action IN ('BAN','UNBAN') ORDER BY a.created_at DESC,a.id DESC LIMIT 1),false)
   ORDER BY u.id FOR KEY SHARE OF u`,[targets,id,senderId,revision])).rows;if(eligible.length!==targets.length)chatError(ErrorCode.FORBIDDEN,'Mention target unavailable');
 }
 private async mentionNotices(db:PoolClient,recipients:string[],conversationId:string,messageId:string,mentionerId:string){
  if(!recipients.length)return;
  const preferences=new Map((await db.query("SELECT user_id,in_app,push FROM notification_preferences WHERE user_id=ANY($1::text[]) AND notification_type='MENTION' ORDER BY user_id FOR SHARE",[recipients])).rows.map(row=>[String(row.user_id),row])),subscribed=new Set((await db.query('SELECT DISTINCT user_id FROM push_subscriptions WHERE user_id=ANY($1::text[])',[recipients])).rows.map(row=>String(row.user_id)));
  const notices:Array<{id:string;recipient:string;data:string;dedup:string}>=[],jobs:Array<{id:string;notification_id:string;recipient:string;channel:string}>=[];
  for(const recipient of recipients){
   const preference=preferences.get(recipient),channels:string[]=[];if(preference?.in_app!==false)channels.push('IN_APP');if(preference?.push!==false&&subscribed.has(recipient))channels.push('PUSH');if(!channels.length)continue;
   const notice={id:randomUUID(),recipient,data:JSON.stringify(MentionNotificationDataSchema.parse({conversationId,messageId,mentionerId})),dedup:'crypto-mention:'+messageId+':'+recipient};notices.push(notice);for(const channel of channels)jobs.push({id:randomUUID(),notification_id:notice.id,recipient,channel});
  }
  if(!notices.length)return;
  // Join only the notices actually inserted; retries cannot create extra jobs.
  await db.query(`WITH added AS (
   INSERT INTO notifications(id,user_id,type,title,body,data,dedup_key)
   SELECT n.id,n.recipient,'MENTION','Tin nhắn mới','Bạn có tin nhắn mới.',n.data,n.dedup FROM jsonb_to_recordset($1::jsonb) AS n(id text,recipient text,data text,dedup text)
   ON CONFLICT(user_id,dedup_key) DO NOTHING RETURNING id,user_id,dedup_key
  ) INSERT INTO notification_outbox(id,notification_id,user_id,channel,dedup_key)
   SELECT j.id,n.id,n.user_id,j.channel,n.dedup_key FROM jsonb_to_recordset($2::jsonb) AS j(id text,notification_id text,recipient text,channel text)
   JOIN added n ON n.id=j.notification_id AND n.user_id=j.recipient`,[JSON.stringify(notices),JSON.stringify(jobs)]);
 }
 async sendMessage(actor:ChatActor,id:string,input:unknown){const parsed=this.parse(SendEncryptedMessageSchema,input);return this.transaction(actor,async(db,userId)=>{
  const state=await this.stateRow(db,actor,id,parsed.membershipRevision);
  if(state.migration_state!=='RECONCILED')chatError(ErrorCode.FORBIDDEN,'Private migration is not reconciled');
  const device=await this.device(db,userId,parsed.deviceId),event=parsed.envelope.event,mentionedUserIds=[...(parsed.mentionedUserIds??[])].sort();
  if((event.sender_key!==undefined&&event.sender_key!==device.curve25519_key)||(event.device_id!==undefined&&event.device_id!==parsed.deviceId))chatError(ErrorCode.INVALID_INPUT,'Sender identity mismatch');
  let sessionId:string;try{sessionId=matrixBase64(event.session_id,32).toString('base64').replace(/=+$/,'');}catch{chatError(ErrorCode.INVALID_INPUT,'Invalid outbound session');}
  const existing=(await db.query(`SELECT id,crypto_envelope,crypto_revision FROM messages WHERE sender_id=$1 AND conversation_id=$2 AND client_message_id=$3 FOR UPDATE`,[userId,id,parsed.clientMessageId])).rows[0];
  if(existing){const dto=await this.messageDto(db,existing.id),savedMentions=dto.origin==='LIVE'?dto.mentionedUserIds??[]:[];if(!this.sameJson(savedMentions.slice().sort(),mentionedUserIds)||dto.deviceId!==parsed.deviceId||Number(existing.crypto_revision)!==parsed.membershipRevision||!this.sameJson(existing.crypto_envelope,parsed.envelope)||!this.sameJson([...dto.attachmentIds].sort(),[...(parsed.attachmentIds??[])].sort()))throw new ConflictException('Message retry conflicts');return dto;}
  await this.mentionTargets(db,id,userId,parsed.membershipRevision,mentionedUserIds);
  // Tombstones bind a Megolm session globally. Never delete/rebind after revoke.
  await db.query(`INSERT INTO chat_crypto_outbound_sessions(session_id,conversation_id,sender_user_id,sender_device_id,membership_revision) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[sessionId,id,userId,parsed.deviceId,parsed.membershipRevision]);
  const binding=(await db.query(`SELECT * FROM chat_crypto_outbound_sessions WHERE session_id=$1 FOR SHARE`,[sessionId])).rows[0];
  if(binding.conversation_id!==id||binding.sender_user_id!==userId||binding.sender_device_id!==parsed.deviceId||Number(binding.membership_revision)!==parsed.membershipRevision)throw new ConflictException('Outbound session cannot be reused across revisions');
  const attachmentIds=[...new Set(parsed.attachmentIds??[])].sort();
  if(attachmentIds.length!==(parsed.attachmentIds??[]).length)chatError(ErrorCode.INVALID_INPUT,'Duplicate attachment');
  const drafts=attachmentIds.length?(await db.query(`SELECT * FROM chat_crypto_upload_drafts WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE`,[attachmentIds])).rows:[];
  if(drafts.length!==attachmentIds.length||drafts.some(d=>d.uploader_id!==userId||d.device_id!==parsed.deviceId||d.conversation_id!==id||d.encryption_mode!=='E2EE'||d.cohort_id!==null||Number(d.membership_revision)!==parsed.membershipRevision||d.consumed_at||d.expires_at.getTime()<=Date.now()))chatError(ErrorCode.FORBIDDEN,'Encrypted attachment claim denied');
  const messageId=randomUUID();
  await db.query(`INSERT INTO messages(id,conversation_id,sender_id,type,content,client_message_id,encryption_mode,crypto_envelope,crypto_revision) VALUES($1,$2,$3,$4,'',$5,'E2EE',$6,$7)`,[messageId,id,userId,drafts.length?'IMAGE':'TEXT',parsed.clientMessageId,parsed.envelope,parsed.membershipRevision]);
  for(const draft of drafts){await db.query(`UPDATE chat_crypto_upload_drafts SET message_id=$2,consumed_at=now() WHERE id=$1`,[draft.id,messageId]);await db.query(`INSERT INTO attachments(id,message_id,conversation_id,url,file_name,file_size,mime_type,encryption_mode) VALUES($1,$2,$3,$4,'',$5,'application/octet-stream','E2EE')`,[draft.id,messageId,id,`/api/v1/crypto/conversations/${encodeURIComponent(id)}/attachments/${encodeURIComponent(draft.id)}`,draft.ciphertext_size]);}
  await db.query(`INSERT INTO realtime_outbox(id,message_id,conversation_id,event_name) VALUES($1,$2,$3,'message.created')`,[randomUUID(),messageId,id]);
  if(mentionedUserIds.length){await db.query('INSERT INTO mentions(id,message_id,mentioned_user_id) SELECT m.id,$1,m.recipient FROM jsonb_to_recordset($2::jsonb) AS m(id text,recipient text)',[messageId,JSON.stringify(mentionedUserIds.map(recipient=>({id:randomUUID(),recipient})))]);await this.mentionNotices(db,mentionedUserIds,id,messageId,userId);}
  const conversation=await this.chat.conversation(id,db);
  if(conversation.kind==='DM'){
   const recipient=conversation.user1_id===userId?conversation.user2_id:conversation.user1_id;
   const banned=recipient&&(await db.query(`SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1`,[recipient])).rows[0]?.action==='BAN';
   if(recipient&&recipient!==userId&&!banned){
    const preference=(await db.query(`SELECT in_app,push FROM notification_preferences WHERE user_id=$1 AND notification_type='DM' FOR SHARE`,[recipient])).rows[0],channels:string[]=[];
    if(preference?.in_app!==false)channels.push('IN_APP');
    if(preference?.push!==false&&(await db.query('SELECT 1 FROM push_subscriptions WHERE user_id=$1 LIMIT 1',[recipient])).rowCount)channels.push('PUSH');
    if(channels.length){
     const data=DMNotificationDataSchema.parse({conversationId:id,messageId,senderId:userId}),noticeId=randomUUID(),dedup='crypto-dm:'+messageId;
     const added=await db.query(`INSERT INTO notifications(id,user_id,type,title,body,data,dedup_key) VALUES($1,$2,'DM','Tin nhắn mới','Bạn có tin nhắn mới.',$3,$4) ON CONFLICT(user_id,dedup_key) DO NOTHING RETURNING id`,[noticeId,recipient,JSON.stringify(data),dedup]);
     // Delivery rechecks current preferences and recipient eligibility. No EMAIL
     // job or ciphertext/plaintext preview is produced for private messages.
     if(added.rowCount)for(const channel of channels)await db.query(`INSERT INTO notification_outbox(id,notification_id,user_id,channel,dedup_key) VALUES($1,$2,$3,$4,$5)`,[randomUUID(),noticeId,recipient,channel,dedup]);
    }
   }
  }
  return this.messageDto(db,messageId);
 });}
 async messageHistory(actor:ChatActor,id:string,input:unknown){const parsed=this.parse(z.object({after:z.string().max(512).optional(),limit:z.coerce.number().int().min(1).max(100).default(50)}).strict(),input);return this.transaction(actor,async(db,userId)=>{
  const state=await this.stateRow(db,actor,id);if(state.migration_state!=='RECONCILED')chatError(ErrorCode.FORBIDDEN,'Private migration is not reconciled');
  const after=this.decodeCursor(parsed.after,userId,id,'messages');
  const rows=(await db.query(`SELECT m.id,m.created_at,to_char(m.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM messages m WHERE m.conversation_id=$1 AND m.encryption_mode='E2EE' AND (EXISTS(SELECT 1 FROM chat_crypto_legacy_migrations lm JOIN chat_crypto_cohort_members cm ON cm.cohort_id=lm.cohort_id AND cm.conversation_id=lm.conversation_id WHERE lm.message_id=m.id AND lm.conversation_id=m.conversation_id AND cm.user_id=$2) OR (NOT EXISTS(SELECT 1 FROM chat_crypto_legacy_migrations lm WHERE lm.message_id=m.id) AND EXISTS(SELECT 1 FROM chat_crypto_membership_intervals i WHERE i.conversation_id=m.conversation_id AND i.user_id=$2 AND i.start_revision<=m.crypto_revision AND (i.end_revision IS NULL OR m.crypto_revision<i.end_revision)))) ${after?'AND (m.created_at,m.id)>($4::timestamp,$5::text)':''} ORDER BY m.created_at,m.id LIMIT $3`,after?[id,userId,parsed.limit+1,after.time,after.id]:[id,userId,parsed.limit+1])).rows;
  const selected=rows.slice(0,parsed.limit),items=[];for(const row of selected)items.push(await this.messageDto(db,row.id));
  await this.chat.authorize(id,actor,db,true);if(!(await db.query(`SELECT 1 FROM "session" WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE`,[actor?.sessionId,userId])).rowCount)chatError(ErrorCode.LOGIN_REQUIRED,'Session expired or revoked');
  return {items,hasMore:rows.length>parsed.limit,nextCursor:rows.length>parsed.limit?this.cursor(userId,id,'messages',selected.at(-1)):null};
 });}
 private attachmentDto(row:DbRow){return EncryptedAttachmentSchema.parse({id:row.id,conversationId:row.conversation_id,ciphertextSize:row.ciphertext_size,ciphertextSha256:row.ciphertext_sha256,expiresAt:(row.expires_at as Date).toISOString()});}
 async uploadAttachment(actor:ChatActor,id:string,input:unknown,file?:{buffer:Buffer;size:number}){return this.uploadCiphertext(actor,id,input,file,false);}
 async uploadLegacyAttachment(actor:ChatActor,id:string,input:unknown,file?:{buffer:Buffer;size:number}){return this.uploadCiphertext(actor,id,input,file,true);}
 private async uploadCiphertext(actor:ChatActor,id:string,input:unknown,file:{buffer:Buffer;size:number}|undefined,historical:boolean){
  const parsed=historical?this.parse(LegacyEncryptedUploadRequestSchema,input):this.parse(EncryptedUploadRequestSchema,input),requestedCohort='cohortId' in parsed&&typeof parsed.cohortId==='string'?parsed.cohortId:undefined;
  if(!file||file.size!==file.buffer.length||file.size!==parsed.ciphertextSize)chatError(ErrorCode.INVALID_INPUT,'Invalid ciphertext size');
  let digest:Buffer;try{digest=matrixBase64(parsed.ciphertextSha256,32);}catch{chatError(ErrorCode.INVALID_INPUT,'Invalid ciphertext digest');}
  if(!timingSafeEqual(createHash('sha256').update(file.buffer).digest(),digest))chatError(ErrorCode.INVALID_INPUT,'Ciphertext digest mismatch');
  const normalized=digest.toString('base64').replace(/=+$/,'');let created:string|undefined;
  try{return await this.transaction(actor,async(db,userId)=>{
   const state=await this.stateRow(db,actor,id,parsed.membershipRevision),cohortId=await this.protocolCohort(db,actor,id,state,requestedCohort);await this.protocolDevice(db,userId,parsed.deviceId,cohortId);
   const reauthorize=async()=>{await this.chat.authorize(id,actor,db,true);await this.protocolCohort(db,actor,id,state,requestedCohort);await this.protocolDevice(db,userId,parsed.deviceId,cohortId);};
   // Serialize dedup across conversations too: the database key is user/upload.
   await db.query(`SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_crypto_upload', $1::text,$2::text)::text,0::bigint))`,[userId,parsed.clientUploadId]);
   const existing=(await db.query(`SELECT * FROM chat_crypto_upload_drafts WHERE uploader_id=$1 AND client_upload_id=$2 FOR UPDATE`,[userId,parsed.clientUploadId])).rows[0];
   if(existing){if(existing.conversation_id!==id||existing.device_id!==parsed.deviceId||existing.cohort_id!==cohortId||Number(existing.membership_revision)!==parsed.membershipRevision||existing.ciphertext_size!==file.size||existing.ciphertext_sha256!==normalized)throw new ConflictException('Upload retry conflicts');if(existing.consumed_at||existing.expires_at.getTime()<=Date.now())chatError(ErrorCode.FORBIDDEN,'Draft no longer available');await reauthorize();return this.attachmentDto(existing);}
   const objectId=randomUUID(),objectKey=objectId+'.bin';await lockCryptoObjectWrite(db,objectKey);await this.objects.put(objectKey,file.buffer);created=objectKey;
   const row=(await db.query(`INSERT INTO chat_crypto_upload_drafts(id,uploader_id,conversation_id,device_id,client_upload_id,membership_revision,encryption_mode,object_key,ciphertext_size,ciphertext_sha256,expires_at,cohort_id) VALUES($1,$2,$3,$4,$5,$6,'E2EE',$7,$8,$9,now()+$10*interval '1 millisecond',$11) RETURNING *`,[objectId,userId,id,parsed.deviceId,parsed.clientUploadId,parsed.membershipRevision,objectKey,file.size,normalized,IMAGE_DRAFT_TTL_MS,cohortId])).rows[0];await reauthorize();return this.attachmentDto(row);
  });}catch(error){if(created)await this.objects.remove(created);throw error;}
 }
 async readAttachment(actor:ChatActor,id:string,attachmentId:string){return this.transaction(actor,async(db,userId)=>{
  const state=await this.stateRow(db,actor,id);if(state.migration_state!=='RECONCILED')chatError(ErrorCode.FORBIDDEN,'Private migration is not reconciled');
  const imported=(await db.query(`SELECT m.*,to_char(m.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM attachments a JOIN messages m ON m.id=a.message_id AND m.conversation_id=a.conversation_id JOIN chat_crypto_legacy_migrations lm ON lm.message_id=m.id AND lm.conversation_id=m.conversation_id WHERE a.id=$1 AND a.conversation_id=$2 AND a.encryption_mode='E2EE' AND m.encryption_mode='E2EE'`,[attachmentId,id])).rows[0];
  if(imported){
   const reauthorize=async()=>{await this.chat.authorize(id,actor,db,true);if(!(await db.query(`SELECT 1 FROM "session" WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE`,[actor?.sessionId,userId])).rowCount)chatError(ErrorCode.LOGIN_REQUIRED,'Session expired or revoked');const binding=await this.importedBinding(db,imported);if(!(await db.query(`SELECT 1 FROM chat_crypto_cohort_members WHERE cohort_id=$1 AND conversation_id=$2 AND user_id=$3`,[binding.candidate.cohort_id,id,userId])).rowCount)chatError(ErrorCode.FORBIDDEN,'Imported object history unavailable');const image=binding.images.find(item=>item.attachment_id===attachmentId);if(!image)throw new ConflictException('Imported image binding unavailable');return image;};
   const image=await reauthorize();let bytes:Buffer|undefined;try{bytes=await this.objects.read(image.object_key);if(bytes.length!==image.ciphertext_size||!timingSafeEqual(createHash('sha256').update(bytes).digest(),matrixBase64(image.ciphertext_sha256,32)))throw new ConflictException('Imported object integrity failed');const current=await reauthorize();if(current.object_key!==image.object_key||current.ciphertext_size!==image.ciphertext_size||current.ciphertext_sha256!==image.ciphertext_sha256)throw new ConflictException('Imported image binding changed');return bytes;}catch(error){bytes?.fill(0);if(error instanceof HttpException)throw error;chatError(ErrorCode.FORBIDDEN,'Imported object unavailable');}
  }
  const row=(await db.query(`SELECT d.*,m.crypto_revision FROM chat_crypto_upload_drafts d LEFT JOIN messages m ON m.id=d.message_id WHERE d.id=$1 AND d.conversation_id=$2 AND d.encryption_mode='E2EE'`,[attachmentId,id])).rows[0];
  if(!row)chatError(ErrorCode.NOT_FOUND,'Encrypted object not found');if(row.cohort_id!==null)chatError(ErrorCode.FORBIDDEN,'Historical object requires candidate context');
  if(row.message_id){if(!(await db.query(`SELECT 1 FROM chat_crypto_membership_intervals WHERE conversation_id=$1 AND user_id=$2 AND start_revision<=$3 AND (end_revision IS NULL OR $3<end_revision)`,[id,userId,row.crypto_revision])).rowCount)chatError(ErrorCode.FORBIDDEN,'Object history is unavailable');}
  else{if(row.uploader_id!==userId||Number(row.membership_revision)!==Number(state.membership_revision)||row.expires_at.getTime()<=Date.now())chatError(ErrorCode.FORBIDDEN,'Draft unavailable');await this.device(db,userId,row.device_id);}
  const reauthorize=async()=>{
   const latest=await this.stateRow(db,actor,id);if(latest.migration_state!=='RECONCILED')chatError(ErrorCode.FORBIDDEN,'Private migration is not reconciled');
   const current=(await db.query(`SELECT d.*,m.crypto_revision FROM chat_crypto_upload_drafts d LEFT JOIN messages m ON m.id=d.message_id WHERE d.id=$1 AND d.conversation_id=$2 AND d.encryption_mode='E2EE'`,[attachmentId,id])).rows[0];
   if(!current||['object_key','ciphertext_size','ciphertext_sha256','message_id','cohort_id','uploader_id','device_id','membership_revision','crypto_revision'].some(key=>current[key]!==row[key])||current.expires_at.getTime()!==row.expires_at.getTime())chatError(ErrorCode.FORBIDDEN,'Object binding changed');
   if(current.message_id){if(!(await db.query(`SELECT 1 FROM chat_crypto_membership_intervals WHERE conversation_id=$1 AND user_id=$2 AND start_revision<=$3 AND (end_revision IS NULL OR $3<end_revision)`,[id,userId,current.crypto_revision])).rowCount)chatError(ErrorCode.FORBIDDEN,'Object history is unavailable');}
   else{if(current.uploader_id!==userId||Number(current.membership_revision)!==Number(latest.membership_revision)||current.expires_at.getTime()<=Date.now())chatError(ErrorCode.FORBIDDEN,'Draft unavailable');await this.device(db,userId,current.device_id);}
  };
  let bytes:Buffer|undefined;try{
   bytes=await this.objects.read(row.object_key);if(bytes.length!==row.ciphertext_size||!timingSafeEqual(createHash('sha256').update(bytes).digest(),matrixBase64(row.ciphertext_sha256,32)))chatError(ErrorCode.FORBIDDEN,'Object integrity failed');
   await reauthorize();return bytes;
  }catch(error){bytes?.fill(0);if(error instanceof HttpException)throw error;chatError(ErrorCode.FORBIDDEN,'Object unavailable');}
 });}
}
