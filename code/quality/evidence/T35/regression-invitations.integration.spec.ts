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
import {InvitationSchema,RecruitmentSchema,RoomSchema,RoomSettingsSchema,RoomMemberSchema} from '@fg/contracts';
import {AppModule} from '../../../apps/api/src/app.module.js';
import {createSignedSessionCookie} from '../../../apps/api/test/test-cookie-helper.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const origin='http://localhost:5173',secret='t23-owned-test-secret-at-least-32-chars';
jest.setTimeout(60000);

describe('T23 real invitation consent and delegated permissions',()=>{
 let app:INestApplication,pool:pg.Pool,base:string,game:{id:string;title:string},schemaCreated=false;
 const owned=`t23_invites_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
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
    if(!/^t23_invites_[0-9]+_[a-z0-9]+$/.test(owned))throw Error('Unsafe fixture cleanup');
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
 const post=(url:string,user='recipient',body:object={})=>request(base).post(`/api/v1/${url}`).set('Cookie',cookies[user]).set('Origin',origin).send(body);
 const patch=(url:string,user:string,body:object)=>request(base).patch(`/api/v1/${url}`).set('Cookie',cookies[user]).set('Origin',origin).send(body);
 const get=(url:string,user='recipient')=>request(base).get(`/api/v1/${url}`).set('Cookie',cookies[user]);
 const put=(url:string,user:string,body:object)=>request(base).put(`/api/v1/${url}`).set('Cookie',cookies[user]).set('Origin',origin).send(body);
 async function room(owner='owner-a',policy='OWNER_APPROVAL',visibility='PRIVATE'){
  const response=await post('rooms',owner,{name:'Phòng lời mời',gameId:game.id,gameTitle:game.title,invitePolicy:policy,visibility,playerCapacity:3});
  expect(response.status).toBe(200);return RoomSchema.parse(response.body);
 }
 async function addMember(roomId:string,userId='member',role='MEMBER'){
  await pool.query('INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,$4)',[`${roomId}-${userId}`,roomId,userId,role]);
  await pool.query('INSERT INTO conversation_members(id,conversation_id,user_id) SELECT $1,conversation_id,$2 FROM rooms WHERE id=$3',[`${roomId}-${userId}`,userId,roomId]);
 }
 async function team(owner='owner-a',capacity=3,scheduled=false){
  const response=await post('recruitments',owner,{gameId:game.id,gameTitle:game.title,title:'Đội mời',mode:'ranked',playerCapacity:capacity,timingType:scheduled?'scheduledAt':'now',...(scheduled?{scheduledAt:'2099-10-07T13:30:00Z'}:{})});
  expect(response.status).toBe(201);const card=RecruitmentSchema.parse(response.body);
  const playSessionId=(await pool.query('SELECT play_session_id FROM recruitments WHERE id=$1',[card.id])).rows[0].play_session_id as string;
  return {...card,playSessionId};
 }
 async function invite(roomId:string,sender='owner-a',receiver='recipient',playSessionId?:string){
  const response=await post('invitations',sender,{targetType:playSessionId?'PLAY_SESSION':'ROOM',roomId,receiverId:receiver,...(playSessionId?{playSessionId}:{})});
  expect(response.status).toBe(201);return InvitationSchema.parse(response.body);
 }
 const respond=(id:string,user='recipient',action='ACCEPT')=>patch(`invitations/${id}/respond`,user,{action});
 const approve=(id:string,user='owner-a',action='ACCEPT')=>post(`invitations/${id}/approve`,user,{invitationId:id,action});
 const membership=async(roomId:string,user='recipient')=>(await pool.query('SELECT id FROM room_members WHERE room_id=$1 AND user_id=$2',[roomId,user])).rowCount;
 const status=async(id:string)=>(await pool.query('SELECT status FROM invitations WHERE id=$1',[id])).rows[0].status as string;

 it('persists recipient consent before owner approval and exposes only the authorized queue',async()=>{
  const r=await room();await addMember(r.id);const i=await invite(r.id,'member');
  expect((await approve(i.id)).status).toBe(409);expect(await membership(r.id)).toBe(0);
  const consent=await respond(i.id);expect(consent.status).toBe(200);expect(consent.body.status).toBe('PENDING');
  expect(consent.body.recipientAcceptedAt).toEqual(expect.any(String));expect(await membership(r.id)).toBe(0);
  const queue=await get('invitations/me','owner-a');expect(queue.status).toBe(200);expect(queue.body.map((x:{id:string})=>x.id)).toContain(i.id);
  expect((await get('invitations/me','outsider')).body).toEqual([]);
  expect((await approve(i.id)).status).toBe(201);expect(await status(i.id)).toBe('ACCEPTED');expect(await membership(r.id)).toBe(1);
  expect((await pool.query("SELECT * FROM active_play_slots WHERE user_id='recipient'")).rowCount).toBe(0);
 });
 it('owner invitation still needs recipient consent; rejection adds no membership',async()=>{
  const r=await room(),i=await invite(r.id);
  expect(await membership(r.id)).toBe(0);expect((await approve(i.id)).status).toBe(409);
  expect((await respond(i.id,'outsider')).status).toBe(403);
  expect((await respond(i.id,'recipient','REJECT')).status).toBe(200);
  expect(await status(i.id)).toBe('REJECTED');expect(await membership(r.id)).toBe(0);
  expect((await approve(i.id)).status).toBe(409);
 });
 it('DIRECT_MEMBER ROOM consent grants room and chat membership without occupying a team slot',async()=>{
  const r=await room('owner-a','DIRECT_MEMBER');await addMember(r.id);const i=await invite(r.id,'member');
  expect(await membership(r.id)).toBe(0);const accepted=await respond(i.id);expect(accepted.status).toBe(200);expect(accepted.body.status).toBe('ACCEPTED');
  expect(await membership(r.id)).toBe(1);expect((await pool.query('SELECT id FROM conversation_members WHERE conversation_id=$1 AND user_id=$2',[r.conversationId,'recipient'])).rowCount).toBe(1);
  expect((await pool.query("SELECT * FROM team_members WHERE user_id='recipient'")).rowCount).toBe(0);
  expect((await pool.query("SELECT * FROM active_play_slots WHERE user_id='recipient'")).rowCount).toBe(0);
 });
 it('rechecks current policy at response and prevents helper settings changes',async()=>{
  const r=await room('owner-a','DIRECT_MEMBER');await addMember(r.id);await addMember(r.id,'helper','HELPER');const i=await invite(r.id,'member');
  expect((await patch(`rooms/${r.id}/settings`,'helper',{invitePolicy:'DIRECT_MEMBER'})).status).toBe(403);
  expect((await patch(`rooms/${r.id}/settings`,'owner-a',{invitePolicy:'OWNER_APPROVAL'})).status).toBe(200);
  expect((await respond(i.id)).body.status).toBe('PENDING');expect(await membership(r.id)).toBe(0);
  expect((await patch(`rooms/${r.id}/settings`,'owner-a',{invitePolicy:'DIRECT_MEMBER'})).status).toBe(200);
  expect((await respond(i.id)).body.status).toBe('ACCEPTED');expect(await membership(r.id)).toBe(1);
 });
 it('private targets require current sender membership and matching room/session; forged consent is rejected',async()=>{
  const r=await room(),t=await team();
  expect((await post('invitations','outsider',{targetType:'ROOM',roomId:r.id,receiverId:'recipient'})).status).toBe(403);
  expect((await post('invitations','owner-a',{targetType:'PLAY_SESSION',roomId:r.id,playSessionId:t.playSessionId,receiverId:'recipient'})).status).toBe(422);
  expect((await post('invitations','owner-a',{targetType:'ROOM',roomId:r.id,receiverId:'recipient',recipientAcceptedAt:new Date().toISOString()})).status).toBe(422);
  expect((await post('invitations','owner-a',{targetType:'ROOM',roomId:r.id,receiverId:'owner-a'})).status).toBe(422);
 });
 it('direct PLAY_SESSION accepts racing across two teams create exactly one active slot',async()=>{
  const a=await team(),b=await team('owner-b');const x=await invite(a.roomId,'owner-a','recipient',a.playSessionId),y=await invite(b.roomId,'owner-b','recipient',b.playSessionId);
  const results=await Promise.all([respond(x.id),respond(y.id)]);expect(results.map(x=>x.status).sort()).toEqual([200,409]);
  expect((await pool.query("SELECT * FROM active_play_slots WHERE user_id='recipient'")).rowCount).toBe(1);
  expect([await status(x.id),await status(y.id)].sort()).toEqual(['ACCEPTED','PENDING']);
 });
 it('last roster seat is atomic for two invitation recipients',async()=>{
  const t=await team('owner-a',2),a=await invite(t.roomId,'owner-a','recipient',t.playSessionId),b=await invite(t.roomId,'owner-a','second',t.playSessionId);
  const results=await Promise.all([respond(a.id),respond(b.id,'second')]);expect(results.map(x=>x.status).sort()).toEqual([200,409]);
  expect((await pool.query('SELECT * FROM team_members WHERE play_session_id=$1',[t.playSessionId])).rowCount).toBe(2);
  expect([await status(a.id),await status(b.id)].sort()).toEqual(['ACCEPTED','PENDING']);
 });
 it('room capacity50 is distinct from roster capacity and two recipients cannot take the last room seat',async()=>{
  const r=await room('owner-a','DIRECT_MEMBER');
  for(let n=0;n<48;n++){
   const id=`filler-${r.id}-${n}`;await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())',[id,`${id}@example.test`]);
   await addMember(r.id,id);
  }
  const a=await invite(r.id),b=await invite(r.id,'owner-a','second');
  const results=await Promise.all([respond(a.id),respond(b.id,'second')]);expect(results.map(x=>x.status).sort()).toEqual([200,409]);
  expect((await pool.query('SELECT * FROM room_members WHERE room_id=$1',[r.id])).rowCount).toBe(50);
  expect([await status(a.id),await status(b.id)].sort()).toEqual(['ACCEPTED','PENDING']);
 });
 it('scheduled invitation reserves roster only and preserves pending immediate join requests',async()=>{
  const scheduled=await team('owner-a',3,true),now=await team('owner-b');
  const pending=await post(`recruitments/${now.id}/requests`);expect(pending.status).toBe(201);
  const i=await invite(scheduled.roomId,'owner-a','recipient',scheduled.playSessionId);expect((await respond(i.id)).status).toBe(200);
  expect((await pool.query('SELECT id FROM team_members WHERE play_session_id=$1 AND user_id=$2',[scheduled.playSessionId,'recipient'])).rowCount).toBe(1);
  expect((await pool.query("SELECT * FROM active_play_slots WHERE user_id='recipient'")).rowCount).toBe(0);
  expect((await pool.query('SELECT status FROM join_requests WHERE id=$1',[pending.body.id])).rows[0].status).toBe('PENDING');
 });
 it('only matching delegated permissions can approve each invitation target',async()=>{
  const t=await team();await addMember(t.roomId,'member');await addMember(t.roomId,'helper','HELPER');
  await pool.query("INSERT INTO permission_grants(id,room_id,user_id,permission,granted_by) VALUES($1,$2,'helper','MANAGE_CALLS','owner-a')",[`${t.roomId}-calls`,t.roomId]);
  const i=await invite(t.roomId,'member','recipient',t.playSessionId);expect((await respond(i.id)).body.status).toBe('PENDING');
  expect((await approve(i.id,'helper')).status).toBe(403);
  const grants=await put(`rooms/${t.roomId}/helpers/helper`,'owner-a',{permissions:['MANAGE_RECRUITMENT']});expect(grants.status).toBe(200);RoomMemberSchema.parse(grants.body);
  expect((await approve(i.id,'helper')).status).toBe(201);
  const r=await room();await addMember(r.id);await addMember(r.id,'helper','HELPER');const j=await invite(r.id,'member');expect((await respond(j.id)).body.status).toBe('PENDING');
  expect((await approve(j.id,'helper')).status).toBe(403);
  expect((await put(`rooms/${r.id}/helpers/helper`,'owner-a',{permissions:['MANAGE_MEMBERS']})).status).toBe(200);
  expect((await approve(j.id,'helper')).status).toBe(201);
 });
 it('same consent/approval retries preserve the final outcome without duplicate memberships or outbox',async()=>{
  const r=await room(),i=await invite(r.id);const results=await Promise.all([respond(i.id),respond(i.id)]);
  expect(results.map(x=>x.status)).toEqual([200,200]);expect(results[0].body).toEqual(results[1].body);
  const notifications=(await pool.query('SELECT id FROM notification_outbox')).rowCount;
  expect((await respond(i.id)).body).toEqual(results[0].body);expect((await pool.query('SELECT id FROM notification_outbox')).rowCount).toBe(notifications);
  expect(await membership(r.id)).toBe(1);expect((await respond(i.id,'recipient','REJECT')).status).toBe(409);
 });
 it('outbox failure rolls back recipient status, membership and active slot',async()=>{
  const t=await team(),i=await invite(t.roomId,'owner-a','recipient',t.playSessionId);
  await pool.query("CREATE FUNCTION fail_invite_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned injected outbox failure'; END $$; CREATE TRIGGER fail_invite_outbox BEFORE INSERT ON notification_outbox FOR EACH ROW EXECUTE FUNCTION fail_invite_outbox()");
  try{expect((await respond(i.id)).status).toBe(500);expect(await status(i.id)).toBe('PENDING');expect(await membership(t.roomId)).toBe(0);expect((await pool.query("SELECT * FROM active_play_slots WHERE user_id='recipient'")).rowCount).toBe(0);}
  finally{await pool.query('DROP TRIGGER fail_invite_outbox ON notification_outbox; DROP FUNCTION fail_invite_outbox()');}
 });
 it('settings read and grant replacement require current authorization; owner-only rights cannot be delegated',async()=>{
  const r=await room();await addMember(r.id,'helper','HELPER');
  const settings=await get(`rooms/${r.id}/settings`,'owner-a');expect(settings.status).toBe(200);expect(RoomSettingsSchema.parse(settings.body).invitePolicy).toBe('OWNER_APPROVAL');
  expect((await get(`rooms/${r.id}/settings`,'outsider')).status).toBe(403);
  expect((await put(`rooms/${r.id}/helpers/helper`,'helper',{permissions:['MANAGE_MEMBERS']})).status).toBe(403);
  expect((await put(`rooms/${r.id}/helpers/helper`,'owner-a',{permissions:['OWNER_TRANSFER']})).status).toBe(422);
  expect((await post(`rooms/${r.id}/transfer-owner`,'helper',{newOwnerId:'helper'})).status).toBe(403);
  expect((await request(base).delete(`/api/v1/rooms/${r.id}`).set('Cookie',cookies.helper).set('Origin',origin)).status).toBe(403);
 });
 it('blocks in either direction prevent new invitations and later admission without removing existing members',async()=>{
  const r=await room();
  for(const [blocker,blocked]of [['owner-a','recipient'],['recipient','owner-a']]){
   await pool.query('INSERT INTO blocks(id,blocker_id,blocked_id) VALUES($1,$2,$3)',['block-test',blocker,blocked]);
   expect((await post('invitations','owner-a',{targetType:'ROOM',roomId:r.id,receiverId:'recipient'})).status).toBe(403);
   expect((await pool.query('SELECT id FROM invitations')).rowCount).toBe(0);await pool.query('DELETE FROM blocks');
  }
  const i=await invite(r.id);await pool.query("INSERT INTO blocks(id,blocker_id,blocked_id) VALUES('later-block','recipient','owner-a')");
  expect((await respond(i.id)).status).toBe(403);expect(await status(i.id)).toBe('PENDING');expect(await membership(r.id,'owner-a')).toBe(1);expect(await membership(r.id)).toBe(0);
 });
 it('revoking a helper grant removes its private review queue and prevents approval',async()=>{
  const r=await room();await addMember(r.id);await addMember(r.id,'helper','HELPER');
  expect((await put(`rooms/${r.id}/helpers/helper`,'owner-a',{permissions:['MANAGE_MEMBERS']})).status).toBe(200);
  const i=await invite(r.id,'member');expect((await respond(i.id)).body.status).toBe('PENDING');
  expect((await get('invitations/me','helper')).body.map((x:{id:string})=>x.id)).toContain(i.id);
  expect((await put(`rooms/${r.id}/helpers/helper`,'owner-a',{permissions:[]})).status).toBe(200);
  expect((await get('invitations/me','helper')).body).toEqual([]);expect((await approve(i.id,'helper')).status).toBe(403);expect(await membership(r.id)).toBe(0);
 });
 it('owner transfer uses the current owner rather than auto-admitting from a former owner invitation',async()=>{
  const r=await room();await addMember(r.id,'second');const i=await invite(r.id);
  expect((await post(`rooms/${r.id}/transfer-owner`,'owner-a',{newOwnerId:'second'})).status).toBe(200);
  expect((await respond(i.id)).body.status).toBe('PENDING');expect(await membership(r.id)).toBe(0);
  expect((await approve(i.id)).status).toBe(403);expect((await approve(i.id,'second')).status).toBe(201);
 });
 it('rechecks session expiry after waiting on a locked room without persisting consent',async()=>{
  const r=await room(),i=await invite(r.id),lock=await pool.connect();let released=false;
  try{
   await lock.query('BEGIN');await lock.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[r.id]);
   const pid=(await lock.query('SELECT pg_backend_pid() AS id')).rows[0].id;
   const pending=respond(i.id).then(response=>response);
   let waiting=false;const deadline=Date.now()+10000;
   while(Date.now()<deadline){if((await pool.query('SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rowCount){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
   expect(waiting).toBe(true);await pool.query("UPDATE session SET expires_at=now()-interval '1 minute' WHERE user_id='recipient'");
   await lock.query('COMMIT');released=true;expect((await pending).status).toBe(401);
   expect(await membership(r.id)).toBe(0);expect((await pool.query('SELECT status,recipient_accepted_at FROM invitations WHERE id=$1',[i.id])).rows[0]).toEqual({status:'PENDING',recipient_accepted_at:null});
  }finally{if(!released)await lock.query('ROLLBACK');lock.release();}
 });
 it('revoked sender membership and banned recipient cannot admit through an old invitation',async()=>{
  const r=await room();await addMember(r.id);const i=await invite(r.id,'member');
  await pool.query("DELETE FROM room_members WHERE room_id=$1 AND user_id='member'",[r.id]);
  expect((await respond(i.id)).status).toBe(403);expect(await membership(r.id)).toBe(0);
  const j=await invite(r.id);await pool.query("INSERT INTO admin_actions(id,target_user_id,action,reason,actor_id) VALUES('ban-recipient','recipient','BAN','test','owner-a')");
  expect((await respond(j.id)).status).toBe(403);expect(await status(j.id)).toBe('PENDING');expect(await membership(r.id)).toBe(0);
  expect((await request(base).get('/api/v1/invitations/me')).status).toBe(401);
 });
});
