import {cryptoSchemaAvailable} from './crypto-schema-readiness.js';
import {Injectable,Inject,Optional,OnModuleInit,OnModuleDestroy,ServiceUnavailableException,ConflictException,Logger} from '@nestjs/common';
import {Pool,PoolClient} from 'pg';
import {randomUUID,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import * as sharpModule from 'sharp';
import {DiscloseChatReportSchema,ReportImageDisclosureSchema,ReportAttachmentReceiptSchema,LobbyStorageEnvelopeSchema,ReadChatReportSchema,ReportDisclosedTextPayloadSchema,DisclosedReportSchema,MAX_IMAGE_PIXELS,MAX_IMAGE_SIZE_BYTES,IMAGE_DRAFT_TTL_MS,ErrorCode} from '@fg/contracts';
import {ChatService,ChatActor,chatError} from '../chat/chat.service.js';
import {OpenBaoTransit} from './openbao-transit.js';
import {CryptoRelayService} from './crypto-relay.service.js';
import {CryptoObjectStore,lockCryptoObjectWrite} from './crypto-object-store.js';
import {soleAdminUserId} from '../auth/auth-admin.js';
import {AuthService} from '../auth/auth.service.js';
import {CryptoSweepLoop} from './crypto-sweep-loop.js';
const sharp=(sharpModule as typeof sharpModule&{default:typeof sharpModule}).default??sharpModule;

export const REPORT_CUSTODY='FG_REPORT_CUSTODY';
export const REPORT_READER='FG_REPORT_READER';
export type ReportCustody={transit:OpenBaoTransit;retentionSeconds:number};
/** Explicit user-supplied disclosures. No access to private decryption keys. */
@Injectable()
export class CryptoReportsService implements OnModuleInit,OnModuleDestroy{
 private schemaReady=false;private pool!:Pool;
 private readonly objects=new CryptoObjectStore(8*1024*1024);
 private readonly logger=new Logger(CryptoReportsService.name);
 private readonly sweeps=new CryptoSweepLoop(()=>this.cleanup(),()=>this.logger.warn('Encrypted report cleanup unavailable; retained for retry'));
 constructor(private readonly chat:ChatService,private readonly auth:AuthService,@Optional()@Inject(REPORT_CUSTODY)private readonly custody?:ReportCustody,@Optional()@Inject(REPORT_READER)private readonly reader?:{transit:OpenBaoTransit},@Optional()private readonly relay?:CryptoRelayService){}
 async onModuleInit(){
  this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000,statement_timeout:10000});
  this.schemaReady=await cryptoSchemaAvailable(this.pool);if(this.schemaReady){await this.objects.initialize();this.sweeps.start();}
 }
 async onModuleDestroy(){await this.sweeps.stop();await this.pool?.end();}
 /** Expiry is stored at consent; no new retention default is chosen here.
  * At most 100 evidence rows and 100 image objects per transaction. Parent
  * and draft locks serialize readers/claims; locked drafts defer the parent.
  * Remove bytes before metadata, so ENOENT permits recovery after DB rollback.
  * Keep moderation roots and private source messages. No KMS read is needed. */
 async cleanup(){
  if(!this.schemaReady)return;
  const db=await this.pool.connect();let objectsRemaining=100;
  try{
   await db.query('BEGIN');
   const evidence=(await db.query(`SELECT id FROM chat_crypto_report_evidence WHERE expires_at<=now() ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED`)).rows;
   for(const row of evidence){
    const drafts=(await db.query(`SELECT id,object_key FROM chat_crypto_upload_drafts WHERE report_evidence_id=$1 ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`,[row.id,objectsRemaining])).rows;
    for(const draft of drafts){await this.objects.remove(draft.object_key);await db.query('DELETE FROM chat_crypto_upload_drafts WHERE id=$1',[draft.id]);objectsRemaining--;}
    await db.query(`DELETE FROM chat_crypto_report_evidence WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM chat_crypto_upload_drafts WHERE report_evidence_id=$1)`,[row.id]);
   }
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 private async verifyObject(draft:{object_key:string;envelope:unknown;ciphertext_size:number;ciphertext_sha256:string}){
  let bytes:Buffer;try{bytes=await this.objects.read(draft.object_key);}catch{chatError(ErrorCode.FORBIDDEN,'Report object unavailable');}
  const envelope=LobbyStorageEnvelopeSchema.safeParse(draft.envelope);
  if(!envelope.success||bytes.length!==draft.ciphertext_size||createHash('sha256').update(bytes).digest('base64').replace(/=+$/,'')!==draft.ciphertext_sha256||bytes.toString()!==JSON.stringify(envelope.data))chatError(ErrorCode.FORBIDDEN,'Report object integrity failed');
 }
 private async authorizeAdmin(db:PoolClient,actor:ChatActor){
  if(!actor)chatError(ErrorCode.LOGIN_REQUIRED,'Login required');
  if(soleAdminUserId()!==actor.userId)chatError(ErrorCode.FORBIDDEN,'Admin required');
  if(!(await db.query(`SELECT id FROM "session" WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE`,[actor.sessionId,actor.userId])).rowCount)chatError(ErrorCode.LOGIN_REQUIRED,'Session revoked');
  const action=(await db.query(`SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1`,[actor.userId])).rows[0];
  if(action?.action==='BAN'||soleAdminUserId()!==actor.userId)chatError(ErrorCode.FORBIDDEN,'Admin access revoked');
  if(!await this.auth.isUserAdmin(actor.userId))chatError(ErrorCode.FORBIDDEN,'Admin identity unavailable');
 }
 private async reportRoot(db:PoolClient,id:string){
  const row=(await db.query(`SELECT r.id,r.reporter_id,m.conversation_id FROM reports r JOIN messages m ON m.id=r.reported_message_id WHERE r.id=$1 AND r.reason='CHAT_CRYPTO_DISCLOSURE'`,[id])).rows[0];if(!row)chatError(ErrorCode.NOT_FOUND,'Report unavailable');return row;
 }
 async readReport(actor:ChatActor,id:string,input:unknown){
  if(!this.schemaReady)throw new ServiceUnavailableException('Chat crypto schema unavailable');
  if(!ReadChatReportSchema.safeParse(input).success)chatError(ErrorCode.INVALID_INPUT,'Invalid report read');const db=await this.pool.connect();
  try{
   await db.query('BEGIN');await this.authorizeAdmin(db,actor);const root=await this.reportRoot(db,id),reader=this.reader?.transit;if(!reader)throw new ServiceUnavailableException('Report reader unavailable');
   const evidence=(await db.query(`SELECT * FROM chat_crypto_report_evidence WHERE report_id=$1 ORDER BY id LIMIT 21 FOR SHARE`,[id])).rows;
   if(!evidence.length||evidence.length>20||evidence.some(e=>e.reporter_id!==root.reporter_id||e.source!=='USER_DISCLOSED'))chatError(ErrorCode.NOT_FOUND,'Report unavailable');
   const selectedMessages=[];
   for(const item of evidence){
    if(!(await db.query('SELECT id FROM chat_crypto_report_evidence WHERE id=$1 AND expires_at>clock_timestamp()',[item.id])).rowCount)chatError(ErrorCode.NOT_FOUND,'Report expired');
    let bytes:Buffer;try{bytes=await reader.decrypt(item.envelope,{kind:'REPORT_TEXT',conversationId:root.conversation_id,objectId:item.id});}catch{throw new ServiceUnavailableException('Report reader unavailable');}
    let payload;try{payload=ReportDisclosedTextPayloadSchema.parse(JSON.parse(bytes.toString('utf8')));}catch{throw new ServiceUnavailableException('Report evidence integrity failed');}finally{bytes.fill(0);}
    if(payload.reportId!==id||payload.reporterId!==root.reporter_id||payload.conversationId!==root.conversation_id)throw new ServiceUnavailableException('Report evidence integrity failed');
    selectedMessages.push({evidenceId:item.id,messageId:payload.messageId,conversationId:payload.conversationId,text:payload.text,reason:payload.reason,source:payload.source,authenticity:payload.authenticity,reportAttachmentIds:payload.reportAttachmentIds});
   }
   const response=DisclosedReportSchema.parse({id,selectedMessages});await this.authorizeAdmin(db,actor);
   if((await db.query('SELECT id FROM chat_crypto_report_evidence WHERE report_id=$1 AND expires_at>clock_timestamp()',[id])).rowCount!==evidence.length)chatError(ErrorCode.NOT_FOUND,'Report expired');
   await db.query(`INSERT INTO chat_crypto_report_audit(id,actor_id,report_id,action) VALUES($1,$2,$3,'READ_REPORT')`,[randomUUID(),actor!.userId,id]);await db.query('COMMIT');return response;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async readImage(actor:ChatActor,id:string,attachmentId:string){
  if(!this.schemaReady)throw new ServiceUnavailableException('Chat crypto schema unavailable');
  const db=await this.pool.connect();let plaintext:Buffer|undefined;
  try{
   await db.query('BEGIN');await this.authorizeAdmin(db,actor);const root=await this.reportRoot(db,id),reader=this.reader?.transit;if(!reader)throw new ServiceUnavailableException('Report reader unavailable');
   const evidence=(await db.query(`SELECT e.* FROM chat_crypto_report_evidence e JOIN chat_crypto_upload_drafts d ON d.report_evidence_id=e.id WHERE e.report_id=$1 AND d.id=$2 AND e.expires_at>clock_timestamp() FOR SHARE OF e`,[id,attachmentId])).rows[0];if(!evidence||evidence.reporter_id!==root.reporter_id||evidence.source!=='USER_DISCLOSED')chatError(ErrorCode.NOT_FOUND,'Report image unavailable');
   const draft=(await db.query(`SELECT d.*,s.source_message_id FROM chat_crypto_upload_drafts d JOIN chat_crypto_report_upload_sources s ON s.upload_id=d.id WHERE d.id=$1 AND d.report_evidence_id=$2 FOR SHARE OF d`,[attachmentId,evidence.id])).rows[0];
   if(!draft||draft.encryption_mode!=='REPORT_AEAD'||!draft.consumed_at||draft.uploader_id!==root.reporter_id||draft.conversation_id!==root.conversation_id)chatError(ErrorCode.NOT_FOUND,'Report image unavailable');await this.verifyObject(draft);
   let selectedBytes:Buffer;try{selectedBytes=await reader.decrypt(evidence.envelope,{kind:'REPORT_TEXT',conversationId:root.conversation_id,objectId:evidence.id});}catch{throw new ServiceUnavailableException('Report reader unavailable');}
   let selected;try{selected=ReportDisclosedTextPayloadSchema.parse(JSON.parse(selectedBytes.toString('utf8')));}catch{throw new ServiceUnavailableException('Report evidence integrity failed');}finally{selectedBytes.fill(0);}
   if(selected.reportId!==id||selected.reporterId!==root.reporter_id||selected.conversationId!==root.conversation_id||selected.messageId!==draft.source_message_id||!selected.reportAttachmentIds.includes(attachmentId))chatError(ErrorCode.NOT_FOUND,'Report image not selected');
   const objectId='rimg1:'+createHash('sha256').update(JSON.stringify(['FG_REPORT_IMAGE',1,root.reporter_id,root.conversation_id,draft.source_message_id,draft.id])).digest('hex');
   try{plaintext=await reader.decrypt(draft.envelope,{kind:'REPORT_IMAGE',conversationId:root.conversation_id,objectId});}catch{throw new ServiceUnavailableException('Report reader unavailable');}
   if(!plaintext.length||plaintext.length>MAX_IMAGE_SIZE_BYTES||plaintext.toString('ascii',0,4)!=='RIFF'||plaintext.toString('ascii',8,12)!=='WEBP')throw new ServiceUnavailableException('Report image integrity failed');
   await this.authorizeAdmin(db,actor);if(!(await db.query('SELECT id FROM chat_crypto_report_evidence WHERE id=$1 AND expires_at>clock_timestamp()',[evidence.id])).rowCount)chatError(ErrorCode.NOT_FOUND,'Report expired');
   await db.query(`INSERT INTO chat_crypto_report_audit(id,actor_id,report_id,action,attachment_id) VALUES($1,$2,$3,'READ_IMAGE',$4)`,[randomUUID(),actor!.userId,id,attachmentId]);await db.query('COMMIT');const result=plaintext;plaintext=undefined;return result;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{plaintext?.fill(0);db.release();}
 }
 async disclose(actor:ChatActor,input:unknown){
  if(!this.schemaReady)throw new ServiceUnavailableException('Chat crypto schema unavailable');
  if(!actor)chatError(ErrorCode.LOGIN_REQUIRED,'Login required');
  const checked=DiscloseChatReportSchema.safeParse(input);if(!checked.success)chatError(ErrorCode.INVALID_INPUT,'Invalid disclosure');const selected=checked.data;
  const attachmentIds=selected.selectedMessages.flatMap(m=>m.reportAttachmentIds??[]);
  if(new Set(selected.selectedMessages.map(m=>m.messageId)).size!==selected.selectedMessages.length||new Set(attachmentIds).size!==attachmentIds.length||selected.selectedMessages.some(m=>m.source!=='USER_DISCLOSED'))chatError(ErrorCode.INVALID_INPUT,'Unsupported disclosure selection');
  // Production must supply a separately scoped writer and reviewed retention.
  // Missing custody never substitutes Lobby/root credentials or plaintext.
  const custody=this.custody;
  if(!custody?.transit||!Number.isSafeInteger(custody.retentionSeconds)||custody.retentionSeconds<=0||custody.retentionSeconds>2147483647)throw new ServiceUnavailableException('Report custody unavailable');
  const db=await this.pool.connect();
  try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');await this.chat.authorize(selected.conversationId,actor,db);
   const state=(await db.query(`SELECT mode,migration_state,membership_revision FROM chat_crypto_state WHERE conversation_id=$1 FOR SHARE`,[selected.conversationId])).rows[0];
   if(state?.mode!=='E2EE'||state.migration_state!=='RECONCILED')chatError(ErrorCode.FORBIDDEN,'Report source unavailable');
   // Recheck membership after waiting for the shared epoch lock. Membership
   // transitions serialize here; existing intervals prove access to each source.
   await this.chat.authorize(selected.conversationId,actor,db);
   const ids=selected.selectedMessages.map(m=>m.messageId).sort();
   const messages=(await db.query(`SELECT id,crypto_revision,encryption_mode,EXISTS(SELECT 1 FROM chat_crypto_legacy_migrations lm WHERE lm.message_id=m.id) AS legacy FROM messages m WHERE conversation_id=$1 AND id=ANY($2::text[]) ORDER BY id FOR SHARE OF m`,[selected.conversationId,ids])).rows;
   if(messages.length!==ids.length)chatError(ErrorCode.FORBIDDEN,'Report source unavailable');
   for(const message of messages){
    await this.reportSource(db,actor,selected.conversationId,message);
   }
   const drafts=attachmentIds.length?(await db.query(`SELECT d.*,s.source_message_id FROM chat_crypto_upload_drafts d JOIN chat_crypto_report_upload_sources s ON s.upload_id=d.id WHERE d.id=ANY($1::text[]) ORDER BY d.id FOR UPDATE OF d`,[attachmentIds])).rows:[];
   if(drafts.length!==attachmentIds.length||drafts.some(d=>d.uploader_id!==actor.userId||d.conversation_id!==selected.conversationId||d.encryption_mode!=='REPORT_AEAD'||d.consumed_at||d.expires_at.getTime()<=Date.now()||Number(d.membership_revision)!==Number(state.membership_revision)||!selected.selectedMessages.some(m=>m.messageId===d.source_message_id&&m.reportAttachmentIds?.includes(d.id))))chatError(ErrorCode.FORBIDDEN,'Report attachment claim denied');
   for(const draft of drafts)await this.verifyObject(draft);
   const reportId=randomUUID(),prepared=[];
   for(const item of selected.selectedMessages){
    const evidenceId=randomUUID(),source=messages.find(m=>m.id===item.messageId)!;
    const plaintext=Buffer.from(JSON.stringify({version:1,conversationId:selected.conversationId,reportId,reporterId:actor.userId,messageId:item.messageId,membershipRevision:Number(source.crypto_revision),reason:selected.reason,text:item.text,reportAttachmentIds:item.reportAttachmentIds??[],source:'USER_DISCLOSED',authenticity:'USER_SUPPLIED_UNVERIFIED'}),'utf8');
    try{prepared.push({id:evidenceId,messageId:item.messageId,envelope:await custody.transit.encrypt('fg-report',plaintext,{kind:'REPORT_TEXT',conversationId:selected.conversationId,objectId:evidenceId})});}
    catch{throw new ServiceUnavailableException('Report custody unavailable');}finally{plaintext.fill(0);}
   }
   // Human reason/text exist only inside the authenticated report envelope.
   await db.query(`INSERT INTO reports(id,reporter_id,target_type,target_id,reported_message_id,reason) VALUES($1,$2,'MESSAGE',$3,$3,'CHAT_CRYPTO_DISCLOSURE')`,[reportId,actor.userId,selected.selectedMessages[0].messageId]);
   for(const item of prepared){await db.query(`INSERT INTO chat_crypto_report_evidence(id,report_id,reporter_id,consented_at,envelope,source,expires_at) VALUES($1,$2,$3,now(),$4,'USER_DISCLOSED',now()+$5::int*interval '1 second')`,[item.id,reportId,actor.userId,item.envelope,custody.retentionSeconds]);for(const draft of drafts.filter(d=>d.source_message_id===item.messageId))await db.query(`UPDATE chat_crypto_upload_drafts SET report_evidence_id=$2,consumed_at=now() WHERE id=$1`,[draft.id,item.id]);}
   for(const message of messages)await this.reportSource(db,actor,selected.conversationId,message);await db.query('COMMIT');return {id:reportId};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }

 private async reportSource(db:PoolClient,actor:NonNullable<ChatActor>,id:string,source:{id:string;encryption_mode:string;legacy:boolean;crypto_revision:unknown}){
  await this.chat.authorize(id,actor,db,true);if(source.encryption_mode!=='E2EE')chatError(ErrorCode.FORBIDDEN,'Report source unavailable');
  if(source.legacy){if(!this.relay)throw new ServiceUnavailableException('Imported report validation unavailable');await this.relay.authorizeImportedReport(db,actor,id,source.id);}
  else if(!(await db.query('SELECT 1 FROM chat_crypto_membership_intervals WHERE conversation_id=$1 AND user_id=$2 AND start_revision<=$3 AND (end_revision IS NULL OR $3<end_revision)',[id,actor.userId,source.crypto_revision])).rowCount)chatError(ErrorCode.FORBIDDEN,'Report source unavailable');
 }
 async uploadImage(actor:ChatActor,input:unknown,file?:{buffer:Buffer;size:number;mimetype:string}){
  if(!this.schemaReady)throw new ServiceUnavailableException('Chat crypto schema unavailable');
  if(!actor)chatError(ErrorCode.LOGIN_REQUIRED,'Login required');const checked=ReportImageDisclosureSchema.safeParse(input);if(!checked.success)chatError(ErrorCode.INVALID_INPUT,'Invalid image disclosure');const parsed=checked.data;
  if(!file||!Buffer.isBuffer(file.buffer)||file.size!==file.buffer.length||file.size!==parsed.plaintextSize||file.size>MAX_IMAGE_SIZE_BYTES)chatError(ErrorCode.INVALID_INPUT,'Invalid disclosure bytes');
  const custody=this.custody,secret=process.env.BETTER_AUTH_SECRET;
  if(!custody?.transit||!Number.isSafeInteger(custody.retentionSeconds)||custody.retentionSeconds<=0||custody.retentionSeconds>2147483647||!secret||secret.length<32)throw new ServiceUnavailableException('Report custody unavailable');
  const fingerprint=createHmac('sha256',secret).update(JSON.stringify(['FG_REPORT_RETRY',1,actor.userId,parsed.conversationId,parsed.messageId,parsed.clientUploadId])).update(Buffer.from([0])).update(file.buffer).digest();
  const db=await this.pool.connect();let created:string|undefined;
  try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');await this.chat.authorize(parsed.conversationId,actor,db);
   const state=(await db.query(`SELECT mode,migration_state,membership_revision FROM chat_crypto_state WHERE conversation_id=$1 FOR SHARE`,[parsed.conversationId])).rows[0];
   if(state?.mode!=='E2EE'||state.migration_state!=='RECONCILED')chatError(ErrorCode.FORBIDDEN,'Report source unavailable');await this.chat.authorize(parsed.conversationId,actor,db);
   const source=(await db.query(`SELECT m.*,EXISTS(SELECT 1 FROM chat_crypto_legacy_migrations lm WHERE lm.message_id=m.id) AS legacy FROM messages m WHERE m.id=$1 AND m.conversation_id=$2 FOR SHARE OF m`,[parsed.messageId,parsed.conversationId])).rows[0];
   if(!source)chatError(ErrorCode.FORBIDDEN,'Report source unavailable');await this.reportSource(db,actor,parsed.conversationId,source);
   if(source.type!=='IMAGE'||!(await db.query(`SELECT 1 FROM attachments WHERE message_id=$1 AND encryption_mode='E2EE'`,[source.id])).rowCount)chatError(ErrorCode.INVALID_INPUT,'Image source required');
   let actual:string|undefined;
   if(file.buffer.subarray(0,3).equals(Buffer.from([255,216,255])))actual='image/jpeg';else if(file.buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))actual='image/png';else if(file.buffer.toString('ascii',0,4)==='RIFF'&&file.buffer.toString('ascii',8,12)==='WEBP')actual='image/webp';
   if(!actual||actual!==file.mimetype)chatError(ErrorCode.INVALID_INPUT,'Invalid disclosure image');
   let encoded:Buffer;
   try{const image=sharp(file.buffer,{limitInputPixels:MAX_IMAGE_PIXELS}),meta=await image.metadata();if(!meta.width||!meta.height||meta.width*meta.height>MAX_IMAGE_PIXELS||(meta.pages??1)>1)throw new Error();encoded=await image.rotate().webp({quality:90}).toBuffer();if(!encoded.length||encoded.length>MAX_IMAGE_SIZE_BYTES)throw new Error();}catch{chatError(ErrorCode.INVALID_INPUT,'Invalid disclosure image');}
   await db.query(`SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_crypto_upload',$1::text,$2::text)::text,0::bigint))`,[actor.userId,parsed.clientUploadId]);
   const existing=(await db.query(`SELECT d.*,s.source_message_id,s.retry_fingerprint FROM chat_crypto_upload_drafts d LEFT JOIN chat_crypto_report_upload_sources s ON s.upload_id=d.id WHERE d.uploader_id=$1 AND d.client_upload_id=$2 FOR UPDATE OF d`,[actor.userId,parsed.clientUploadId])).rows[0];
   if(existing){const old=Buffer.from(existing.retry_fingerprint??'','base64');if(existing.encryption_mode!=='REPORT_AEAD'||existing.conversation_id!==parsed.conversationId||existing.source_message_id!==parsed.messageId||Number(existing.membership_revision)!==Number(state.membership_revision)||old.length!==fingerprint.length||!timingSafeEqual(old,fingerprint))throw new ConflictException('Upload retry conflicts');if(existing.consumed_at||existing.expires_at.getTime()<=Date.now())chatError(ErrorCode.FORBIDDEN,'Draft no longer available');await this.verifyObject(existing);await this.reportSource(db,actor,parsed.conversationId,source);await db.query('COMMIT');return ReportAttachmentReceiptSchema.parse({id:existing.id,expiresAt:existing.expires_at.toISOString()});}
   const id=randomUUID(),objectId='rimg1:'+createHash('sha256').update(JSON.stringify(['FG_REPORT_IMAGE',1,actor.userId,parsed.conversationId,parsed.messageId,id])).digest('hex');
   let envelope;try{envelope=await custody.transit.encrypt('fg-report',encoded,{kind:'REPORT_IMAGE',conversationId:parsed.conversationId,objectId});}catch{throw new ServiceUnavailableException('Report custody unavailable');}finally{encoded.fill(0);}
   const bytes=Buffer.from(JSON.stringify(envelope)),key=id+'.bin';await lockCryptoObjectWrite(db,key);await this.objects.put(key,bytes);created=key;
   const row=(await db.query(`INSERT INTO chat_crypto_upload_drafts(id,uploader_id,conversation_id,client_upload_id,membership_revision,encryption_mode,object_key,ciphertext_size,ciphertext_sha256,envelope,expires_at) VALUES($1,$2,$3,$4,$5,'REPORT_AEAD',$6,$7,$8,$9,now()+$10*interval '1 millisecond') RETURNING expires_at`,[id,actor.userId,parsed.conversationId,parsed.clientUploadId,state.membership_revision,key,bytes.length,createHash('sha256').update(bytes).digest('base64').replace(/=+$/,''),envelope,IMAGE_DRAFT_TTL_MS])).rows[0];
   await db.query(`INSERT INTO chat_crypto_report_upload_sources(upload_id,source_message_id,retry_fingerprint) VALUES($1,$2,$3)`,[id,parsed.messageId,fingerprint.toString('base64').replace(/=+$/,'')]);await this.reportSource(db,actor,parsed.conversationId,source);await db.query('COMMIT');return ReportAttachmentReceiptSchema.parse({id,expiresAt:row.expires_at.toISOString()});
  }catch(error){await db.query('ROLLBACK');if(created)await this.objects.remove(created);throw error;}finally{db.release();}
 }
}
