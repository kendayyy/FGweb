import 'reflect-metadata';
import {jest} from '@jest/globals';
import {NestFactory} from '@nestjs/core';
import type {INestApplication} from '@nestjs/common';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import request from 'supertest';
import * as tables from '@fg/database';
import {CallGroupSchema,CallJoinSchema,RoomSchema} from '@fg/contracts';
import {TokenVerifier,RoomServiceClient} from 'livekit-server-sdk';
import {AppModule} from '../../../../apps/api/src/app.module.js';
import {createSignedSessionCookie} from '../../../../apps/api/test/test-cookie-helper.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const origin='http://localhost:5173',secret='t26-isolated-cookie-secret-at-least-32-chars';
type Fixture={server:string;ws:string;close:()=>Promise<{containersRemoved:boolean;networkRemoved:boolean}>};
jest.setTimeout(60000);
describe('T26 native HTTP/PostgreSQL call admission',()=>{
 let app:INestApplication,pool:pg.Pool,base:string,game:{id:string;title:string},created=false,sfu:RoomServiceClient,fixture:Fixture;
 const owned=`t30_reg_admission_${randomUUID().replaceAll('-','')}`,saved={...process.env},cookies:Record<string,string>={};
 const actors=['owner','outsider',...Array.from({length:11},(_,i)=>`viewer-${i}`)];
 beforeAll(async()=>{
  const env=parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8')),connection=new URL(env.DATABASE_URL!);
  connection.searchParams.set('options',`-c search_path=${owned}`);
  pool=new pg.Pool({connectionString:connection.href,max:20,connectionTimeoutMillis:5000,statement_timeout:15000});
  await pool.query(`CREATE SCHEMA "${owned}"`);created=true;
  await migrate(drizzle(pool),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:owned});
  await tables.seedGames(drizzle(pool,{schema:tables}));game=(await pool.query("SELECT id,title FROM games WHERE title='Valorant'")).rows[0];
  for(const id of actors){
   await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())',[id,`${id}@fixture.invalid`]);
   await pool.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$1)',[id]);
   await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$1,$2)',[id,game.id]);
   cookies[id]=await createSignedSessionCookie(secret,`tok-${id}`);
  }
  const helper=await import(pathToFileURL(path.join(root,'quality/evidence/T30/private-gateway-regression-linux-reviewed1.mjs')).href) as {startGatewayFixture:(input:{databaseURL:string;key:string;secret:string;origin:string})=>Promise<Fixture>};
  fixture=await helper.startGatewayFixture({databaseURL:connection.href,key:env.LIVEKIT_API_KEY!,secret:env.LIVEKIT_API_SECRET!,origin});
  Object.assign(process.env,env,{DATABASE_URL:connection.href,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:secret,LIVEKIT_SERVER_URL:fixture.server,LIVEKIT_ADMISSION_URL:fixture.ws});
  sfu=new RoomServiceClient(process.env.LIVEKIT_SERVER_URL!,env.LIVEKIT_API_KEY!,env.LIVEKIT_API_SECRET!);
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});await app.listen(0,'127.0.0.1');base=await app.getUrl();
 });
 afterAll(async()=>{
  try{await cleanupSfu();await app?.close();if(fixture){const cleanup=await fixture.close();expect(cleanup.containersRemoved).toBe(true);expect(cleanup.networkRemoved).toBe(true);}if(created){expect(owned).toMatch(/^t30_reg_admission_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA "${owned}" CASCADE`);expect((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[owned])).rowCount).toBe(0);}}
  finally{await pool?.end();process.env=saved;}
 });
 beforeEach(async()=>{
  await cleanupSfu();
  await pool.query('DELETE FROM notification_outbox;DELETE FROM notifications;DELETE FROM invitations;DELETE FROM active_play_slots;DELETE FROM join_requests;DELETE FROM recruitments;DELETE FROM team_members;DELETE FROM play_sessions;DELETE FROM rooms;DELETE FROM admin_actions;DELETE FROM session');
  await pool.query("DELETE FROM conversations WHERE kind='ROOM'");
  for(const id of actors)await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[`sess-${id}`,id,`tok-${id}`]);
 });
 async function cleanupSfu(){if(!sfu||!created)return;for(const room of await sfu.listRooms())try{await sfu.deleteRoom(room.name);}catch(error){if((await sfu.listRooms([room.name])).length)throw error;}}
 const post=(url:string,user='owner',body:object={})=>request(base).post('/api/v1/'+url).set('Cookie',cookies[user]).set('Origin',origin).send(body);
 const get=(url:string,user='owner')=>request(base).get('/api/v1/'+url).set('Cookie',cookies[user]);
 async function room(){
  const res=await post('rooms','owner',{name:'T26 private call',gameId:game.id,gameTitle:game.title,visibility:'PRIVATE',invitePolicy:'OWNER_APPROVAL',playerCapacity:1});
  expect(res.status).toBe(200);const r=RoomSchema.parse(res.body);
  for(const actor of actors.filter(id=>id.startsWith('viewer-'))){
   await pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,'MEMBER')",[randomUUID(),r.id,actor]);
   await pool.query('INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3)',[randomUUID(),r.conversationId,actor]);
  }
  return r;
 }
 async function call(roomId:string,user='owner'){
  const res=await post(`rooms/${roomId}/calls`,user);expect(res.status).toBe(201);return CallGroupSchema.parse(res.body);
 }
 it('creates multiple member-only groups in one persistent room with independent capacities',async()=>{
  const r=await room(),a=await call(r.id),b=await call(r.id,'viewer-0');expect(a.id).not.toBe(b.id);
  expect(a.participantCount).toBe(0);expect(b.participantCount).toBe(0);
  const listed=await get(`rooms/${r.id}/calls`,'viewer-1');expect(listed.status).toBe(200);expect(listed.body.map((c:{id:string})=>c.id).sort()).toEqual([a.id,b.id].sort());
  expect((await get(`rooms/${r.id}/calls`,'outsider')).status).toBe(403);
 });
 it('eleven simultaneous spectators allocate exactly ten real seats and zero playing slots',async()=>{
  const r=await room(),c=await call(r.id);
  const results=await Promise.all(actors.filter(id=>id.startsWith('viewer-')).map(id=>post(`calls/${c.id}/join`,id)));
  expect(results.filter(x=>x.status===201)).toHaveLength(10);expect(results.filter(x=>x.status===409)).toHaveLength(1);
  expect(results.find(x=>x.status===409)?.body.code).toBe('CAPACITY_FULL');
  const seats=(await pool.query('SELECT seat_index,user_id FROM call_members WHERE call_group_id=$1 AND left_at IS NULL',[c.id])).rows;
  expect(seats).toHaveLength(10);expect(new Set(seats.map(s=>s.seat_index)).size).toBe(10);
  expect(Number((await pool.query('SELECT count(*) AS n FROM active_play_slots')).rows[0].n)).toBe(0);
  expect(Number((await pool.query('SELECT count(*) AS n FROM team_members')).rows[0].n)).toBe(0);
 });
 it('same-user concurrent refresh is idempotent and cannot occupy two different calls',async()=>{
  const r=await room(),a=await call(r.id),b=await call(r.id);
  const joins=await Promise.all([post(`calls/${a.id}/join`,'viewer-0'),post(`calls/${a.id}/join`,'viewer-0')]);
  expect(joins.map(x=>x.status)).toEqual([201,201]);expect((await pool.query('SELECT id FROM call_members WHERE user_id=$1 AND left_at IS NULL',['viewer-0'])).rowCount).toBe(1);
  expect((await post(`calls/${b.id}/join`,'viewer-0')).status).toBe(409);
 });
 it('competing joins in different groups permit only one call per user',async()=>{
  const r=await room(),a=await call(r.id),b=await call(r.id);
  const joins=await Promise.all([post(`calls/${a.id}/join`,'viewer-0'),post(`calls/${b.id}/join`,'viewer-0')]);
  expect(joins.map(x=>x.status).sort()).toEqual([201,409]);expect((await pool.query('SELECT id FROM call_members WHERE user_id=$1 AND left_at IS NULL',['viewer-0'])).rowCount).toBe(1);
 });
 it('guest and outsider cannot obtain tokens; an unaccepted ROOM invitation grants no access',async()=>{
  const r=await room(),c=await call(r.id);
  expect((await request(base).post(`/api/v1/calls/${c.id}/join`).set('Origin',origin).send({})).status).toBe(401);
  const invited=await post('invitations','owner',{targetType:'ROOM',roomId:r.id,receiverId:'outsider'});expect(invited.status).toBe(201);expect(invited.body.status).toBe('PENDING');
  const denied=await post(`calls/${c.id}/join`,'outsider');expect(denied.status).toBe(403);expect(denied.body.token).toBeUndefined();
  expect((await pool.query('SELECT id FROM call_members WHERE user_id=$1',['outsider'])).rowCount).toBe(0);
 });
 it('membership revoked after a grant never refreshes or creates a new token',async()=>{
  const r=await room(),c=await call(r.id);expect((await post(`calls/${c.id}/join`,'viewer-0')).status).toBe(201);
  await pool.query('DELETE FROM room_members WHERE room_id=$1 AND user_id=$2',[r.id,'viewer-0']);
  const denied=await post(`calls/${c.id}/join`,'viewer-0');expect(denied.status).toBe(403);expect(denied.body.token).toBeUndefined();
 });
 it('logout and bans invalidate token issuance even for an already reserved user',async()=>{
  const r=await room(),c=await call(r.id);expect((await post(`calls/${c.id}/join`,'viewer-0')).status).toBe(201);
  await pool.query('DELETE FROM session WHERE user_id=$1',['viewer-0']);expect((await post(`calls/${c.id}/join`,'viewer-0')).status).toBe(401);
  await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action) VALUES($1,'owner','viewer-1','BAN')",[randomUUID()]);
  expect((await post(`calls/${c.id}/join`,'viewer-1')).status).toBe(403);
 });
 it('tokens bind only the admitted identity/room, expire shortly and do not enable camera or screen publication',async()=>{
  const r=await room(),c=await call(r.id),response=await post(`calls/${c.id}/join`,'viewer-0');expect(response.status).toBe(201);
  const joined=CallJoinSchema.parse(response.body),claims=await new TokenVerifier(process.env.LIVEKIT_API_KEY!,process.env.LIVEKIT_API_SECRET!).verify(joined.token);
  expect(joined.callId).toBe(c.id);expect(claims.video?.room).toBe(joined.roomName);expect(claims.video?.roomJoin).toBe(true);
  expect(claims.video?.roomAdmin).not.toBe(true);expect(claims.video?.roomCreate).not.toBe(true);
  expect(claims.video?.canPublishSources).toEqual(['microphone']);expect(claims.video?.canPublishData).toBe(false);
  expect(claims.exp!-claims.nbf!).toBeLessThanOrEqual(60);expect(claims.exp!-claims.nbf!).toBeGreaterThan(0);
 });
 it('caller-supplied identity or capacity does not bypass authorization or the ten-person limit',async()=>{
  const r=await room(),c=await call(r.id);
  const res=await post(`calls/${c.id}/join`,'viewer-0',{userId:'owner',capacity:100,role:'OWNER'});expect(res.status).toBe(422);
  expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1',[c.id])).rowCount).toBe(0);
  expect((await request(base).post(`/api/v1/calls/${c.id}/join`).set('Cookie',cookies['viewer-0']).set('Origin','https://foreign.invalid').send({})).status).toBe(403);
 });
 it('explicit leave releases only a call seat, allowing a different group without deleting room membership',async()=>{
  const r=await room(),a=await call(r.id),b=await call(r.id);expect((await post(`calls/${a.id}/join`,'viewer-0')).status).toBe(201);
  const left=await post(`calls/${a.id}/leave`,'viewer-0');expect(left.status).toBe(201);expect(left.body).toEqual({success:true});
  expect((await post(`calls/${b.id}/join`,'viewer-0')).status).toBe(201);
  expect((await pool.query('SELECT id FROM room_members WHERE room_id=$1 AND user_id=$2',[r.id,'viewer-0'])).rowCount).toBe(1);
  expect((await pool.query('SELECT id FROM rooms WHERE id=$1',[r.id])).rowCount).toBe(1);
 });
 it('uses an opaque session-bound identity and gives a new identity after leaving',async()=>{
  const r=await room(),c=await call(r.id),verify=new TokenVerifier(process.env.LIVEKIT_API_KEY!,process.env.LIVEKIT_API_SECRET!);
  const first=await post(`calls/${c.id}/join`,'viewer-0');expect(first.status).toBe(201);
  const claims=await verify.verify(first.body.token);expect(claims.sub).not.toBe('viewer-0');expect(claims.sub).toMatch(/^admission_/);
  const lease=(await pool.query('SELECT a.*,m.user_id FROM call_admissions a JOIN call_members m ON m.id=a.call_member_id WHERE a.id=$1',[claims.sub])).rows[0];
  expect(lease.user_id).toBe('viewer-0');expect(lease.session_id).toBe('sess-viewer-0');expect(lease.revoked_at).toBeNull();
  expect(first.body.sfuUrl).toBe(process.env.LIVEKIT_ADMISSION_URL);expect(first.body.sfuUrl).not.toBe(process.env.LIVEKIT_URL);
  expect((await post(`calls/${c.id}/leave`,'viewer-0')).status).toBe(201);
  // Leave must not revive the old opaque lease in a fresh call.
  const next=await call(r.id),second=await post(`calls/${next.id}/join`,'viewer-0');expect(second.status).toBe(201);
  expect((await verify.verify(second.body.token)).sub).not.toBe(claims.sub);
  expect((await pool.query('SELECT revoked_at FROM call_admissions WHERE id=$1',[claims.sub])).rows[0].revoked_at).not.toBeNull();
 });
 it('expires unconnected reservations before allocating the last available seat',async()=>{
  const r=await room(),c=await call(r.id);
  for(let i=0;i<10;i++)expect((await post(`calls/${c.id}/join`,`viewer-${i}`)).status).toBe(201);
  await pool.query("UPDATE call_admissions SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE call_member_id IN(SELECT id FROM call_members WHERE user_id='viewer-0')");
  const admitted=await post(`calls/${c.id}/join`,'viewer-10');expect(admitted.status).toBe(201);
  expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1 AND left_at IS NULL',[c.id])).rowCount).toBe(10);
  expect((await pool.query("SELECT left_at FROM call_members WHERE call_group_id=$1 AND user_id='viewer-0'",[c.id])).rows[0].left_at).not.toBeNull();
 });
 it('creates the actual SFU room with a server-side maximum of ten',async()=>{
  const r=await room(),c=await call(r.id),rooms=await sfu.listRooms([`fg-call_${c.id}`]);
  expect(rooms).toHaveLength(1);expect(rooms[0].maxParticipants).toBe(10);
 });
});
