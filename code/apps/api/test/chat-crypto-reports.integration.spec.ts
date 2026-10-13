import 'reflect-metadata';
import {jest} from '@jest/globals';
import {Global,Module,INestApplication} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {randomUUID,randomBytes,createCipheriv,createHash} from 'node:crypto';
import * as sharpModule from 'sharp';
import request from 'supertest';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import {ChatCryptoModule} from '../src/modules/chat-crypto/chat-crypto.module.js';
import {OpenBaoTransit} from '../src/modules/chat-crypto/openbao-transit.js';
import {CryptoReportsService} from '../src/modules/chat-crypto/crypto-reports.service.js';
import {hashFgPassword} from '../src/modules/auth/auth-password.js';
import {UploadsModule} from '../src/modules/uploads/uploads.module.js';
import {UploadsService} from '../src/modules/uploads/uploads.service.js';
import type {LobbyCipher} from '../src/modules/chat-crypto/lobby-cipher.js';
import {ChatService} from '../src/modules/chat/chat.service.js';
import {ChatModule} from '../src/modules/chat/chat.module.js';
import {ALLOWED_GAMES,SocketEventNames,MessageSchema} from '@fg/contracts';
import {io,Socket} from 'socket.io-client';
import {Redis} from 'ioredis';
import {RealtimeGateway} from '../src/modules/realtime/realtime.gateway.js';
import {configureFgHttpBodyParsers} from '../src/modules/chat-crypto/http-body-parsers.js';
import {matrixUserId,matrixRoomId,canonicalSignedPayload} from '../src/modules/chat-crypto/matrix-signatures.js';
import {createSignedSessionCookie} from './test-cookie-helper.js';
const sharp=(sharpModule as typeof sharpModule&{default:typeof sharpModule}).default??sharpModule;

jest.setTimeout(60000);
describe('Consented report text over native HTTP/PostgreSQL/Transit TLS',()=>{
 const owned=`crypto_be_${randomUUID().replaceAll('-','')}`,savedEnv={...process.env},objectRoot=path.resolve('.runtime/chatcrypto-be',owned);
 const origin='http://localhost:5173',secret='report-fixture-only-session-secret-32-characters';
 let pool:pg.Pool,app:INestApplication,base:string,machine:sdk.OlmMachine;
 const cookies:Record<string,string>={},ids:string[]=[];
 let writerToken=process.env.FG_REPORT_TEST_WRITER!;
 let denyAfter:number|undefined,tokenCalls=0;
 const options={transit:undefined as unknown as OpenBaoTransit,retentionSeconds:3600},readOptions={transit:undefined as unknown as OpenBaoTransit};
 const lobbyOptions={transit:undefined as unknown as OpenBaoTransit};let lobbyToken=process.env.FG_REPORT_TEST_DENIED!,lobby:string;
 let reader:OpenBaoTransit;
 let importedReport:{id:string;messageId:string;attachmentId:string}|undefined;
 let picture:Buffer,imageReceipt:{id:string;expiresAt:string};
 @Global()@Module({providers:[{provide:'FG_REPORT_CUSTODY',useValue:options},{provide:'FG_REPORT_READER',useValue:readOptions},{provide:'FG_LOBBY_CUSTODY',useValue:lobbyOptions}],exports:['FG_REPORT_CUSTODY','FG_REPORT_READER','FG_LOBBY_CUSTODY']})class FixtureCustody{}
 @Module({imports:[FixtureCustody,ChatModule,ChatCryptoModule,UploadsModule],providers:[RealtimeGateway]})class FixtureApp{}
 const post=(body:unknown,auth=cookies.alice)=>request(base).post('/api/v1/crypto/reports').set('Cookie',auth).set('Origin',origin).send(body);
 const disclosure=()=>({consent:true,conversationId:'dm',reason:'selected-fixture-reason',selectedMessages:ids.slice(0,2).map((messageId,i)=>({messageId,text:`disclosed-text-${i}`,source:'USER_DISCLOSED'}))});
 beforeAll(async()=>{
  expect(process.env.FG_REPORT_TEST_ADDRESS).toMatch(/^https:\/\/127\.0\.0\.1:\d+$/);expect(writerToken).toBeTruthy();
  const ca=fs.readFileSync(process.env.FG_REPORT_TEST_CA!);
  options.transit=new OpenBaoTransit({address:process.env.FG_REPORT_TEST_ADDRESS!,ca,token:async()=>++tokenCalls===denyAfter?process.env.FG_REPORT_TEST_DENIED!:writerToken});
  reader=new OpenBaoTransit({address:process.env.FG_REPORT_TEST_ADDRESS!,ca,token:async()=>process.env.FG_REPORT_TEST_READER!});
  readOptions.transit=reader;
  lobbyOptions.transit=new OpenBaoTransit({address:process.env.FG_REPORT_TEST_ADDRESS!,ca,token:async()=>lobbyToken});
  await sdk.initAsync();const env=parseEnv(fs.readFileSync('.env.local','utf8')),url=new URL(env.DATABASE_URL);url.searchParams.set('options',`-c search_path=${owned}`);
  pool=new pg.Pool({connectionString:url.href,connectionTimeoutMillis:5000});await pool.query(`CREATE SCHEMA "${owned}"`);
  const db=await pool.connect();try{await migrate(drizzle(db),{migrationsFolder:'packages/database/migrations',migrationsSchema:owned});}finally{db.release();}
  for(const user of ['alice','bob','outsider']){
   await pool.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())`,[user,user+'@example.invalid']);
   await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$1,now()+interval '1 day',now(),now())`,[user+'-session',user]);cookies[user]=await createSignedSessionCookie(secret,user+'-session');
  }
  for(const id of ['dm','other']){
   const partner=id==='dm'?'bob':'outsider';
   await pool.query(`INSERT INTO conversations(id,kind,user1_id,user2_id) VALUES($1,'DM','alice',$2)`,[id,partner]);
   await pool.query(`INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES($1,'E2EE','RECONCILED','KNOWN')`,[id]);
   for(const user of ['alice',partner])await pool.query(`INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES($1,$2,$3,1,now())`,[id+'-'+user,id,user]);
  }
  await pool.query('INSERT INTO games(id,title) VALUES($1,$2) ON CONFLICT(title) DO NOTHING',['native-lobby-game',ALLOWED_GAMES[0]]);const game=(await pool.query('SELECT id FROM games WHERE title=$1',[ALLOWED_GAMES[0]])).rows[0].id;
  await pool.query("INSERT INTO lobbies(id,game_id,name) VALUES('native-lobby',$1,'Native fixture Lobby') ON CONFLICT(game_id) DO NOTHING",[game]);
  await pool.query("INSERT INTO profiles(user_id,display_name) VALUES('alice','Native Alice')");await pool.query("INSERT INTO game_interests(id,user_id,game_id) VALUES('native-interest','alice',$1)",[game]);
  Object.assign(process.env,{FG_CRYPTO_OBJECTS_DIR:objectRoot,FG_UPLOADS_DIR:path.join(objectRoot,'legacy-images'),DATABASE_URL:url.href,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:secret,DISCORD_CLIENT_ID:'fixture',DISCORD_CLIENT_SECRET:'fixture',SMTP_HOST:'127.0.0.1',SMTP_PORT:'465',SMTP_USER:'fixture',SMTP_PASSWORD:'fixture',SMTP_FROM:'fixture@example.invalid'});
  app=await NestFactory.create(FixtureApp,{logger:false,bodyParser:false,abortOnError:false});configureFgHttpBodyParsers(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();
  lobby=await app.get(ChatService).lobby(game);await pool.query("INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES($1,'LOBBY_AEAD','RECONCILED','KNOWN')",[lobby]);
  machine=await sdk.OlmMachine.initialize(new sdk.UserId(matrixUserId('alice')),new sdk.DeviceId('REPORT'));
  const upload=(await machine.outgoingRequests()).find(r=>r.type===sdk.RequestType.KeysUpload) as sdk.KeysUploadRequest,payload=JSON.parse(upload.body);
  expect((await request(base).post('/api/v1/crypto/devices').set('Cookie',cookies.alice).set('Origin',origin).send({deviceId:'REPORT',deviceKeys:payload.device_keys,oneTimeKeys:payload.one_time_keys})).status).toBe(201);
  picture=await sharp({create:{width:2,height:3,channels:3,background:'red'}}).withMetadata({orientation:6}).png().toBuffer();
  for(const [i,id]of ['dm','dm','dm','other'].entries()){
   const room=new sdk.RoomId(matrixRoomId(id)),settings=new sdk.EncryptionSettings();settings.historyVisibility=sdk.HistoryVisibility.Joined;settings.sharingStrategy=sdk.CollectStrategy.onlyTrustedDevices();await machine.shareRoomKey(room,[],settings);
   const attachments:string[]=[];let imageFile:unknown;
   if(i===0){
    const key=randomBytes(32),iv=randomBytes(16),encrypt=createCipheriv('aes-256-ctr',key,iv),ciphertext=Buffer.concat([encrypt.update(picture),encrypt.final()]);
    const uploaded=await request(base).post('/api/v1/crypto/conversations/dm/attachments').set('Cookie',cookies.alice).set('Origin',origin).field('metadata',JSON.stringify({clientUploadId:'native-report-source',deviceId:'REPORT',membershipRevision:2,ciphertextSize:ciphertext.length,ciphertextSha256:createHash('sha256').update(ciphertext).digest('base64')})).attach('file',ciphertext,{filename:'opaque.bin',contentType:'application/octet-stream'});expect(uploaded.status).toBe(201);attachments.push(uploaded.body.id);
    imageFile={v:'v2',key:{kty:'oct',key_ops:['encrypt','decrypt'],alg:'A256CTR',k:key.toString('base64url'),ext:true},iv:iv.toString('base64'),hashes:{sha256:createHash('sha256').update(ciphertext).digest('base64')}};
   }
   const event=JSON.parse(await machine.encryptRoomEvent(room,'m.room.message',JSON.stringify({msgtype:i===0?'m.image':'m.text',body:'original-undisclosed-'+i,...(imageFile?{file:imageFile}:{})})));
   const sent=await request(base).post(`/api/v1/crypto/conversations/${id}/messages`).set('Cookie',cookies.alice).set('Origin',origin).send({deviceId:'REPORT',membershipRevision:2,clientMessageId:'source-'+i,envelope:{version:1,protocol:'MATRIX_MEGOLM',event},...(attachments.length?{attachmentIds:attachments}:{})});expect(sent.status).toBe(201);ids.push(sent.body.id);
  }
 });
 afterAll(async()=>{
  machine?.close();try{await app?.close();}finally{try{if(pool){expect(owned).toMatch(/^crypto_be_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);}if(fs.existsSync(objectRoot)){expect(fs.realpathSync(objectRoot)).toBe(path.join(fs.realpathSync('.runtime/chatcrypto-be'),owned));fs.rmSync(objectRoot,{recursive:true});}}finally{await pool?.end();process.env=savedEnv;}}
 });
 it('requires session and same-origin consented writes',async()=>{
  expect((await request(base).post('/api/v1/crypto/reports').set('Origin',origin).send(disclosure())).status).toBe(401);
  expect((await request(base).post('/api/v1/crypto/reports').set('Cookie',cookies.alice).set('Origin','https://evil.invalid').send(disclosure())).status).toBe(403);
 });

 it('accepts explicitly disclosed imported text/image only for the original cohort and completed bindings',async()=>{
  // Public imported-state ACL fixture; conversion/cleanup are proved separately.
  const conversation='report-import',cohort='report-import-cohort',stage=randomUUID(),message=randomUUID(),candidate=randomUUID(),attachment=randomUUID(),draft=randomUUID(),digest=(value:Buffer|string)=>createHash('sha256').update(value).digest('base64').replace(/=+$/,'');
  await pool.query("INSERT INTO conversations(id,kind) VALUES($1,'ROOM')",[conversation]);await pool.query("INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status,membership_revision) VALUES($1,'E2EE','RECONCILED','KNOWN',2)",[conversation]);
  for(const user of ['alice','bob']){await pool.query('INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3)',[randomUUID(),conversation,user]);await pool.query('INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES($1,$2,$3,1,clock_timestamp())',[randomUUID(),conversation,user]);}
  await pool.query("INSERT INTO chat_crypto_history_cohorts(id,conversation_id,verified_at,verification_basis) VALUES($1,$2,clock_timestamp(),'EXPLICIT_RECONCILIATION')",[cohort,conversation]);await pool.query("INSERT INTO chat_crypto_cohort_members(cohort_id,conversation_id,user_id) VALUES($1,$2,'alice')",[cohort,conversation]);
  const image=sdk.Attachment.encrypt(new Uint8Array(picture)),ciphertext=Buffer.from(image.encryptedData),secretInfo=image.mediaEncryptionInfo!;image.free();fs.writeFileSync(path.join(objectRoot,draft+'.bin'),ciphertext);
  const room=new sdk.RoomId(matrixRoomId(conversation)),settings=new sdk.EncryptionSettings();await machine.shareRoomKey(room,[],settings);const archive={msgtype:'m.image',body:'original-imported-private',file:JSON.parse(secretInfo)},event=JSON.parse(await machine.encryptRoomEvent(room,'m.room.message',JSON.stringify(archive))),envelope={version:1,protocol:'MATRIX_MEGOLM',event},originalSha=digest('public-import-source-fixture'),envelopeSha=digest(canonicalSignedPayload(envelope));
  await pool.query("INSERT INTO messages(id,conversation_id,sender_id,type,content,client_message_id,encryption_mode,crypto_revision,crypto_envelope) VALUES($1,$2,'alice','IMAGE','','report-import-source','E2EE',1,$3)",[message,conversation,envelope]);
  await pool.query("INSERT INTO chat_crypto_outbound_sessions(session_id,conversation_id,sender_user_id,sender_device_id,membership_revision) VALUES($1,$2,'alice','REPORT',1)",[event.session_id.replace(/=+$/,''),conversation]);
  await pool.query("INSERT INTO chat_crypto_legacy_migrations(message_id,conversation_id,cohort_id,original_sha256,state,reconciled_at) VALUES($1,$2,$3,$4,'RECONCILED',clock_timestamp())",[message,conversation,cohort,originalSha]);
  await pool.query("INSERT INTO chat_crypto_legacy_candidates(id,message_id,conversation_id,cohort_id,membership_revision,original_sha256,envelope_sha256,importer_user_id,importer_device_id,envelope) VALUES($1,$2,$3,$4,1,$5,$6,'alice','REPORT',$7)",[candidate,message,conversation,cohort,originalSha,envelopeSha,envelope]);
  await pool.query("INSERT INTO attachments(id,message_id,conversation_id,file_name,file_size,mime_type,url,encryption_mode) VALUES($1,$2,$3,'',$4,'application/octet-stream',$5,'E2EE')",[attachment,message,conversation,ciphertext.length,`/api/v1/crypto/conversations/${conversation}/attachments/${attachment}`]);
  await pool.query("INSERT INTO chat_crypto_upload_drafts(id,uploader_id,conversation_id,device_id,client_upload_id,membership_revision,encryption_mode,object_key,ciphertext_size,ciphertext_sha256,message_id,consumed_at,expires_at,cohort_id) VALUES($1,'alice',$2,'REPORT','report-import-cipher',1,'E2EE',$3,$4,$5,$6,clock_timestamp(),clock_timestamp()+interval '1 day',$7)",[draft,conversation,draft+'.bin',ciphertext.length,digest(ciphertext),message,cohort]);
  await pool.query('INSERT INTO chat_crypto_legacy_candidate_images(candidate_id,attachment_id,draft_id,plaintext_sha256,ciphertext_sha256) VALUES($1,$2,$3,$4,$5)',[candidate,attachment,draft,digest(picture),digest(ciphertext)]);
  await pool.query("INSERT INTO chat_crypto_legacy_stages(id,conversation_id,seed_cohort_id,reviewer_user_id,reviewer_device_id,membership_revision,next_live_revision,source_count,attachment_count,required_claims,manifest_sha256,phase,converted_at,completed_at) VALUES($1,$2,$3,'alice','REPORT',1,2,1,1,1,$4,'RECONCILED',clock_timestamp(),clock_timestamp())",[stage,conversation,cohort,digest('public-stage-fixture')]);
  await pool.query('INSERT INTO chat_crypto_legacy_stage_sources(stage_id,message_id,candidate_id,cohort_id,conversation_id,membership_revision,original_sha256,envelope_sha256) VALUES($1,$2,$3,$4,$5,1,$6,$7)',[stage,message,candidate,cohort,conversation,originalSha,envelopeSha]);await pool.query("INSERT INTO chat_crypto_legacy_stage_objects(stage_id,message_id,candidate_id,attachment_id,draft_id,plaintext_sha256,ciphertext_sha256,cleanup_state,removed_at) VALUES($1,$2,$3,$4,$5,$6,$7,'REMOVED',clock_timestamp())",[stage,message,candidate,attachment,draft,digest(picture),digest(ciphertext)]);
  const selected={consent:true,conversationId:conversation,reason:'imported-selected-reason',selectedMessages:[{messageId:message,text:'imported-selected-text',source:'USER_DISCLOSED'}]},upload=(cookie:string,tag='report-import-picture')=>request(base).post('/api/v1/crypto/reports/attachments').set('Cookie',cookie).set('Origin',origin).field('metadata',JSON.stringify({consent:true,conversationId:conversation,messageId:message,clientUploadId:tag,plaintextSize:picture.length})).attach('file',picture,{filename:'disclosed.png',contentType:'image/png'});
  expect((await post(selected,cookies.bob)).status).toBe(403);expect((await upload(cookies.bob)).status).toBe(403);expect((await post(selected,cookies.outsider)).status).toBe(403);
  const receipt=await upload(cookies.alice);expect(receipt.status).toBe(201);const sent=await post({...selected,selectedMessages:[{...selected.selectedMessages[0],reportAttachmentIds:[receipt.body.id]}]});expect(sent.status).toBe(201);
  importedReport={id:sent.body.id,messageId:message,attachmentId:receipt.body.id};
  const evidence=(await pool.query('SELECT * FROM chat_crypto_report_evidence WHERE report_id=$1',[sent.body.id])).rows[0];expect(evidence.source).toBe('USER_DISCLOSED');const decoded=JSON.parse((await reader.decrypt(evidence.envelope,{kind:'REPORT_TEXT',conversationId:conversation,objectId:evidence.id})).toString());expect(decoded.text).toBe('imported-selected-text');expect(decoded.authenticity).toBe('USER_SUPPLIED_UNVERIFIED');expect(JSON.stringify(evidence)).not.toContain('imported-selected-text');
  await pool.query("UPDATE chat_crypto_legacy_stages SET phase='CLEANING',completed_at=NULL WHERE id=$1",[stage]);try{expect((await post(selected)).status).toBe(409);}finally{await pool.query("UPDATE chat_crypto_legacy_stages SET phase='RECONCILED',completed_at=clock_timestamp() WHERE id=$1",[stage]);}
  await pool.query('UPDATE chat_crypto_legacy_stage_sources SET envelope_sha256=$2 WHERE stage_id=$1',[stage,digest('wrong-stage')]);try{expect((await post(selected)).status).toBe(409);}finally{await pool.query('UPDATE chat_crypto_legacy_stage_sources SET envelope_sha256=$2 WHERE stage_id=$1',[stage,envelopeSha]);}
  const originalTransit=options.transit;for(const kind of ['text','image']){
   const beforeReports=(await pool.query('SELECT count(*) FROM reports')).rows[0].count,beforeDrafts=(await pool.query('SELECT count(*) FROM chat_crypto_upload_drafts')).rows[0].count,beforeFiles=fs.readdirSync(objectRoot).sort();let changed=false;
   options.transit=new OpenBaoTransit({address:process.env.FG_REPORT_TEST_ADDRESS!,ca:fs.readFileSync(process.env.FG_REPORT_TEST_CA!),token:async()=>{if(!changed){changed=true;await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason) VALUES($1,'bob','alice','BAN','owned late KMS fixture')",['import-report-late-'+kind]);}return writerToken;}});
   try{const denied=kind==='text'?await post(selected):await upload(cookies.alice,'import-report-late-image');expect(changed).toBe(true);expect(denied.status).toBe(403);expect((await pool.query('SELECT count(*) FROM reports')).rows[0].count).toBe(beforeReports);expect((await pool.query('SELECT count(*) FROM chat_crypto_upload_drafts')).rows[0].count).toBe(beforeDrafts);expect(fs.readdirSync(objectRoot).sort()).toEqual(beforeFiles);}finally{options.transit=originalTransit;await pool.query('DELETE FROM admin_actions WHERE id=$1',['import-report-late-'+kind]);}
  }

 });
 it('stores only selected disclosure encrypted with an independent report role and binding',async()=>{
  const sent=await post(disclosure());expect(sent.status).toBe(201);expect(Object.keys(sent.body)).toEqual(['id']);
  const report=(await pool.query('SELECT * FROM reports WHERE id=$1',[sent.body.id])).rows[0];expect(report.reason).toBe('CHAT_CRYPTO_DISCLOSURE');expect(report.details).toBeNull();
  const evidence=(await pool.query('SELECT * FROM chat_crypto_report_evidence WHERE report_id=$1 ORDER BY id',[sent.body.id])).rows;expect(evidence).toHaveLength(2);
  const decoded=[];
  for(const item of evidence){
   expect(item.source).toBe('USER_DISCLOSED');expect(item.reporter_id).toBe('alice');expect(item.envelope.keyId).toBe('fg-report');expect(item.expires_at.getTime()-item.consented_at.getTime()).toBe(3600000);
   const binding={kind:'REPORT_TEXT' as const,conversationId:'dm',objectId:item.id};decoded.push(JSON.parse((await reader.decrypt(item.envelope,binding)).toString()));
   await expect(options.transit.decrypt(item.envelope,binding)).rejects.toMatchObject({reason:'AUTHORIZATION'});
   await expect(reader.decrypt(item.envelope,{...binding,objectId:'wrong-evidence'})).rejects.toMatchObject({reason:'INTEGRITY'});
  }
  expect(decoded.map(d=>d.messageId).sort()).toEqual(ids.slice(0,2).sort());expect(decoded.map(d=>d.text).sort()).toEqual(['disclosed-text-0','disclosed-text-1']);
  expect(decoded.every(d=>d.reason==='selected-fixture-reason'&&d.authenticity==='USER_SUPPLIED_UNVERIFIED')).toBe(true);
  const rows=JSON.stringify({report,evidence});for(const value of ['disclosed-text','selected-fixture-reason','original-undisclosed'])expect(rows).not.toContain(value);
 });
 it('rejects absent consent, duplicate selections, foreign conversation, outsiders and unsupported image/source claims',async()=>{
  expect((await post({...disclosure(),consent:false})).status).toBe(422);
  const item=disclosure().selectedMessages[0];expect((await post({...disclosure(),selectedMessages:[item,item]})).status).toBe(422);
  expect((await post({...disclosure(),selectedMessages:[{...item,messageId:ids[3]}]})).status).toBe(403);
  expect((await post(disclosure(),cookies.outsider)).status).toBe(403);
  expect((await post({...disclosure(),selectedMessages:[{...item,reportAttachmentIds:['unowned-image']}]})).status).toBe(403);
  expect((await post({...disclosure(),selectedMessages:[{...item,source:'LEGACY_IMPORT'}]})).status).toBe(422);
 });
 it('enforces historical intervals instead of granting old messages to a current participant',async()=>{
  await pool.query(`UPDATE chat_crypto_membership_intervals SET end_revision=2,left_at=now() WHERE id='dm-bob'`);
  try{expect((await post(disclosure(),cookies.bob)).status).toBe(403);}finally{await pool.query(`UPDATE chat_crypto_membership_intervals SET end_revision=NULL,left_at=NULL WHERE id='dm-bob'`);}
 });
 it('fails closed without writer permissions or valid explicit retention and writes no report',async()=>{
  const before=(await pool.query('SELECT count(*) FROM reports')).rows[0].count;
  writerToken=process.env.FG_REPORT_TEST_DENIED!;try{expect((await post(disclosure())).status).toBe(503);}finally{writerToken=process.env.FG_REPORT_TEST_WRITER!;}
  options.retentionSeconds=0;try{expect((await post(disclosure())).status).toBe(503);}finally{options.retentionSeconds=3600;}
  const transit=options.transit;options.transit=undefined as unknown as OpenBaoTransit;
  try{expect((await post(disclosure())).status).toBe(503);}finally{options.transit=transit;}
  expect((await pool.query('SELECT count(*) FROM reports')).rows[0].count).toBe(before);
 });
 it('rolls back report metadata and evidence on a real PostgreSQL evidence-write fault',async()=>{
  const before=(await pool.query('SELECT count(*) FROM reports')).rows[0].count,evidenceBefore=(await pool.query('SELECT count(*) FROM chat_crypto_report_evidence')).rows[0].count;
  await pool.query('CREATE SEQUENCE report_fault_calls');
  await pool.query(`CREATE FUNCTION report_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF nextval('report_fault_calls')=2 THEN RAISE EXCEPTION 'fixture report fault'; END IF; RETURN NEW; END $$`);await pool.query('CREATE TRIGGER report_fault BEFORE INSERT ON chat_crypto_report_evidence FOR EACH ROW EXECUTE FUNCTION report_fault()');
  try{expect((await post(disclosure())).status).toBe(500);expect(Number((await pool.query('SELECT last_value FROM report_fault_calls')).rows[0].last_value)).toBe(2);expect((await pool.query('SELECT count(*) FROM reports')).rows[0].count).toBe(before);expect((await pool.query('SELECT count(*) FROM chat_crypto_report_evidence')).rows[0].count).toBe(evidenceBefore);}
  finally{await pool.query('DROP TRIGGER report_fault ON chat_crypto_report_evidence');await pool.query('DROP FUNCTION report_fault()');await pool.query('DROP SEQUENCE report_fault_calls');}
 });
 it('rejects stale sessions, banned reporters and an admin who cannot read the private source',async()=>{
  await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('alice-expired','alice','alice-expired',now()-interval '1 second',now()-interval '1 day',now())`);
  const expiredCookie=await createSignedSessionCookie(secret,'alice-expired');
  try{expect((await post(disclosure(),expiredCookie)).status).toBe(401);}finally{await pool.query(`DELETE FROM "session" WHERE id='alice-expired'`);}
  await pool.query(`INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason) VALUES('report-ban','bob','alice','BAN','fixture')`);
  try{expect((await post(disclosure())).status).toBe(403);}finally{await pool.query(`DELETE FROM admin_actions WHERE id='report-ban'`);}
  const previous=process.env.ADMIN_USER_IDS;process.env.ADMIN_USER_IDS='outsider';
  try{expect((await post(disclosure(),cookies.outsider)).status).toBe(403);}finally{if(previous===undefined)delete process.env.ADMIN_USER_IDS;else process.env.ADMIN_USER_IDS=previous;}
 });
 it('commits no partial report when a later real Transit encryption is denied',async()=>{
  const before=(await pool.query('SELECT count(*) FROM reports')).rows[0].count,evidenceBefore=(await pool.query('SELECT count(*) FROM chat_crypto_report_evidence')).rows[0].count;
  tokenCalls=0;denyAfter=2;
  try{expect((await post(disclosure())).status).toBe(503);expect(tokenCalls).toBe(2);expect((await pool.query('SELECT count(*) FROM reports')).rows[0].count).toBe(before);expect((await pool.query('SELECT count(*) FROM chat_crypto_report_evidence')).rows[0].count).toBe(evidenceBefore);}
  finally{denyAfter=undefined;}
 });
 const uploadImage=(tag:string,bytes=picture,metadata:Record<string,unknown>={},auth=cookies.alice,contentType='image/png')=>request(base).post('/api/v1/crypto/reports/attachments').set('Cookie',auth).set('Origin',origin).field('metadata',JSON.stringify({consent:true,conversationId:'dm',messageId:ids[0],clientUploadId:tag,plaintextSize:bytes.length,...metadata})).attach('file',bytes,{filename:'private-report-name.png',contentType});
 it.each([{kind:'text',isolation:'read committed'},{kind:'text',isolation:'repeatable read'},{kind:'image',isolation:'read committed'},{kind:'image',isolation:'repeatable read'}])('denies native report $kind after committed reporter ban with caller default $isolation',async({kind,isolation})=>{
  const service=app.get(CryptoReportsService) as unknown as {pool:pg.Pool},actualConnect=service.pool.connect.bind(service.pool),observed=service.pool as unknown as {connect:()=>Promise<pg.PoolClient>},previous=new Map<pg.PoolClient,string>(),saved=options.transit,tag='report-writer-isolation-'+randomUUID(),ban=tag+'-ban',files=fs.readdirSync(objectRoot).sort(),counts=await pool.query('SELECT (SELECT count(*) FROM reports) AS reports,(SELECT count(*) FROM chat_crypto_report_evidence) AS evidence,(SELECT count(*) FROM chat_crypto_upload_drafts) AS drafts'),buffers:Uint8Array[]=[];let inserted=false,createdId:string|undefined;
  const writer=new OpenBaoTransit({address:process.env.FG_REPORT_TEST_ADDRESS!,ca:fs.readFileSync(process.env.FG_REPORT_TEST_CA!),token:async()=>{if(!inserted){await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason,created_at) VALUES($1,'outsider','alice','BAN','owned report writer isolation',clock_timestamp())",[ban]);inserted=true;expect((await pool.query("SELECT action FROM admin_actions WHERE target_user_id='alice' AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1")).rows[0].action).toBe('BAN');}return process.env.FG_REPORT_TEST_WRITER!;}}),actualEncrypt=writer.encrypt.bind(writer),encryptObserver=jest.spyOn(writer,'encrypt').mockImplementation(async(...args:Parameters<OpenBaoTransit['encrypt']>)=>{buffers.push(args[1]);return actualEncrypt(...args);}),connectionObserver=jest.spyOn(observed,'connect').mockImplementation(async()=>{const client=await actualConnect();if(!previous.has(client)){previous.set(client,(await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation);await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[isolation]);expect((await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation).toBe(isolation);}return client;});
  try{
   options.transit=writer;const response=kind==='image'?await uploadImage(tag):await post({consent:true,conversationId:'dm',reason:tag,selectedMessages:[{messageId:ids[1],text:'selected writer boundary text',source:'USER_DISCLOSED'}]});if(response.status===201)createdId=response.body.id;
   expect(inserted).toBe(true);expect(response.status).toBe(403);expect(buffers.length).toBeGreaterThan(0);expect(buffers.every(bytes=>bytes.every(byte=>byte===0))).toBe(true);
   expect((await pool.query('SELECT (SELECT count(*) FROM reports) AS reports,(SELECT count(*) FROM chat_crypto_report_evidence) AS evidence,(SELECT count(*) FROM chat_crypto_upload_drafts) AS drafts')).rows).toEqual(counts.rows);expect(fs.readdirSync(objectRoot).sort()).toEqual(files);
  }finally{
   options.transit=saved;encryptObserver.mockRestore();connectionObserver.mockRestore();for(const [client,setting]of previous)await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[setting]);
   if(createdId){expect(createdId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    if(kind==='text'){expect((await pool.query("SELECT id FROM reports WHERE id=$1 AND reporter_id='alice' AND target_type='MESSAGE' AND target_id=$2 AND reported_message_id=$2 AND reason='CHAT_CRYPTO_DISCLOSURE'",[createdId,ids[1]])).rowCount).toBe(1);expect((await pool.query('SELECT id FROM chat_crypto_report_audit WHERE report_id=$1',[createdId])).rowCount).toBe(0);const evidence=(await pool.query("SELECT id FROM chat_crypto_report_evidence WHERE report_id=$1 AND reporter_id='alice' AND source='USER_DISCLOSED'",[createdId])).rows;expect(evidence).toHaveLength(1);expect((await pool.query('SELECT id FROM chat_crypto_upload_drafts WHERE report_evidence_id=$1',[evidence[0].id])).rowCount).toBe(0);await pool.query("DELETE FROM chat_crypto_report_evidence WHERE report_id=$1 AND reporter_id='alice' AND source='USER_DISCLOSED'",[createdId]);await pool.query("DELETE FROM reports WHERE id=$1 AND reporter_id='alice' AND target_id=$2 AND reported_message_id=$2",[createdId,ids[1]]);}
    else{const draft=(await pool.query("SELECT d.* FROM chat_crypto_upload_drafts d JOIN chat_crypto_report_upload_sources s ON s.upload_id=d.id WHERE d.id=$1 AND d.uploader_id='alice' AND d.conversation_id='dm' AND d.client_upload_id=$2 AND d.encryption_mode='REPORT_AEAD' AND d.message_id IS NULL AND d.report_evidence_id IS NULL AND d.cohort_id IS NULL AND d.consumed_at IS NULL AND s.source_message_id=$3",[createdId,tag,ids[0]])).rows[0];expect(draft).toBeDefined();expect(draft.object_key).toBe(createdId+'.bin');const root=fs.realpathSync(objectRoot),target=path.resolve(root,draft.object_key);expect(root).toBe(path.resolve('.runtime/chatcrypto-be',owned));expect(path.dirname(target)).toBe(root);expect(files).not.toContain(draft.object_key);await pool.query("DELETE FROM chat_crypto_upload_drafts WHERE id=$1 AND uploader_id='alice' AND conversation_id='dm' AND client_upload_id=$2 AND message_id IS NULL AND report_evidence_id IS NULL AND cohort_id IS NULL AND consumed_at IS NULL",[createdId,tag]);fs.unlinkSync(target);}
   }
   await pool.query('DELETE FROM admin_actions WHERE id=$1',[ban]);
  }
 });
 it('requires image consent/source access and rejects invalid format, oversized pixels/bytes and text-only sources',async()=>{
  expect((await uploadImage('image-no-consent',picture,{consent:false})).status).toBe(422);
  expect((await uploadImage('image-outsider',picture,{},cookies.outsider)).status).toBe(403);
  expect((await uploadImage('image-other',picture,{messageId:ids[3]})).status).toBe(403);
  expect((await uploadImage('image-text',picture,{messageId:ids[1]})).status).toBe(422);
  expect((await uploadImage('image-size',picture,{plaintextSize:picture.length+1})).status).toBe(422);
  expect((await uploadImage('image-svg',Buffer.from('<svg/>'),{},cookies.alice,'image/svg+xml')).status).toBe(422);
  expect((await uploadImage('image-mime',picture,{},cookies.alice,'image/jpeg')).status).toBe(422);
  const pixels=await sharp({create:{width:5200,height:4000,channels:3,background:'black'}}).png().toBuffer();expect((await uploadImage('image-pixels',pixels)).status).toBe(422);
  expect((await uploadImage('image-bytes',Buffer.alloc(5*1024*1024+1))).status).toBe(413);
 });
 it('normalizes and encrypts disclosed images, binds source/owner and preserves retry identity without filenames/plaintext',async()=>{
  const sent=await uploadImage('image-owned');expect(sent.status).toBe(201);expect(Object.keys(sent.body).sort()).toEqual(['expiresAt','id']);imageReceipt=sent.body;
  const retry=await uploadImage('image-owned');expect(retry.status).toBe(201);expect(retry.body).toEqual(sent.body);
  const changed=await sharp({create:{width:2,height:3,channels:3,background:'blue'}}).png().toBuffer();expect((await uploadImage('image-owned',changed)).status).toBe(409);
  const row=(await pool.query('SELECT * FROM chat_crypto_upload_drafts WHERE id=$1',[sent.body.id])).rows[0],source=(await pool.query('SELECT * FROM chat_crypto_report_upload_sources WHERE upload_id=$1',[sent.body.id])).rows[0];
  expect(row.encryption_mode).toBe('REPORT_AEAD');expect(row.device_id).toBeNull();expect(row.message_id).toBeNull();expect(row.envelope.keyId).toBe('fg-report');expect(source.source_message_id).toBe(ids[0]);
  expect(source.retry_fingerprint).not.toBe(createHash('sha256').update(picture).digest('base64'));expect(JSON.stringify({row,source})).not.toContain('private-report-name');
  const bytes=fs.readFileSync(path.join(objectRoot,row.object_key));expect(bytes.length).toBe(row.ciphertext_size);expect(createHash('sha256').update(bytes).digest('base64').replace(/=+$/,'')).toBe(row.ciphertext_sha256);expect(JSON.parse(bytes.toString())).toEqual(row.envelope);
  const objectId='rimg1:'+createHash('sha256').update(JSON.stringify(['FG_REPORT_IMAGE',1,'alice','dm',ids[0],row.id])).digest('hex');
  const plain=await reader.decrypt(row.envelope,{kind:'REPORT_IMAGE',conversationId:'dm',objectId}),meta=await sharp(plain).metadata();expect(meta.format).toBe('webp');expect(meta.width).toBe(3);expect(meta.height).toBe(2);expect(meta.exif).toBeUndefined();
  await expect(reader.decrypt(row.envelope,{kind:'REPORT_IMAGE',conversationId:'dm',objectId:'wrong-source'})).rejects.toMatchObject({reason:'INTEGRITY'});
 });
 it('claims report images only for their reporter/selected source, atomically, and denies reuse',async()=>{
  const item={messageId:ids[0],text:'selected image',source:'USER_DISCLOSED',reportAttachmentIds:[imageReceipt.id]},body={consent:true,conversationId:'dm',reason:'image disclosure',selectedMessages:[item]};
  expect((await post(body,cookies.bob)).status).toBe(403);expect((await post({...body,selectedMessages:[{...item,messageId:ids[1]}]})).status).toBe(403);
  expect((await post({...body,selectedMessages:[{...item,reportAttachmentIds:[imageReceipt.id,imageReceipt.id]}]})).status).toBe(422);
  const sent=await post(body);expect(sent.status).toBe(201);const evidence=(await pool.query('SELECT * FROM chat_crypto_report_evidence WHERE report_id=$1',[sent.body.id])).rows[0],draft=(await pool.query('SELECT * FROM chat_crypto_upload_drafts WHERE id=$1',[imageReceipt.id])).rows[0];expect(draft.report_evidence_id).toBe(evidence.id);expect(draft.consumed_at).not.toBeNull();expect(draft.message_id).toBeNull();
  const plain=JSON.parse((await reader.decrypt(evidence.envelope,{kind:'REPORT_TEXT',conversationId:'dm',objectId:evidence.id})).toString());expect(plain.reportAttachmentIds).toEqual([imageReceipt.id]);
  expect((await post(body)).status).toBe(403);expect((await uploadImage('image-owned')).status).toBe(403);
  expect((await request(base).get(`/api/v1/crypto/conversations/dm/attachments/${imageReceipt.id}`).set('Cookie',cookies.alice)).status).toBe(404);
 });
 it('denies tampered or expired report drafts without creating evidence',async()=>{
  const sent=await uploadImage('image-tamper');expect(sent.status).toBe(201);const row=(await pool.query('SELECT * FROM chat_crypto_upload_drafts WHERE id=$1',[sent.body.id])).rows[0],target=path.join(objectRoot,row.object_key),original=fs.readFileSync(target),before=(await pool.query('SELECT count(*) FROM reports')).rows[0].count;
  const body={...disclosure(),selectedMessages:[{...disclosure().selectedMessages[0],reportAttachmentIds:[sent.body.id]}]};
  fs.writeFileSync(target,Buffer.from('invalid ciphertext'));try{expect((await post(body)).status).toBe(403);}finally{fs.writeFileSync(target,original);}
  await pool.query(`UPDATE chat_crypto_upload_drafts SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1`,[sent.body.id]);expect((await post(body)).status).toBe(403);expect((await pool.query('SELECT count(*) FROM reports')).rows[0].count).toBe(before);
 });
 it('leaves no draft or object when report-image source persistence or native writer permission fails',async()=>{
  const files=fs.readdirSync(objectRoot).sort(),before=(await pool.query('SELECT count(*) FROM chat_crypto_upload_drafts')).rows[0].count;
  await pool.query(`CREATE FUNCTION image_source_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture source fault'; END $$`);await pool.query('CREATE TRIGGER image_source_fault BEFORE INSERT ON chat_crypto_report_upload_sources FOR EACH ROW EXECUTE FUNCTION image_source_fault()');
  try{expect((await uploadImage('image-db-fault')).status).toBe(500);expect((await pool.query('SELECT count(*) FROM chat_crypto_upload_drafts')).rows[0].count).toBe(before);expect(fs.readdirSync(objectRoot).sort()).toEqual(files);}finally{await pool.query('DROP TRIGGER image_source_fault ON chat_crypto_report_upload_sources');await pool.query('DROP FUNCTION image_source_fault()');}
  writerToken=process.env.FG_REPORT_TEST_DENIED!;try{expect((await uploadImage('image-kms-fault')).status).toBe(503);}finally{writerToken=process.env.FG_REPORT_TEST_WRITER!;}
  expect((await pool.query('SELECT count(*) FROM chat_crypto_upload_drafts')).rows[0].count).toBe(before);expect(fs.readdirSync(objectRoot).sort()).toEqual(files);
 });
 it('refuses a successful upload retry receipt when its original report object is missing or modified',async()=>{
  const sent=await uploadImage('image-retry-integrity');expect(sent.status).toBe(201);const row=(await pool.query('SELECT * FROM chat_crypto_upload_drafts WHERE id=$1',[sent.body.id])).rows[0],target=path.join(objectRoot,row.object_key),original=fs.readFileSync(target);
  fs.unlinkSync(target);try{expect((await uploadImage('image-retry-integrity')).status).toBe(403);}finally{fs.writeFileSync(target,original);}
  fs.writeFileSync(target,Buffer.from('modified ciphertext'));try{expect((await uploadImage('image-retry-integrity')).status).toBe(403);}finally{fs.writeFileSync(target,original);}
  const retry=await uploadImage('image-retry-integrity');expect(retry.status).toBe(201);expect(retry.body).toEqual(sent.body);
 });
 const sweep=()=> (app.get(CryptoReportsService) as unknown as {cleanup:()=>Promise<void>}).cleanup();
 const retainedReport=async(tag:string,image=true)=>{
  const uploaded=image?await uploadImage(tag):undefined;if(uploaded)expect(uploaded.status).toBe(201);
  const sent=await post({...disclosure(),selectedMessages:[{...disclosure().selectedMessages[0],...(uploaded?{reportAttachmentIds:[uploaded.body.id]}:{})}]});expect(sent.status).toBe(201);
  const evidence=(await pool.query('SELECT * FROM chat_crypto_report_evidence WHERE report_id=$1',[sent.body.id])).rows[0];
  const draft=uploaded?(await pool.query('SELECT * FROM chat_crypto_upload_drafts WHERE id=$1',[uploaded.body.id])).rows[0]:undefined;
  return {reportId:sent.body.id,evidence,draft};
 };
 const expire=async(id:string)=>pool.query(`UPDATE chat_crypto_report_evidence SET created_at=now()-interval '2 days',consented_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1`,[id]);
 it('removes expired consented evidence and image bytes/bindings while preserving live evidence, moderation roots and private source',async()=>{
  const expired=await retainedReport('retention-expired'),live=await retainedReport('retention-live'),text=await retainedReport('retention-text',false);
  const source=(await pool.query('SELECT * FROM messages WHERE id=$1',[ids[0]])).rows[0],file=path.join(objectRoot,expired.draft.object_key);
  await expire(expired.evidence.id);await expire(text.evidence.id);await sweep();await sweep();
  expect(fs.existsSync(file)).toBe(false);expect((await pool.query('SELECT upload_id FROM chat_crypto_report_upload_sources WHERE upload_id=$1',[expired.draft.id])).rowCount).toBe(0);
  expect((await pool.query('SELECT id FROM chat_crypto_upload_drafts WHERE id=$1',[expired.draft.id])).rowCount).toBe(0);
  expect((await pool.query('SELECT id FROM chat_crypto_report_evidence WHERE id=ANY($1::text[])',[[expired.evidence.id,text.evidence.id]])).rowCount).toBe(0);
  expect((await pool.query('SELECT id FROM reports WHERE id=ANY($1::text[])',[[expired.reportId,text.reportId]])).rowCount).toBe(2);
  expect((await pool.query('SELECT * FROM messages WHERE id=$1',[ids[0]])).rows[0]).toEqual(source);
  expect(fs.existsSync(path.join(objectRoot,live.draft.object_key))).toBe(true);expect((await pool.query('SELECT * FROM chat_crypto_report_evidence WHERE id=$1',[live.evidence.id])).rows[0]).toEqual(live.evidence);
 });
 it('skips locked evidence and attachment claims, then retries deletion after lock release',async()=>{
  for(const lock of ['evidence','draft']){
   const item=await retainedReport('retention-lock-'+lock);await expire(item.evidence.id);const db=await pool.connect();
   try{await db.query('BEGIN');await db.query(`SELECT id FROM ${lock==='evidence'?'chat_crypto_report_evidence':'chat_crypto_upload_drafts'} WHERE id=$1 FOR UPDATE`,[lock==='evidence'?item.evidence.id:item.draft.id]);await sweep();expect(fs.existsSync(path.join(objectRoot,item.draft.object_key))).toBe(true);expect((await pool.query('SELECT id FROM chat_crypto_report_evidence WHERE id=$1',[item.evidence.id])).rowCount).toBe(1);}
   finally{await db.query('ROLLBACK');db.release();}
   await sweep();expect(fs.existsSync(path.join(objectRoot,item.draft.object_key))).toBe(false);expect((await pool.query('SELECT id FROM chat_crypto_report_evidence WHERE id=$1',[item.evidence.id])).rowCount).toBe(0);
  }
 });
 it('retains metadata on filesystem refusal and resumes after the owned object is restored',async()=>{
  const item=await retainedReport('retention-filesystem');await expire(item.evidence.id);const target=path.join(objectRoot,item.draft.object_key),bytes=fs.readFileSync(target);
  fs.unlinkSync(target);fs.mkdirSync(target);
  try{await expect(sweep()).rejects.toBeDefined();expect((await pool.query('SELECT id FROM chat_crypto_report_evidence WHERE id=$1',[item.evidence.id])).rowCount).toBe(1);expect((await pool.query('SELECT id FROM chat_crypto_upload_drafts WHERE id=$1',[item.draft.id])).rowCount).toBe(1);}
  finally{fs.rmdirSync(target);fs.writeFileSync(target,bytes);}
  await sweep();expect(fs.existsSync(target)).toBe(false);
 });
 it('rolls back report metadata on PostgreSQL delete faults and safely retries already removed bytes',async()=>{
  const item=await retainedReport('retention-db');await expire(item.evidence.id);
  await pool.query(`CREATE FUNCTION report_retention_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture retention fault'; END $$`);await pool.query('CREATE TRIGGER report_retention_fault BEFORE DELETE ON chat_crypto_report_evidence FOR EACH ROW EXECUTE FUNCTION report_retention_fault()');
  try{await expect(sweep()).rejects.toBeDefined();expect(fs.existsSync(path.join(objectRoot,item.draft.object_key))).toBe(false);expect((await pool.query('SELECT id FROM chat_crypto_report_evidence WHERE id=$1',[item.evidence.id])).rowCount).toBe(1);expect((await pool.query('SELECT id FROM chat_crypto_upload_drafts WHERE id=$1',[item.draft.id])).rowCount).toBe(1);}
  finally{await pool.query('DROP TRIGGER report_retention_fault ON chat_crypto_report_evidence');await pool.query('DROP FUNCTION report_retention_fault()');}
  await sweep();expect((await pool.query('SELECT id FROM chat_crypto_report_evidence WHERE id=$1',[item.evidence.id])).rowCount).toBe(0);expect((await pool.query('SELECT id FROM chat_crypto_upload_drafts WHERE id=$1',[item.draft.id])).rowCount).toBe(0);
 });
 it('bounds evidence deletion to 100 rows per sweep and preserves root report metadata',async()=>{
  const seed=await retainedReport('retention-batch-seed',false),batch=randomUUID();
  // Structural expiry clones only; native custody/source integrity is tested above.
  await pool.query(`INSERT INTO chat_crypto_report_evidence(id,report_id,reporter_id,consented_at,envelope,source,created_at,expires_at) SELECT $1||'-'||n,$2,'alice',now()-interval '2 days',$3,'USER_DISCLOSED',now()-interval '2 days',now()-interval '1 day' FROM generate_series(1,101)n`,[batch,seed.reportId,seed.evidence.envelope]);
  const count=async()=>Number((await pool.query('SELECT count(*) FROM chat_crypto_report_evidence WHERE report_id=$1 AND id<>$2',[seed.reportId,seed.evidence.id])).rows[0].count);
  expect(await count()).toBe(101);await sweep();expect(await count()).toBe(1);await sweep();expect(await count()).toBe(0);expect((await pool.query('SELECT id FROM reports WHERE id=$1',[seed.reportId])).rowCount).toBe(1);
 });
 it('bounds consumed image deletion to 100 files and defers its evidence until all referenced drafts are gone',async()=>{
  const seed=await retainedReport('retention-image-bound',false),template=(await pool.query('SELECT * FROM chat_crypto_upload_drafts WHERE id=$1',[imageReceipt.id])).rows[0],binding=(await pool.query('SELECT * FROM chat_crypto_report_upload_sources WHERE upload_id=$1',[imageReceipt.id])).rows[0],batch=Array.from({length:101},()=>randomUUID());
  // Owned filesystem/relational budget fixtures reuse native ciphertext only;
  // these clones are not claimed to carry valid per-object decrypt bindings.
  const bytes=fs.readFileSync(path.join(objectRoot,template.object_key));for(const id of batch)fs.writeFileSync(path.join(objectRoot,id+'.bin'),bytes);
  await pool.query(`INSERT INTO chat_crypto_upload_drafts(id,uploader_id,conversation_id,client_upload_id,membership_revision,encryption_mode,object_key,ciphertext_size,ciphertext_sha256,envelope,expires_at) SELECT n,'alice','dm',n,2,'REPORT_AEAD',n||'.bin',$2,$3,$4,now()+interval '1 hour' FROM unnest($1::text[])n`,[batch,template.ciphertext_size,template.ciphertext_sha256,template.envelope]);
  await pool.query(`INSERT INTO chat_crypto_report_upload_sources(upload_id,source_message_id,retry_fingerprint) SELECT n,$2,$3 FROM unnest($1::text[])n`,[batch,binding.source_message_id,binding.retry_fingerprint]);
  await pool.query('UPDATE chat_crypto_upload_drafts SET consumed_at=now(),report_evidence_id=$2 WHERE id=ANY($1::text[])',[batch,seed.evidence.id]);await expire(seed.evidence.id);
  await sweep();const remaining=(await pool.query('SELECT id,object_key FROM chat_crypto_upload_drafts WHERE id=ANY($1::text[])',[batch])).rows;expect(remaining).toHaveLength(1);expect(batch.filter(id=>fs.existsSync(path.join(objectRoot,id+'.bin')))).toEqual([remaining[0].id]);expect((await pool.query('SELECT id FROM chat_crypto_report_evidence WHERE id=$1',[seed.evidence.id])).rowCount).toBe(1);
  await sweep();expect((await pool.query('SELECT id FROM chat_crypto_upload_drafts WHERE id=ANY($1::text[])',[batch])).rowCount).toBe(0);expect((await pool.query('SELECT upload_id FROM chat_crypto_report_upload_sources WHERE upload_id=ANY($1::text[])',[batch])).rowCount).toBe(0);expect((await pool.query('SELECT id FROM chat_crypto_report_evidence WHERE id=$1',[seed.evidence.id])).rowCount).toBe(0);expect(batch.some(id=>fs.existsSync(path.join(objectRoot,id+'.bin')))).toBe(false);
 });
 let adminReport:Awaited<ReturnType<typeof retainedReport>>;
 const readReport=(id:string,auth=cookies.outsider)=>request(base).post(`/api/v1/crypto/reports/${id}/read`).set('Cookie',auth).set('Origin',origin).send({});
 it('lets only the sole admin read explicitly submitted evidence and commits metadata-only audit before response',async()=>{
  adminReport=await retainedReport('admin-read');const prior=process.env.ADMIN_USER_IDS;process.env.ADMIN_USER_IDS='outsider';
  // Actual isolated fixture identity, not a main kingame provision/login claim.
  await pool.query("UPDATE \"user\" SET name='kingame' WHERE id='outsider'");
  const passwordHash=await hashFgPassword('FixtureA!'+randomBytes(16).toString('hex'));
  await pool.query(`INSERT INTO account(id,user_id,provider_id,account_id,password,created_at,updated_at) VALUES('read-admin-credential','outsider','credential','outsider',$1,now(),now())`,[passwordHash]);
  try{
   expect((await readReport(adminReport.reportId,cookies.alice)).status).toBe(403);expect((await request(base).post(`/api/v1/crypto/reports/${adminReport.reportId}/read`).set('Origin',origin).send({})).status).toBe(401);
   const result=await readReport(adminReport.reportId);expect(result.status).toBe(201);expect(result.headers['cache-control']).toBe('no-store');expect(result.body).toEqual({id:adminReport.reportId,selectedMessages:[{evidenceId:adminReport.evidence.id,messageId:ids[0],conversationId:'dm',text:'disclosed-text-0',reason:'selected-fixture-reason',source:'USER_DISCLOSED',authenticity:'USER_SUPPLIED_UNVERIFIED',reportAttachmentIds:[adminReport.draft.id]}]});
   const audit=(await pool.query('SELECT * FROM chat_crypto_report_audit WHERE report_id=$1',[adminReport.reportId])).rows;expect(audit).toHaveLength(1);expect(audit[0].actor_id).toBe('outsider');expect(audit[0].action).toBe('READ_REPORT');for(const value of ['disclosed-text','selected-fixture-reason','original-undisclosed'])expect(JSON.stringify(audit)).not.toContain(value);
   expect((await request(base).get('/api/v1/crypto/conversations/dm/messages').set('Cookie',cookies.outsider)).status).toBe(403);
   expect(importedReport).toBeDefined();const imported=await readReport(importedReport!.id);expect(imported.status).toBe(201);expect(imported.body.selectedMessages).toEqual([expect.objectContaining({messageId:importedReport!.messageId,text:'imported-selected-text',source:'USER_DISCLOSED',authenticity:'USER_SUPPLIED_UNVERIFIED',reportAttachmentIds:[importedReport!.attachmentId]})]);const disclosedImage=await request(base).get(`/api/v1/crypto/reports/${importedReport!.id}/attachments/${importedReport!.attachmentId}`).set('Cookie',cookies.outsider);expect(disclosedImage.status).toBe(200);expect(disclosedImage.body.toString('ascii',0,4)).toBe('RIFF');expect((await request(base).get('/api/v1/crypto/conversations/report-import/messages').set('Cookie',cookies.outsider)).status).toBe(403);const importedAudit=(await pool.query('SELECT action,actor_id FROM chat_crypto_report_audit WHERE report_id=$1 ORDER BY action',[importedReport!.id])).rows;expect(importedAudit).toEqual([{action:'READ_IMAGE',actor_id:'outsider'},{action:'READ_REPORT',actor_id:'outsider'}]);

  }finally{if(prior===undefined)delete process.env.ADMIN_USER_IDS;else process.env.ADMIN_USER_IDS=prior;}
 });
 it('audits selected report-image access and denies foreign or private source attachments',async()=>{
  const previous=process.env.ADMIN_USER_IDS;process.env.ADMIN_USER_IDS='outsider';const get=(id:string)=>request(base).get(`/api/v1/crypto/reports/${adminReport.reportId}/attachments/${id}`).set('Cookie',cookies.outsider);
  try{
   const before=(await pool.query('SELECT count(*) FROM chat_crypto_report_audit')).rows[0].count;expect((await get(imageReceipt.id)).status).toBe(404);expect((await get('unselected')).status).toBe(404);expect((await pool.query('SELECT count(*) FROM chat_crypto_report_audit')).rows[0].count).toBe(before);
   const result=await get(adminReport.draft.id);expect(result.status).toBe(200);expect(result.headers['content-type']).toBe('image/webp');expect(result.headers['cache-control']).toBe('no-store');const meta=await sharp(result.body).metadata();expect(meta.format).toBe('webp');expect(meta.exif).toBeUndefined();expect((await pool.query("SELECT id FROM chat_crypto_report_audit WHERE report_id=$1 AND action='READ_IMAGE' AND attachment_id=$2",[adminReport.reportId,adminReport.draft.id])).rowCount).toBe(1);
  }finally{if(previous===undefined)delete process.env.ADMIN_USER_IDS;else process.env.ADMIN_USER_IDS=previous;}
 });
 it('denies multiple admin IDs, revoked grants, bans, absent reader custody and expiry without disclosures/audits',async()=>{
  const prior=process.env.ADMIN_USER_IDS;const before=(await pool.query('SELECT count(*) FROM chat_crypto_report_audit')).rows[0].count;
  try{
   for(const grant of ['alice,outsider','alice','']){process.env.ADMIN_USER_IDS=grant;expect((await readReport(adminReport.reportId)).status).toBe(403);}
   process.env.ADMIN_USER_IDS='outsider';await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason) VALUES('read-ban','alice','outsider','BAN','fixture')");try{expect((await readReport(adminReport.reportId)).status).toBe(403);}finally{await pool.query("DELETE FROM admin_actions WHERE id='read-ban'");}
   const saved=readOptions.transit;readOptions.transit=undefined as unknown as OpenBaoTransit;try{expect((await readReport(adminReport.reportId)).status).toBe(503);}finally{readOptions.transit=saved;}
   const expired=await retainedReport('read-expired');await expire(expired.evidence.id);expect((await readReport(expired.reportId)).status).toBe(404);
   expect((await pool.query('SELECT count(*) FROM chat_crypto_report_audit')).rows[0].count).toBe(before);
  }finally{if(prior===undefined)delete process.env.ADMIN_USER_IDS;else process.env.ADMIN_USER_IDS=prior;}
 });
 it('fails closed with no plaintext response when native decrypt custody or PostgreSQL audit insertion fails',async()=>{
  const prior=process.env.ADMIN_USER_IDS;process.env.ADMIN_USER_IDS='outsider';const before=(await pool.query('SELECT count(*) FROM chat_crypto_report_audit')).rows[0].count,saved=readOptions.transit;
  try{
   readOptions.transit=options.transit;try{expect((await readReport(adminReport.reportId)).status).toBe(503);}finally{readOptions.transit=saved;}
   await pool.query("CREATE FUNCTION report_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit fault'; END $$");await pool.query('CREATE TRIGGER report_audit_fault BEFORE INSERT ON chat_crypto_report_audit FOR EACH ROW EXECUTE FUNCTION report_audit_fault()');
   try{const result=await readReport(adminReport.reportId);expect(result.status).toBe(500);expect(JSON.stringify(result.body)).not.toContain('disclosed-text');}finally{await pool.query('DROP TRIGGER report_audit_fault ON chat_crypto_report_audit');await pool.query('DROP FUNCTION report_audit_fault()');}
   expect((await pool.query('SELECT count(*) FROM chat_crypto_report_audit')).rows[0].count).toBe(before);
  }finally{readOptions.transit=saved;if(prior===undefined)delete process.env.ADMIN_USER_IDS;else process.env.ADMIN_USER_IDS=prior;}
 });
 it('refuses a report-image association rewritten to evidence that did not select it',async()=>{
  const previous=process.env.ADMIN_USER_IDS;process.env.ADMIN_USER_IDS='outsider';const other=await retainedReport('read-association',false);
  await pool.query('UPDATE chat_crypto_upload_drafts SET report_evidence_id=$2 WHERE id=$1',[adminReport.draft.id,other.evidence.id]);
  try{const result=await request(base).get(`/api/v1/crypto/reports/${other.reportId}/attachments/${adminReport.draft.id}`).set('Cookie',cookies.outsider);expect(result.status).toBe(404);expect(result.headers['content-type']).not.toBe('image/webp');}
  finally{await pool.query('UPDATE chat_crypto_upload_drafts SET report_evidence_id=$2 WHERE id=$1',[adminReport.draft.id,adminReport.evidence.id]);if(previous===undefined)delete process.env.ADMIN_USER_IDS;else process.env.ADMIN_USER_IDS=previous;}
 });

 it.each(['read committed','repeatable read'])('denies native report plaintext after a committed admin ban with caller default %s',async(isolation)=>{
  const service=app.get(CryptoReportsService) as unknown as {pool:pg.Pool},actualConnect=service.pool.connect.bind(service.pool),observed=service.pool as unknown as {connect:()=>Promise<pg.PoolClient>},previous=new Map<pg.PoolClient,string>(),priorAdmin=process.env.ADMIN_USER_IDS,savedReader=readOptions.transit,ban='report-reader-isolation-'+randomUUID(),buffers:Buffer[]=[],before=(await pool.query('SELECT count(*) FROM chat_crypto_report_audit')).rows[0].count;let inserted=false;
  const reader=new OpenBaoTransit({address:process.env.FG_REPORT_TEST_ADDRESS!,ca:fs.readFileSync(process.env.FG_REPORT_TEST_CA!),token:async()=>{if(!inserted){inserted=true;await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason,created_at) VALUES($1,'alice','outsider','BAN','owned report reader isolation',clock_timestamp())",[ban]);expect((await pool.query("SELECT action FROM admin_actions WHERE target_user_id='outsider' AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1")).rows[0].action).toBe('BAN');}return process.env.FG_REPORT_TEST_READER!;}}),originalDecrypt=reader.decrypt.bind(reader),decryptObserver=jest.spyOn(reader,'decrypt').mockImplementation(async(...args:Parameters<OpenBaoTransit['decrypt']>)=>{const bytes=await originalDecrypt(...args);buffers.push(bytes);return bytes;}),connectionObserver=jest.spyOn(observed,'connect').mockImplementation(async()=>{const client=await actualConnect();if(!previous.has(client)){previous.set(client,(await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation);await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[isolation]);expect((await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation).toBe(isolation);}return client;});
  try{process.env.ADMIN_USER_IDS='outsider';readOptions.transit=reader;const response=await readReport(adminReport.reportId);expect(response.status).toBe(403);expect(response.body.selectedMessages).toBeUndefined();expect(JSON.stringify(response.body)).not.toContain('disclosed-text');expect(inserted).toBe(true);expect(buffers.length).toBeGreaterThan(0);expect(buffers.every(bytes=>bytes.every(byte=>byte===0))).toBe(true);expect((await pool.query('SELECT count(*) FROM chat_crypto_report_audit')).rows[0].count).toBe(before);}
  finally{readOptions.transit=savedReader;decryptObserver.mockRestore();connectionObserver.mockRestore();for(const [client,setting]of previous)await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[setting]);await pool.query('DELETE FROM admin_actions WHERE id=$1',[ban]);if(priorAdmin===undefined)delete process.env.ADMIN_USER_IDS;else process.env.ADMIN_USER_IDS=priorAdmin;}
 });
 it('rechecks grants, bans and actual wall-clock expiry after native KMS decryption, before audit or plaintext response',async()=>{
  const previous=process.env.ADMIN_USER_IDS,saved=readOptions.transit,before=(await pool.query('SELECT count(*) FROM chat_crypto_report_audit')).rows[0].count;
  const native=async(mutate:()=>Promise<void>)=>new OpenBaoTransit({address:process.env.FG_REPORT_TEST_ADDRESS!,ca:fs.readFileSync(process.env.FG_REPORT_TEST_CA!),token:async()=>{await mutate();return process.env.FG_REPORT_TEST_READER!;}});
  try{
   process.env.ADMIN_USER_IDS='outsider';readOptions.transit=await native(async()=>{process.env.ADMIN_USER_IDS='alice';});expect((await readReport(adminReport.reportId)).status).toBe(403);
   process.env.ADMIN_USER_IDS='outsider';readOptions.transit=await native(async()=>{await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason) VALUES('late-read-ban','alice','outsider','BAN','fixture')");});try{expect((await readReport(adminReport.reportId)).status).toBe(403);}finally{await pool.query("DELETE FROM admin_actions WHERE id='late-read-ban'");}
   readOptions.transit=saved;const expires=await retainedReport('late-read-expiry',false);await pool.query("UPDATE chat_crypto_report_evidence SET expires_at=clock_timestamp()+interval '2 seconds' WHERE id=$1",[expires.evidence.id]);readOptions.transit=await native(async()=>{await new Promise(resolve=>setTimeout(resolve,2200));});expect((await readReport(expires.reportId)).status).toBe(404);
   expect((await pool.query('SELECT count(*) FROM chat_crypto_report_audit')).rows[0].count).toBe(before);
  }finally{readOptions.transit=saved;if(previous===undefined)delete process.env.ADMIN_USER_IDS;else process.env.ADMIN_USER_IDS=previous;}
 });
 it('uses central admin identity eligibility rather than granting an arbitrary configured ID',async()=>{
  const previous=process.env.ADMIN_USER_IDS;process.env.ADMIN_USER_IDS='outsider';const credential=(await pool.query("SELECT * FROM account WHERE id='read-admin-credential'")).rows[0],before=(await pool.query('SELECT count(*) FROM chat_crypto_report_audit')).rows[0].count,statuses:number[]=[];
  try{
   await pool.query("UPDATE \"user\" SET name='ordinary-user' WHERE id='outsider'");try{statuses.push((await readReport(adminReport.reportId)).status);}finally{await pool.query("UPDATE \"user\" SET name='kingame' WHERE id='outsider'");}
   await pool.query("UPDATE \"user\" SET email_verified=false WHERE id='outsider'");try{statuses.push((await readReport(adminReport.reportId)).status);}finally{await pool.query("UPDATE \"user\" SET email_verified=true WHERE id='outsider'");}
   await pool.query("DELETE FROM account WHERE id='read-admin-credential'");try{statuses.push((await readReport(adminReport.reportId)).status);}finally{await pool.query(`INSERT INTO account(id,user_id,provider_id,account_id,password,created_at,updated_at) VALUES('read-admin-credential','outsider','credential','outsider',$1,now(),now())`,[credential.password]);}
   expect(statuses).toEqual([403,403,403]);expect((await pool.query('SELECT count(*) FROM chat_crypto_report_audit')).rows[0].count).toBe(before);
  }finally{if(previous===undefined)delete process.env.ADMIN_USER_IDS;else process.env.ADMIN_USER_IDS=previous;}
 });
 const postLobby=(tag:string,content='lobby-visible-after-decrypt',extra:Record<string,unknown>={})=>request(base).post(`/api/v1/conversations/${lobby}/messages`).set('Cookie',cookies.alice).set('Origin',origin).send({clientMessageId:tag,content,...extra});
 it('stores Lobby text as native fg-lobby AEAD while preserving actual public history and metadata-only outbox',async()=>{
  const sent=await postLobby('lobby-native-text');expect(sent.status).toBe(201);expect(sent.body.content).toBe('lobby-visible-after-decrypt');
  const row=(await pool.query('SELECT * FROM messages WHERE id=$1',[sent.body.id])).rows[0];expect(row.encryption_mode).toBe('LOBBY_AEAD');expect(row.content).toBe('');expect(row.crypto_envelope.keyId).toBe('fg-lobby');expect(row.crypto_revision).toBe('1');
  const outbox=(await pool.query('SELECT * FROM realtime_outbox WHERE message_id=$1',[sent.body.id])).rows;expect(outbox).toHaveLength(1);expect(JSON.stringify({row,outbox})).not.toContain('lobby-visible-after-decrypt');
  const history=await request(base).get(`/api/v1/conversations/${lobby}/messages`);expect(history.status).toBe(200);expect(history.body.items.some((m:{id:string;content:string})=>m.id===sent.body.id&&m.content==='lobby-visible-after-decrypt')).toBe(true);
  expect((await request(base).post(`/api/v1/conversations/${lobby}/messages`).set('Origin',origin).send({clientMessageId:'guest-lobby',content:'denied'})).status).toBe(401);
 });
 it('keeps public replies, explicit mentions and idempotent retry without plaintext persistence',async()=>{
  const parent=await postLobby('lobby-parent','lobby-parent-text');expect(parent.status).toBe(201);const body={replyToId:parent.body.id,mentionedUserIds:['bob']};
  const sent=await postLobby('lobby-reply','lobby-reply-text',body),retry=await postLobby('lobby-reply','lobby-reply-text',body);expect(sent.status).toBe(201);expect(retry.status).toBe(201);expect(retry.body).toEqual(sent.body);expect(sent.body.replyToMessage.content).toBe('lobby-parent-text');expect(sent.body.mentionedUserIds).toEqual(['bob']);
  const rows=(await pool.query('SELECT content,encryption_mode FROM messages WHERE id=ANY($1::text[])',[[parent.body.id,sent.body.id]])).rows;expect(rows.every(r=>r.content===''&&r.encryption_mode==='LOBBY_AEAD')).toBe(true);expect((await pool.query('SELECT id FROM realtime_outbox WHERE message_id=$1',[sent.body.id])).rowCount).toBe(1);
 });
 it('fails closed with absent/wrong Lobby custody or unreconciled state instead of plaintext fallback',async()=>{
  const before=(await pool.query('SELECT count(*) FROM messages WHERE conversation_id=$1',[lobby])).rows[0].count,saved=lobbyOptions.transit;
  lobbyOptions.transit=undefined as unknown as OpenBaoTransit;try{expect((await postLobby('lobby-no-custody')).status).toBe(503);}finally{lobbyOptions.transit=saved;}
  lobbyToken=process.env.FG_REPORT_TEST_WRITER!;try{expect((await postLobby('lobby-denied-role')).status).toBe(503);}finally{lobbyToken=process.env.FG_REPORT_TEST_DENIED!;}
  await pool.query("UPDATE chat_crypto_state SET migration_state='MIGRATING' WHERE conversation_id=$1",[lobby]);try{expect((await postLobby('lobby-migrating')).status).toBe(409);expect((await request(base).get(`/api/v1/conversations/${lobby}/messages`)).status).toBe(409);}finally{await pool.query("UPDATE chat_crypto_state SET migration_state='RECONCILED' WHERE conversation_id=$1",[lobby]);}
  expect((await pool.query('SELECT count(*) FROM messages WHERE conversation_id=$1',[lobby])).rows[0].count).toBe(before);
 });
 it('rejects conflicting Lobby retries and authenticated ciphertext substitution',async()=>{
  const sent=await postLobby('lobby-conflict','original Lobby selection');expect(sent.status).toBe(201);
  expect((await postLobby('lobby-conflict','changed Lobby selection')).status).toBe(409);
  const other=await postLobby('lobby-substitution','other Lobby message');expect(other.status).toBe(201);
  const original=(await pool.query('SELECT crypto_envelope FROM messages WHERE id=$1',[sent.body.id])).rows[0].crypto_envelope;
  const replacement=(await pool.query('SELECT crypto_envelope FROM messages WHERE id=$1',[other.body.id])).rows[0].crypto_envelope;
  await pool.query('UPDATE messages SET crypto_envelope=$2 WHERE id=$1',[sent.body.id,replacement]);
  try{const history=await request(base).get(`/api/v1/conversations/${lobby}/messages`);expect(history.status).toBe(503);expect(JSON.stringify(history.body)).not.toContain('other Lobby message');}
  finally{await pool.query('UPDATE messages SET crypto_envelope=$2 WHERE id=$1',[sent.body.id,original]);}
 });
 const uploadLobby=()=>request(base).post('/api/v1/uploads/images').set('Cookie',cookies.alice).set('Origin',origin).field('conversationId',lobby).attach('file',picture,{filename:'private-original-name.png',contentType:'image/png'});
 it('encrypts normalized Lobby images before storage and publishes only authenticated selected attachments',async()=>{
  const upload=await uploadLobby();expect(upload.status).toBe(201);expect(upload.body.fileName).toBe('image.webp');
  const id=upload.body.id,draft=(await pool.query('SELECT * FROM chat_crypto_upload_drafts WHERE id=$1',[id])).rows[0];expect(draft.encryption_mode).toBe('LOBBY_AEAD');expect(draft.envelope.keyId).toBe('fg-lobby');expect(draft.object_key).toBe(id+'.bin');
  const disk=fs.readFileSync(path.join(objectRoot,draft.object_key));expect(disk.length).toBe(draft.ciphertext_size);expect(disk.toString('ascii',0,4)).not.toBe('RIFF');expect(JSON.stringify(draft)).not.toContain('private-original-name');expect(fs.existsSync(path.join(objectRoot,'legacy-images',id+'.webp'))).toBe(false);expect((await pool.query('SELECT id FROM pending_image_uploads WHERE id=$1',[id])).rowCount).toBe(0);
  expect((await request(base).get(`/api/v1/attachments/${id}/content`)).status).toBe(403);
  expect((await request(base).get(`/api/v1/attachments/${id}/content`).set('Cookie',cookies.alice)).status).toBe(200);
  const sent=await postLobby('lobby-image','public image caption',{attachmentIds:[id]});expect(sent.status).toBe(201);expect(sent.body.attachments).toEqual([upload.body]);
  const stored=(await pool.query('SELECT * FROM attachments WHERE id=$1',[id])).rows[0];expect(stored.file_name).toBe('');expect(stored.mime_type).toBe('application/octet-stream');expect(stored.encryption_mode).toBe('LOBBY_AEAD');
  const content=await request(base).get(`/api/v1/attachments/${id}/content`);expect(content.status).toBe(200);expect(content.headers['cache-control']).toContain('no-store');const meta=await sharp(content.body).metadata();expect(meta.format).toBe('webp');expect(meta.exif).toBeUndefined();expect(content.body.length).toBe(upload.body.fileSize);
  const other=await postLobby('lobby-unselected-image','no selected image');await pool.query('UPDATE attachments SET message_id=$2 WHERE id=$1',[id,other.body.id]);await pool.query('UPDATE chat_crypto_upload_drafts SET message_id=$2 WHERE id=$1',[id,other.body.id]);
  try{expect((await request(base).get(`/api/v1/attachments/${id}/content`)).status).toBe(503);}finally{await pool.query('UPDATE attachments SET message_id=$2 WHERE id=$1',[id,sent.body.id]);await pool.query('UPDATE chat_crypto_upload_drafts SET message_id=$2 WHERE id=$1',[id,sent.body.id]);}
 });
 it('does not write a plaintext Lobby image or draft when native custody is missing or denied',async()=>{
  const before=fs.readdirSync(path.join(objectRoot,'legacy-images')),count=(await pool.query('SELECT count(*) FROM chat_crypto_upload_drafts')).rows[0].count,saved=lobbyOptions.transit;
  lobbyOptions.transit=undefined as unknown as OpenBaoTransit;try{expect((await uploadLobby()).status).toBe(503);}finally{lobbyOptions.transit=saved;}
  lobbyToken=process.env.FG_REPORT_TEST_WRITER!;try{expect((await uploadLobby()).status).toBe(503);}finally{lobbyToken=process.env.FG_REPORT_TEST_DENIED!;}
  expect(fs.readdirSync(path.join(objectRoot,'legacy-images'))).toEqual(before);expect((await pool.query('SELECT count(*) FROM chat_crypto_upload_drafts')).rows[0].count).toBe(count);
 });
 it('rolls back Lobby ciphertext objects on PostgreSQL failure and denies tampered or expired drafts',async()=>{
  const before=fs.readdirSync(objectRoot).sort();await pool.query("CREATE FUNCTION lobby_upload_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.encryption_mode='LOBBY_AEAD' THEN RAISE EXCEPTION 'fixture upload fault'; END IF; RETURN NEW; END $$");await pool.query('CREATE TRIGGER lobby_upload_fault BEFORE INSERT ON chat_crypto_upload_drafts FOR EACH ROW EXECUTE FUNCTION lobby_upload_fault()');
  try{expect((await uploadLobby()).status).toBe(500);expect(fs.readdirSync(objectRoot).sort()).toEqual(before);}finally{await pool.query('DROP TRIGGER lobby_upload_fault ON chat_crypto_upload_drafts');await pool.query('DROP FUNCTION lobby_upload_fault()');}
  const uploaded=await uploadLobby();expect(uploaded.status).toBe(201);const id=uploaded.body.id,draft=(await pool.query('SELECT * FROM chat_crypto_upload_drafts WHERE id=$1',[id])).rows[0],target=path.join(objectRoot,draft.object_key),original=fs.readFileSync(target);fs.writeFileSync(target,Buffer.from('tampered cipher object'));
  try{expect((await request(base).get(`/api/v1/attachments/${id}/content`).set('Cookie',cookies.alice)).status).toBe(503);expect((await postLobby('lobby-tampered-claim','tampered',{attachmentIds:[id]})).status).toBe(503);}finally{fs.writeFileSync(target,original);}
  await pool.query("UPDATE chat_crypto_upload_drafts SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[id]);expect((await request(base).get(`/api/v1/attachments/${id}/content`).set('Cookie',cookies.alice)).status).toBe(404);expect((await postLobby('lobby-expired-claim','expired',{attachmentIds:[id]})).status).toBe(422);
  expect((await pool.query('SELECT id FROM messages WHERE client_message_id=ANY($1::text[])',[['lobby-tampered-claim','lobby-expired-claim']])).rowCount).toBe(0);
 });
 it('rechecks a ban after native Lobby encrypt or post-insert decrypt and rolls back the whole write',async()=>{
  const saved=lobbyOptions.transit,before=(await pool.query('SELECT count(*) FROM messages WHERE conversation_id=$1',[lobby])).rows[0].count,files=fs.readdirSync(objectRoot).sort();
  const lateBan=(onCall:number)=>{let calls=0;return new OpenBaoTransit({address:process.env.FG_REPORT_TEST_ADDRESS!,ca:fs.readFileSync(process.env.FG_REPORT_TEST_CA!),token:async()=>{if(++calls===onCall)await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason) VALUES('late-lobby-ban','outsider','alice','BAN','fixture')");return process.env.FG_REPORT_TEST_DENIED!;}});};
  try{
   lobbyOptions.transit=lateBan(1);try{expect((await uploadLobby()).status).toBe(403);expect(fs.readdirSync(objectRoot).sort()).toEqual(files);}finally{await pool.query("DELETE FROM admin_actions WHERE id='late-lobby-ban'");}
   lobbyOptions.transit=lateBan(2);try{expect((await postLobby('lobby-late-ban')).status).toBe(403);}finally{await pool.query("DELETE FROM admin_actions WHERE id='late-lobby-ban'");}
   expect((await pool.query('SELECT count(*) FROM messages WHERE conversation_id=$1',[lobby])).rows[0].count).toBe(before);expect((await pool.query("SELECT id FROM realtime_outbox WHERE message_id IN(SELECT id FROM messages WHERE client_message_id='lobby-late-ban')")).rowCount).toBe(0);
  }finally{lobbyOptions.transit=saved;await pool.query("DELETE FROM admin_actions WHERE id='late-lobby-ban'");}
 });
 it.each(['read committed','repeatable read'])('denies Lobby upload after native object put and committed ban with caller default %s',async(isolation)=>{
  const service=app.get(UploadsService) as unknown as {pool:pg.Pool;lobbyCipher:LobbyCipher},actualConnect=service.pool.connect.bind(service.pool),observed=service.pool as unknown as {connect:()=>Promise<pg.PoolClient>},previous=new Map<pg.PoolClient,string>(),tag='lobby-object-authority-'+randomUUID(),ban=tag+'-ban',files=fs.readdirSync(objectRoot).sort(),drafts=(await pool.query('SELECT count(*) FROM chat_crypto_upload_drafts')).rows[0].count,keys:string[]=[],buffers:Buffer[]=[],actualPut=service.lobbyCipher.objects.put.bind(service.lobbyCipher.objects),actualEncode=service.lobbyCipher.encodeImage.bind(service.lobbyCipher);let inserted=false,uploadId:string|undefined;
  const observer=jest.spyOn(observed,'connect').mockImplementation(async()=>{const client=await actualConnect();if(!previous.has(client)){previous.set(client,(await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation);await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[isolation]);expect((await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation).toBe(isolation);}return client;}),encodeObserver=jest.spyOn(service.lobbyCipher,'encodeImage').mockImplementation(async(...args:Parameters<LobbyCipher['encodeImage']>)=>{buffers.push(args[0]);return actualEncode(...args);}),putObserver=jest.spyOn(service.lobbyCipher.objects,'put').mockImplementation(async(key,bytes)=>{await actualPut(key,bytes);keys.push(key);expect(key).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.bin$/);const root=fs.realpathSync(objectRoot),target=path.resolve(root,key);expect(root).toBe(path.resolve('.runtime/chatcrypto-be',owned));expect(path.dirname(target)).toBe(root);expect(files).not.toContain(key);expect(fs.statSync(target).isFile()).toBe(true);expect(fs.readFileSync(target)).toEqual(bytes);await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason,created_at) VALUES($1,'outsider','alice','BAN','owned Lobby native file boundary',clock_timestamp())",[ban]);inserted=true;expect((await pool.query("SELECT action FROM admin_actions WHERE target_user_id='alice' AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1")).rows[0].action).toBe('BAN');});
  try{const response=await uploadLobby();if(response.status===201)uploadId=response.body.id;expect(inserted).toBe(true);expect(keys).toHaveLength(1);expect(response.status).toBe(403);expect(buffers.length).toBeGreaterThan(0);expect(buffers.every(bytes=>bytes.every(byte=>byte===0))).toBe(true);expect((await pool.query('SELECT count(*) FROM chat_crypto_upload_drafts')).rows[0].count).toBe(drafts);expect(fs.readdirSync(objectRoot).sort()).toEqual(files);}
  finally{
   putObserver.mockRestore();encodeObserver.mockRestore();observer.mockRestore();for(const [client,setting]of previous)await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[setting]);
   if(uploadId){expect(keys).toEqual([uploadId+'.bin']);const draft=(await pool.query("SELECT * FROM chat_crypto_upload_drafts WHERE id=$1 AND uploader_id='alice' AND conversation_id=$2 AND encryption_mode='LOBBY_AEAD' AND message_id IS NULL AND report_evidence_id IS NULL AND cohort_id IS NULL AND consumed_at IS NULL",[uploadId,lobby])).rows[0];expect(draft).toBeDefined();expect(draft.object_key).toBe(uploadId+'.bin');const root=fs.realpathSync(objectRoot),target=path.resolve(root,draft.object_key);expect(root).toBe(path.resolve('.runtime/chatcrypto-be',owned));expect(path.dirname(target)).toBe(root);expect(files).not.toContain(draft.object_key);await pool.query("DELETE FROM chat_crypto_upload_drafts WHERE id=$1 AND uploader_id='alice' AND conversation_id=$2 AND message_id IS NULL AND report_evidence_id IS NULL AND cohort_id IS NULL AND consumed_at IS NULL",[uploadId,lobby]);fs.unlinkSync(target);}
   await pool.query('DELETE FROM admin_actions WHERE id=$1',[ban]);
  }
 });
 it('denies Lobby upload when the actual cookie session expires during native object put and removes the new file',async()=>{
  const chat=app.get(ChatService),service=app.get(UploadsService) as unknown as {lobbyCipher:LobbyCipher},actualActor=chat.actor.bind(chat),actualPut=service.lobbyCipher.objects.put.bind(service.lobbyCipher.objects),actualEncode=service.lobbyCipher.encodeImage.bind(service.lobbyCipher),files=fs.readdirSync(objectRoot).sort(),drafts=(await pool.query('SELECT count(*) FROM chat_crypto_upload_drafts')).rows[0].count,buffers:Buffer[]=[],keys:string[]=[];let sessionId:string|undefined,expires:string|undefined,written=false,expired=false,uploadId:string|undefined;
  const actorObserver=jest.spyOn(chat,'actor').mockImplementation(async(...args:Parameters<ChatService['actor']>)=>{const actor=await actualActor(...args);expect(actor?.userId).toBe('alice');expect(sessionId).toBeUndefined();sessionId=actor!.sessionId;expires=(await pool.query(`SELECT expires_at::text AS expires FROM "session" WHERE id=$1 AND user_id='alice'`,[sessionId])).rows[0].expires;await pool.query(`UPDATE "session" SET expires_at=clock_timestamp()+interval '2 seconds' WHERE id=$1 AND user_id='alice'`,[sessionId]);return actor;}),encodeObserver=jest.spyOn(service.lobbyCipher,'encodeImage').mockImplementation(async(...args:Parameters<LobbyCipher['encodeImage']>)=>{buffers.push(args[0]);return actualEncode(...args);}),putObserver=jest.spyOn(service.lobbyCipher.objects,'put').mockImplementation(async(key,bytes)=>{await actualPut(key,bytes);keys.push(key);expect(key).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.bin$/);const root=fs.realpathSync(objectRoot),target=path.resolve(root,key);expect(root).toBe(path.resolve('.runtime/chatcrypto-be',owned));expect(path.dirname(target)).toBe(root);expect(files).not.toContain(key);expect(fs.readFileSync(target)).toEqual(bytes);written=true;await new Promise(resolve=>setTimeout(resolve,2200));expired=(await pool.query(`SELECT expires_at<=clock_timestamp() AS expired FROM "session" WHERE id=$1 AND user_id='alice'`,[sessionId])).rows[0].expired;expect(expired).toBe(true);});
  try{const response=await uploadLobby();if(response.status===201)uploadId=response.body.id;expect(sessionId).toBeDefined();expect(written).toBe(true);expect(expired).toBe(true);expect(response.status).toBe(401);expect(keys).toHaveLength(1);expect(buffers.length).toBeGreaterThan(0);expect(buffers.every(bytes=>bytes.every(byte=>byte===0))).toBe(true);expect((await pool.query('SELECT count(*) FROM chat_crypto_upload_drafts')).rows[0].count).toBe(drafts);expect(fs.readdirSync(objectRoot).sort()).toEqual(files);}
  finally{actorObserver.mockRestore();encodeObserver.mockRestore();putObserver.mockRestore();if(sessionId&&expires){await pool.query(`UPDATE "session" SET expires_at=$2::timestamptz WHERE id=$1 AND user_id='alice'`,[sessionId,expires]);expect((await pool.query(`SELECT expires_at::text AS expires FROM "session" WHERE id=$1 AND user_id='alice'`,[sessionId])).rows[0].expires).toBe(expires);}
   if(uploadId){expect(keys).toEqual([uploadId+'.bin']);const draft=(await pool.query("SELECT * FROM chat_crypto_upload_drafts WHERE id=$1 AND uploader_id='alice' AND conversation_id=$2 AND encryption_mode='LOBBY_AEAD' AND message_id IS NULL AND report_evidence_id IS NULL AND cohort_id IS NULL AND consumed_at IS NULL",[uploadId,lobby])).rows[0];expect(draft).toBeDefined();expect(draft.object_key).toBe(uploadId+'.bin');const root=fs.realpathSync(objectRoot),target=path.resolve(root,draft.object_key);expect(root).toBe(path.resolve('.runtime/chatcrypto-be',owned));expect(path.dirname(target)).toBe(root);expect(files).not.toContain(draft.object_key);await pool.query("DELETE FROM chat_crypto_upload_drafts WHERE id=$1 AND uploader_id='alice' AND conversation_id=$2 AND message_id IS NULL AND report_evidence_id IS NULL AND cohort_id IS NULL AND consumed_at IS NULL",[uploadId,lobby]);fs.unlinkSync(target);}
  }
 });
 it.each([{kind:'message',isolation:'read committed'},{kind:'message',isolation:'repeatable read'},{kind:'upload',isolation:'read committed'},{kind:'upload',isolation:'repeatable read'}])('denies native Lobby $kind after committed late ban with caller default $isolation',async({kind,isolation})=>{
  const service=app.get(kind==='message'?ChatService:UploadsService) as unknown as {pool:pg.Pool},actualConnect=service.pool.connect.bind(service.pool),observed=service.pool as unknown as {connect:()=>Promise<pg.PoolClient>},previous=new Map<pg.PoolClient,string>(),saved=lobbyOptions.transit,tag='lobby-isolation-'+randomUUID(),ban=tag+'-ban',files=fs.readdirSync(objectRoot).sort(),drafts=(await pool.query('SELECT count(*) FROM chat_crypto_upload_drafts')).rows[0].count;let calls=0,inserted=false,uploadId:string|undefined;
  const observer=jest.spyOn(observed,'connect').mockImplementation(async()=>{const client=await actualConnect();if(!previous.has(client)){previous.set(client,(await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation);await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[isolation]);expect((await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation).toBe(isolation);}return client;});
  lobbyOptions.transit=new OpenBaoTransit({address:process.env.FG_REPORT_TEST_ADDRESS!,ca:fs.readFileSync(process.env.FG_REPORT_TEST_CA!),token:async()=>{if(++calls===(kind==='message'?2:1)){await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason,created_at) VALUES($1,'outsider','alice','BAN','owned Lobby isolation',clock_timestamp())",[ban]);inserted=true;expect((await pool.query("SELECT action FROM admin_actions WHERE target_user_id='alice' AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1")).rows[0].action).toBe('BAN');}return process.env.FG_REPORT_TEST_DENIED!;}});
  try{
   const response=kind==='message'?await postLobby(tag):await uploadLobby();if(kind==='upload'&&response.status===201)uploadId=response.body.id;
   expect(inserted).toBe(true);expect(response.status).toBe(403);
   expect((await pool.query("SELECT id FROM messages WHERE sender_id='alice' AND conversation_id=$1 AND client_message_id=$2",[lobby,tag])).rowCount).toBe(0);
   expect((await pool.query("SELECT id FROM realtime_outbox WHERE message_id IN(SELECT id FROM messages WHERE sender_id='alice' AND conversation_id=$1 AND client_message_id=$2)",[lobby,tag])).rowCount).toBe(0);
   expect((await pool.query('SELECT count(*) FROM chat_crypto_upload_drafts')).rows[0].count).toBe(drafts);expect(fs.readdirSync(objectRoot).sort()).toEqual(files);
  }finally{
   lobbyOptions.transit=saved;observer.mockRestore();for(const [client,setting]of previous)await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[setting]);
   const messages=(await pool.query("SELECT id FROM messages WHERE sender_id='alice' AND conversation_id=$1 AND client_message_id=$2",[lobby,tag])).rows.map(row=>row.id);
   if(messages.length){await pool.query('DELETE FROM realtime_outbox WHERE message_id=ANY($1::text[])',[messages]);await pool.query("DELETE FROM messages WHERE id=ANY($1::text[]) AND sender_id='alice' AND conversation_id=$2 AND client_message_id=$3",[messages,lobby,tag]);}
   if(uploadId){expect(uploadId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);const draft=(await pool.query("SELECT * FROM chat_crypto_upload_drafts WHERE id=$1 AND uploader_id='alice' AND conversation_id=$2 AND encryption_mode='LOBBY_AEAD' AND message_id IS NULL AND report_evidence_id IS NULL AND cohort_id IS NULL AND consumed_at IS NULL",[uploadId,lobby])).rows[0];expect(draft).toBeDefined();expect(draft.object_key).toBe(uploadId+'.bin');const root=fs.realpathSync(objectRoot),target=path.resolve(root,draft.object_key);expect(root).toBe(path.resolve('.runtime/chatcrypto-be',owned));expect(path.dirname(target)).toBe(root);expect(files).not.toContain(draft.object_key);await pool.query("DELETE FROM chat_crypto_upload_drafts WHERE id=$1 AND uploader_id='alice' AND conversation_id=$2 AND message_id IS NULL AND report_evidence_id IS NULL AND cohort_id IS NULL AND consumed_at IS NULL",[uploadId,lobby]);fs.unlinkSync(target);}
   await pool.query('DELETE FROM admin_actions WHERE id=$1',[ban]);
  }
 });
 it('closes the legacy upload activation gap before a plaintext file or draft is written',async()=>{
  const chat=app.get(ChatService),original=chat.assertLegacyRouteAllowed.bind(chat),files=fs.readdirSync(path.join(objectRoot,'legacy-images')).sort(),before=(await pool.query('SELECT count(*) FROM pending_image_uploads')).rows[0].count;
  await pool.query('DELETE FROM chat_crypto_state WHERE conversation_id=$1',[lobby]);let activated=false;
  const spy=jest.spyOn(chat,'assertLegacyRouteAllowed').mockImplementation(async(...args)=>{if(args[2]&&!activated){activated=true;await pool.query("INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES($1,'LOBBY_AEAD','RECONCILED','KNOWN')",[lobby]);}return original(...args);});
  try{expect((await uploadLobby()).status).toBe(409);expect(activated).toBe(true);expect(fs.readdirSync(path.join(objectRoot,'legacy-images')).sort()).toEqual(files);expect((await pool.query('SELECT count(*) FROM pending_image_uploads')).rows[0].count).toBe(before);}
  finally{spy.mockRestore();await pool.query("INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES($1,'LOBBY_AEAD','RECONCILED','KNOWN') ON CONFLICT DO NOTHING",[lobby]);}
 });
 it('delivers decrypted public Lobby over actual Socket.IO while Redis/outbox retain only opaque routing IDs',async()=>{
  const socket:Socket=io(base,{path:'/socket.io',transports:['websocket'],reconnection:false,extraHeaders:{Origin:origin}}),bus=new Redis(process.env.REDIS_URL!),channel='fg:chat:'+createHash('sha256').update(process.env.DATABASE_URL!).digest('hex').slice(0,24),published:string[]=[],received:unknown[]=[];
  socket.on(SocketEventNames.MESSAGE_CREATED,value=>received.push(value));socket.on(SocketEventNames.CRYPTO_MESSAGE_CREATED,value=>received.push(value));bus.on('error',()=>undefined);bus.on('message',(_,value)=>published.push(value));
  const wait=async(check:()=>boolean)=>{const deadline=Date.now()+5000;while(!check()){if(Date.now()>deadline)throw new Error('Actual Lobby realtime condition timed out');await new Promise(resolve=>setTimeout(resolve,20));}};
  try{
   await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});await bus.subscribe(channel);
   const ack=await new Promise<{ok:boolean}>((resolve,reject)=>socket.timeout(3000).emit(SocketEventNames.CONVERSATION_SUBSCRIBE,{conversationId:lobby},(error:Error|null,value:{ok:boolean})=>error?reject(error):resolve(value)));expect(ack.ok).toBe(true);
   const denied=await new Promise<{ok:boolean}>((resolve,reject)=>socket.timeout(3000).emit(SocketEventNames.CONVERSATION_SUBSCRIBE,{conversationId:'dm'},(error:Error|null,value:{ok:boolean})=>error?reject(error):resolve(value)));expect(denied.ok).toBe(false);
   const sent=await postLobby('lobby-native-realtime','public realtime through Transit');expect(sent.status).toBe(201);await wait(()=>received.some(value=>MessageSchema.safeParse(value).success&&MessageSchema.parse(value).id===sent.body.id));await wait(()=>published.includes(sent.body.id));
   expect(MessageSchema.parse(received.find(value=>MessageSchema.safeParse(value).success&&MessageSchema.parse(value).id===sent.body.id))).toEqual(sent.body);
   expect(published.every(value=>/^[a-f0-9-]{36}$/.test(value))).toBe(true);expect(JSON.stringify(published)).not.toContain('public realtime through Transit');expect(received.every(value=>MessageSchema.parse(value).conversationId===lobby)).toBe(true);
   const deadline=Date.now()+5000;while((await pool.query('SELECT id FROM realtime_outbox WHERE message_id=$1 AND delivered_at IS NULL',[sent.body.id])).rowCount){if(Date.now()>deadline)throw new Error('Native outbox delivery not committed');await new Promise(resolve=>setTimeout(resolve,20));}
  }finally{socket.disconnect();bus.disconnect();}
 });
});
