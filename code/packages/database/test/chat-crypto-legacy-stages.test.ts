import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
const root=path.resolve(import.meta.dirname,'../../..'),owned=`crypto_be_${randomUUID().replaceAll('-','')}`,digest=Buffer.alloc(32).toString('base64').replace(/=+$/,'');
describe('Durable original-cohort legacy stages on actual PostgreSQL',()=>{
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
  await candidate();
  await client.query("INSERT INTO attachments(id,message_id,conversation_id,url,file_name,file_size,mime_type) VALUES('image','source','private','/private','source.webp',42,'image/webp')");
  await client.query("INSERT INTO chat_crypto_upload_drafts(id,uploader_id,conversation_id,device_id,client_upload_id,membership_revision,encryption_mode,object_key,ciphertext_size,ciphertext_sha256,expires_at,cohort_id) VALUES('draft','a','private','A','upload',1,'E2EE','cipher.bin',42,$1,now()+interval '5 minutes','cohort')",[digest]);
  await client.query("INSERT INTO chat_crypto_legacy_candidate_images(candidate_id,attachment_id,draft_id,plaintext_sha256,ciphertext_sha256) VALUES('candidate','image','draft',$1,$1)",[digest]);
 });
 afterEach(async()=>{await client.query('ROLLBACK');});afterAll(async()=>{try{expect(owned).toMatch(/^crypto_be_[a-f0-9]{32}$/);await client.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);}finally{await client?.end();}});
 const rejects=async(action:()=>Promise<unknown>,code:string)=>{await client.query('SAVEPOINT probe');try{await expect(action()).rejects.toMatchObject({code});}finally{await client.query('ROLLBACK TO SAVEPOINT probe');await client.query('RELEASE SAVEPOINT probe');}};
 const candidate=(id='candidate',cohort='cohort',user='a',device='A',revision=1,payload:unknown=envelope)=>client.query('INSERT INTO chat_crypto_legacy_candidates(id,message_id,conversation_id,cohort_id,membership_revision,original_sha256,envelope_sha256,importer_user_id,importer_device_id,envelope) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9)',[id,'source','private',cohort,revision,digest,user,device,payload]);

 const stage=(id='stage',conversation='private',cohort='cohort',revision=1,next=2,sources=1,images=1,claims=2)=>client.query('INSERT INTO chat_crypto_legacy_stages(id,conversation_id,seed_cohort_id,reviewer_user_id,reviewer_device_id,membership_revision,next_live_revision,source_count,attachment_count,required_claims,manifest_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,conversation,cohort,'a','A',revision,next,sources,images,claims,digest]);
 const source=(message='source',candidateId='candidate',cohort='cohort',conversation='private',revision=1)=>client.query('INSERT INTO chat_crypto_legacy_stage_sources(stage_id,message_id,candidate_id,cohort_id,conversation_id,membership_revision,original_sha256,envelope_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$7)',['stage',message,candidateId,cohort,conversation,revision,digest]);
 const image=(message='source',candidateId='candidate',attachment='image',draft='draft')=>client.query('INSERT INTO chat_crypto_legacy_stage_objects(stage_id,message_id,candidate_id,attachment_id,draft_id,plaintext_sha256,ciphertext_sha256) VALUES($1,$2,$3,$4,$5,$6,$6)',['stage',message,candidateId,attachment,draft,digest]);
 it('retains an immutable public source/image routing snapshot without source conversion',async()=>{
  await stage();await source();await image();expect((await client.query("SELECT state FROM chat_crypto_legacy_migrations WHERE message_id='source'")).rows[0].state).toBe('PREPARED');
  expect((await client.query("SELECT phase,converted_at,completed_at FROM chat_crypto_legacy_stages WHERE id='stage'")).rows[0]).toEqual({phase:'STAGED',converted_at:null,completed_at:null});
  const tables=['chat_crypto_legacy_stages','chat_crypto_legacy_stage_sources','chat_crypto_legacy_stage_objects'];
  const columns=(await client.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=ANY($2::text[])',[owned,tables])).rows.map(row=>row.column_name);
  expect(columns.join(',')).not.toMatch(/body|file_name|private_key|recovery_key|descriptor|ciphertext$/);expect(columns).toContain('manifest_sha256');
 });
 it('rejects a stage with a foreign seed cohort, wrong reviewer device, or duplicate conversation',async()=>{
  await rejects(()=>stage('bad','private','foreign'),'23503');await stage();await rejects(()=>stage('retry'),'23505');
  await rejects(()=>client.query("UPDATE chat_crypto_legacy_stages SET reviewer_device_id='B' WHERE id='stage'"),'23503');
  await rejects(()=>client.query("UPDATE chat_crypto_legacy_stages SET reviewer_user_id='late',reviewer_device_id='L' WHERE id='stage'"),'23503');
 });
 it('rejects omitted or contradictory counts, unsafe revisions, and noncanonical public digests',async()=>{
  await rejects(()=>stage('zero','private','cohort',1,2,0),'23514');await rejects(()=>stage('images','private','cohort',1,2,1,-1),'23514');await rejects(()=>stage('claims','private','cohort',1,2,2,0,1),'23514');
  await rejects(()=>stage('epoch','private','cohort',1,3),'23514');await rejects(()=>stage('overflow','private','cohort',9007199254740991,9007199254740992),'23514');await stage();
  await rejects(()=>client.query("UPDATE chat_crypto_legacy_stages SET manifest_sha256='private plaintext' WHERE id='stage'"),'23514');
 });
 it('binds each staged source to the exact candidate, original cohort, conversation and epoch',async()=>{
  await stage();await rejects(()=>source('missing'),'23503');await rejects(()=>source('source','candidate','foreign'),'23503');await rejects(()=>source('source','candidate','cohort','other'),'23503');await rejects(()=>source('source','candidate','cohort','private',2),'23503');
  await candidate('next-candidate','cohort','a','A',2);await rejects(()=>source('source','next-candidate'),'23503');await source();await rejects(()=>source(),'23505');
  await rejects(()=>client.query("DELETE FROM chat_crypto_legacy_candidates WHERE id='candidate'"),'23503');
 });
 it('retains exact original-image/ciphertext-draft mappings and resumable cleanup progress',async()=>{
  await stage();await source();await rejects(()=>image('missing'),'23503');await rejects(()=>image('source','candidate','missing'),'23503');await rejects(()=>image('source','candidate','image','missing'),'23503');await image();await rejects(()=>image(),'23505');
  await rejects(()=>client.query("DELETE FROM chat_crypto_legacy_candidate_images WHERE candidate_id='candidate'"),'23503');await rejects(()=>client.query("DELETE FROM chat_crypto_upload_drafts WHERE id='draft'"),'23503');
  await rejects(()=>client.query("UPDATE chat_crypto_legacy_stage_objects SET cleanup_state='REMOVED' WHERE stage_id='stage'"),'23514');
  await client.query("UPDATE chat_crypto_legacy_stage_objects SET cleanup_state='REMOVED',removed_at=now() WHERE stage_id='stage'");expect((await client.query('SELECT cleanup_state FROM chat_crypto_legacy_stage_objects')).rows[0].cleanup_state).toBe('REMOVED');
 });
 it('requires durable conversion/completion clocks for each lifecycle phase',async()=>{
  await stage();await rejects(()=>client.query("UPDATE chat_crypto_legacy_stages SET phase='RECONCILED' WHERE id='stage'"),'23514');
  await rejects(()=>client.query("UPDATE chat_crypto_legacy_stages SET converted_at=now() WHERE id='stage'"),'23514');
  await rejects(()=>client.query("UPDATE chat_crypto_legacy_stages SET phase='DB_CONVERTED',converted_at=created_at-interval '1 second' WHERE id='stage'"),'23514');
  await client.query("UPDATE chat_crypto_legacy_stages SET phase='DB_CONVERTED',converted_at=now() WHERE id='stage'");await client.query("UPDATE chat_crypto_legacy_stages SET phase='CLEANING' WHERE id='stage'");
  await rejects(()=>client.query("UPDATE chat_crypto_legacy_stages SET phase='RECONCILED',completed_at=converted_at-interval '1 second' WHERE id='stage'"),'23514');
  await client.query("UPDATE chat_crypto_legacy_stages SET phase='RECONCILED',completed_at=now() WHERE id='stage'");expect((await client.query('SELECT phase FROM chat_crypto_legacy_stages')).rows[0].phase).toBe('RECONCILED');
 });
});
