import {describe,it,expect,beforeAll,beforeEach,afterEach,afterAll} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import * as tables from '../src/index.js';
const root=path.resolve(import.meta.dirname,'../../..'),env=parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8'));
const owned=`t07_lease_${randomUUID().replaceAll('-','')}`,created:string[]=[];
describe('T07-FIX2 durable SFU admission identity and session lease',()=>{
 let client:pg.Client,legacy:unknown;
 beforeAll(async()=>{
  client=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:15000});await client.connect();
  await client.query(`CREATE SCHEMA "${owned}"`);created.push(owned);await client.query(`SET search_path TO "${owned}"`);
  await migrate(drizzle(client),{migrationsFolder:path.join(root,'quality/evidence/T07-FIX2/baseline-migrations'),migrationsSchema:owned});
  await tables.seedGames(drizzle(client,{schema:tables}));const game=(await client.query("SELECT id FROM games WHERE title='Valorant'")).rows[0].id;
  await client.query("INSERT INTO \"user\"(id,name,email,email_verified,created_at,updated_at) VALUES('owner','Owner','owner@fixture.invalid',true,now(),now()),('viewer','Viewer','viewer@fixture.invalid',true,now(),now())");
  await client.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES('session','viewer','fixture-native-token',now()+interval '1 day',now(),now())");
  await client.query("INSERT INTO conversations(id,kind) VALUES('chat','ROOM')");
  await client.query('BEGIN');
  await client.query("INSERT INTO rooms(id,name,game_id,owner_id,conversation_id) VALUES('room','Legacy room',$1,'owner','chat')",[game]);
  await client.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES('owner-membership','room','owner','OWNER'),('membership','room','viewer','MEMBER')");
  await client.query('COMMIT');
  await client.query("INSERT INTO call_groups(id,room_id) VALUES('call','room')");
  await client.query("INSERT INTO call_members(id,call_group_id,room_id,user_id,seat_index) VALUES('seat','call','room','viewer',1)");
  legacy={calls:(await client.query('SELECT * FROM call_groups')).rows,members:(await client.query('SELECT * FROM call_members')).rows,rooms:(await client.query('SELECT * FROM rooms')).rows};
  await migrate(drizzle(client),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:owned});
  const empty=`${owned}_empty`;await client.query(`CREATE SCHEMA "${empty}"`);created.push(empty);await client.query(`SET search_path TO "${empty}"`);
  await migrate(drizzle(client),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:empty});await client.query(`SET search_path TO "${owned}"`);
 },60000);
 beforeEach(async()=>{await client.query('BEGIN');});afterEach(async()=>{await client.query('ROLLBACK');});
 afterAll(async()=>{try{for(const schema of created){expect(schema).toMatch(/^t07_lease_[a-f0-9]{32}(?:_empty)?$/);await client.query(`DROP SCHEMA "${schema}" CASCADE`);expect((await client.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[schema])).rowCount).toBe(0);}}finally{await client?.end();}},60000);
 async function exists(){expect((await client.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 AND tablename='call_admissions'",[owned])).rowCount,'migration creates the admission table').toBe(1);}
 const insert=(id:string,member='seat',session='session',expires="clock_timestamp()+interval '45 seconds'")=>client.query(`INSERT INTO call_admissions(id,call_member_id,session_id,expires_at) VALUES($1,$2,$3,${expires})`,[id,member,session]);
 it('additive migration preserves legacy room/call/seats and never invents admissions',async()=>{
  await exists();expect((await client.query('SELECT id FROM call_admissions')).rowCount).toBe(0);
  expect({calls:(await client.query('SELECT * FROM call_groups')).rows,members:(await client.query('SELECT * FROM call_members')).rows,rooms:(await client.query('SELECT * FROM rooms')).rows}).toEqual(legacy);
 });
 it('empty migration creates UTC lease timestamps with nullable lifecycle markers',async()=>{
  await exists();const empty=`${owned}_empty`;
   const columns=(await client.query("SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name='call_admissions'",[empty])).rows;
   for(const name of ['created_at','expires_at','connected_at','disconnected_at','revoked_at'])expect(columns.find(c=>c.column_name===name)?.data_type).toBe('timestamp with time zone');
   for(const name of ['connected_at','disconnected_at','revoked_at'])expect(columns.find(c=>c.column_name===name)).toMatchObject({is_nullable:'YES',column_default:null});
 },60000);
 it('member and native session FKs prevent dangling grants',async()=>{
  await exists();await client.query('SAVEPOINT invalid_member');await expect(insert('bad-member','unknown')).rejects.toMatchObject({code:'23503'});await client.query('ROLLBACK TO SAVEPOINT invalid_member');
  await client.query('SAVEPOINT invalid_session');await expect(insert('bad-session','seat','unknown')).rejects.toMatchObject({code:'23503'});await client.query('ROLLBACK TO SAVEPOINT invalid_session');
  expect((await client.query('SELECT id FROM call_admissions')).rowCount).toBe(0);
 });
 it('admission FKs bind to the active schema instead of another deployment schema',async()=>{
  await exists();const references=(await client.query("SELECT n.nspname FROM pg_constraint c JOIN pg_class target ON target.oid=c.confrelid JOIN pg_namespace n ON n.oid=target.relnamespace WHERE c.conrelid='call_admissions'::regclass AND c.contype='f'")).rows;
  expect(references).toHaveLength(2);expect(references.map(r=>r.nspname)).toEqual([owned,owned]);
 });
 it('one unrevoked identity per seat; a new admission never reuses revoked identity',async()=>{
  await exists();await insert('old-opaque');await client.query('SAVEPOINT duplicate');await expect(insert('other-active')).rejects.toMatchObject({code:'23505'});await client.query('ROLLBACK TO SAVEPOINT duplicate');
  await client.query("UPDATE call_admissions SET revoked_at=clock_timestamp() WHERE id='old-opaque'");await insert('new-opaque');
  expect((await client.query('SELECT id FROM call_admissions WHERE revoked_at IS NULL')).rows.map(r=>r.id)).toEqual(['new-opaque']);
  await client.query('SAVEPOINT reused');await expect(insert('old-opaque')).rejects.toMatchObject({code:'23505'});await client.query('ROLLBACK TO SAVEPOINT reused');
 });
 it('native logout removes the admission binding and preserves room/call/seats',async()=>{
  await exists();await insert('lease');await client.query("DELETE FROM session WHERE id='session'");
  expect((await client.query('SELECT id FROM call_admissions')).rowCount).toBe(0);expect((await client.query('SELECT id FROM call_members')).rowCount).toBe(1);expect((await client.query('SELECT id FROM call_groups')).rowCount).toBe(1);expect((await client.query('SELECT id FROM rooms')).rowCount).toBe(1);
 });
 it('membership revocation cascades the seat/lease while keeping persistent room and call',async()=>{
  await exists();await insert('lease');await client.query("DELETE FROM room_members WHERE id='membership'");
  expect((await client.query('SELECT id FROM call_admissions')).rowCount).toBe(0);expect((await client.query('SELECT id FROM call_members')).rowCount).toBe(0);expect((await client.query('SELECT id FROM call_groups')).rowCount).toBe(1);expect((await client.query('SELECT id FROM rooms')).rowCount).toBe(1);
 });
 it('invalid expiry is rejected and valid expiry roundtrips across database timezones',async()=>{
  await exists();await client.query('SAVEPOINT expired');await expect(insert('invalid','seat','session',"'2000-01-01T00:00:00Z'::timestamptz")).rejects.toMatchObject({code:'23514'});await client.query('ROLLBACK TO SAVEPOINT expired');
  await insert('utc');const original=(await client.query("SELECT expires_at FROM call_admissions WHERE id='utc'")).rows[0].expires_at.toISOString();
  for(const zone of ['Asia/Bangkok','UTC']){await client.query('SELECT set_config($1,$2,true)',['TimeZone',zone]);expect((await client.query("SELECT expires_at FROM call_admissions WHERE id='utc'")).rows[0].expires_at.toISOString()).toBe(original);}
 });
});
