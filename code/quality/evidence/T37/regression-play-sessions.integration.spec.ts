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
import {RecruitmentSchema,PlaySessionSchema,TeamSnapshotSchema} from '@fg/contracts';
import {AppModule} from '../../../apps/api/src/app.module.js';
import {createSignedSessionCookie} from '../../../apps/api/test/test-cookie-helper.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const origin='http://localhost:5173',secret='t24-owned-test-secret-at-least-32-chars';
jest.setTimeout(60000);

describe('T24 real play session lifecycle and roster approval',()=>{
 let app:INestApplication,pool:pg.Pool,base:string,game:{id:string;title:string},schemaCreated=false;
 const owned=`t24_invites_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
 const saved={...process.env},cookies:Record<string,string>={};
 beforeAll(async()=>{
  const env=parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8'));
  const connection=new URL(env.DATABASE_URL!);connection.searchParams.set('options',`-c search_path=${owned}`);
  pool=new pg.Pool({connectionString:connection.href,max:20,connectionTimeoutMillis:5000,statement_timeout:15000});
  await pool.query(`CREATE SCHEMA "${owned}"`);
  schemaCreated=true;
  const db=await pool.connect();
  try{await migrate(drizzle(db),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:owned});}finally{db.release();}
  await tables.seedGames(drizzle(pool,{schema:tables}));
  game=(await pool.query("SELECT id,title FROM games WHERE title='Valorant'")).rows[0];
  for(const id of ['owner-a','owner-b','member','helper','recipient','second','outsider']){
   await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())',[id,`${id}@example.test`]);
   await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[`sess-${id}`,id,`tok-${id}`]);
   await pool.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$1)',[id]);
   await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$1,$2)',[id,game.id]);
   cookies[id]=await createSignedSessionCookie(secret,`tok-${id}`);
  }
  Object.assign(process.env,env,{DATABASE_URL:connection.href,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:secret});
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});
  await app.listen(0,'127.0.0.1');base=await app.getUrl();
 });
 afterAll(async()=>{
  try{
   if(app)await app.close();
   if(pool&&schemaCreated){
    if(!/^t24_invites_[0-9]+_[a-z0-9]+$/.test(owned))throw Error('Unsafe fixture cleanup');
    await pool.query(`DROP SCHEMA "${owned}" CASCADE`);
    expect((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[owned])).rowCount).toBe(0);
   }
  }finally{await pool?.end();process.env=saved;}
 });
 beforeEach(async()=>{
  await pool.query('DELETE FROM blocks');
  await pool.query('DELETE FROM notification_outbox; DELETE FROM notifications; DELETE FROM invitations; DELETE FROM active_play_slots; DELETE FROM join_requests; DELETE FROM recruitments; DELETE FROM team_members; DELETE FROM play_sessions; DELETE FROM permission_grants; DELETE FROM rooms; DELETE FROM admin_actions');
  await pool.query("DELETE FROM conversations WHERE kind='ROOM'");
  await pool.query("UPDATE session SET expires_at=now()+interval '1 day'");
 });
 const post=(url:string,user='owner-a',body:object={})=>request(base).post(`/api/v1/${url}`).set('Cookie',cookies[user]).set('Origin',origin).send(body);
 const get=(url:string,user='owner-a')=>request(base).get(`/api/v1/${url}`).set('Cookie',cookies[user]);
 const put=(url:string,user:string,body:object)=>request(base).put(`/api/v1/${url}`).set('Cookie',cookies[user]).set('Origin',origin).send(body);
 async function team(owner='owner-a',scheduled=true,capacity=3,roomId?:string){
  const r=await post('recruitments',owner,{gameId:game.id,gameTitle:game.title,title:'T24 session',mode:'ranked',playerCapacity:capacity,timingType:scheduled?'scheduledAt':'now',...(scheduled?{scheduledAt:'2099-10-07T13:30:00Z'}:{}),...(roomId?{roomId}:{})});
  expect(r.status).toBe(201);const card=RecruitmentSchema.parse(r.body);
  return {...card,playSessionId:(await pool.query('SELECT play_session_id FROM recruitments WHERE id=$1',[card.id])).rows[0].play_session_id as string};
 }
 async function member(roomId:string,user='recipient'){
  await pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,'MEMBER') ON CONFLICT DO NOTHING",[`${roomId}-${user}`,roomId,user]);
  await pool.query('INSERT INTO conversation_members(id,conversation_id,user_id) SELECT $1,conversation_id,$2 FROM rooms WHERE id=$3 ON CONFLICT DO NOTHING',[`${roomId}-${user}`,user,roomId]);
 }
 const join=(id:string,user='recipient')=>post(`play-sessions/${id}/join`,user);
 const respond=(play:string,id:string,user='owner-a',action='ACCEPT')=>post(`play-sessions/${play}/requests/${id}/respond`,user,{action});
 async function reserve(t:{roomId:string;playSessionId:string},user='recipient'){
  await member(t.roomId,user);const r=await join(t.playSessionId,user);expect(r.status).toBe(201);expect(r.body.status).toBe('PENDING');
  const accepted=await respond(t.playSessionId,r.body.id);expect(accepted.status).toBe(201);expect(accepted.body.status).toBe('ACCEPTED');return r.body.id as string;
 }
 const slots=async(user:string)=>(await pool.query('SELECT user_id FROM active_play_slots WHERE user_id=$1',[user])).rowCount;
 const roster=async(id:string)=>(await pool.query('SELECT user_id FROM team_members WHERE play_session_id=$1 ORDER BY user_id',[id])).rows.map(r=>r.user_id);

 it('member request in a private room with closed recruitment waits for exact manager approval',async()=>{
  const t=await team();await member(t.roomId);
  expect((await request(base).patch(`/api/v1/rooms/${t.roomId}/settings`).set('Cookie',cookies['owner-a']).set('Origin',origin).send({visibility:'PRIVATE'})).status).toBe(200);
  const r=await join(t.playSessionId);expect(r.status).toBe(201);expect(r.body.status).toBe('PENDING');expect(await roster(t.playSessionId)).toEqual(['owner-a']);
  expect((await get(`play-sessions/${t.playSessionId}/requests`)).body.map((x:{id:string})=>x.id)).toContain(r.body.id);
  expect((await get(`play-sessions/${t.playSessionId}/requests`,'recipient')).status).toBe(403);
  expect((await respond(t.playSessionId,r.body.id)).status).toBe(201);expect(await roster(t.playSessionId)).toEqual(['owner-a','recipient']);expect(await slots('recipient')).toBe(0);
 });
 it('clock does not start a scheduled team; manual start allocates all roster slots atomically and retries safely',async()=>{
  const t=await team();await reserve(t);expect(await slots('recipient')).toBe(0);
  await pool.query("UPDATE play_sessions SET scheduled_at=now()-interval '1 minute' WHERE id=$1",[t.playSessionId]);
  expect(TeamSnapshotSchema.parse((await get(`play-sessions/${t.playSessionId}`)).body).playSession.state).toBe('SCHEDULED');
  expect(await slots('owner-a')).toBe(0);expect(await slots('recipient')).toBe(0);
  const started=await post(`play-sessions/${t.playSessionId}/start`);expect(started.status).toBe(201);expect(PlaySessionSchema.parse(started.body).state).toBe('ACTIVE');
  expect(await slots('recipient')).toBe(1);expect(await slots('owner-a')).toBe(1);
  expect((await post(`play-sessions/${t.playSessionId}/start`)).body).toEqual(started.body);expect((await pool.query('SELECT user_id FROM active_play_slots WHERE play_session_id=$1',[t.playSessionId])).rowCount).toBe(2);
 });
 it('scheduled start conflict rolls back the entire team and preserves the other active team and pending requests',async()=>{
  const scheduled=await team();await reserve(scheduled);const active=await team('owner-b',false);
  const req=await post(`recruitments/${active.id}/requests`,'recipient');expect(req.status).toBe(201);expect((await post(`join-requests/${req.body.id}/approve`,'owner-b')).status).toBe(201);
  expect((await post(`play-sessions/${scheduled.playSessionId}/start`)).status).toBe(409);
  expect((await pool.query('SELECT state FROM play_sessions WHERE id=$1',[scheduled.playSessionId])).rows[0].state).toBe('SCHEDULED');expect(await slots('owner-a')).toBe(0);expect(await roster(scheduled.playSessionId)).toEqual(['owner-a','recipient']);
  expect((await pool.query('SELECT play_session_id FROM active_play_slots WHERE user_id=$1',['recipient'])).rows[0].play_session_id).toBe(active.playSessionId);
 });
 it('two scheduled starts competing for one user commit only one complete active team',async()=>{
  const a=await team(),b=await team('owner-b');await reserve(a);await member(b.roomId);
  const req=await join(b.playSessionId);expect(req.status).toBe(201);expect((await respond(b.playSessionId,req.body.id,'owner-b')).status).toBe(201);
  const results=await Promise.all([post(`play-sessions/${a.playSessionId}/start`),post(`play-sessions/${b.playSessionId}/start`,'owner-b')]);expect(results.map(r=>r.status).sort()).toEqual([201,409]);
  expect(await slots('recipient')).toBe(1);expect((await pool.query("SELECT id FROM play_sessions WHERE state='ACTIVE'")).rowCount).toBe(1);expect((await pool.query('SELECT user_id FROM active_play_slots')).rowCount).toBe(2);
 });
 it('leaving roster releases only the caller slot while keeping room/chat/call and other roster members',async()=>{
  const t=await team();await reserve(t);expect((await post(`play-sessions/${t.playSessionId}/start`)).status).toBe(201);
  await pool.query("INSERT INTO call_groups(id,room_id) VALUES('call-fixture',$1)",[t.roomId]);await pool.query("INSERT INTO call_members(id,call_group_id,room_id,user_id,seat_index) VALUES('call-member','call-fixture',$1,'recipient',1)",[t.roomId]);
  expect((await post(`play-sessions/${t.playSessionId}/leave`,'recipient')).body).toEqual({success:true});expect(await slots('recipient')).toBe(0);expect(await roster(t.playSessionId)).toEqual(['owner-a']);
  expect((await pool.query('SELECT id FROM room_members WHERE room_id=$1 AND user_id=$2',[t.roomId,'recipient'])).rowCount).toBe(1);expect((await pool.query("SELECT id FROM call_members WHERE id='call-member' AND left_at IS NULL")).rowCount).toBe(1);
  expect((await post(`play-sessions/${t.playSessionId}/leave`,'recipient')).body).toEqual({success:true});
 });
 it('end is idempotent, closes recruitment and releases slots without deleting room/call/chat or historical roster',async()=>{
  const t=await team();await reserve(t);expect((await post(`play-sessions/${t.playSessionId}/start`)).status).toBe(201);
  await pool.query("INSERT INTO call_groups(id,room_id) VALUES('preserved-call',$1)",[t.roomId]);
  const ended=await post(`play-sessions/${t.playSessionId}/end`);expect(ended.status).toBe(201);expect(PlaySessionSchema.parse(ended.body).state).toBe('ENDED');
  expect((await post(`play-sessions/${t.playSessionId}/end`)).body).toEqual(ended.body);expect(await slots('recipient')).toBe(0);expect(await slots('owner-a')).toBe(0);
  expect(await roster(t.playSessionId)).toEqual(['owner-a','recipient']);expect((await pool.query('SELECT state FROM recruitments WHERE id=$1',[t.id])).rows[0].state).toBe('CLOSED');
  expect((await pool.query('SELECT id FROM rooms WHERE id=$1',[t.roomId])).rowCount).toBe(1);expect((await pool.query("SELECT id FROM call_groups WHERE id='preserved-call' AND state='OPEN'")).rowCount).toBe(1);
  const next=await team('owner-a',false,3,t.roomId);expect(next.playSessionId).not.toBe(t.playSessionId);expect(await roster(next.playSessionId)).toEqual(['owner-a']);
 });
 it('spectating does not grant roster or slots and nonmanagers cannot start/end/approve',async()=>{
  const t=await team();await member(t.roomId,'helper');await member(t.roomId);expect((await put(`rooms/${t.roomId}/helpers/helper`,'owner-a',{permissions:['MANAGE_CALLS']})).status).toBe(200);
  expect(await slots('recipient')).toBe(0);expect(await roster(t.playSessionId)).toEqual(['owner-a']);const req=await join(t.playSessionId);expect(req.status).toBe(201);
  for(const action of ['start','end'])expect((await post(`play-sessions/${t.playSessionId}/${action}`,'helper')).status).toBe(403);
  expect((await respond(t.playSessionId,req.body.id,'helper')).status).toBe(403);
  expect((await put(`rooms/${t.roomId}/helpers/helper`,'owner-a',{permissions:['MANAGE_RECRUITMENT']})).status).toBe(200);expect((await respond(t.playSessionId,req.body.id,'helper')).status).toBe(201);expect((await post(`play-sessions/${t.playSessionId}/start`,'helper')).status).toBe(201);
 });
 it('private session membership, guest auth, forged actors and cross-session request identity are enforced',async()=>{
  const a=await team(),b=await team('owner-b');await member(a.roomId);const req=await join(a.playSessionId);expect(req.status).toBe(201);
  expect((await join(a.playSessionId,'outsider')).status).toBe(403);expect((await request(base).post(`/api/v1/play-sessions/${a.playSessionId}/join`).set('Origin',origin).send({})).status).toBe(401);
  expect((await post(`play-sessions/${a.playSessionId}/join`,'recipient',{userId:'second'})).status).toBe(422);expect((await post(`play-sessions/${a.playSessionId}/start`,'owner-a',{userId:'owner-b'})).status).toBe(422);
  expect((await respond(b.playSessionId,req.body.id,'owner-b')).status).toBe(422);expect((await pool.query('SELECT status FROM join_requests WHERE id=$1',[req.body.id])).rows[0].status).toBe('PENDING');
 });
 it('last roster seat approval is atomic and rejection/retries do not grant seats',async()=>{
  const t=await team('owner-a',true,2);await member(t.roomId);await member(t.roomId,'second');const a=await join(t.playSessionId),b=await join(t.playSessionId,'second');expect(a.status).toBe(201);expect(b.status).toBe(201);
  const results=await Promise.all([respond(t.playSessionId,a.body.id),respond(t.playSessionId,b.body.id)]);expect(results.map(r=>r.status).sort()).toEqual([201,409]);expect((await roster(t.playSessionId)).length).toBe(2);
  const loser=results[0].status===409?a:b;expect((await respond(t.playSessionId,loser.body.id,'owner-a','REJECT')).body.status).toBe('REJECTED');expect((await respond(t.playSessionId,loser.body.id,'owner-a','REJECT')).body.status).toBe('REJECTED');expect((await respond(t.playSessionId,loser.body.id)).status).toBe(409);
 });
 it('leaving a call does not remove roster or release an active game slot',async()=>{
  const t=await team();await reserve(t);expect((await post(`play-sessions/${t.playSessionId}/start`)).status).toBe(201);
  await pool.query("INSERT INTO call_groups(id,room_id) VALUES('leaving-call',$1)",[t.roomId]);await pool.query("INSERT INTO call_members(id,call_group_id,room_id,user_id,seat_index) VALUES('leaving-call-member','leaving-call',$1,'recipient',1)",[t.roomId]);
  await pool.query("UPDATE call_members SET left_at=now() WHERE id='leaving-call-member'");
  expect(await roster(t.playSessionId)).toEqual(['owner-a','recipient']);expect(await slots('recipient')).toBe(1);
  expect((await pool.query('SELECT id FROM room_members WHERE room_id=$1 AND user_id=$2',[t.roomId,'recipient'])).rowCount).toBe(1);
 });
 it('banned or removed reserved members abort start without partial slots',async()=>{
  const t=await team();await reserve(t);
  await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action) VALUES('reserve-ban','owner-b','recipient','BAN')");
  expect((await post(`play-sessions/${t.playSessionId}/start`)).status).toBe(403);expect(await slots('owner-a')).toBe(0);expect(await slots('recipient')).toBe(0);
  await pool.query("DELETE FROM admin_actions WHERE id='reserve-ban'");await pool.query('DELETE FROM room_members WHERE room_id=$1 AND user_id=$2',[t.roomId,'recipient']);
  expect((await post(`play-sessions/${t.playSessionId}/start`)).status).toBe(403);
  expect((await pool.query('SELECT state FROM play_sessions WHERE id=$1',[t.playSessionId])).rows[0].state).toBe('SCHEDULED');expect(await slots('owner-a')).toBe(0);
 });
 it('join and approval retries keep a single durable notification and outbox event per outcome',async()=>{
  const t=await team();await member(t.roomId);const a=await join(t.playSessionId),b=await join(t.playSessionId);expect(a.status).toBe(201);expect(b.body).toEqual(a.body);
  expect((await pool.query('SELECT id FROM notifications')).rowCount).toBe(1);expect((await pool.query('SELECT id FROM notification_outbox')).rowCount).toBe(1);
  const accepted=await respond(t.playSessionId,a.body.id);expect(accepted.status).toBe(201);expect((await respond(t.playSessionId,a.body.id)).body).toEqual(accepted.body);
  expect((await pool.query('SELECT id FROM notifications')).rowCount).toBe(2);expect((await pool.query('SELECT id FROM notification_outbox')).rowCount).toBe(2);expect(await roster(t.playSessionId)).toEqual(['owner-a','recipient']);
 });
 it('host uses explicit end rather than silently ending the team through leave',async()=>{
  const t=await team();await reserve(t);expect((await post(`play-sessions/${t.playSessionId}/start`)).status).toBe(201);
  expect((await post(`play-sessions/${t.playSessionId}/leave`)).status).toBe(409);expect(await slots('owner-a')).toBe(1);expect(await slots('recipient')).toBe(1);
  expect((await post(`play-sessions/${t.playSessionId}/end`)).status).toBe(201);expect(await slots('owner-a')).toBe(0);expect(await slots('recipient')).toBe(0);
 });
 it.each(['expired session','revoked grant'])('rechecks %s after waiting for the room lock',async change=>{
  const t=await team();await member(t.roomId,'helper');expect((await put(`rooms/${t.roomId}/helpers/helper`,'owner-a',{permissions:['MANAGE_RECRUITMENT']})).status).toBe(200);
  const blocker=await pool.connect();let pending:Promise<request.Response>|undefined;
  try{
   await blocker.query('BEGIN');await blocker.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[t.roomId]);
   pending=post(`play-sessions/${t.playSessionId}/start`,'helper').then(r=>r);
   const deadline=Date.now()+8000;let waiting=false;
   while(Date.now()<deadline){
    const waits=await pool.query("SELECT pid FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE 'SELECT id,owner_id,visibility,conversation_id FROM rooms%' AND query LIKE '%FOR UPDATE%'");
    if(waits.rowCount){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,25));
   }
   expect(waiting).toBe(true);
   if(change==='expired session')await pool.query("UPDATE session SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id='helper'");
   else await blocker.query("DELETE FROM permission_grants WHERE room_id=$1 AND user_id='helper'",[t.roomId]);
   await blocker.query('COMMIT');expect((await pending).status).toBe(change==='expired session'?401:403);
   expect((await pool.query('SELECT state FROM play_sessions WHERE id=$1',[t.playSessionId])).rows[0].state).toBe('SCHEDULED');expect(await slots('owner-a')).toBe(0);
  }finally{await blocker.query('ROLLBACK');blocker.release();if(pending)await pending;}
 });
 it('end prevents pending member admission and a later start never resurrects an ended session',async()=>{
  const t=await team();await member(t.roomId);const req=await join(t.playSessionId);expect(req.status).toBe(201);expect((await post(`play-sessions/${t.playSessionId}/end`)).status).toBe(201);
  expect((await respond(t.playSessionId,req.body.id)).status).toBe(409);expect((await post(`play-sessions/${t.playSessionId}/start`)).status).toBe(409);expect((await join(t.playSessionId)).status).toBe(409);
  expect(TeamSnapshotSchema.parse((await get(`play-sessions/${t.playSessionId}`)).body).playSession.state).toBe('ENDED');
 });
});
