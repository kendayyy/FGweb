import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
const root=path.resolve(import.meta.dirname,'../../..'),owned=`crypto_be_${randomUUID().replaceAll('-','')}`,digest=Buffer.alloc(32).toString('base64').replace(/=+$/,'');
describe('Legacy ciphertext candidates and recipient receipts on actual PostgreSQL',()=>{
 let client:pg.Client;
 const envelope={version:1,protocol:'MATRIX_MEGOLM',event:{algorithm:'m.megolm.v1.aes-sha2',session_id:digest,ciphertext:Buffer.alloc(128).toString('base64')}};
 beforeAll(async()=>{const env=parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8'));client=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:15000});await client.connect();await client.query(`CREATE SCHEMA "${owned}"`);await client.query(`SET search_path TO "${owned}"`);await migrate(drizzle(client),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:owned});});
 beforeEach(async()=>{
  await client.query('BEGIN');for(const id of ['a','b','late'])await client.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())`,[id,id+'@example.invalid']);
  await client.query("INSERT INTO conversations(id,kind) VALUES('private','ROOM'),('other','ROOM')");
  for(const [user,id,byte]of [['a','A',1],['b','B',2],['late','L',3]] as const){const key=Buffer.alloc(32,byte).toString('base64').replace(/=+$/,'');await client.query('INSERT INTO chat_crypto_devices(user_id,device_id,ed25519_key,curve25519_key,device_keys) VALUES($1,$2,$3,$3,$4)',[user,id,key,{user_id:`@${user}:fg.invalid`,device_id:id,algorithms:['m.olm.v1.curve25519-aes-sha2','m.megolm.v1.aes-sha2'],keys:{[`ed25519:${id}`]:key,[`curve25519:${id}`]:key},signatures:{[`@${user}:fg.invalid`]:{[`ed25519:${id}`]:'A'.repeat(86)}}}]);}
  await client.query("INSERT INTO messages(id,conversation_id,sender_id,client_message_id) VALUES('source','private','a','original')");
  await client.query("INSERT INTO chat_crypto_history_cohorts(id,conversation_id,verified_at,verification_basis) VALUES('cohort','private',now(),'EXPLICIT_RECONCILIATION'),('foreign','other',now(),'EXPLICIT_RECONCILIATION')");
  for(const id of ['a','b'])await client.query("INSERT INTO chat_crypto_cohort_members(cohort_id,conversation_id,user_id) VALUES('cohort','private',$1)",[id]);
  await client.query("INSERT INTO chat_crypto_legacy_migrations(message_id,conversation_id,cohort_id,original_sha256,state) VALUES('source','private','cohort',$1,'PREPARED')",[digest]);
 });
 afterEach(async()=>{await client.query('ROLLBACK');});afterAll(async()=>{try{expect(owned).toMatch(/^crypto_be_[a-f0-9]{32}$/);await client.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);}finally{await client?.end();}});
 const rejects=async(action:()=>Promise<unknown>,code:string)=>{await client.query('SAVEPOINT probe');try{await expect(action()).rejects.toMatchObject({code});}finally{await client.query('ROLLBACK TO SAVEPOINT probe');await client.query('RELEASE SAVEPOINT probe');}};
 const candidate=(id='candidate',cohort='cohort',user='a',device='A',revision=1,payload:unknown=envelope)=>client.query('INSERT INTO chat_crypto_legacy_candidates(id,message_id,conversation_id,cohort_id,membership_revision,original_sha256,envelope_sha256,importer_user_id,importer_device_id,envelope) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9)',[id,'source','private',cohort,revision,digest,user,device,payload]);
 it('stores ciphertext and public bindings without plaintext manifests, filenames or private keys',async()=>{await candidate();const columns=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='chat_crypto_legacy_candidates' ORDER BY ordinal_position",[owned])).rows.map(row=>row.column_name);expect(columns).toEqual(['id','message_id','conversation_id','cohort_id','membership_revision','original_sha256','envelope_sha256','importer_user_id','importer_device_id','envelope','prepared_at']);expect((await client.query("SELECT state FROM chat_crypto_legacy_migrations WHERE message_id='source'")).rows[0].state).toBe('PREPARED');});
 it('requires existing mapped sources, a matching conversation cohort and an entitled importer device',async()=>{await rejects(()=>candidate('foreign','foreign'),'23503');await rejects(()=>candidate('late','cohort','late','L'),'23503');await rejects(()=>candidate('device','cohort','a','B'),'23503');await candidate();await rejects(()=>client.query("DELETE FROM chat_crypto_legacy_migrations WHERE message_id='source'"),'23503');});
 it('rejects invalid ciphertext/revisions and deduplicates source candidates within an epoch',async()=>{await rejects(()=>candidate('bad-revision','cohort','a','A',0),'23514');await rejects(()=>candidate('plaintext','cohort','a','A',1,{content:'private'}),'23514');await candidate();await rejects(()=>candidate('retry'),'23505');await candidate('next-epoch','cohort','a','A',2);});
 it('requires receipts from a cohort member and owned immutable device, with one receipt per candidate/device',async()=>{
  await candidate();const receipt=(user='b',device='B',cohort='cohort')=>client.query('INSERT INTO chat_crypto_legacy_attestations(candidate_id,cohort_id,user_id,device_id,attestation) VALUES($1,$2,$3,$4,$5)',['candidate',cohort,user,device,{signatures:{[`@${user}:fg.invalid`]:{[`ed25519:${device}`]:'A'.repeat(86)}}}]);
  await rejects(()=>receipt('late','L'),'23503');await rejects(()=>receipt('b','A'),'23503');await rejects(()=>receipt('b','B','foreign'),'23503');await receipt();await rejects(()=>receipt(),'23505');expect((await client.query('SELECT count(*)::int AS count FROM chat_crypto_legacy_attestations')).rows[0].count).toBe(1);
 });
 it('binds unique candidate images to existing original attachments and ciphertext drafts',async()=>{
  await candidate();await client.query("INSERT INTO attachments(id,message_id,conversation_id,url,file_name,file_size,mime_type) VALUES('image','source','private','/private','source.webp',42,'image/webp')");
  await client.query("INSERT INTO chat_crypto_upload_drafts(id,uploader_id,conversation_id,device_id,client_upload_id,membership_revision,encryption_mode,object_key,ciphertext_size,ciphertext_sha256,expires_at) VALUES('draft','a','private','A','upload',1,'E2EE','cipher.bin',42,$1,now()+interval '5 minutes')",[digest]);
  const mapping=(attachment='image',draft='draft')=>client.query('INSERT INTO chat_crypto_legacy_candidate_images(candidate_id,attachment_id,draft_id,plaintext_sha256,ciphertext_sha256) VALUES($1,$2,$3,$4,$4)',['candidate',attachment,draft,digest]);
  await rejects(()=>mapping('missing'),'23503');await rejects(()=>mapping('image','missing'),'23503');await mapping();await rejects(()=>mapping(),'23505');await rejects(()=>client.query("DELETE FROM chat_crypto_upload_drafts WHERE id='draft'"),'23503');
 });
});
