import 'reflect-metadata';
import {jest} from '@jest/globals';
import {NestFactory} from '@nestjs/core';
import type {INestApplication} from '@nestjs/common';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import request from 'supertest';
import * as tables from '@fg/database';
import {JoinRequestSchema,TeamSnapshotSchema,RecruitmentSchema} from '@fg/contracts';
import {AppModule} from '../src/app.module.js';
import {createSignedSessionCookie} from './test-cookie-helper.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),origin='http://localhost:5173',secret='t22-owned-test-secret-at-least-32-chars';
jest.setTimeout(60000);
describe('T22 real atomic team approval',()=>{
 let app:INestApplication,pool:pg.Pool,base:string,game:{id:string;title:string};
 const owned=`t22_teams_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,saved={...process.env},cookies:Record<string,string>={};
 beforeAll(async()=>{
  const env=parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8')),connection=new URL(env.DATABASE_URL!);connection.searchParams.set('options',`-c search_path=${owned}`);
  pool=new pg.Pool({connectionString:connection.href,max:20,connectionTimeoutMillis:5000,statement_timeout:15000});await pool.query(`CREATE SCHEMA "${owned}"`);
  const db=await pool.connect();try{await migrate(drizzle(db),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:owned});}finally{db.release();}
  await tables.seedGames(drizzle(pool,{schema:tables}));game=(await pool.query("SELECT id,title FROM games WHERE title='Valorant'")).rows[0];
  for(const id of ['owner-a','owner-b','applicant','second','helper','outsider','incomplete']){
   await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())',[id,`${id}@example.test`]);
   await pool.query('INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval \'1 day\',now(),now())',[`sess-${id}`,id,`tok-${id}`]);
   if(id!=='incomplete'){await pool.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$1)',[id]);await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$1,$2)',[id,game.id]);}
   cookies[id]=await createSignedSessionCookie(secret,`tok-${id}`);
  }
  Object.assign(process.env,env,{DATABASE_URL:connection.href,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:secret});
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});await app.listen(0,'127.0.0.1');base=await app.getUrl();
 });
 afterAll(async()=>{try{if(app)await app.close();if(pool){if(!/^t22_teams_[0-9]+_[a-z0-9]+$/.test(owned))throw Error('Unsafe fixture cleanup');await pool.query(`DROP SCHEMA "${owned}" CASCADE`);expect((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[owned])).rowCount).toBe(0);}}finally{await pool?.end();process.env=saved;}});
 beforeEach(async()=>{
  await pool.query('DELETE FROM notification_outbox; DELETE FROM notifications; DELETE FROM active_play_slots; DELETE FROM join_requests; DELETE FROM recruitments; DELETE FROM team_members; DELETE FROM play_sessions; DELETE FROM permission_grants; DELETE FROM rooms; DELETE FROM admin_actions');
  await pool.query("UPDATE session SET expires_at=now()+interval '1 day'");
 });
 const post=(url:string,user='applicant',body:object={})=>request(base).post(`/api/v1/${url}`).set('Cookie',cookies[user]).set('Origin',origin).send(body);
 const get=(url:string,user='applicant')=>request(base).get(`/api/v1/${url}`).set('Cookie',cookies[user]);
 async function create(owner='owner-a',scheduled=false,capacity=3){const r=await post('recruitments',owner,{gameId:game.id,gameTitle:game.title,title:'Đội test',mode:'ranked',requirementText:'Rank cao chỉ tham khảo',playerCapacity:capacity,timingType:scheduled?'scheduledAt':'now',...(scheduled?{scheduledAt:'2099-10-07T13:30:00Z'}:{})});expect(r.status).toBe(201);return RecruitmentSchema.parse(r.body);}
 async function apply(id:string,user='applicant',legacy=false){const r=await post(`recruitments/${id}/${legacy?'join-requests':'requests'}`,user);expect(r.status).toBe(201);return JoinRequestSchema.parse(r.body);}
 const approve=(id:string,user='owner-a')=>post(`join-requests/${id}/approve`,user);
 const state=async(id:string)=>(await pool.query('SELECT status FROM join_requests WHERE id=$1',[id])).rows[0]?.status;
 const play=async(id:string)=>(await pool.query('SELECT play_session_id FROM recruitments WHERE id=$1',[id])).rows[0].play_session_id as string;
 it('submits without rank gate; retries same identity and queues one owner notification',async()=>{
  const c=await create();const a=await apply(c.id),b=await apply(c.id,'applicant',true);expect(b.id).toBe(a.id);expect(a.applicantId).toBe('applicant');expect((await pool.query("SELECT * FROM notifications WHERE type='JOIN_REQUEST'")).rowCount).toBe(1);expect((await pool.query('SELECT * FROM notification_outbox')).rowCount).toBe(1);
 });
 it('atomically adds room/chat membership, roster/slot, cancels only other now requests',async()=>{
  const c=await create(),other=await create('owner-b'),scheduled=await create('owner-a',true);const a=await apply(c.id),b=await apply(other.id),s=await apply(scheduled.id);
  const r=await approve(a.id);expect(r.status).toBe(201);expect(JoinRequestSchema.parse(r.body).status).toBe('ACCEPTED');expect(await state(b.id)).toBe('CANCELLED');expect(await state(s.id)).toBe('PENDING');
  expect((await pool.query('SELECT * FROM room_members WHERE room_id=$1 AND user_id=$2',[c.roomId,'applicant'])).rowCount).toBe(1);
  expect((await pool.query('SELECT cm.* FROM conversation_members cm JOIN rooms r ON r.conversation_id=cm.conversation_id WHERE r.id=$1 AND cm.user_id=$2',[c.roomId,'applicant'])).rowCount).toBe(1);
  expect((await pool.query('SELECT * FROM active_play_slots WHERE user_id=$1',['applicant'])).rowCount).toBe(1);
  const snapshot=await get(`play-sessions/${await play(c.id)}`);expect(snapshot.status).toBe(200);expect(TeamSnapshotSchema.parse(snapshot.body).roster.map(m=>m.userId).sort()).toEqual(['applicant','owner-a']);
 });
 it('two teams approving same user concurrently have one success and other409',async()=>{
  const c=await create(),d=await create('owner-b'),a=await apply(c.id),b=await apply(d.id);const r=await Promise.all([approve(a.id),approve(b.id,'owner-b')]);expect(r.map(r=>r.status).sort()).toEqual([201,409]);expect((await pool.query('SELECT * FROM active_play_slots WHERE user_id=$1',['applicant'])).rowCount).toBe(1);expect([await state(a.id),await state(b.id)].sort()).toEqual(['ACCEPTED','CANCELLED']);
 });
 it('two applicants racing last seat have one success, loser remains pending',async()=>{
  const c=await create('owner-a',false,2),a=await apply(c.id),b=await apply(c.id,'second');const r=await Promise.all([approve(a.id),approve(b.id)]);expect(r.map(r=>r.status).sort()).toEqual([201,409]);expect([await state(a.id),await state(b.id)].sort()).toEqual(['ACCEPTED','PENDING']);expect((await pool.query('SELECT * FROM team_members WHERE play_session_id=$1',[await play(c.id)])).rowCount).toBe(2);
 });
 it('concurrent approval retries do not duplicate admission or outbox',async()=>{
  const c=await create(),a=await apply(c.id);const r=await Promise.all([approve(a.id),approve(a.id)]);expect(r.map(r=>r.status)).toEqual([201,201]);expect(r[0].body).toEqual(r[1].body);expect((await pool.query("SELECT * FROM notifications WHERE type='JOIN_REQUEST_RESULT'")).rowCount).toBe(1);expect((await pool.query('SELECT * FROM team_members WHERE user_id=$1',['applicant'])).rowCount).toBe(1);
 });
 it('scheduled acceptance reserves roster without active slot or cancelling now requests',async()=>{
  const c=await create('owner-a',true),now=await create('owner-b'),a=await apply(c.id),b=await apply(now.id);expect((await approve(a.id)).status).toBe(201);expect((await pool.query('SELECT * FROM active_play_slots WHERE user_id=$1',['applicant'])).rowCount).toBe(0);expect(await state(b.id)).toBe('PENDING');expect((await pool.query('SELECT * FROM team_members WHERE user_id=$1',['applicant'])).rowCount).toBe(1);
 });
 it('scheduled acceptance permits applicant already playing another active team',async()=>{
  const c=await create('owner-a',true),now=await create('owner-b'),a=await apply(c.id),b=await apply(now.id);expect((await approve(b.id,'owner-b')).status).toBe(201);expect((await approve(a.id)).status).toBe(201);expect((await pool.query('SELECT * FROM active_play_slots WHERE user_id=$1',['applicant'])).rowCount).toBe(1);
 });
 it('rejects unauthorized owner/helper, then permits exact recruitment grant',async()=>{
  const c=await create(),a=await apply(c.id);expect((await approve(a.id,'owner-b')).status).toBe(403);
  await pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES('helper-m',$1,'helper','HELPER')",[c.roomId]);
  await pool.query("INSERT INTO permission_grants(id,room_id,user_id,permission,granted_by) VALUES('calls',$1,'helper','MANAGE_CALLS','owner-a')",[c.roomId]);expect((await approve(a.id,'helper')).status).toBe(403);
  await pool.query("INSERT INTO permission_grants(id,room_id,user_id,permission,granted_by) VALUES('recruit',$1,'helper','MANAGE_RECRUITMENT','owner-a')",[c.roomId]);expect((await approve(a.id,'helper')).status).toBe(201);
 });
 it('reject is idempotent, legacy respond preserved and contradictory accept conflicts',async()=>{
  const c=await create(),a=await apply(c.id);const r=await request(base).patch(`/api/v1/join-requests/${a.id}/respond`).set('Cookie',cookies['owner-a']).set('Origin',origin).send({action:'REJECT'});expect(r.status).toBe(200);expect((await post(`join-requests/${a.id}/reject`,'owner-a')).body.status).toBe('REJECTED');expect((await approve(a.id)).status).toBe(409);expect((await pool.query('SELECT * FROM active_play_slots WHERE user_id=$1',['applicant'])).rowCount).toBe(0);
 });
 it('rollback at result outbox leaves roster, slot, counters and other requests unchanged',async()=>{
  const c=await create(),d=await create('owner-b'),a=await apply(c.id),b=await apply(d.id);
  await pool.query("CREATE FUNCTION fail_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (SELECT type FROM notifications WHERE id=NEW.notification_id)='JOIN_REQUEST_RESULT' THEN RAISE EXCEPTION 'owned rollback fault'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_result BEFORE INSERT ON notification_outbox FOR EACH ROW EXECUTE FUNCTION fail_result()");
  try{expect((await approve(a.id)).status).toBe(500);expect(await state(a.id)).toBe('PENDING');expect(await state(b.id)).toBe('PENDING');expect((await pool.query('SELECT * FROM active_play_slots WHERE user_id=$1',['applicant'])).rowCount).toBe(0);expect((await pool.query('SELECT current_players FROM recruitments WHERE id=$1',[c.id])).rows[0].current_players).toBe(1);expect((await pool.query('SELECT * FROM room_members WHERE user_id=$1',['applicant'])).rowCount).toBe(0);expect((await pool.query("SELECT * FROM notifications WHERE type='JOIN_REQUEST_RESULT'")).rowCount).toBe(0);}finally{await pool.query('DROP TRIGGER fail_result ON notification_outbox; DROP FUNCTION fail_result()');}
 });
 it('public room snapshot/list privacy requires actual current membership',async()=>{
  const c=await create(),a=await apply(c.id),id=await play(c.id);expect((await request(base).get(`/api/v1/play-sessions/${id}`)).status).toBe(401);expect((await get(`play-sessions/${id}`)).status).toBe(403);expect((await get(`recruitments/${c.id}/join-requests`)).status).toBe(403);expect((await get(`recruitments/${c.id}/join-requests`,'owner-a')).status).toBe(200);expect((await get('recruitments/me/joins')).body[0].id).toBe(a.id);
  await approve(a.id);await pool.query('DELETE FROM room_members WHERE room_id=$1 AND user_id=$2',[c.roomId,'applicant']);expect((await get(`play-sessions/${id}`)).status).toBe(403);
 });
 it('rejects private/closed recruitment, forged actor/action and incomplete users',async()=>{
  const c=await create();expect((await post(`recruitments/${c.id}/requests`,'applicant',{applicantId:'outsider'})).status).toBe(422);expect((await post(`recruitments/${c.id}/requests`,'incomplete')).status).toBe(403);const a=await apply(c.id);expect((await post(`join-requests/${a.id}/approve`,'owner-a',{action:'REJECT'})).status).toBe(422);
  await pool.query("UPDATE rooms SET visibility='PRIVATE' WHERE id=$1",[c.roomId]);expect((await post(`recruitments/${c.id}/requests`,'second')).status).toBe(403);expect((await approve(a.id)).status).toBe(409);expect(await state(a.id)).toBe('PENDING');
 });
 it('cancel belongs only to applicant and does not cancel another request',async()=>{
  const c=await create(),a=await apply(c.id);const cancel=(u:string)=>request(base).delete(`/api/v1/join-requests/${a.id}/cancel`).set('Cookie',cookies[u]).set('Origin',origin).send({requestId:a.id});expect((await cancel('outsider')).status).toBe(403);expect((await cancel('applicant')).status).toBe(200);expect((await cancel('applicant')).status).toBe(200);expect(await state(a.id)).toBe('CANCELLED');expect((await approve(a.id)).status).toBe(409);
 });
 it('rejects revoked session and banned applicant at approval',async()=>{
  const c=await create(),a=await apply(c.id);await pool.query("UPDATE session SET expires_at=now()-interval '1 second' WHERE user_id='owner-a'");expect((await approve(a.id)).status).toBe(401);
  // Better Auth removes an expired session; install a new owned session for the distinct ban check.
  await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES('sess-owner-a-new','owner-a','tok-owner-a-new',now()+interval '1 day',now(),now())");cookies['owner-a']=await createSignedSessionCookie(secret,'tok-owner-a-new');
  await pool.query("INSERT INTO admin_actions(id,target_user_id,action,reason,actor_id) VALUES('ban','applicant','BAN','test','owner-a')");expect((await approve(a.id)).status).toBe(403);expect(await state(a.id)).toBe('PENDING');
 });
 it('rechecks actor expiry after waiting on play-session lock before committing admission',async()=>{
  const c=await create(),a=await apply(c.id),playId=await play(c.id),block=await pool.connect();
  await pool.query("UPDATE session SET expires_at=clock_timestamp()+interval '2 seconds' WHERE user_id='owner-a'");
  // Better Auth normally renews near-expiry sessions. This owned fixture preserves
  // its hard deadline so the DB expiry check can be tested across a real lock wait.
  await pool.query("CREATE FUNCTION fixed_expiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='owner-a' THEN NEW.expires_at:=OLD.expires_at; END IF; RETURN NEW; END $$; CREATE TRIGGER fixed_expiry BEFORE UPDATE ON session FOR EACH ROW EXECUTE FUNCTION fixed_expiry()");
  await block.query('BEGIN');await block.query('SELECT id FROM play_sessions WHERE id=$1 FOR UPDATE',[playId]);
  const pending=approve(a.id).then(r=>r);let waiting=false;
  try{
   for(let i=0;i<100;i++){const waits=await pool.query("SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT p.%FROM play_sessions p%FOR UPDATE'");if(waits.rowCount){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
   expect(waiting).toBe(true);await new Promise(resolve=>setTimeout(resolve,2100));
   expect((await pool.query("SELECT bool_and(expires_at<clock_timestamp()) AS expired FROM session WHERE user_id='owner-a'")).rows[0].expired).toBe(true);await block.query('COMMIT');
   expect((await pending).status).toBe(401);expect(await state(a.id)).toBe('PENDING');expect((await pool.query('SELECT * FROM active_play_slots WHERE user_id=$1',['applicant'])).rowCount).toBe(0);
  }finally{await block.query('ROLLBACK');block.release();await pending;await pool.query('DROP TRIGGER fixed_expiry ON session; DROP FUNCTION fixed_expiry()');}
 });
 it('closed or ended recruitment cannot accept a pending applicant',async()=>{
  const c=await create(),a=await apply(c.id);await pool.query("UPDATE recruitments SET state='CLOSED' WHERE id=$1",[c.id]);expect((await approve(a.id)).status).toBe(409);expect(await state(a.id)).toBe('PENDING');
  await pool.query("UPDATE recruitments SET state='OPEN' WHERE id=$1",[c.id]);await pool.query('DELETE FROM active_play_slots WHERE play_session_id=$1',[await play(c.id)]);await pool.query("UPDATE play_sessions SET state='ENDED' WHERE id=$1",[await play(c.id)]);expect((await approve(a.id)).status).toBe(409);expect(await state(a.id)).toBe('PENDING');
 });
});
