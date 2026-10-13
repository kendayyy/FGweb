import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
const root=path.resolve(import.meta.dirname,'../../..'),owned=`crypto_be_${randomUUID().replaceAll('-','')}`;
describe('Additive report-image source binding on actual isolated PostgreSQL',()=>{
 let client:pg.Client;
 beforeAll(async()=>{
  const env=parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8'));client=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:15000});await client.connect();await client.query(`CREATE SCHEMA "${owned}"`);await client.query(`SET search_path TO "${owned}"`);
  await migrate(drizzle(client),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:owned});
 });
 beforeEach(async()=>{
  await client.query('BEGIN');await client.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES('a','Fixture','fixture@example.invalid',true,now(),now())`);
  await client.query(`INSERT INTO conversations(id,kind) VALUES('private','ROOM'),('other','ROOM')`);
  await client.query(`INSERT INTO messages(id,conversation_id,sender_id,client_message_id,type,content) VALUES('source','private','a','old','IMAGE','LEGACY_RETAINED'),('foreign','other','a','foreign','IMAGE','FOREIGN_RETAINED')`);
  for(const [id,mode,key]of [['report','REPORT_AEAD','fg-report'],['lobby','LOBBY_AEAD','fg-lobby']])await client.query(`INSERT INTO chat_crypto_upload_drafts(id,uploader_id,conversation_id,client_upload_id,membership_revision,encryption_mode,object_key,ciphertext_size,ciphertext_sha256,envelope,expires_at) VALUES($1,'a','private',$1,1,$2,$1||'.bin',128,$3,$4,now()+interval '1 hour')`,[id,mode,Buffer.alloc(32).toString('base64'),{version:1,protocol:'OPENBAO_TRANSIT_AES256GCM',keyId:key,keyVersion:1,ciphertext:'bao:v1:AQID'}]);
 });
 afterEach(async()=>{await client.query('ROLLBACK');});
 afterAll(async()=>{try{expect(owned).toMatch(/^crypto_be_[a-f0-9]{32}$/);await client.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);}finally{await client?.end();}});
 const fingerprint=Buffer.alloc(32,17).toString('base64');
 const bind=(upload='report',source='source',digest=fingerprint)=>client.query(`INSERT INTO chat_crypto_report_upload_sources(upload_id,source_message_id,retry_fingerprint) VALUES($1,$2,$3)`,[upload,source,digest]);
 async function rejects(action:()=>Promise<unknown>,code:string){await client.query('SAVEPOINT probe');try{await expect(action()).rejects.toMatchObject({code});}finally{await client.query('ROLLBACK TO SAVEPOINT probe');await client.query('RELEASE SAVEPOINT probe');}}
 it('stores a binding without repurposing message_id or changing old plaintext data',async()=>{
  await bind();expect((await client.query(`SELECT * FROM chat_crypto_report_upload_sources WHERE upload_id='report'`)).rows[0]).toEqual({upload_id:'report',source_message_id:'source',retry_fingerprint:fingerprint});
  expect((await client.query(`SELECT message_id FROM chat_crypto_upload_drafts WHERE id='report'`)).rows[0].message_id).toBeNull();expect((await client.query(`SELECT content FROM messages WHERE id='source'`)).rows[0].content).toBe('LEGACY_RETAINED');
 });
 it('rejects a non-report draft and a source from another conversation',async()=>{await rejects(()=>bind('lobby'),'23514');await rejects(()=>bind('report','foreign'),'23514');});
 it('enforces source/upload foreign keys and keyed-fingerprint shape',async()=>{await rejects(()=>bind('missing'),'23503');await rejects(()=>bind('report','missing'),'23503');await rejects(()=>bind('report','source','not-a-digest'),'23514');});
 it('keeps bindings immutable and source tombstones protected',async()=>{
  await bind();await rejects(()=>client.query(`UPDATE chat_crypto_report_upload_sources SET retry_fingerprint=$1 WHERE upload_id='report'`,[Buffer.alloc(32,18).toString('base64')]),'23514');
  await rejects(()=>client.query(`UPDATE chat_crypto_report_upload_sources SET source_message_id='foreign' WHERE upload_id='report'`),'23514');await rejects(()=>client.query(`DELETE FROM messages WHERE id='source'`),'23503');
 });
 it('removes abandoned source metadata with its draft and permits migration reapplication',async()=>{
  await bind();await client.query(`DELETE FROM chat_crypto_upload_drafts WHERE id='report'`);expect((await client.query(`SELECT * FROM chat_crypto_report_upload_sources`)).rowCount).toBe(0);
  await migrate(drizzle(client),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:owned});expect((await client.query(`SELECT content FROM messages WHERE id='source'`)).rows[0].content).toBe('LEGACY_RETAINED');
 });
});
