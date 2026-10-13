import fs from 'node:fs';import pg from 'pg';import {randomUUID} from 'node:crypto';import {parseEnv} from 'node:util';import assert from 'node:assert/strict';
import {leaseReasonSql,startLeaseReasons} from './lease-reasons-observer1.mjs';
const out='quality/evidence/T30/lease-reasons-smoke2',schema='t30_screen_'+randomUUID().replaceAll('-','');assert(/^t30_screen_[a-f0-9]{32}$/.test(schema));fs.mkdirSync(out);
const url=new URL(parseEnv(fs.readFileSync('.env.local','utf8')).DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema}`);const pool=new pg.Pool({connectionString:url.href,max:2});let observer,created=false;const controls=[];
try{
 await pool.query(`CREATE SCHEMA "${schema}"`);created=true;
 await pool.query(`CREATE TABLE call_admissions(id text,call_member_id text,session_id text,revoked_at timestamptz,connected_at timestamptz,expires_at timestamptz,disconnected_at timestamptz);CREATE TABLE call_members(id text,user_id text,call_group_id text,room_id text,left_at timestamptz);CREATE TABLE call_groups(id text,state text);CREATE TABLE session(id text,user_id text,expires_at timestamp);CREATE TABLE room_members(room_id text,user_id text);CREATE TABLE profiles(user_id text);CREATE TABLE game_interests(user_id text);CREATE TABLE admin_actions(id text,target_user_id text,action text,created_at timestamptz);CREATE TABLE call_publish_slots(call_group_id text,user_id text)`);
 await pool.query(`INSERT INTO call_admissions VALUES('synthetic-lease','member','session',NULL,clock_timestamp(),clock_timestamp()+interval '1 day',NULL);INSERT INTO call_members VALUES('member','user','group','room',NULL);INSERT INTO call_groups VALUES('group','OPEN');INSERT INTO session VALUES('session','user',clock_timestamp() AT TIME ZONE 'UTC'+interval '1 day');INSERT INTO room_members VALUES('room','user');INSERT INTO profiles VALUES('user');INSERT INTO game_interests VALUES('user');INSERT INTO call_publish_slots VALUES('group','user')`);
 const sample=async()=>{const row=(await pool.query(leaseReasonSql)).rows[0];assert(row);return row;};
 const healthy=await sample();for(const key of ['revoked','admission_expired','grace_expired','member_left','group_closed','session_invalid','membership_missing','profile_missing','interests_missing','banned'])assert(!healthy[key]);assert(healthy.publishing&&healthy.connected);controls.push('healthy');
 for(const [sql,key,restore]of [
  ["UPDATE call_admissions SET revoked_at=clock_timestamp()",'revoked',"UPDATE call_admissions SET revoked_at=NULL"],
  ["UPDATE call_admissions SET expires_at=clock_timestamp()-interval '1 second'",'admission_expired',"UPDATE call_admissions SET expires_at=clock_timestamp()+interval '1 day'"],
  ["UPDATE call_admissions SET disconnected_at=clock_timestamp()-interval '31 seconds'",'grace_expired',"UPDATE call_admissions SET disconnected_at=NULL"],
  ["UPDATE call_members SET left_at=clock_timestamp()",'member_left',"UPDATE call_members SET left_at=NULL"],
  ["UPDATE session SET expires_at=clock_timestamp() AT TIME ZONE 'UTC'-interval '1 second'",'session_invalid',"UPDATE session SET expires_at=clock_timestamp() AT TIME ZONE 'UTC'+interval '1 day'"],
  ["DELETE FROM room_members",'membership_missing',"INSERT INTO room_members VALUES('room','user')"]
 ]){await pool.query(sql);assert.equal((await sample())[key],true);controls.push(key);await pool.query(restore);}
 observer=await startLeaseReasons({connectionString:url.href,evidenceDir:out});await new Promise(r=>setTimeout(r,800));await observer.stop();observer=undefined;
 const health=JSON.parse(fs.readFileSync(out+'/lease-reasons-health.json'));assert(health.samples>=2&&health.failureCount===0&&health.droppedCount===0&&health.actualClientEnded&&health.readOnly);
 const logs=fs.readFileSync(out+'/lease-reasons.jsonl','utf8');assert(!logs.includes('synthetic-lease'));const rows=logs.trim().split('\n').map(JSON.parse);assert(rows.every(r=>r.leases[0].tag===1&&r.leases[0].publishing));
 fs.writeFileSync(out+'/review.json',JSON.stringify({at:new Date().toISOString(),controls,privacyAndReadOnly:true,health},null,2)+'\n');console.log('Actual PostgreSQL lease-reason controls passed: '+controls.length+'; sampler read-only, raw IDs omitted.');
}finally{if(observer)await observer.stop();if(created)await pool.query(`DROP SCHEMA "${schema}" CASCADE`);await pool.end();fs.writeFileSync(out+'/cleanup.json',JSON.stringify({at:new Date().toISOString(),ownedSchemaRemoved:created,poolEnded:true})+'\n');}
