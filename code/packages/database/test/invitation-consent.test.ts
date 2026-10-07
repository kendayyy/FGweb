import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import * as tables from '../src/index.js';

const root=path.resolve(import.meta.dirname,'../../..'),migrations=path.join(root,'packages/database/migrations');
const env=parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8'));
const owned=`t06_consent_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
describe('T06-FIX1 durable consent migration on actual PostgreSQL',()=>{
 let client:pg.Client;
 const created:string[]=[];
 beforeAll(async()=>{
  client=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:15000});await client.connect();
  const baseline=path.join(root,'quality/evidence/T06-FIX1/baseline-migrations');fs.mkdirSync(path.join(baseline,'meta'),{recursive:true});
  const journal=JSON.parse(fs.readFileSync(path.join(migrations,'meta/_journal.json'),'utf8'));journal.entries=journal.entries.slice(0,6);
  fs.writeFileSync(path.join(baseline,'meta/_journal.json'),JSON.stringify(journal,null,2)+'\n');
  for(const entry of journal.entries)fs.copyFileSync(path.join(migrations,`${entry.tag}.sql`),path.join(baseline,`${entry.tag}.sql`));
  await client.query(`CREATE SCHEMA "${owned}"`);created.push(owned);await client.query(`SET search_path TO "${owned}"`);
  await migrate(drizzle(client),{migrationsFolder:baseline,migrationsSchema:owned});
  await tables.seedGames(drizzle(client,{schema:tables}));const game=(await client.query("SELECT id FROM games WHERE title='Valorant'")).rows[0].id;
  await client.query("INSERT INTO \"user\"(id,name,email,email_verified,created_at,updated_at) VALUES('owner','Owner','owner@example.test',true,now(),now()),('receiver','Receiver','receiver@example.test',true,now(),now())");
  await client.query('BEGIN');
  try{
   await client.query("INSERT INTO conversations(id,kind) VALUES('conversation','ROOM')");
   await client.query("INSERT INTO rooms(id,name,game_id,owner_id,conversation_id) VALUES('room','Old room',$1,'owner','conversation')",[game]);
   await client.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES('owner-membership','room','owner','OWNER')");
   await client.query("INSERT INTO play_sessions(id,room_id,host_user_id,timing_type,scheduled_at) VALUES('play','room','owner','scheduledAt','2099-10-07T13:30:00Z')");
   for(const target of ['ROOM','PLAY_SESSION'])for(const status of ['PENDING','ACCEPTED','REJECTED','CANCELLED']){
    await client.query('INSERT INTO invitations(id,target_type,sender_id,receiver_id,room_id,play_session_id,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[`${target}-${status}`,target,'owner','receiver','room',target==='PLAY_SESSION'?'play':null,status,'2024-10-07T00:00:00Z']);
   }
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
 },60000);
 afterAll(async()=>{
  try{if(client)for(const schema of created){if(!/^t06_consent_[0-9]+_[a-z0-9]+(?:_empty)?$/.test(schema))throw Error('Unsafe fixture cleanup');await client.query(`DROP SCHEMA "${schema}" CASCADE`);expect((await client.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[schema])).rowCount).toBe(0);}}
  finally{await client?.end();}
 },60000);
 it('forward migration preserves all legacy invitation states and does not fabricate consent',async()=>{
  await migrate(drizzle(client),{migrationsFolder:migrations,migrationsSchema:owned});
  const rows=(await client.query('SELECT id,target_type,sender_id,receiver_id,room_id,play_session_id,status,recipient_accepted_at FROM invitations ORDER BY id')).rows;
  expect(rows).toHaveLength(8);for(const row of rows){expect(row.recipient_accepted_at).toBeNull();expect(row.sender_id).toBe('owner');expect(row.receiver_id).toBe('receiver');expect(row.status).toBe(row.id.slice(row.target_type.length+1));expect(row.play_session_id).toBe(row.target_type==='PLAY_SESSION'?'play':null);}
 });
 it('empty migration creates a nullable timestamptz with no default consent',async()=>{
  const empty=`${owned}_empty`;await client.query(`CREATE SCHEMA "${empty}"`);created.push(empty);await client.query(`SET search_path TO "${empty}"`);
  try{
   await migrate(drizzle(client),{migrationsFolder:migrations,migrationsSchema:empty});
   const column=(await client.query("SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name='invitations' AND column_name='recipient_accepted_at'",[empty])).rows[0];
   expect(column).toEqual({data_type:'timestamp with time zone',is_nullable:'YES',column_default:null});
  }finally{await client.query(`SET search_path TO "${owned}"`);}
 },60000);
 it('persists UTC consent across PostgreSQL session timezones without changing invitation status',async()=>{
  const consent='2026-10-07T13:30:00.000Z';await client.query('UPDATE invitations SET recipient_accepted_at=$1 WHERE id=$2',[consent,'ROOM-PENDING']);
  try{for(const zone of ['Asia/Bangkok','UTC']){await client.query('SELECT set_config($1,$2,false)',['TimeZone',zone]);const row=(await client.query("SELECT status,recipient_accepted_at FROM invitations WHERE id='ROOM-PENDING'")).rows[0];expect(row.recipient_accepted_at.toISOString()).toBe(consent);expect(row.status).toBe('PENDING');}}
  finally{await client.query("SET TIME ZONE 'UTC'");}
 });
 it('transaction rollback restores pending consent and status after a constraint failure',async()=>{
  await client.query('BEGIN');
  try{
   await client.query("UPDATE invitations SET recipient_accepted_at=clock_timestamp(),status='ACCEPTED' WHERE id='PLAY_SESSION-PENDING'");
   await expect(client.query("UPDATE invitations SET receiver_id='missing' WHERE id='PLAY_SESSION-PENDING'")).rejects.toMatchObject({code:'23503'});
  }finally{await client.query('ROLLBACK');}
  const row=(await client.query("SELECT status,recipient_accepted_at FROM invitations WHERE id='PLAY_SESSION-PENDING'")).rows[0];expect(row.status).toBe('PENDING');expect(row.recipient_accepted_at).toBeNull();
 });
 it('retains self-invitation, target-shape and receiver FK constraints',async()=>{
  await expect(client.query("INSERT INTO invitations(id,target_type,sender_id,receiver_id,room_id) VALUES('self','ROOM','owner','owner','room')")).rejects.toMatchObject({code:'23514'});
  await expect(client.query("INSERT INTO invitations(id,target_type,sender_id,receiver_id,room_id,play_session_id) VALUES('shape','ROOM','owner','receiver','room','play')")).rejects.toMatchObject({code:'23514'});
  await expect(client.query("INSERT INTO invitations(id,target_type,sender_id,receiver_id,room_id) VALUES('fk','ROOM','owner','unknown','room')")).rejects.toMatchObject({code:'23503'});
 });
});
