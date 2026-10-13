import {cryptoSchemaAvailable} from './crypto-schema-readiness.js';
import {Injectable,OnModuleInit,OnModuleDestroy,ConflictException,ServiceUnavailableException} from '@nestjs/common';
import {Pool,PoolClient} from 'pg';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,timingSafeEqual,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {LegacyBatchQuerySchema,LegacyImageQuerySchema,LegacySourceManifestSchema,LegacyMigrationItemSchema,CommitLegacyCiphertextSchema,LegacyCandidateSchema,LegacyCandidateQuerySchema,LegacyRoundtripAttestationSchema,LegacyReconcileRequestSchema,ErrorCode} from '@fg/contracts';
import {ChatService,ChatActor,chatError} from '../chat/chat.service.js';
import {canonicalSignedPayload,matrixBase64,verifyLegacyRoundtripAttestation} from './matrix-signatures.js';
import {CryptoObjectStore} from './crypto-object-store.js';
type Row=Record<string,unknown>;
type Source=z.infer<typeof LegacyMigrationItemSchema>;
const maximum=5*1024*1024,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
@Injectable()
export class CryptoLegacyService implements OnModuleInit,OnModuleDestroy{
 private readonly objects=new CryptoObjectStore();private objectInitialization?:Promise<void>;
 private schemaReady=false;private cleanupEnabled=false;private pool!:Pool;private directory!:string;private runtimeRoot!:string;private realDirectory?:string;
 constructor(private readonly chat:ChatService){}
 async onModuleInit(){
  const cwd=process.cwd(),codeRoot=path.basename(cwd)==='api'&&path.basename(path.dirname(cwd))==='apps'?path.resolve(cwd,'../..'):cwd,root=path.join(codeRoot,'.runtime');
  this.directory=path.resolve(process.env.FG_UPLOADS_DIR??path.join(root,'chat-images'));if(!this.directory.startsWith(root+path.sep))throw new Error('Legacy image storage must remain inside code runtime');
  this.runtimeRoot=root;this.cleanupEnabled=process.env.FG_LEGACY_SOURCE_CLEANUP==='enabled';
  this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000,statement_timeout:10000});this.schemaReady=await cryptoSchemaAvailable(this.pool);
 }
 async onModuleDestroy(){await this.pool?.end();}
 private parse<T>(schema:z.ZodType<T>,input:unknown){const parsed=schema.safeParse(input);if(!parsed.success)chatError(ErrorCode.INVALID_INPUT,'Invalid legacy migration request');return parsed.data;}
 private publicDigest(value:string){try{return matrixBase64(value,32);}catch{chatError(ErrorCode.INVALID_INPUT,'Invalid migration public encoding');}}
 private async device(db:PoolClient,userId:string,deviceId:string,cohortId:string){
  const eligible=(await db.query(`SELECT d.ed25519_key,d.curve25519_key FROM chat_crypto_devices d JOIN chat_crypto_history_cohorts c ON c.id=$3 WHERE d.user_id=$1 AND d.device_id=$2 AND d.revoked_at IS NULL AND d.created_at<=c.verified_at`,[userId,deviceId,cohortId])).rows[0];
  if(!eligible)chatError(ErrorCode.FORBIDDEN,'Historical device unavailable');return eligible;
 }
 private async authorizeCohort(db:PoolClient,actor:NonNullable<ChatActor>,id:string,deviceId:string,cohortId:string){
  const cohort=(await db.query(`SELECT c.id FROM chat_crypto_history_cohorts c JOIN chat_crypto_cohort_members m ON m.cohort_id=c.id AND m.conversation_id=c.conversation_id WHERE c.id=$1 AND c.conversation_id=$2 AND m.user_id=$3 AND c.verified_at<=clock_timestamp() FOR SHARE OF c,m`,[cohortId,id,actor.userId])).rowCount;
  if(!cohort)chatError(ErrorCode.FORBIDDEN,'Historical cohort access denied');await this.device(db,actor.userId,deviceId,cohortId);
 }
 private async transaction<T>(actor:ChatActor,id:string,deviceId:string,cohortId:string,action:(db:PoolClient)=>Promise<T>,allowCompleted=false){
  if(!actor)chatError(ErrorCode.LOGIN_REQUIRED,'Login required');if(!this.schemaReady)throw new ServiceUnavailableException('Chat crypto schema unavailable');const db=await this.pool.connect();try{
   await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');await this.chat.authorize(id,actor,db,true);
   await db.query('SELECT id FROM conversations WHERE id=$1 FOR UPDATE',[id]);
   const state=(await db.query('SELECT * FROM chat_crypto_state WHERE conversation_id=$1 FOR UPDATE',[id])).rows[0];
   if(!state||state.mode!=='E2EE'||state.history_status!=='KNOWN'||!(allowCompleted?['LEGACY_PENDING','MIGRATING','RECONCILED']:['LEGACY_PENDING','MIGRATING']).includes(state.migration_state))chatError(ErrorCode.FORBIDDEN,'Verified historical source unavailable');
   await this.authorizeCohort(db,actor,id,deviceId,cohortId);
   const result=await action(db);await this.chat.authorize(id,actor,db,true);await this.device(db,actor.userId,deviceId,cohortId);await db.query('COMMIT');return result;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 /** Read through a bounded handle and compare path/handle identity. No source
  * normalization, deletion or candidate writes happen in this read boundary. */
 private async image(id:string):Promise<Buffer>{
  if(!uuid.test(id))throw new ServiceUnavailableException('Historical image unavailable');let handle:fs.FileHandle|undefined,bytes:Buffer|undefined;
  try{
   const realRoot=await fs.realpath(this.runtimeRoot);if(realRoot!==path.join(await fs.realpath(path.dirname(this.runtimeRoot)),'.runtime'))throw new Error();const realDirectory=await fs.realpath(this.directory);if(!realDirectory.startsWith(realRoot+path.sep))throw new Error();if(this.realDirectory&&realDirectory!==this.realDirectory)throw new Error();this.realDirectory=realDirectory;
   const file=path.join(this.directory,id+'.webp'),before=await fs.lstat(file);if(!before.isFile()||before.isSymbolicLink()||before.size<1||before.size>maximum||await fs.realpath(file)!==path.join(realDirectory,id+'.webp'))throw new Error();
   handle=await fs.open(file,'r');const opened=await handle.stat();if(opened.ino!==before.ino||opened.dev!==before.dev||opened.size!==before.size||opened.mtimeMs!==before.mtimeMs)throw new Error();
   bytes=Buffer.alloc(opened.size+1);let used=0;while(used<bytes.length){const read=await handle.read(bytes,used,bytes.length-used,used);if(!read.bytesRead)break;used+=read.bytesRead;}
   const after=await handle.stat();if(used!==opened.size||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')throw new Error();return bytes.subarray(0,used);
  }catch{bytes?.fill(0);throw new ServiceUnavailableException('Historical image unavailable');}finally{await handle?.close();}
 }
 private async source(db:PoolClient,id:string,conversationId:string,cohortId:string){
  const row=(await db.query(`SELECT m.*,to_char(m.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso,to_char(m.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_iso,lm.original_sha256 FROM messages m JOIN chat_crypto_legacy_migrations lm ON lm.message_id=m.id AND lm.conversation_id=m.conversation_id WHERE m.id=$1 AND m.conversation_id=$2 AND lm.cohort_id=$3 AND lm.state='PREPARED' AND m.encryption_mode='LEGACY_PENDING' FOR SHARE OF m,lm`,[id,conversationId,cohortId])).rows[0] as Row|undefined;
  if(!row)chatError(ErrorCode.NOT_FOUND,'Mapped historical source not found');const images=(await db.query(`SELECT * FROM attachments WHERE message_id=$1 AND conversation_id=$2 ORDER BY id COLLATE "C" FOR SHARE`,[id,conversationId])).rows;
  const attachments=[];for(const image of images){if(image.encryption_mode!=='LEGACY_PENDING'||image.crypto_envelope||image.mime_type!=='image/webp')throw new ConflictException('Historical image changed');const bytes=await this.image(image.id);try{if(bytes.length!==image.file_size)throw new ConflictException('Historical image changed');attachments.push({id:image.id,fileName:image.file_name,fileSize:image.file_size,mimeType:image.mime_type,plaintextSha256:createHash('sha256').update(bytes).digest('base64').replace(/=+$/,'')});}finally{bytes.fill(0);}}
  const mentioned=(await db.query(`SELECT mentioned_user_id FROM mentions WHERE message_id=$1 ORDER BY mentioned_user_id COLLATE "C" FOR SHARE`,[id])).rows;
  const parsed=LegacySourceManifestSchema.safeParse({version:1,conversationId,messageId:row.id,senderId:row.sender_id,clientMessageId:row.client_message_id,type:row.type,content:row.content,replyToId:row.reply_to_id,mentionedUserIds:mentioned.map(item=>item.mentioned_user_id),createdAt:row.created_iso,updatedAt:row.updated_iso,attachments});if(!parsed.success)throw new ConflictException('Historical source shape changed');
  const digest=createHash('sha256').update(canonicalSignedPayload(parsed.data)).digest();let expected:Buffer;try{expected=matrixBase64(String(row.original_sha256),32);}catch{throw new ConflictException('Historical source digest unavailable');}if(!timingSafeEqual(expected,digest))throw new ConflictException('Historical source changed');
  return LegacyMigrationItemSchema.parse({messageId:row.id,originalSha256:digest.toString('base64').replace(/=+$/,''),createdAt:row.created_iso,senderId:row.sender_id,content:row.content,attachmentIds:attachments.map(item=>item.id),sourceManifest:parsed.data});
 }
 private async availableCohort(db:PoolClient,id:string,cohortId:string){
  const rows=(await db.query(`SELECT m.user_id,
   EXISTS(SELECT 1 FROM chat_crypto_devices d JOIN chat_crypto_history_cohorts h ON h.id=m.cohort_id WHERE d.user_id=m.user_id AND d.revoked_at IS NULL AND d.created_at<=h.verified_at) AS device_available,
   EXISTS(SELECT 1 FROM conversations c WHERE c.id=$1 AND (c.user1_id=m.user_id OR c.user2_id=m.user_id OR EXISTS(SELECT 1 FROM rooms r JOIN room_members rm ON rm.room_id=r.id WHERE r.conversation_id=c.id AND rm.user_id=m.user_id) OR (NOT EXISTS(SELECT 1 FROM rooms r WHERE r.conversation_id=c.id) AND EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.user_id=m.user_id)))) AS member_available,
   COALESCE((SELECT a.action='BAN' FROM admin_actions a WHERE a.target_user_id=m.user_id AND a.action IN ('BAN','UNBAN') ORDER BY a.created_at DESC,a.id DESC LIMIT 1),false) AS banned
   FROM chat_crypto_cohort_members m WHERE m.cohort_id=$2 AND m.conversation_id=$1 ORDER BY m.user_id LIMIT 1001 FOR SHARE OF m`,[id,cohortId])).rows;
  if(!rows.length||rows.length>1000||rows.some(row=>!row.device_available||!row.member_available||row.banned))throw new ConflictException('Historical recipient unavailable');
 }
 /** Only prepares ciphertext. Source rows and reconciliation state remain intact. */
 async prepare(actor:ChatActor,id:string,input:unknown){
  if(!actor)chatError(ErrorCode.LOGIN_REQUIRED,'Login required');const parsed=this.parse(CommitLegacyCiphertextSchema,input),claimedDigest=this.publicDigest(parsed.originalSha256),sessionId=this.publicDigest(parsed.envelope.event.session_id).toString('base64').replace(/=+$/,'');
  return this.transaction(actor,id,parsed.deviceId,parsed.cohortId,async db=>{
   const registered=await this.device(db,actor.userId,parsed.deviceId,parsed.cohortId);
   if(parsed.envelope.event.device_id!==undefined&&parsed.envelope.event.device_id!==parsed.deviceId)chatError(ErrorCode.FORBIDDEN,'Migration sender device mismatch');
   if(parsed.envelope.event.sender_key!==undefined&&!timingSafeEqual(this.publicDigest(parsed.envelope.event.sender_key),matrixBase64(registered.curve25519_key,32)))chatError(ErrorCode.FORBIDDEN,'Migration sender key mismatch');
   const state=(await db.query('SELECT membership_revision FROM chat_crypto_state WHERE conversation_id=$1',[id])).rows[0];if(Number(state.membership_revision)!==parsed.membershipRevision)throw new ConflictException('Membership revision changed');
   await this.availableCohort(db,id,parsed.cohortId);const source=await this.source(db,parsed.messageId,id,parsed.cohortId);
   if(!timingSafeEqual(claimedDigest,matrixBase64(source.originalSha256,32)))throw new ConflictException('Historical source changed');
   const mappings=(parsed.attachmentMappings??[]).map(mapping=>({...mapping,plaintextSha256:this.publicDigest(mapping.plaintextSha256).toString('base64').replace(/=+$/,''),ciphertextSha256:this.publicDigest(mapping.ciphertextSha256).toString('base64').replace(/=+$/,'')}));
   if(JSON.stringify(mappings.map(mapping=>mapping.attachmentId))!==JSON.stringify(source.attachmentIds))throw new ConflictException('Historical image mapping incomplete');
   const envelopeSha256=createHash('sha256').update(canonicalSignedPayload(parsed.envelope)).digest('base64').replace(/=+$/,'');
   let row=(await db.query('SELECT * FROM chat_crypto_legacy_candidates WHERE message_id=$1 AND membership_revision=$2 FOR UPDATE',[parsed.messageId,parsed.membershipRevision])).rows[0];
   const existingImages=row?(await db.query('SELECT * FROM chat_crypto_legacy_candidate_images WHERE candidate_id=$1 ORDER BY attachment_id COLLATE "C" FOR SHARE',[row.id])).rows:[];
   if(row&&JSON.stringify(existingImages.map(image=>({attachmentId:image.attachment_id,draftId:image.draft_id,plaintextSha256:image.plaintext_sha256,ciphertextSha256:image.ciphertext_sha256})))!==JSON.stringify(mappings))throw new ConflictException('Historical image mapping conflicts');
   for(const mapping of [...mappings].sort((a,b)=>a.draftId<b.draftId?-1:a.draftId>b.draftId?1:0)){
    const original=source.sourceManifest.attachments.find(image=>image.id===mapping.attachmentId)!,draft=(await db.query('SELECT * FROM chat_crypto_upload_drafts WHERE id=$1 FOR UPDATE',[mapping.draftId])).rows[0];
    if(!draft||draft.uploader_id!==actor.userId||draft.device_id!==parsed.deviceId||draft.conversation_id!==id||draft.cohort_id!==parsed.cohortId||Number(draft.membership_revision)!==parsed.membershipRevision||draft.encryption_mode!=='E2EE'||draft.envelope||draft.consumed_at||draft.message_id||draft.report_evidence_id||(!row&&draft.expires_at.getTime()<=Date.now())||mapping.plaintextSha256!==original.plaintextSha256||mapping.ciphertextSha256!==draft.ciphertext_sha256)throw new ConflictException('Historical image draft binding denied');
    const bytes=await this.ciphertext(draft);bytes.fill(0);
   }
   if(row){if((parsed.candidateId&&parsed.candidateId!==row.id)||row.conversation_id!==id||row.cohort_id!==parsed.cohortId||row.importer_user_id!==actor.userId||row.importer_device_id!==parsed.deviceId||row.original_sha256!==source.originalSha256||row.envelope_sha256!==envelopeSha256||canonicalSignedPayload(row.envelope)!==canonicalSignedPayload(parsed.envelope))throw new ConflictException('Historical candidate conflicts');}
   else{
    const session=(await db.query('SELECT * FROM chat_crypto_outbound_sessions WHERE session_id=$1',[sessionId])).rows[0];
    if(session&&(session.conversation_id!==id||session.sender_user_id!==actor.userId||session.sender_device_id!==parsed.deviceId||Number(session.membership_revision)!==parsed.membershipRevision))throw new ConflictException('Migration session conflicts');
    const incompatible=(await db.query("SELECT 1 FROM chat_crypto_legacy_candidates WHERE rtrim(envelope->'event'->>'session_id','=')=$1 AND cohort_id<>$2 LIMIT 1",[sessionId,parsed.cohortId])).rowCount;if(incompatible)throw new ConflictException('Migration session cohort conflicts');
    if(!session)await db.query('INSERT INTO chat_crypto_outbound_sessions(session_id,conversation_id,sender_user_id,sender_device_id,membership_revision) VALUES($1,$2,$3,$4,$5)',[sessionId,id,actor.userId,parsed.deviceId,parsed.membershipRevision]);
    try{row=(await db.query('INSERT INTO chat_crypto_legacy_candidates(id,message_id,conversation_id,cohort_id,membership_revision,original_sha256,envelope_sha256,importer_user_id,importer_device_id,envelope) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[parsed.candidateId??randomUUID(),parsed.messageId,id,parsed.cohortId,parsed.membershipRevision,source.originalSha256,envelopeSha256,actor.userId,parsed.deviceId,parsed.envelope])).rows[0];}catch(error){if((error as {code?:string}).code==='23505')throw new ConflictException('Historical candidate conflicts');throw error;}
   }
   if(!existingImages.length)for(const mapping of mappings){try{await db.query('INSERT INTO chat_crypto_legacy_candidate_images(candidate_id,attachment_id,draft_id,plaintext_sha256,ciphertext_sha256) VALUES($1,$2,$3,$4,$5)',[row.id,mapping.attachmentId,mapping.draftId,mapping.plaintextSha256,mapping.ciphertextSha256]);}catch(error){if((error as {code?:string}).code==='23505')throw new ConflictException('Historical image draft already claimed');throw error;}}
   const bound=await this.boundCandidate(db,id,parsed.cohortId,row.id);await this.availableCohort(db,id,parsed.cohortId);
   return this.candidateDto(row,bound.images.map(image=>image.attachment_id));
  });
 }
 private candidateDto(row:Row,attachmentIds:string[]=[]){return LegacyCandidateSchema.parse({candidateId:row.id,messageId:row.message_id,conversationId:row.conversation_id,cohortId:row.cohort_id,membershipRevision:Number(row.membership_revision),originalSha256:row.original_sha256,envelopeSha256:row.envelope_sha256,importerUserId:row.importer_user_id,importerDeviceId:row.importer_device_id,envelope:row.envelope,attachmentIds,preparedAt:(row.prepared_at as Date).toISOString(),state:'PREPARED'});}
 /** Object bytes stay opaque; the native descriptor never enters this service. */
 private async ciphertext(draft:Row){
  this.objectInitialization??=this.objects.initialize();await this.objectInitialization;let bytes:Buffer|undefined;
  try{bytes=await this.objects.read(String(draft.object_key));if(bytes.length!==draft.ciphertext_size||!timingSafeEqual(createHash('sha256').update(bytes).digest(),matrixBase64(String(draft.ciphertext_sha256),32)))throw new Error();return bytes;}catch{bytes?.fill(0);throw new ConflictException('Historical ciphertext object changed');}
 }
 private async mappedImages(db:PoolClient,row:Row,source:Source){
  const images=(await db.query(`SELECT ci.*,d.uploader_id,d.device_id,d.conversation_id,d.cohort_id,d.membership_revision,d.encryption_mode,d.envelope,d.consumed_at,d.message_id,d.report_evidence_id,d.object_key,d.ciphertext_size,d.ciphertext_sha256 AS draft_sha256 FROM chat_crypto_legacy_candidate_images ci JOIN chat_crypto_upload_drafts d ON d.id=ci.draft_id WHERE ci.candidate_id=$1 ORDER BY ci.attachment_id COLLATE "C" FOR SHARE OF ci FOR UPDATE OF d`,[row.id])).rows;
  if(JSON.stringify(images.map(image=>image.attachment_id))!==JSON.stringify(source.attachmentIds))throw new ConflictException('Historical image mapping changed');
  for(const [index,image]of images.entries()){
   if(image.uploader_id!==row.importer_user_id||image.device_id!==row.importer_device_id||image.conversation_id!==row.conversation_id||image.cohort_id!==row.cohort_id||Number(image.membership_revision)!==Number(row.membership_revision)||image.encryption_mode!=='E2EE'||image.envelope||image.consumed_at||image.message_id||image.report_evidence_id||image.plaintext_sha256!==source.sourceManifest.attachments[index].plaintextSha256||image.ciphertext_sha256!==image.draft_sha256)throw new ConflictException('Historical image mapping changed');
   const bytes=await this.ciphertext(image);bytes.fill(0);
  }
  return images;
 }
 private async convertedImages(db:PoolClient,row:Row){
  const attachments=(await db.query('SELECT * FROM attachments WHERE message_id=$1 AND conversation_id=$2 ORDER BY id COLLATE "C" FOR SHARE',[row.message_id,row.conversation_id])).rows;
  const images=(await db.query(`SELECT ci.*,d.uploader_id,d.device_id,d.conversation_id,d.cohort_id,d.membership_revision,d.encryption_mode,d.envelope,d.consumed_at,d.message_id,d.report_evidence_id,d.object_key,d.ciphertext_size,d.ciphertext_sha256 AS draft_sha256 FROM chat_crypto_legacy_candidate_images ci JOIN chat_crypto_upload_drafts d ON d.id=ci.draft_id WHERE ci.candidate_id=$1 ORDER BY ci.attachment_id COLLATE "C" FOR SHARE OF ci FOR UPDATE OF d`,[row.id])).rows;
  if(images.length!==attachments.length||images.length>4)throw new ConflictException('Converted image mapping changed');
  for(const [index,image]of images.entries()){
   const attachment=attachments[index];if(image.attachment_id!==attachment.id||attachment.encryption_mode!=='E2EE'||attachment.crypto_envelope||attachment.file_name!==''||attachment.mime_type!=='application/octet-stream'||attachment.file_size!==image.ciphertext_size||attachment.url!==`/api/v1/crypto/conversations/${encodeURIComponent(String(row.conversation_id))}/attachments/${encodeURIComponent(String(image.attachment_id))}`||image.uploader_id!==row.importer_user_id||image.device_id!==row.importer_device_id||image.conversation_id!==row.conversation_id||image.cohort_id!==row.cohort_id||Number(image.membership_revision)!==Number(row.membership_revision)||image.encryption_mode!=='E2EE'||image.envelope||!image.consumed_at||image.message_id!==row.message_id||image.report_evidence_id||image.ciphertext_sha256!==image.draft_sha256)throw new ConflictException('Converted image mapping changed');
   const bytes=await this.ciphertext(image);bytes.fill(0);
  }
  return images;
 }
 async candidateContent(actor:ChatActor,id:string,candidateId:string,attachmentId:string,input:unknown){
  const parsed=this.parse(LegacyCandidateQuerySchema,input),candidate=this.parse(z.string().min(1).max(128),candidateId),attachment=this.parse(z.string().min(1).max(128),attachmentId);let bytes:Buffer|undefined;
  try{return await this.transaction(actor,id,parsed.deviceId,parsed.cohortId,async db=>{const bound=await this.boundCandidate(db,id,parsed.cohortId,candidate),image=bound.images.find(image=>image.attachment_id===attachment);if(!image)chatError(ErrorCode.NOT_FOUND,'Historical candidate image not found');bytes=await this.ciphertext(image);await this.boundCandidate(db,id,parsed.cohortId,candidate);await this.availableCohort(db,id,parsed.cohortId);return bytes;});}catch(error){bytes?.fill(0);throw error;}
 }
 private async boundCandidate(db:PoolClient,id:string,cohortId:string,candidateId:string,converted=false,completed=false){
  const row=(await db.query('SELECT * FROM chat_crypto_legacy_candidates WHERE id=$1 AND conversation_id=$2 AND cohort_id=$3 FOR UPDATE',[candidateId,id,cohortId])).rows[0];if(!row)chatError(ErrorCode.NOT_FOUND,'Historical candidate not found');
  const state=(await db.query('SELECT membership_revision,migration_state FROM chat_crypto_state WHERE conversation_id=$1',[id])).rows[0];if(completed?(state.migration_state!=='RECONCILED'||Number(state.membership_revision)<Number(row.membership_revision)+1):Number(state.membership_revision)!==Number(row.membership_revision))throw new ConflictException('Membership revision changed');
  if(!completed){await this.availableCohort(db,id,cohortId);await this.device(db,row.importer_user_id,row.importer_device_id,cohortId);}
  let source:Source|undefined;
  if(converted){const message=(await db.query(`SELECT m.*,lm.original_sha256,lm.cohort_id,lm.state,lm.reconciled_at FROM messages m JOIN chat_crypto_legacy_migrations lm ON lm.message_id=m.id AND lm.conversation_id=m.conversation_id WHERE m.id=$1 AND m.conversation_id=$2 FOR SHARE OF m,lm`,[row.message_id,id])).rows[0];if(!message||message.encryption_mode!=='E2EE'||message.content!==''||message.state!=='RECONCILED'||!message.reconciled_at||message.cohort_id!==cohortId||message.original_sha256!==row.original_sha256||Number(message.crypto_revision)!==Number(row.membership_revision)||canonicalSignedPayload(message.crypto_envelope)!==canonicalSignedPayload(row.envelope))throw new ConflictException('Converted source binding changed');}
  else{source=await this.source(db,row.message_id,id,cohortId);if(row.original_sha256!==source.originalSha256)throw new ConflictException('Historical candidate binding changed');}
  if(row.envelope_sha256!==createHash('sha256').update(canonicalSignedPayload(row.envelope)).digest('base64').replace(/=+$/,''))throw new ConflictException('Historical candidate binding changed');
  const images=converted?await this.convertedImages(db,row):await this.mappedImages(db,row,source!);
  const sessionId=this.publicDigest(row.envelope.event.session_id).toString('base64').replace(/=+$/,''),session=(await db.query('SELECT * FROM chat_crypto_outbound_sessions WHERE session_id=$1 FOR SHARE',[sessionId])).rows[0];if(!session||session.conversation_id!==id||session.sender_user_id!==row.importer_user_id||session.sender_device_id!==row.importer_device_id||Number(session.membership_revision)!==Number(row.membership_revision))throw new ConflictException('Migration session binding changed');
  return {row,images,expected:{candidateId:row.id,messageId:row.message_id,conversationId:id,cohortId,membershipRevision:Number(row.membership_revision),originalSha256:row.original_sha256,envelopeSha256:row.envelope_sha256,attachmentDigests:images.map(image=>({attachmentId:image.attachment_id,plaintextSha256:image.plaintext_sha256,ciphertextSha256:image.ciphertext_sha256}))}};
 }
 async candidate(actor:ChatActor,id:string,candidateId:string,input:unknown){const parsed=this.parse(LegacyCandidateQuerySchema,input),candidate=this.parse(z.string().min(1).max(128),candidateId);return this.transaction(actor,id,parsed.deviceId,parsed.cohortId,async db=>{const {row,images}=await this.boundCandidate(db,id,parsed.cohortId,candidate);await this.availableCohort(db,id,parsed.cohortId);return this.candidateDto(row,images.map(image=>image.attachment_id));});}
 /** A native signature authenticates the recipient claim, never server decryption. */
 async attest(actor:ChatActor,id:string,input:unknown){
  if(!actor)chatError(ErrorCode.LOGIN_REQUIRED,'Login required');const parsed=this.parse(LegacyRoundtripAttestationSchema,input);if(parsed.userId!==actor.userId||parsed.conversationId!==id)chatError(ErrorCode.FORBIDDEN,'Historical receipt owner denied');
  return this.transaction(actor,id,parsed.deviceId,parsed.cohortId,async db=>{
   const {row,expected}=await this.boundCandidate(db,id,parsed.cohortId,parsed.candidateId),device=await this.device(db,actor.userId,parsed.deviceId,parsed.cohortId);let receipt;
   try{canonicalSignedPayload(parsed.signatures);receipt=verifyLegacyRoundtripAttestation(parsed,{userId:actor.userId,deviceId:parsed.deviceId,ed25519Key:device.ed25519_key},expected);}catch{chatError(ErrorCode.FORBIDDEN,'Historical receipt authentication denied');}
   const json=JSON.stringify(receipt),size=(await db.query('SELECT octet_length($1::jsonb::text) AS bytes',[json])).rows[0].bytes;if(size>16384)chatError(ErrorCode.INVALID_INPUT,'Historical receipt too large');
   const existing=(await db.query('SELECT attestation FROM chat_crypto_legacy_attestations WHERE candidate_id=$1 AND user_id=$2 AND device_id=$3 FOR UPDATE',[row.id,actor.userId,parsed.deviceId])).rows[0];if(existing){if(canonicalSignedPayload(existing.attestation)!==canonicalSignedPayload(receipt)||canonicalSignedPayload(existing.attestation.signatures)!==canonicalSignedPayload(receipt.signatures))throw new ConflictException('Historical receipt conflicts');}
   else await db.query('INSERT INTO chat_crypto_legacy_attestations(candidate_id,cohort_id,user_id,device_id,attestation) VALUES($1,$2,$3,$4,$5)',[row.id,parsed.cohortId,actor.userId,parsed.deviceId,json]);
   await this.boundCandidate(db,id,parsed.cohortId,parsed.candidateId);await this.availableCohort(db,id,parsed.cohortId);return {success:true as const};
  });
 }
 /** Internal review only: no cutoff endpoint, source mutation or success claim. */
 async reviewReconciliation(actor:ChatActor,id:string,input:unknown){
  const parsed=this.parse(LegacyReconcileRequestSchema,input);if(!actor)chatError(ErrorCode.LOGIN_REQUIRED,'Login required');return this.transaction(actor,id,parsed.deviceId,parsed.cohortId,db=>this.cutoffReadiness(db,actor,id,parsed));
 }

 /** Internal non-destructive stage only; plaintext remains LEGACY_PENDING. */
 async stageReconciliation(actor:ChatActor,id:string,input:unknown){
  const parsed=this.parse(LegacyReconcileRequestSchema,input);if(!actor)chatError(ErrorCode.LOGIN_REQUIRED,'Login required');
  return this.transaction(actor,id,parsed.deviceId,parsed.cohortId,async db=>{
   if(parsed.membershipRevision>=Number.MAX_SAFE_INTEGER)throw new ConflictException('Historical next epoch unavailable');
   const ready=await this.cutoffReadiness(db,actor,id,parsed),snapshot=await this.stageSnapshot(db,id,ready),manifestSha256=createHash('sha256').update(canonicalSignedPayload(snapshot.manifest)).digest('base64').replace(/=+$/,'');
   let stage=(await db.query('SELECT * FROM chat_crypto_legacy_stages WHERE conversation_id=$1 FOR UPDATE',[id])).rows[0];
   if(stage){
    if(stage.phase!=='STAGED'||stage.seed_cohort_id!==parsed.cohortId||Number(stage.membership_revision)!==parsed.membershipRevision||Number(stage.next_live_revision)!==parsed.membershipRevision+1||Number(stage.source_count)!==ready.sourceCount||Number(stage.attachment_count)!==ready.attachmentCount||Number(stage.required_claims)!==ready.requiredDeviceClaims||stage.manifest_sha256!==manifestSha256)throw new ConflictException('Historical stage conflicts');
    await this.validateStageRows(db,stage.id,snapshot);
   }else{
    stage=(await db.query(`INSERT INTO chat_crypto_legacy_stages(id,conversation_id,seed_cohort_id,reviewer_user_id,reviewer_device_id,membership_revision,next_live_revision,source_count,attachment_count,required_claims,manifest_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[randomUUID(),id,parsed.cohortId,actor.userId,parsed.deviceId,parsed.membershipRevision,parsed.membershipRevision+1,ready.sourceCount,ready.attachmentCount,ready.requiredDeviceClaims,manifestSha256])).rows[0];
    for(const source of snapshot.sources)await db.query('INSERT INTO chat_crypto_legacy_stage_sources(stage_id,message_id,candidate_id,cohort_id,conversation_id,membership_revision,original_sha256,envelope_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[stage.id,source.messageId,source.candidateId,source.cohortId,id,parsed.membershipRevision,source.originalSha256,source.envelopeSha256]);
    for(const image of snapshot.objects)await db.query('INSERT INTO chat_crypto_legacy_stage_objects(stage_id,message_id,candidate_id,attachment_id,draft_id,plaintext_sha256,ciphertext_sha256) VALUES($1,$2,$3,$4,$5,$6,$7)',[stage.id,image.messageId,image.candidateId,image.attachmentId,image.draftId,image.plaintextSha256,image.ciphertextSha256]);
    await this.validateStageRows(db,stage.id,snapshot);
   }
   const finalReady=await this.cutoffReadiness(db,actor,id,parsed),finalSnapshot=await this.stageSnapshot(db,id,finalReady);
   if(canonicalSignedPayload(finalSnapshot.manifest)!==canonicalSignedPayload(snapshot.manifest))throw new ConflictException('Historical stage changed');
   return {operationId:stage.id as string,conversationId:id,phase:'STAGED' as const,membershipRevision:parsed.membershipRevision,nextLiveRevision:parsed.membershipRevision+1,sourceCount:ready.sourceCount,attachmentCount:ready.attachmentCount,requiredDeviceClaims:ready.requiredDeviceClaims,manifestSha256};
  });
 }
 /** Internal DB conversion only. Pending physical cleanup keeps all readers closed. */
 async convertStagedReconciliation(actor:ChatActor,id:string,input:unknown){
  const parsed=this.parse(LegacyReconcileRequestSchema,input);if(!actor)chatError(ErrorCode.LOGIN_REQUIRED,'Login required');return this.transaction(actor,id,parsed.deviceId,parsed.cohortId,async db=>{
   const stage=(await db.query('SELECT * FROM chat_crypto_legacy_stages WHERE conversation_id=$1 FOR UPDATE',[id])).rows[0],state=(await db.query('SELECT migration_state FROM chat_crypto_state WHERE conversation_id=$1',[id])).rows[0];
   if(!stage||!['STAGED','DB_CONVERTED'].includes(stage.phase)||stage.seed_cohort_id!==parsed.cohortId||Number(stage.membership_revision)!==parsed.membershipRevision||Number(stage.next_live_revision)!==parsed.membershipRevision+1||Number(stage.source_count)!==parsed.expectedSourceCount||(stage.phase==='STAGED'?state.migration_state!=='LEGACY_PENDING':state.migration_state!=='MIGRATING'))throw new ConflictException('Historical conversion stage conflicts');
   const converted=stage.phase==='DB_CONVERTED',ready=await this.cutoffReadiness(db,actor,id,parsed,converted),snapshot=await this.stageSnapshot(db,id,ready,converted);
   if(Number(stage.attachment_count)!==ready.attachmentCount||Number(stage.required_claims)!==ready.requiredDeviceClaims||stage.manifest_sha256!==createHash('sha256').update(canonicalSignedPayload(snapshot.manifest)).digest('base64').replace(/=+$/,''))throw new ConflictException('Historical conversion manifest changed');await this.validateStageRows(db,stage.id,snapshot);
   await this.sourceRootBinding(db,stage,!converted);
   if(!converted){
    await db.query("UPDATE chat_crypto_state SET migration_state='MIGRATING' WHERE conversation_id=$1",[id]);
    const sourceImages=new Map<string,typeof snapshot.objects>();for(const image of snapshot.objects){const images=sourceImages.get(image.messageId)??[];images.push(image);sourceImages.set(image.messageId,images);}
    for(const source of snapshot.sources){
     const candidate=(await db.query('SELECT envelope FROM chat_crypto_legacy_candidates WHERE id=$1 AND message_id=$2 AND conversation_id=$3 FOR UPDATE',[source.candidateId,source.messageId,id])).rows[0];
     const updated=await db.query("UPDATE messages SET content='',encryption_mode='E2EE',crypto_envelope=$3,crypto_revision=$4 WHERE id=$1 AND conversation_id=$2 AND encryption_mode='LEGACY_PENDING'",[source.messageId,id,candidate.envelope,parsed.membershipRevision]);if(updated.rowCount!==1)throw new ConflictException('Historical conversion source changed');
     for(const image of sourceImages.get(source.messageId)??[]){
      const draft=(await db.query('SELECT ciphertext_size FROM chat_crypto_upload_drafts WHERE id=$1 FOR UPDATE',[image.draftId])).rows[0];const claimed=await db.query(`WITH claim_clock AS MATERIALIZED (SELECT clock_timestamp() AS claimed_at) UPDATE chat_crypto_upload_drafts SET message_id=$2,consumed_at=claim_clock.claimed_at,expires_at=GREATEST(expires_at,claim_clock.claimed_at+interval '1 millisecond') FROM claim_clock WHERE id=$1 AND message_id IS NULL AND consumed_at IS NULL`,[image.draftId,source.messageId]);if(claimed.rowCount!==1)throw new ConflictException('Historical conversion object changed');
      const attachment=await db.query("UPDATE attachments SET encryption_mode='E2EE',crypto_envelope=NULL,file_name='',mime_type='application/octet-stream',url=$4,file_size=$5 WHERE id=$1 AND message_id=$2 AND conversation_id=$3 AND encryption_mode='LEGACY_PENDING'",[image.attachmentId,source.messageId,id,`/api/v1/crypto/conversations/${encodeURIComponent(id)}/attachments/${encodeURIComponent(image.attachmentId)}`,draft.ciphertext_size]);if(attachment.rowCount!==1)throw new ConflictException('Historical conversion attachment changed');
     }
     const reconciled=await db.query("UPDATE chat_crypto_legacy_migrations SET state='RECONCILED',reconciled_at=clock_timestamp() WHERE message_id=$1 AND conversation_id=$2 AND state='PREPARED'",[source.messageId,id]);if(reconciled.rowCount!==1)throw new ConflictException('Historical conversion source changed');
    }
    await db.query("UPDATE chat_crypto_legacy_stages SET phase='DB_CONVERTED',converted_at=clock_timestamp() WHERE id=$1",[stage.id]);
   }
   const finalReady=await this.cutoffReadiness(db,actor,id,parsed,true),finalSnapshot=await this.stageSnapshot(db,id,finalReady,true);await this.validateStageRows(db,stage.id,finalSnapshot);if(canonicalSignedPayload(finalSnapshot.manifest)!==canonicalSignedPayload(snapshot.manifest))throw new ConflictException('Historical conversion changed');
   return {operationId:stage.id as string,conversationId:id,phase:'DB_CONVERTED' as const,membershipRevision:parsed.membershipRevision,nextLiveRevision:parsed.membershipRevision+1,sourceCount:ready.sourceCount,attachmentCount:ready.attachmentCount};
  });
 }

 /** A durable public journal pins the source directory before DB conversion. */
 private async sourceRootBinding(db:PoolClient,stage:Row,create=false){
  if(!Number(stage.attachment_count))return;
  try{
   const root=await fs.realpath(this.runtimeRoot),directory=await fs.realpath(this.directory),stat=await fs.lstat(this.directory,{bigint:true});
   if(root!==path.join(await fs.realpath(path.dirname(this.runtimeRoot)),'.runtime')||directory!==this.directory||!directory.startsWith(root+path.sep)||!stat.isDirectory()||stat.isSymbolicLink())throw new Error();
   const scope=(await db.query('SELECT current_database() AS database,current_schema() AS schema')).rows[0],hash=(value:Row)=>createHash('sha256').update(canonicalSignedPayload(value)).digest('hex');
   const scopeSha256=hash(scope),expected={version:1,operationId:stage.id,conversationId:stage.conversation_id,manifestSha256:stage.manifest_sha256,scopeSha256,sourceRootSha256:hash({directory,dev:String(stat.dev),ino:String(stat.ino)})};
   const folder=path.join(path.dirname(this.directory),'legacy-operations');if(create)await fs.mkdir(folder,{recursive:true});
   if(await fs.realpath(folder)!==folder||!folder.startsWith(root+path.sep))throw new Error();
   const file=path.join(folder,hash({scopeSha256,operationId:stage.id})+'.json');
   try{const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>4096||canonicalSignedPayload(JSON.parse(await fs.readFile(file,'utf8')))!==canonicalSignedPayload(expected))throw new Error();}
   catch(error){if(!create||(error as NodeJS.ErrnoException).code!=='ENOENT')throw error;const temp=path.join(folder,randomUUID()+'.tmp');let handle:fs.FileHandle|undefined;try{handle=await fs.open(temp,'wx');await handle.writeFile(JSON.stringify(expected));await handle.sync();await handle.close();handle=undefined;await fs.rename(temp,file);}finally{await handle?.close();await fs.unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}}
  }catch{throw new ServiceUnavailableException('Historical source root binding unavailable');}
 }
 private async removeSource(attachmentId:string,plaintextSha256:string,removed:boolean){
  if(!uuid.test(attachmentId))throw new ServiceUnavailableException('Historical source path unavailable');const file=path.join(this.directory,attachmentId+'.webp');let before;
  try{before=await fs.lstat(file);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw new ServiceUnavailableException('Historical source unavailable');}
  if(removed)throw new ConflictException('Removed historical source reappeared');if(!before.isFile()||before.isSymbolicLink())throw new ServiceUnavailableException('Historical source unavailable');
  const bytes=await this.image(attachmentId);try{
   if(!timingSafeEqual(createHash('sha256').update(bytes).digest(),matrixBase64(plaintextSha256,32)))throw new ConflictException('Historical source changed');
   const after=await fs.lstat(file);if(after.ino!==before.ino||after.dev!==before.dev||after.size!==before.size||after.mtimeMs!==before.mtimeMs||await fs.realpath(file)!==file)throw new ServiceUnavailableException('Historical source changed');await fs.unlink(file);
  }finally{bytes.fill(0);}
 }
 /** Internal, explicitly enabled physical cleanup with committed per-object receipts. */
 async cleanupStagedReconciliation(actor:ChatActor,id:string,input:unknown){
  if(!this.cleanupEnabled)throw new ServiceUnavailableException('Historical source cleanup disabled');const parsed=this.parse(LegacyReconcileRequestSchema,input);if(!actor)chatError(ErrorCode.LOGIN_REQUIRED,'Login required');
  const context=async(db:PoolClient)=>{
   const stage=(await db.query('SELECT * FROM chat_crypto_legacy_stages WHERE conversation_id=$1 FOR UPDATE',[id])).rows[0],state=(await db.query('SELECT * FROM chat_crypto_state WHERE conversation_id=$1',[id])).rows[0];
   if(!stage||!['DB_CONVERTED','CLEANING','RECONCILED'].includes(stage.phase)||stage.seed_cohort_id!==parsed.cohortId||Number(stage.membership_revision)!==parsed.membershipRevision||Number(stage.next_live_revision)!==parsed.membershipRevision+1||Number(stage.source_count)!==parsed.expectedSourceCount)throw new ConflictException('Historical cleanup stage conflicts');
   const completed=stage.phase==='RECONCILED';if(completed?(state.migration_state!=='RECONCILED'||Number(state.membership_revision)<Number(stage.next_live_revision)):(state.migration_state!=='MIGRATING'||Number(state.membership_revision)!==parsed.membershipRevision))throw new ConflictException('Historical cleanup epoch changed');
   const ready=completed?{conversationId:id,cohortId:parsed.cohortId,membershipRevision:parsed.membershipRevision,sourceCount:Number(stage.source_count),attachmentCount:Number(stage.attachment_count),requiredDeviceClaims:Number(stage.required_claims),candidateIds:(await db.query('SELECT candidate_id FROM chat_crypto_legacy_stage_sources WHERE stage_id=$1 ORDER BY message_id COLLATE "C"',[stage.id])).rows.map(row=>row.candidate_id as string)}:await this.cutoffReadiness(db,actor,id,parsed,true);
   const snapshot=await this.stageSnapshot(db,id,ready,true,completed);if(stage.manifest_sha256!==createHash('sha256').update(canonicalSignedPayload(snapshot.manifest)).digest('base64').replace(/=+$/,''))throw new ConflictException('Historical cleanup manifest changed');await this.validateStageRows(db,stage.id,snapshot,true);await this.sourceRootBinding(db,stage);
   const objects=(await db.query('SELECT * FROM chat_crypto_legacy_stage_objects WHERE stage_id=$1 ORDER BY message_id COLLATE "C",attachment_id COLLATE "C" FOR UPDATE',[stage.id])).rows;
   for(const object of objects)if(object.cleanup_state==='REMOVED')await this.removeSource(object.attachment_id,object.plaintext_sha256,true);
   if(completed&&objects.some(object=>object.cleanup_state!=='REMOVED'))throw new ConflictException('Historical cleanup incomplete');return {stage,objects,completed};
  };
  const tx=<T>(action:(db:PoolClient)=>Promise<T>)=>this.transaction(actor,id,parsed.deviceId,parsed.cohortId,action,true);
  await tx(async db=>{const {stage,completed}=await context(db);if(!completed&&stage.phase==='DB_CONVERTED')await db.query("UPDATE chat_crypto_legacy_stages SET phase='CLEANING' WHERE id=$1",[stage.id]);});
  for(let index=0;;index++){
   const more=await tx(async db=>{const {stage,objects,completed}=await context(db),pending=objects.find(object=>object.cleanup_state==='PENDING');if(completed||!pending)return false;if(index>=objects.length)throw new ConflictException('Historical cleanup progress changed');await this.removeSource(pending.attachment_id,pending.plaintext_sha256,false);await db.query("UPDATE chat_crypto_legacy_stage_objects SET cleanup_state='REMOVED',removed_at=clock_timestamp() WHERE stage_id=$1 AND attachment_id=$2 AND cleanup_state='PENDING'",[stage.id,pending.attachment_id]);return true;});if(!more)break;
  }
  return tx(async db=>{
   const {stage,objects,completed}=await context(db);if(objects.some(object=>object.cleanup_state!=='REMOVED'))throw new ConflictException('Historical cleanup incomplete');
   if(!completed){
    const members=(await db.query(`SELECT u.id FROM "user" u WHERE EXISTS(SELECT 1 FROM conversations c WHERE c.id=$1 AND (c.user1_id=u.id OR c.user2_id=u.id OR EXISTS(SELECT 1 FROM rooms r JOIN room_members rm ON rm.room_id=r.id WHERE r.conversation_id=c.id AND rm.user_id=u.id) OR (NOT EXISTS(SELECT 1 FROM rooms r WHERE r.conversation_id=c.id) AND EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.user_id=u.id)))) AND NOT COALESCE((SELECT a.action='BAN' FROM admin_actions a WHERE a.target_user_id=u.id AND a.action IN ('BAN','UNBAN') ORDER BY a.created_at DESC,a.id DESC LIMIT 1),false) ORDER BY u.id`,[id])).rows;
    await db.query('UPDATE chat_crypto_membership_intervals SET end_revision=$2,left_at=clock_timestamp() WHERE conversation_id=$1 AND end_revision IS NULL',[id,stage.next_live_revision]);
    for(const member of members)await db.query('INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES($1,$2,$3,$4,clock_timestamp())',[randomUUID(),id,member.id,stage.next_live_revision]);
    await db.query("UPDATE chat_crypto_legacy_stages SET phase='RECONCILED',completed_at=clock_timestamp() WHERE id=$1",[stage.id]);await db.query("UPDATE chat_crypto_state SET migration_state='RECONCILED',membership_revision=$2 WHERE conversation_id=$1",[id,stage.next_live_revision]);
   }
   return {operationId:stage.id as string,conversationId:id,phase:'RECONCILED' as const,membershipRevision:parsed.membershipRevision,nextLiveRevision:Number(stage.next_live_revision),sourceCount:Number(stage.source_count),attachmentCount:Number(stage.attachment_count)};
  });
 }
 private async stageSnapshot(db:PoolClient,id:string,ready:Awaited<ReturnType<CryptoLegacyService['cutoffReadiness']>>,converted=false,completed=false){
  const sources:{messageId:string;candidateId:string;cohortId:string;originalSha256:string;envelopeSha256:string}[]=[],objects:{messageId:string;candidateId:string;attachmentId:string;draftId:string;plaintextSha256:string;ciphertextSha256:string}[]=[],claims:{candidateId:string;userId:string;deviceId:string;receiptSha256:string}[]=[];
  for(const candidateId of ready.candidateIds){
   const candidate=(await db.query('SELECT cohort_id FROM chat_crypto_legacy_candidates WHERE id=$1 AND conversation_id=$2',[candidateId,id])).rows[0];if(!candidate)throw new ConflictException('Historical candidate changed');const bound=await this.boundCandidate(db,id,candidate.cohort_id,candidateId,converted,completed);
   sources.push({messageId:bound.row.message_id,candidateId,cohortId:candidate.cohort_id,originalSha256:bound.row.original_sha256,envelopeSha256:bound.row.envelope_sha256});
   for(const image of bound.images)objects.push({messageId:bound.row.message_id,candidateId,attachmentId:image.attachment_id,draftId:image.draft_id,plaintextSha256:image.plaintext_sha256,ciphertextSha256:image.ciphertext_sha256});
   const receipts=(await db.query(`SELECT a.user_id,a.device_id,a.attestation,d.ed25519_key FROM chat_crypto_legacy_attestations a JOIN chat_crypto_cohort_members m ON m.cohort_id=a.cohort_id AND m.user_id=a.user_id JOIN chat_crypto_history_cohorts h ON h.id=m.cohort_id AND h.conversation_id=m.conversation_id JOIN chat_crypto_devices d ON d.user_id=a.user_id AND d.device_id=a.device_id AND d.created_at<=h.verified_at AND ($4::boolean OR d.revoked_at IS NULL) WHERE a.candidate_id=$1 AND a.cohort_id=$2 AND m.conversation_id=$3 ORDER BY a.user_id COLLATE "C",a.device_id COLLATE "C" FOR SHARE OF a,d,m,h`,[candidateId,candidate.cohort_id,id,completed])).rows;
   for(const claim of receipts){let receipt;try{receipt=verifyLegacyRoundtripAttestation(claim.attestation,{userId:claim.user_id,deviceId:claim.device_id,ed25519Key:claim.ed25519_key},bound.expected);}catch{throw new ConflictException('Historical stage receipt changed');}claims.push({candidateId,userId:claim.user_id,deviceId:claim.device_id,receiptSha256:createHash('sha256').update(canonicalSignedPayload({receipt})).digest('base64').replace(/=+$/,'')});}
  }
  if(sources.length!==ready.sourceCount||objects.length!==ready.attachmentCount||claims.length!==ready.requiredDeviceClaims)throw new ConflictException('Historical stage coverage changed');
  return {sources,objects,manifest:{version:1,conversationId:id,seedCohortId:ready.cohortId,membershipRevision:ready.membershipRevision,nextLiveRevision:ready.membershipRevision+1,sourceCount:ready.sourceCount,attachmentCount:ready.attachmentCount,requiredDeviceClaims:ready.requiredDeviceClaims,sources,objects,claims}};
 }
 private async validateStageRows(db:PoolClient,stageId:string,snapshot:Awaited<ReturnType<CryptoLegacyService['stageSnapshot']>>,allowRemoved=false){
  const sources=(await db.query(`SELECT message_id AS "messageId",candidate_id AS "candidateId",cohort_id AS "cohortId",original_sha256 AS "originalSha256",envelope_sha256 AS "envelopeSha256" FROM chat_crypto_legacy_stage_sources WHERE stage_id=$1 ORDER BY message_id COLLATE "C" FOR SHARE`,[stageId])).rows;
  const objects=(await db.query(`SELECT message_id AS "messageId",candidate_id AS "candidateId",attachment_id AS "attachmentId",draft_id AS "draftId",plaintext_sha256 AS "plaintextSha256",ciphertext_sha256 AS "ciphertextSha256",cleanup_state,removed_at FROM chat_crypto_legacy_stage_objects WHERE stage_id=$1 ORDER BY message_id COLLATE "C",attachment_id COLLATE "C" FOR SHARE`,[stageId])).rows;
  if(objects.some(row=>!(row.cleanup_state==='PENDING'&&row.removed_at===null)&&!(allowRemoved&&row.cleanup_state==='REMOVED'&&row.removed_at instanceof Date)))throw new ConflictException('Historical stage cleanup changed');
  const publicObjects=objects.map(row=>({messageId:row.messageId,candidateId:row.candidateId,attachmentId:row.attachmentId,draftId:row.draftId,plaintextSha256:row.plaintextSha256,ciphertextSha256:row.ciphertextSha256}));
  if(canonicalSignedPayload({sources,objects:publicObjects})!==canonicalSignedPayload({sources:snapshot.sources,objects:snapshot.objects}))throw new ConflictException('Historical stage rows changed');
 }
 private async cutoffReadiness(db:PoolClient,actor:NonNullable<ChatActor>,id:string,parsed:z.infer<typeof LegacyReconcileRequestSchema>,converted=false){
  const state=(await db.query('SELECT membership_revision FROM chat_crypto_state WHERE conversation_id=$1',[id])).rows[0];if(Number(state.membership_revision)!==parsed.membershipRevision)throw new ConflictException('Membership revision changed');await this.availableCohort(db,id,parsed.cohortId);
  const mode=converted?'E2EE':'LEGACY_PENDING';if(converted&&(await db.query("SELECT 1 FROM messages WHERE conversation_id=$1 AND encryption_mode<>'E2EE' LIMIT 1",[id])).rowCount)throw new ConflictException('Converted source coverage incomplete');
  const count=async()=>Number((await db.query('SELECT count(*) FROM messages WHERE conversation_id=$1 AND encryption_mode=$2',[id,mode])).rows[0].count),sourceCount=await count();if(!Number.isSafeInteger(sourceCount)||sourceCount!==parsed.expectedSourceCount)throw new ConflictException('Historical source count changed');
  const eligible=async(cohortId:string)=>{
   const devices=(await db.query(`SELECT d.user_id,d.device_id,d.ed25519_key FROM chat_crypto_cohort_members m JOIN chat_crypto_history_cohorts h ON h.id=m.cohort_id AND h.conversation_id=m.conversation_id JOIN chat_crypto_devices d ON d.user_id=m.user_id AND d.created_at<=h.verified_at AND d.revoked_at IS NULL WHERE m.conversation_id=$1 AND m.cohort_id=$2 ORDER BY d.user_id COLLATE "C",d.device_id COLLATE "C" LIMIT 100001`,[id,cohortId])).rows;
   if(!devices.length||devices.length>100000)throw new ConflictException('Historical device coverage unavailable');return devices;
  },cohorts=new Map<string,Awaited<ReturnType<typeof eligible>>>(),candidateCohorts=new Map<string,string>(),candidateIds:string[]=[];let after:string|null=null,attachmentCount=0,requiredDeviceClaims=0;
  for(;;){
   const rows:{id:string;cohort_id:string|null;state:string|null;candidate_id:string|null}[]=(await db.query(`SELECT m.id,lm.cohort_id,lm.state,c.id AS candidate_id FROM messages m LEFT JOIN chat_crypto_legacy_migrations lm ON lm.message_id=m.id AND lm.conversation_id=m.conversation_id LEFT JOIN chat_crypto_legacy_candidates c ON c.message_id=m.id AND c.conversation_id=m.conversation_id AND c.membership_revision=$2 WHERE m.conversation_id=$1 AND m.encryption_mode=$4 AND ($3::text IS NULL OR m.id COLLATE "C">$3::text COLLATE "C") ORDER BY m.id COLLATE "C" LIMIT 25 FOR SHARE OF m`,[id,parsed.membershipRevision,after,mode])).rows;if(!rows.length)break;
   for(const source of rows){
    if(!source.cohort_id||source.state!==(converted?'RECONCILED':'PREPARED')||!source.candidate_id)throw new ConflictException('Historical source coverage incomplete');const cohortId=source.cohort_id;
    if(!cohorts.has(cohortId)){await this.authorizeCohort(db,actor,id,parsed.deviceId,cohortId);await this.availableCohort(db,id,cohortId);cohorts.set(cohortId,await eligible(cohortId));if([...cohorts.values()].reduce((sum,devices)=>sum+devices.length,0)>100000)throw new ConflictException('Historical device coverage unavailable');}
    const devices=cohorts.get(cohortId)!,bound=await this.boundCandidate(db,id,cohortId,source.candidate_id,converted);
    const receipts=(await db.query('SELECT user_id,device_id,attestation FROM chat_crypto_legacy_attestations WHERE candidate_id=$1 AND cohort_id=$2 FOR SHARE',[source.candidate_id,cohortId])).rows,claims=new Map(receipts.map(row=>[JSON.stringify([row.user_id,row.device_id]),row.attestation]));
    for(const device of devices){const claim=claims.get(JSON.stringify([device.user_id,device.device_id]));if(!claim)throw new ConflictException('Historical device receipt missing');try{const receipt=LegacyRoundtripAttestationSchema.parse(claim);canonicalSignedPayload(receipt.signatures);verifyLegacyRoundtripAttestation(receipt,{userId:device.user_id,deviceId:device.device_id,ed25519Key:device.ed25519_key},bound.expected);}catch{throw new ConflictException('Historical device receipt changed');}}
    candidateIds.push(source.candidate_id);attachmentCount+=bound.images.length;requiredDeviceClaims+=devices.length;candidateCohorts.set(source.candidate_id,cohortId);
   }
   after=rows.at(-1)!.id;
  }
  // Revalidate earlier sources/objects after the complete receipt pass.
  // This is a read boundary, not an atomic filesystem cutoff/cleanup proof.
  for(const [candidateId,cohortId]of candidateCohorts)await this.boundCandidate(db,id,cohortId,candidateId,converted);
  for(const [cohortId,devices]of cohorts){await this.authorizeCohort(db,actor,id,parsed.deviceId,cohortId);await this.availableCohort(db,id,cohortId);if(JSON.stringify(await eligible(cohortId))!==JSON.stringify(devices))throw new ConflictException('Historical coverage changed');}
  if(!cohorts.has(parsed.cohortId)||candidateIds.length!==sourceCount||await count()!==sourceCount)throw new ConflictException('Historical coverage changed');
  if(!Number.isSafeInteger(requiredDeviceClaims))throw new ConflictException('Historical device coverage unavailable');
  return {conversationId:id,cohortId:parsed.cohortId,...(cohorts.size>1?{cohortIds:[...cohorts.keys()].sort()}:{}),membershipRevision:parsed.membershipRevision,sourceCount,attachmentCount,requiredDeviceClaims,candidateIds};
 }
 async batch(actor:ChatActor,id:string,input:unknown){const parsed=this.parse(LegacyBatchQuerySchema,input);return this.transaction(actor,id,parsed.deviceId,parsed.cohortId,async db=>{
  let cursor:Row|undefined;if(parsed.after){cursor=(await db.query(`SELECT m.id,m.created_at FROM messages m JOIN chat_crypto_legacy_migrations lm ON lm.message_id=m.id WHERE m.id=$1 AND m.conversation_id=$2 AND lm.cohort_id=$3 AND lm.state='PREPARED' AND m.encryption_mode='LEGACY_PENDING'`,[parsed.after,id,parsed.cohortId])).rows[0];if(!cursor)chatError(ErrorCode.INVALID_INPUT,'Invalid historical cursor');}
  const rows=(await db.query(`SELECT m.id FROM messages m JOIN chat_crypto_legacy_migrations lm ON lm.message_id=m.id AND lm.conversation_id=m.conversation_id WHERE m.conversation_id=$1 AND lm.cohort_id=$2 AND lm.state='PREPARED' AND m.encryption_mode='LEGACY_PENDING' ${cursor?'AND (m.created_at,m.id)>((SELECT created_at FROM messages WHERE id=$4),$4::text)':''} ORDER BY m.created_at,m.id LIMIT $3`,cursor?[id,parsed.cohortId,parsed.limit+1,parsed.after]:[id,parsed.cohortId,parsed.limit+1])).rows;
  const selected=rows.slice(0,parsed.limit),items=[];for(const row of selected)items.push(await this.source(db,row.id,id,parsed.cohortId));return {items,hasMore:rows.length>parsed.limit,nextCursor:rows.length>parsed.limit?String(selected.at(-1)!.id):null};
 });}
 async content(actor:ChatActor,id:string,attachmentId:string,input:unknown){const parsed=this.parse(LegacyImageQuerySchema,input);let bytes:Buffer|undefined;try{return await this.transaction(actor,id,parsed.deviceId,parsed.cohortId,async db=>{
  const source=await this.source(db,parsed.messageId,id,parsed.cohortId),image=source.sourceManifest.attachments.find(item=>item.id===attachmentId);if(!image)chatError(ErrorCode.NOT_FOUND,'Historical image not found');bytes=await this.image(attachmentId);if(bytes.length!==image.fileSize||!timingSafeEqual(createHash('sha256').update(bytes).digest(),matrixBase64(image.plaintextSha256,32)))throw new ConflictException('Historical image changed');return bytes;
 });}catch(error){bytes?.fill(0);throw error;}}
}
