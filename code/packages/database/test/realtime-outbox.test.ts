import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
const root=path.resolve(import.meta.dirname,'../../..');
const migrations=path.join(root,'packages/database/migrations');
const prefix=`t07_fix1_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const env=parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8'));
describe('T07-FIX1 actual PostgreSQL durable message events',()=>{
 let client:pg.Client;
 beforeAll(async()=>{
  client=new pg.Client({connectionString:env.DATABASE_URL,query_timeout:10000,connectionTimeoutMillis:5000});await client.connect();
  const baseline=path.join(root,'quality/evidence/T07-FIX1/baseline-migrations');fs.mkdirSync(path.join(baseline,'meta'),{recursive:true});
  const journal=JSON.parse(fs.readFileSync(path.join(migrations,'meta/_journal.json'),'utf8'));journal.entries=journal.entries.slice(0,4);
  fs.writeFileSync(path.join(baseline,'meta/_journal.json'),JSON.stringify(journal,null,2)+'\n');
  for(const entry of journal.entries)fs.copyFileSync(path.join(migrations,`${entry.tag}.sql`),path.join(baseline,`${entry.tag}.sql`));
  await client.query(`CREATE SCHEMA "${prefix}"`);await client.query(`SET search_path TO "${prefix}"`);
  await migrate(drizzle(client),{migrationsFolder:baseline,migrationsSchema:prefix});
  await client.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES('u','Fixture','fixture@example.com',true,now(),now())`);
  await client.query(`INSERT INTO conversations(id,kind) VALUES('c','ROOM'),('other','ROOM')`);
  await client.query(`INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id) VALUES('legacy','c','u','Preserve this message','legacy-client')`);
 },30000);
 afterAll(async()=>{
  if(!client)return;
  try{for(const name of [prefix,`${prefix}_empty`]){if(!/^t07_fix1_[0-9]+_[a-z0-9]+(?:_empty)?$/.test(name))throw new Error('Invalid owned schema');await client.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);}const left=await client.query('SELECT nspname FROM pg_namespace WHERE nspname LIKE $1',[`${prefix}%`]);expect(left.rowCount).toBe(0);}finally{await client.end();}
 },30000);
 it('adds the table through forward migration while preserving seeded messages',async()=>{
  await migrate(drizzle(client),{migrationsFolder:migrations,migrationsSchema:prefix});
  const prior=await client.query(`SELECT content FROM messages WHERE id='legacy'`);expect(prior.rows[0].content).toBe('Preserve this message');
  const table=await client.query('SELECT to_regclass($1) AS name',[`${prefix}.realtime_outbox`]);expect(table.rows[0].name).not.toBeNull();
 });
 it('migrates an empty schema with a usable durable creation event table',async()=>{
  const empty=`${prefix}_empty`;await client.query(`CREATE SCHEMA "${empty}"`);await client.query(`SET search_path TO "${empty}"`);
  try{await migrate(drizzle(client),{migrationsFolder:migrations,migrationsSchema:empty});const table=await client.query('SELECT to_regclass($1) AS name',[`${empty}.realtime_outbox`]);expect(table.rows[0].name).not.toBeNull();}finally{await client.query(`SET search_path TO "${prefix}"`);}
 });
 it('rolls back message and outbox together on an aborted transaction',async()=>{
  await client.query('BEGIN');
  try{await client.query(`INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id) VALUES('rolled-back','c','u','Never publish','rollback-client')`);await client.query(`INSERT INTO realtime_outbox(id,message_id,conversation_id,event_name) VALUES('rollback-event','rolled-back','c','message.created')`);}finally{await client.query('ROLLBACK');}
  expect((await client.query(`SELECT id FROM messages WHERE id='rolled-back'`)).rowCount).toBe(0);
  expect((await client.query(`SELECT id FROM realtime_outbox WHERE id='rollback-event'`)).rowCount).toBe(0);
 });
 it('deduplicates jobs and prevents cross-conversation linkage or negative attempts',async()=>{
  await client.query(`INSERT INTO realtime_outbox(id,message_id,conversation_id,event_name) VALUES('event','legacy','c','message.created')`);
  await expect(client.query(`INSERT INTO realtime_outbox(id,message_id,conversation_id,event_name) VALUES('duplicate','legacy','c','message.created')`)).rejects.toMatchObject({code:'23505'});
  await client.query(`INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id) VALUES('another','c','u','FK fixture','fk-client')`);
  await expect(client.query(`INSERT INTO realtime_outbox(id,message_id,conversation_id,event_name) VALUES('wrong','another','other','message.created')`)).rejects.toMatchObject({code:'23503'});
  await expect(client.query(`UPDATE realtime_outbox SET attempts=-1 WHERE id='event'`)).rejects.toMatchObject({code:'23514'});
  const event=(await client.query(`SELECT delivered_at,attempts FROM realtime_outbox WHERE id='event'`)).rows[0];expect(event).toEqual({delivered_at:null,attempts:0});
 });
});
