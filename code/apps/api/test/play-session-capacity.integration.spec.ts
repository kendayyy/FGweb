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
import {createPageSchema,PlaySessionSchema,RecruitmentSchema} from '@fg/contracts';
import {AppModule} from '../src/app.module.js';
import {createSignedSessionCookie} from './test-cookie-helper.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const origin='http://localhost:5173',secret='t24-discovery-isolated-test-secret-32-chars';
jest.setTimeout(60000);
describe('T24-FIX2 real stored session capacity',()=>{
 let app:INestApplication,pool:pg.Pool,base:string,game:{id:string;title:string},created=false;
 const owned=`t24_capacity_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,saved={...process.env},cookies:Record<string,string>={};
 beforeAll(async()=>{
  const env=parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8')),connection=new URL(env.DATABASE_URL!);
  connection.searchParams.set('options',`-c search_path=${owned}`);
  pool=new pg.Pool({connectionString:connection.href,max:16,connectionTimeoutMillis:5000,statement_timeout:15000});
  await pool.query(`CREATE SCHEMA "${owned}"`);created=true;
  await migrate(drizzle(pool),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:owned});
  await tables.seedGames(drizzle(pool,{schema:tables}));game=(await pool.query("SELECT id,title FROM games WHERE title='Valorant'")).rows[0];
  for(const id of ['owner','member','outsider']){
   await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())',[id,`${id}@fixture.invalid`]);
   await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[`sess-${id}`,id,`tok-${id}`]);
   await pool.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$1)',[id]);
   await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$1,$2)',[id,game.id]);cookies[id]=await createSignedSessionCookie(secret,`tok-${id}`);
  }
  Object.assign(process.env,env,{DATABASE_URL:connection.href,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:secret});
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});await app.listen(0,'127.0.0.1');base=await app.getUrl();
 });
 afterAll(async()=>{try{await app?.close();if(created){expect(owned).toMatch(/^t24_capacity_[0-9]+_[a-z0-9]+$/);await pool.query(`DROP SCHEMA "${owned}" CASCADE`);expect((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[owned])).rowCount).toBe(0);}}finally{await pool?.end();process.env=saved;}});
 beforeEach(async()=>{
  await pool.query('DELETE FROM notification_outbox; DELETE FROM notifications; DELETE FROM invitations; DELETE FROM active_play_slots; DELETE FROM join_requests; DELETE FROM recruitments; DELETE FROM team_members; DELETE FROM play_sessions; DELETE FROM permission_grants; DELETE FROM rooms; DELETE FROM admin_actions');
  await pool.query("DELETE FROM conversations WHERE kind='ROOM'");await pool.query("UPDATE session SET expires_at=now()+interval '1 day'");
  // Better Auth deletes an expired native session on read. Each isolated case
  // needs a real persisted session again, not only an UPDATE of vanished rows.
  for(const id of ['owner','member','outsider'])await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now()) ON CONFLICT(id) DO UPDATE SET expires_at=EXCLUDED.expires_at",[`sess-${id}`,id,`tok-${id}`]);
  await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$1,$2) ON CONFLICT DO NOTHING',['member',game.id]);
 });
 async function room(){
  const response=await request(base).post('/api/v1/recruitments').set('Cookie',cookies.owner).set('Origin',origin).send({gameId:game.id,gameTitle:game.title,title:'Discovery session',mode:'ranked',playerCapacity:3,timingType:'scheduledAt',scheduledAt:'2099-10-07T13:30:00Z'});
  expect(response.status).toBe(201);const card=RecruitmentSchema.parse(response.body);
  await pool.query("UPDATE rooms SET visibility='PRIVATE' WHERE id=$1",[card.roomId]);await pool.query("UPDATE recruitments SET state='CLOSED' WHERE id=$1",[card.id]);
  await pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,'member','MEMBER')",[`${card.roomId}-member`,card.roomId]);
  const play=(await pool.query('SELECT play_session_id FROM recruitments WHERE id=$1',[card.id])).rows[0].play_session_id as string;
  return {roomId:card.roomId,play};
 }
 const list=(id:string,user='member',query='')=>request(base).get(`/api/v1/rooms/${id}/play-sessions${query}`).set('Cookie',cookies[user]);
 const pageSchema=createPageSchema(PlaySessionSchema);
 async function history(id:string,count:number){
  for(let i=0;i<count;i++)await pool.query("INSERT INTO play_sessions(id,room_id,host_user_id,state,timing_type,player_capacity,created_at,updated_at) VALUES($1,$2,'owner',$3,'now',3,'2026-01-01 00:00:00.123456','2026-01-01 00:00:00.123456')",[`history-${String(i).padStart(3,'0')}`,id,['ENDED','ACTIVE','SCHEDULED'][i%3]]);
 }

 it('member private/CLOSED discovery and snapshot preserve each stored capacity',async()=>{
  const t=await room();await history(t.roomId,2);
  await pool.query("UPDATE play_sessions SET player_capacity=CASE id WHEN 'history-000' THEN 1 WHEN 'history-001' THEN 2 ELSE 3 END WHERE room_id=$1",[t.roomId]);
  const result=await list(t.roomId);expect(result.status).toBe(200);const page=pageSchema.parse(result.body);
  expect(Object.fromEntries(page.items.map(p=>[p.id,p.playerCapacity]))).toEqual({[t.play]:3,'history-000':1,'history-001':2});
  const snapshot=await request(base).get('/api/v1/play-sessions/'+t.play).set('Cookie',cookies.member);expect(snapshot.status).toBe(200);expect(snapshot.body.playSession.playerCapacity).toBe(3);
  expect((await list(t.roomId,'outsider')).status).toBe(403);
 });
 it('changing mutable room settings never misreports or replaces the existing session admission limit',async()=>{
  const t=await room();
  for(const capacity of [10,1]){
   const changed=await request(base).patch('/api/v1/rooms/'+t.roomId+'/settings').set('Cookie',cookies.owner).set('Origin',origin).send({playerCapacity:capacity});expect(changed.status).toBe(200);expect(changed.body.settings.playerCapacity).toBe(capacity);
   const snapshot=await request(base).get('/api/v1/play-sessions/'+t.play).set('Cookie',cookies.member);expect(snapshot.status).toBe(200);expect(snapshot.body.playSession.playerCapacity).toBe(3);
   expect((await list(t.roomId)).body.items[0].playerCapacity).toBe(3);
  }
  const joined=await request(base).post('/api/v1/play-sessions/'+t.play+'/join').set('Cookie',cookies.member).set('Origin',origin).send({});expect(joined.status).toBe(201);
  const accepted=await request(base).post('/api/v1/play-sessions/'+t.play+'/requests/'+joined.body.id+'/respond').set('Cookie',cookies.owner).set('Origin',origin).send({action:'ACCEPT'});expect(accepted.status).toBe(201);
  expect((await pool.query('SELECT user_id FROM team_members WHERE play_session_id=$1',[t.play])).rowCount).toBe(2);
 });
 it('start/end responses expose the actual capacity while room/chat membership persists',async()=>{
  const t=await room();
  for(const action of ['start','end']){
   const response=await request(base).post('/api/v1/play-sessions/'+t.play+'/'+action).set('Cookie',cookies.owner).set('Origin',origin).send({});expect(response.status).toBe(201);expect(PlaySessionSchema.parse(response.body).playerCapacity).toBe(3);
   expect((await pool.query('SELECT id FROM rooms WHERE id=$1',[t.roomId])).rowCount).toBe(1);expect((await pool.query('SELECT id FROM room_members WHERE room_id=$1',[t.roomId])).rowCount).toBe(2);
  }
 });
});
