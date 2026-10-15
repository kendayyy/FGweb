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
import {AppModule} from '../../../apps/api/src/app.module.js';
import {createSignedSessionCookie} from '../../../apps/api/test/test-cookie-helper.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const origin='http://localhost:5173',secret='t24-discovery-isolated-test-secret-32-chars';
jest.setTimeout(60000);
describe('T24-FIX1 real member-only room session discovery',()=>{
 let app:INestApplication,pool:pg.Pool,base:string,game:{id:string;title:string},created=false;
 const owned=`t24_discovery_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,saved={...process.env},cookies:Record<string,string>={};
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
 afterAll(async()=>{try{await app?.close();if(created){expect(owned).toMatch(/^t24_discovery_[0-9]+_[a-z0-9]+$/);await pool.query(`DROP SCHEMA "${owned}" CASCADE`);expect((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[owned])).rowCount).toBe(0);}}finally{await pool?.end();process.env=saved;}});
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
 it('current ordinary member discovers private sessions despite closed recruitment, without roster or manager queue fields',async()=>{
  const t=await room();await history(t.roomId,3);const result=await list(t.roomId);expect(result.status).toBe(200);
  const page=pageSchema.parse(result.body);expect(page.items).toHaveLength(4);expect(new Set(page.items.map(p=>p.state))).toEqual(new Set(['SCHEDULED','ACTIVE','ENDED']));
  expect(page.items[0].id).toBe(t.play);for(const item of result.body.items)expect(Object.keys(item).sort()).toEqual(Object.keys(PlaySessionSchema.parse(item)).sort());
  expect((await request(base).get('/api/v1/recruitments')).body.items).toHaveLength(0);
 });
 it('default20/max50 and newest createdAt/id pagination retain all microsecond ties without duplicates',async()=>{
  const t=await room();await history(t.roomId,52);const first=await list(t.roomId);expect(first.status).toBe(200);expect(first.body.items).toHaveLength(20);expect(first.body.hasMore).toBe(true);
  expect((await list(t.roomId,'member','?limit=50')).body.items).toHaveLength(50);
  const ids:string[]=[];let cursor:string|undefined;
  do{const r=await list(t.roomId,'member',`?limit=7${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);expect(r.status).toBe(200);const page=pageSchema.parse(r.body);ids.push(...page.items.map(p=>p.id));cursor=page.hasMore?page.nextCursor??undefined:undefined;if(page.hasMore)expect(cursor).toBeTruthy();else expect(page.nextCursor??null).toBeNull();}while(cursor);
  expect(ids).toEqual([t.play,...Array.from({length:52},(_,i)=>`history-${String(51-i).padStart(3,'0')}`)]);expect(new Set(ids).size).toBe(53);
 });
 it('rejects malformed/unknown/duplicate query values and cross-room cursors with422',async()=>{
  const a=await room(),b=await room();await history(a.roomId,2);const first=await list(a.roomId,'member','?limit=1');expect(first.status).toBe(200);
  for(const query of ['?limit=0','?limit=51','?limit=1.5','?limit=NaN','?limit=','?limit=1&limit=2','?userId=owner','?roomId=other','?state=PUBLIC','?cursor=','?cursor=@@@',`?cursor=${Buffer.from(JSON.stringify({id:'x',createdAt:'bad',roomId:a.roomId})).toString('base64url')}`])expect((await list(a.roomId,'member',query)).status).toBe(422);
  expect((await list(b.roomId,'member',`?cursor=${encodeURIComponent(first.body.nextCursor)}`)).status).toBe(422);
 });
 it('never grants guest/nonmember access even when the room becomesPUBLIC',async()=>{
  const t=await room();for(const visibility of ['PRIVATE','PUBLIC']){await pool.query('UPDATE rooms SET visibility=$2 WHERE id=$1',[t.roomId,visibility]);expect((await list(t.roomId,'outsider')).status).toBe(403);expect((await request(base).get(`/api/v1/rooms/${t.roomId}/play-sessions`)).status).toBe(401);}
 });
 it('removal and missing onboarding immediately revoke discovery',async()=>{
  const t=await room();expect((await list(t.roomId)).status).toBe(200);await pool.query("DELETE FROM game_interests WHERE user_id='member'");expect((await list(t.roomId)).status).toBe(403);
  await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$1,$2)',['member',game.id]);await pool.query("DELETE FROM room_members WHERE room_id=$1 AND user_id='member'",[t.roomId]);expect((await list(t.roomId)).status).toBe(403);
 });
 it('ban, expired session and missing room return real403/401/404',async()=>{
  const t=await room();expect((await list('missing-room')).status).toBe(404);
  await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action) VALUES('ban','owner','member','BAN')");expect((await list(t.roomId)).status).toBe(403);await pool.query('DELETE FROM admin_actions');
  await pool.query("UPDATE session SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id='member'");expect((await list(t.roomId)).status).toBe(401);
 });
 it('returns empty history without recreating a session or altering slots, requests or outbox',async()=>{
  const t=await room();await pool.query('DELETE FROM recruitments WHERE room_id=$1',[t.roomId]);await pool.query('DELETE FROM team_members WHERE play_session_id=$1',[t.play]);await pool.query('DELETE FROM play_sessions WHERE room_id=$1',[t.roomId]);
  const result=await list(t.roomId);expect(result.status).toBe(200);expect(pageSchema.parse(result.body)).toEqual({items:[],hasMore:false});
  for(const table of ['play_sessions','active_play_slots','join_requests','notifications','notification_outbox'])expect((await pool.query(`SELECT count(*)::integer AS count FROM ${table}`)).rows[0].count).toBe(0);
 });
 it.each(['session','membership','ban'])('rechecks %s after waiting on room mutation instead of trusting the HTTP guard',async change=>{
  const t=await room(),blocker=await pool.connect();let pending:Promise<request.Response>|undefined;
  try{
   await blocker.query('BEGIN');await blocker.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[t.roomId]);pending=list(t.roomId).then(r=>r);
   const deadline=Date.now()+8000;let waiting=false;
   while(Date.now()<deadline){if((await pool.query("SELECT pid FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE 'SELECT id,owner_id,visibility,conversation_id FROM rooms%' AND query LIKE '%FOR SHARE%'")).rowCount){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,25));}
   expect(waiting).toBe(true);
   if(change==='session')await pool.query("UPDATE session SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id='member'");
   else if(change==='membership')await blocker.query("DELETE FROM room_members WHERE room_id=$1 AND user_id='member'",[t.roomId]);
   else await blocker.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action) VALUES('late-ban','owner','member','BAN')");
   await blocker.query('COMMIT');expect((await pending).status).toBe(change==='session'?401:403);
  }finally{await blocker.query('ROLLBACK');blocker.release();if(pending)await pending;}
 });
});
