import {describe,it,expect,beforeAll,beforeEach,afterEach,afterAll} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
const root=path.resolve(import.meta.dirname,'../../..'),env=parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8'));
const owned=`chatcrypto_${randomUUID().replaceAll('-','')}`,schemas:string[]=[];
const privateEnvelope={version:1,protocol:'MATRIX_MEGOLM',event:{algorithm:'m.megolm.v1.aes-sha2',ciphertext:Buffer.alloc(128).toString('base64'),session_id:Buffer.alloc(32).toString('base64').replace(/=+$/,'')}};
describe('CHAT-CRYPTO-01 native PostgreSQL additive migration and boundaries',()=>{
 let client:pg.Client,legacy:unknown;
 beforeAll(async()=>{
  client=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:15000});await client.connect();
  await client.query(`CREATE SCHEMA "${owned}"`);schemas.push(owned);await client.query(`SET search_path TO "${owned}"`);
  await migrate(drizzle(client),{migrationsFolder:path.join(root,'quality/evidence/CHATCRYPTO-DATA/baseline-migrations'),migrationsSchema:owned});
  await client.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES('a','Fixture A','a@crypto.invalid',true,now(),now()),('b','Fixture B','b@crypto.invalid',true,now(),now())`);
  await client.query("INSERT INTO conversations(id,kind,user1_id,user2_id) VALUES('private','DM','a','b'); INSERT INTO conversations(id,kind) VALUES('group','ROOM')");
  await client.query("INSERT INTO conversation_members(id,conversation_id,user_id) VALUES('ma','private','a'),('mb','private','b')");
  await client.query("INSERT INTO messages(id,conversation_id,sender_id,client_message_id,content) VALUES('old','private','a','old-client','LEGACY_FIXTURE_TEXT')");
  await client.query("INSERT INTO attachments(id,message_id,conversation_id,url,file_name,file_size,mime_type) VALUES('old-image','old','private','/fixture-image','legacy-name.png',256,'image/png')");
  legacy={messages:(await client.query('SELECT id,conversation_id,sender_id,client_message_id,content,created_at FROM messages')).rows,attachments:(await client.query('SELECT id,url,file_name,file_size,mime_type FROM attachments')).rows,members:(await client.query('SELECT * FROM conversation_members')).rows};
  await migrate(drizzle(client),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:owned});
  const empty=`${owned}_empty`;await client.query(`CREATE SCHEMA "${empty}"`);schemas.push(empty);await client.query(`SET search_path TO "${empty}"`);
  await migrate(drizzle(client),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:empty});await client.query(`SET search_path TO "${owned}"`);
 },60000);
 beforeEach(async()=>{await client.query('BEGIN');});afterEach(async()=>{await client.query('ROLLBACK');});
 afterAll(async()=>{try{for(const schema of schemas){expect(schema).toMatch(/^chatcrypto_[a-f0-9]{32}(?:_empty)?$/);await client.query(`DROP SCHEMA "${schema}" CASCADE`);expect((await client.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[schema])).rowCount).toBe(0);}}finally{await client?.end();}},60000);
 const exists=async()=>{expect((await client.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 AND tablename='chat_crypto_state'",[owned])).rowCount,'new crypto migration must exist').toBe(1);};
 async function rejected(query:string,params:unknown[],code='23514'){await client.query('SAVEPOINT invalid');await expect(client.query(query,params)).rejects.toMatchObject({code});await client.query('ROLLBACK TO SAVEPOINT invalid');}
 it('preserves original IDs/content/images/cursors/members and leaves history pending',async()=>{
  await exists();expect({messages:(await client.query('SELECT id,conversation_id,sender_id,client_message_id,content,created_at FROM messages')).rows,attachments:(await client.query('SELECT id,url,file_name,file_size,mime_type FROM attachments')).rows,members:(await client.query('SELECT * FROM conversation_members')).rows}).toEqual(legacy);
  expect((await client.query("SELECT encryption_mode FROM messages WHERE id='old'")).rows[0].encryption_mode).toBe('LEGACY_PENDING');
  expect((await client.query("SELECT history_status,migration_state FROM chat_crypto_state WHERE conversation_id='private'")).rows[0]).toEqual({history_status:'UNKNOWN',migration_state:'LEGACY_PENDING'});
  expect((await client.query('SELECT * FROM chat_crypto_history_cohorts')).rowCount).toBe(0);
 });
 it('empty database and reapplication are safe, with UTC lifecycle markers',async()=>{
  await exists();await migrate(drizzle(client),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:owned});
  const fields=(await client.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name='chat_crypto_membership_intervals'",[`${owned}_empty`])).rows;
  for(const name of ['joined_at','left_at'])expect(fields.find(c=>c.column_name===name)?.data_type).toBe('timestamp with time zone');
 });
 it('encrypted private rows cannot keep plaintext or downgrade to legacy',async()=>{
  await exists();await rejected("INSERT INTO messages(id,conversation_id,sender_id,client_message_id,content,encryption_mode,crypto_envelope) VALUES('bad','private','a','bad','LEAK','E2EE',$1)",[privateEnvelope]);
  await client.query("INSERT INTO messages(id,conversation_id,sender_id,client_message_id,content,encryption_mode,crypto_revision,crypto_envelope) VALUES('new','private','a','new','','E2EE',1,$1)",[privateEnvelope]);
  await rejected("UPDATE messages SET encryption_mode='LEGACY_PENDING',crypto_envelope=NULL,content='LEAK' WHERE id='new'",[]);
  await rejected("INSERT INTO messages(id,conversation_id,sender_id,client_message_id,content,encryption_mode,crypto_envelope) VALUES('invalid','private','a','invalid','','E2EE',$1)",[{version:1,protocol:'PLAINTEXT',event:{text:'LEAK'}}]);
 });
 it('encrypted image metadata cannot retain a private filename/mime/thumbnail',async()=>{
  await exists();await rejected("UPDATE attachments SET encryption_mode='E2EE' WHERE id='old-image'",[]);
  await client.query("UPDATE attachments SET encryption_mode='E2EE',file_name='',mime_type='application/octet-stream' WHERE id='old-image'");
  await rejected("UPDATE attachments SET file_name='LEAK.png' WHERE id='old-image'",[]);
 });
 it('membership revisions and intervals reject invalid windows and two active joins',async()=>{
  await exists();await rejected("UPDATE chat_crypto_state SET membership_revision=0 WHERE conversation_id='private'",[]);
  await client.query("INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES('ia','private','a',1,now())");
  await rejected("INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES('duplicate','private','a',1,now())",[],'23505');
  await rejected("UPDATE chat_crypto_membership_intervals SET end_revision=1,left_at=now() WHERE id='ia'",[]);
  await client.query("UPDATE chat_crypto_membership_intervals SET end_revision=2,left_at=now() WHERE id='ia'");
  await client.query("INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES('rejoin','private','a',3,now())");
 });
 it('recovery is ciphertext-only and has no private-key or password columns',async()=>{
  await exists();const ciphertext='-----BEGIN MEGOLM SESSION DATA-----\n'+Buffer.alloc(100).toString('base64')+'\n-----END MEGOLM SESSION DATA-----';
  await rejected("INSERT INTO chat_crypto_recovery_backups(user_id,backup_version,ciphertext) VALUES('a',1,'PRIVATE_KEYS')",[]);
  await client.query("INSERT INTO chat_crypto_recovery_backups(user_id,backup_version,ciphertext) VALUES('a',1,$1)",[ciphertext]);
  const fields=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='chat_crypto_recovery_backups'",[owned])).rows.map(r=>r.column_name);
  for(const name of ['private_key','password','recovery_code'])expect(fields).not.toContain(name);
 });
 it('a migration receipt is unique per original ID and cannot erase its original message',async()=>{
  await exists();await client.query("INSERT INTO chat_crypto_history_cohorts(id,conversation_id,verified_at,verification_basis) VALUES('cohort','private',now(),'EXPLICIT_RECONCILIATION')");
  await client.query("INSERT INTO chat_crypto_legacy_migrations(message_id,conversation_id,cohort_id,original_sha256,state) VALUES('old','private','cohort',$1,'PREPARED')",['A'.repeat(43)]);
  await rejected("INSERT INTO chat_crypto_legacy_migrations(message_id,conversation_id,cohort_id,original_sha256,state) VALUES('old','private','cohort',$1,'PREPARED')",['A'.repeat(43)],'23505');
  expect((await client.query("SELECT content FROM messages WHERE id='old'")).rows[0].content).toBe('LEGACY_FIXTURE_TEXT');
 });
 it('cohorts and receipts cannot point at another conversation',async()=>{
  await exists();await client.query("INSERT INTO chat_crypto_history_cohorts(id,conversation_id,verified_at,verification_basis) VALUES('wrong','group',now(),'EXPLICIT_RECONCILIATION')");
  await rejected("INSERT INTO chat_crypto_legacy_migrations(message_id,conversation_id,cohort_id,original_sha256,state) VALUES('old','private','wrong',$1,'PREPARED')",['A'.repeat(43)],'23503');
 });
 it('NULL cannot bypass encrypted-message or interval CHECK constraints',async()=>{
  await exists();
  await rejected("INSERT INTO messages(id,conversation_id,sender_id,client_message_id,content,encryption_mode) VALUES('null','private','a','null','','E2EE')",[]);
  await rejected("INSERT INTO messages(id,conversation_id,sender_id,client_message_id,content,encryption_mode,crypto_envelope) VALUES('no-revision','private','a','no-revision','','E2EE',$1)",[privateEnvelope]);
  await rejected("INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,end_revision,joined_at,left_at) VALUES('broken','private','a',1,2,now(),NULL)",[]);
 });
 it('cipher envelopes cannot hide private metadata or omit authenticated ciphertext fields',async()=>{
  await exists();
  for(const envelope of [{...privateEnvelope,event:{...privateEnvelope.event,privateKey:'LEAK'}},{...privateEnvelope,event:{algorithm:'m.megolm.v1.aes-sha2',session_id:privateEnvelope.event.session_id}},{...privateEnvelope,event:{...privateEnvelope.event,ciphertext:'not base64 !'}}])await rejected("INSERT INTO messages(id,conversation_id,sender_id,client_message_id,content,encryption_mode,crypto_revision,crypto_envelope) VALUES('hidden','private','a','hidden','','E2EE',1,$1)",[envelope]);
 });
 it('a report envelope cannot omit ciphertext or contain a wrong Transit key/version',async()=>{
  await exists();await client.query("INSERT INTO reports(id,reporter_id,target_type,target_id,reported_message_id,reason) VALUES('report','a','MESSAGE','old','old','SPAM')");
  for(const envelope of [{protocol:'OPENBAO_TRANSIT_AES256GCM',keyId:'fg-report'},{version:1,protocol:'OPENBAO_TRANSIT_AES256GCM',keyId:'fg-report',keyVersion:2,ciphertext:'vault:v1:AAAA'}])await rejected("INSERT INTO chat_crypto_report_evidence(id,report_id,reporter_id,consented_at,envelope,source,expires_at) VALUES('evidence','report','a',now(),$1,'USER_DISCLOSED',now()+interval '1 day')",[envelope]);
 });
 it('JSON scalar coercion cannot substitute strings or protocol versions',async()=>{
  await exists();
  for(const envelope of [{...privateEnvelope,version:'1'},{...privateEnvelope,event:{...privateEnvelope.event,ciphertext:1234}},{...privateEnvelope,event:{...privateEnvelope.event,session_id:null}}])await rejected("INSERT INTO messages(id,conversation_id,sender_id,client_message_id,content,encryption_mode,crypto_revision,crypto_envelope) VALUES('scalar','private','a','scalar','','E2EE',1,$1)",[envelope]);
 });
 it('durably queues verification metadata with recipient FK, dedup and expiry',async()=>{
  const key=Buffer.alloc(32).toString('base64').replace(/=+$/,'');
  for(const [userId,deviceId,curve] of [['a','A',key],['b','B',Buffer.alloc(32,1).toString('base64').replace(/=+$/,'')]])await client.query("INSERT INTO chat_crypto_devices(user_id,device_id,ed25519_key,curve25519_key,device_keys) VALUES($1,$2,$3,$4,$5)",[userId,deviceId,key,curve,{user_id:`@${userId}:fg.invalid`,device_id:deviceId,algorithms:['m.olm.v1.curve25519-aes-sha2','m.megolm.v1.aes-sha2'],keys:{[`ed25519:${deviceId}`]:key,[`curve25519:${deviceId}`]:curve},signatures:{[`@${userId}:fg.invalid`]:{[`ed25519:${deviceId}`]:'A'.repeat(86)}}}]);
  const event={eventType:'m.key.verification.request',content:{transaction_id:'tx',from_device:'A',methods:['m.sas.v1'],timestamp:1791460000000}};
  const insert="INSERT INTO chat_crypto_protocol_events(id,conversation_id,membership_revision,sender_user_id,sender_device_id,recipient_user_id,recipient_device_id,transaction_id,event,expires_at) VALUES('q','private',1,'a','A','b','B','tx',$1,now()+interval '5 minutes')";
  await client.query(insert,[event]);
  expect((await client.query("SELECT event FROM chat_crypto_protocol_events WHERE id='q'")).rows[0].event).toEqual(event);
  await rejected(insert,[event],'23505');
  await rejected("UPDATE chat_crypto_protocol_events SET recipient_device_id='MISSING' WHERE id='q'",[],'23503');
  await rejected("UPDATE chat_crypto_protocol_events SET event=$1 WHERE id='q'",[{...event,content:{...event.content,body:'LEAK'}}]);
  await rejected("UPDATE chat_crypto_protocol_events SET event=$1 WHERE id='q'",[{eventType:event.eventType,content:{}}]);
  await rejected("UPDATE chat_crypto_protocol_events SET expires_at=created_at WHERE id='q'",[]);
 });
 it('encrypted upload drafts retain ownership/revision/cipher digest, never a private filename',async()=>{
  const digest=Buffer.alloc(32).toString('base64').replace(/=+$/,'');
  await client.query("INSERT INTO chat_crypto_devices(user_id,device_id,ed25519_key,curve25519_key,device_keys) VALUES('a','A',$1,$1,$2)",[digest,{user_id:'@a:fg.invalid',device_id:'A',keys:{'ed25519:A':digest,'curve25519:A':digest},algorithms:['m.olm.v1.curve25519-aes-sha2','m.megolm.v1.aes-sha2'],signatures:{'@a:fg.invalid':{'ed25519:A':'A'.repeat(86)}}}]);
  await client.query("INSERT INTO chat_crypto_upload_drafts(id,uploader_id,conversation_id,device_id,client_upload_id,membership_revision,encryption_mode,object_key,ciphertext_size,ciphertext_sha256,expires_at) VALUES('draft','a','private','A','upload',1,'E2EE','opaque-object',256,$1,now()+interval '1 hour')",[digest]);
  const row=(await client.query("SELECT uploader_id,membership_revision,encryption_mode FROM chat_crypto_upload_drafts WHERE id='draft'")).rows[0];expect(row).toEqual({uploader_id:'a',membership_revision:'1',encryption_mode:'E2EE'});
  await rejected("UPDATE chat_crypto_upload_drafts SET envelope=$1 WHERE id='draft'",[{key:'PRIVATE_KEY',fileName:'PRIVATE.png'}]);
  await rejected("UPDATE chat_crypto_upload_drafts SET ciphertext_size=5242881 WHERE id='draft'",[]);
  await rejected("UPDATE chat_crypto_upload_drafts SET encryption_mode='REPORT_AEAD',envelope=NULL WHERE id='draft'",[]);
 });
 it('public key JSON and recovery armor cannot conceal nested private data',async()=>{
  const key=Buffer.alloc(32).toString('base64').replace(/=+$/,'');
  await rejected("INSERT INTO chat_crypto_devices(user_id,device_id,ed25519_key,curve25519_key,device_keys) VALUES('a','A',$1,$1,$2)",[key,{device_id:'A',keys:{private_key:'LEAK'}}]);
  await rejected("INSERT INTO chat_crypto_identity_keys(user_id,revision,public_keys) VALUES('a',1,$1)",[{masterKey:{privateKey:'LEAK'},selfSigningKey:{},userSigningKey:{}}]);
  await rejected("INSERT INTO chat_crypto_recovery_backups(user_id,backup_version,ciphertext) VALUES('a',1,$1)",['-----BEGIN MEGOLM SESSION DATA-----\nPRIVATE_KEY: must-never-store-this-private-data\n-----END MEGOLM SESSION DATA-----']);
 });
 it('attachment ciphertext cannot downgrade and reconciled migration receipts need a timestamp',async()=>{
  await client.query("UPDATE attachments SET encryption_mode='E2EE',file_name='',mime_type='application/octet-stream' WHERE id='old-image'");
  await rejected("UPDATE attachments SET encryption_mode='LEGACY_PENDING',file_name='legacy.png',mime_type='image/png' WHERE id='old-image'",[]);
  await client.query("INSERT INTO chat_crypto_history_cohorts(id,conversation_id,verified_at,verification_basis) VALUES('cohort','private',now(),'EXPLICIT_RECONCILIATION')");
  await rejected("INSERT INTO chat_crypto_legacy_migrations(message_id,conversation_id,cohort_id,original_sha256,state,reconciled_at) VALUES('old','private','cohort',$1,'RECONCILED',NULL)",['A'.repeat(43)]);
 });
 it('native SDK public keys, SAS/withheld and Olm envelopes satisfy SQL guards without plaintext extensions',async()=>{
  const fixtures=JSON.parse(fs.readFileSync(path.join(root,'quality/evidence/CHATCRYPTO-DATA/native-interop/wire-fixtures.json'),'utf8'));
  expect(fixtures.devices.length).toBeGreaterThanOrEqual(3);expect(fixtures.protocol.length).toBeGreaterThanOrEqual(10);expect(fixtures.olm.length).toBeGreaterThanOrEqual(3);
  for(const d of fixtures.devices)expect((await client.query('SELECT chat_crypto_valid_device_keys($1,$2,$3,$4) AS valid',[d,d.device_id,d.keys[`ed25519:${d.device_id}`],d.keys[`curve25519:${d.device_id}`]])).rows[0].valid).toBe(true);
  expect((await client.query('SELECT chat_crypto_valid_identity_keys($1) AS valid',[fixtures.identity])).rows[0].valid).toBe(true);
  for(const e of fixtures.protocol)expect((await client.query('SELECT chat_crypto_valid_protocol_event($1,$2,$3) AS valid',[e.event,e.senderDeviceId,e.transactionId])).rows[0].valid).toBe(true);
  for(const e of fixtures.olm){expect((await client.query('SELECT chat_crypto_valid_olm($1) AS valid',[e])).rows[0].valid).toBe(true);expect((await client.query('SELECT chat_crypto_valid_olm($1) AS valid',[{...e,private_key:'LEAK'}])).rows[0].valid).toBe(false);}
  expect((await client.query('SELECT chat_crypto_valid_one_time_key($1) AS valid',[{key:'A'.repeat(43),signatures:{private_key:'LEAK'}}])).rows[0].valid).toBe(false);
 });
 it('an outbound Megolm session is permanently bound to its conversation/device/epoch',async()=>{
  const fixtures=JSON.parse(fs.readFileSync(path.join(root,'quality/evidence/CHATCRYPTO-DATA/native-interop/wire-fixtures.json'),'utf8')),d=fixtures.devices[0],session=Buffer.alloc(32).toString('base64').replace(/=+$/,'');
  await client.query("INSERT INTO chat_crypto_devices(user_id,device_id,ed25519_key,curve25519_key,device_keys) VALUES('a',$1,$2,$3,$4)",[d.device_id,d.keys[`ed25519:${d.device_id}`],d.keys[`curve25519:${d.device_id}`],d]);
  await client.query("INSERT INTO chat_crypto_outbound_sessions(session_id,conversation_id,sender_user_id,sender_device_id,membership_revision) VALUES($1,'private','a',$2,1)",[session,d.device_id]);
  await rejected("INSERT INTO chat_crypto_outbound_sessions(session_id,conversation_id,sender_user_id,sender_device_id,membership_revision) VALUES($1,'private','a',$2,2)",[session,d.device_id],'23505');
  await rejected("UPDATE chat_crypto_outbound_sessions SET membership_revision=2 WHERE session_id=$1",[session]);
  await rejected("UPDATE chat_crypto_outbound_sessions SET conversation_id='group' WHERE session_id=$1",[session]);
 });
});
