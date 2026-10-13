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
import WebSocket from 'ws';
import {SignalResponse} from '@livekit/protocol';
import {AccessToken,RoomServiceClient,TokenVerifier,TrackSource} from 'livekit-server-sdk';
import * as tables from '@fg/database';
import {AppModule} from '../../../../apps/api/src/app.module.js';
import {CallsService} from '../../../../apps/api/src/modules/calls/calls.service.js';
import {createSignedSessionCookie} from '../../../../apps/api/test/test-cookie-helper.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..'),origin='http://localhost:5173',authSecret='t26-gateway-isolated-cookie-secret-at-least-32';
type Fixture={server:string;ws:string;close:()=>Promise<{containersRemoved:boolean;networkRemoved:boolean}>;result:{privateSignaling:boolean}};
jest.setTimeout(90000);
describe('T26 private native SFU gateway authorization',()=>{
 let app:INestApplication,pool:pg.Pool,base:string,fixture:Fixture,sfu:RoomServiceClient,game:{id:string;title:string},created=false;
 const owned=`t30_reg_gateway_${randomUUID().replaceAll('-','')}`,saved={...process.env},cookies:Record<string,string>={},sockets:WebSocket[]=[];
 beforeAll(async()=>{
  const env=parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8')),db=new URL(env.DATABASE_URL!);db.searchParams.set('options',`-c search_path=${owned}`);
  pool=new pg.Pool({connectionString:db.href,max:20,connectionTimeoutMillis:5000,statement_timeout:10000});await pool.query(`CREATE SCHEMA "${owned}"`);created=true;
  await migrate(drizzle(pool),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:owned});await tables.seedGames(drizzle(pool,{schema:tables}));game=(await pool.query("SELECT id,title FROM games WHERE title='Valorant'")).rows[0];
  for(const id of ['owner','viewer','outsider']){
   await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())',[id,`${id}@fixture.invalid`]);
   await pool.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$1)',[id]);await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$1,$2)',[id,game.id]);cookies[id]=await createSignedSessionCookie(authSecret,`tok-${id}`);
  }
  const helper=await import(pathToFileURL(path.join(root,'quality/evidence/T30/private-gateway-fixture.mjs')).href) as {startGatewayFixture:(input:{databaseURL:string;key:string;secret:string;origin:string})=>Promise<Fixture>};
  fixture=await helper.startGatewayFixture({databaseURL:db.href,key:env.LIVEKIT_API_KEY!,secret:env.LIVEKIT_API_SECRET!,origin});
  Object.assign(process.env,env,{DATABASE_URL:db.href,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:authSecret,LIVEKIT_SERVER_URL:fixture.server,LIVEKIT_ADMISSION_URL:fixture.ws});
  sfu=new RoomServiceClient(fixture.server,env.LIVEKIT_API_KEY!,env.LIVEKIT_API_SECRET!);
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});await app.listen(0,'127.0.0.1');base=await app.getUrl();
 });
 afterAll(async()=>{
  try{for(const ws of sockets)ws.terminate();await app?.close();if(fixture){const cleanup=await fixture.close();expect(cleanup.containersRemoved).toBe(true);expect(cleanup.networkRemoved).toBe(true);}if(created){expect(owned).toMatch(/^t30_reg_gateway_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA "${owned}" CASCADE`);expect((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[owned])).rowCount).toBe(0);}}
  finally{await pool?.end();process.env=saved;}
 });
 beforeEach(async()=>{
  for(const ws of sockets.splice(0))ws.terminate();for(const room of await sfu.listRooms())try{await sfu.deleteRoom(room.name);}catch(error){if((await sfu.listRooms([room.name])).length)throw error;}
  await pool.query('DELETE FROM rooms;DELETE FROM admin_actions;DELETE FROM session');await pool.query("DELETE FROM conversations WHERE kind='ROOM'");
  for(const id of ['owner','viewer','outsider'])await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[`sess-${id}`,id,`tok-${id}`]);
 });
 const post=(url:string,user='owner')=>request(base).post('/api/v1/'+url).set('Cookie',cookies[user]).set('Origin',origin).send({});
 async function admitted(){
  const room=await request(base).post('/api/v1/rooms').set('Cookie',cookies.owner).set('Origin',origin).send({name:'T26 gateway private',gameId:game.id,gameTitle:game.title,visibility:'PRIVATE',playerCapacity:1});expect(room.status).toBe(200);
  await pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,'viewer','MEMBER')",[randomUUID(),room.body.id]);await pool.query("INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,'viewer')",[randomUUID(),room.body.conversationId]);
  const call=await post(`rooms/${room.body.id}/calls`);expect(call.status).toBe(201);const join=await post(`calls/${call.body.id}/join`,'viewer');expect(join.status).toBe(201);return {room:room.body,call:call.body,join:join.body};
 }
 async function signal(token:string,headerOrigin=origin):Promise<{accepted:boolean;status?:number;ws:WebSocket;refreshTokens:string[]}>{return new Promise((resolve,reject)=>{
  const url=new URL('/rtc',fixture.ws);url.searchParams.set('access_token',token);url.searchParams.set('protocol','16');url.searchParams.set('sdk','js');url.searchParams.set('version','2.22.3');url.searchParams.set('auto_subscribe','0');
  const ws=new WebSocket(url,{headers:{Origin:headerOrigin}}),refreshTokens:string[]=[];sockets.push(ws);
  const timer=setTimeout(()=>{ws.terminate();reject(Error('Native gateway JoinResponse timeout'));},10000);
  const finish=(accepted:boolean,status?:number)=>{clearTimeout(timer);resolve({accepted,status,ws,refreshTokens});};
  ws.once('unexpected-response',(_req,res)=>{finish(false,res.statusCode);res.resume();});ws.once('error',()=>finish(false));
  ws.on('message',bytes=>{const msg=SignalResponse.fromBinary(new Uint8Array(bytes as Buffer));if(msg.message.case==='join')finish(true);if(msg.message.case==='refreshToken')refreshTokens.push(msg.message.value);if(msg.message.case==='leave')finish(false);});
 });}
 async function validate(token:string){const url=new URL('/rtc/validate',fixture.server);url.searchParams.set('access_token',token);return fetch(url,{headers:{Origin:origin},signal:AbortSignal.timeout(5000)});}
 async function participants(roomName:string){try{return await sfu.listParticipants(roomName);}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='not_found')return [];throw error;}}
 async function eventually(run:()=>Promise<boolean>,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){if(await run())return;await new Promise(r=>setTimeout(r,100));}throw Error('Native state did not reach expected authorization result');}
 it('reaches a real private SFU and returns native JoinResponse with no public signal bypass',async()=>{
  const {join}=await admitted();expect(fixture.result.privateSignaling).toBe(true);expect((await validate(join.token)).status).toBe(200);const connected=await signal(join.token);expect(connected.accepted).toBe(true);
  expect((await participants(join.roomName)).map(p=>p.identity)).toHaveLength(1);
  const lease=(await pool.query('SELECT connected_at,expires_at FROM call_admissions')).rows[0];expect(lease.connected_at).not.toBeNull();expect(lease.expires_at.getTime()).toBeGreaterThan(Date.now()+60000);
 });
 it('native logout revokes the original unexpired token and removes the connected participant',async()=>{
  const {join}=await admitted();expect((await signal(join.token)).accepted).toBe(true);
  const logout=await request(base).post('/api/auth/sign-out').set('Cookie',cookies.viewer).set('Origin',origin).send({});expect(logout.status).toBe(200);
  expect((await participants(join.roomName)).length).toBe(0);
  expect((await new TokenVerifier(process.env.LIVEKIT_API_KEY!,process.env.LIVEKIT_API_SECRET!).verify(join.token)).exp!>Date.now()/1000).toBe(true);
  expect((await signal(join.token)).status).toBe(403);await eventually(async()=>!(await participants(join.roomName)).length);
  expect((await pool.query("SELECT id FROM session WHERE user_id='viewer'")).rowCount).toBe(0);
 });
 it('native room removal revokes an existing participant and replay without deleting the room',async()=>{
  const {room,join}=await admitted();expect((await signal(join.token)).accepted).toBe(true);
  const removed=await request(base).delete(`/api/v1/rooms/${room.id}/members/viewer`).set('Cookie',cookies.owner).set('Origin',origin);expect(removed.status).toBe(200);
  expect((await participants(join.roomName)).length).toBe(0);
  expect((await signal(join.token)).status).toBe(403);await eventually(async()=>!(await participants(join.roomName)).length);expect((await pool.query('SELECT id FROM rooms WHERE id=$1',[room.id])).rowCount).toBe(1);
 });
 it('bans deny before SFU handshake and permanently invalidate the old lease even after unban',async()=>{
  const {join}=await admitted();expect((await signal(join.token)).accepted).toBe(true);
  await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action) VALUES($1,'owner','viewer','BAN')",[randomUUID()]);expect((await signal(join.token)).status).toBe(403);
  await eventually(async()=>!(await participants(join.roomName)).length);
  await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action,created_at) VALUES($1,'owner','viewer','UNBAN',now()+interval '1 second')",[randomUUID()]);expect((await validate(join.token)).status).toBe(403);
 });
 it('accepts a native SFU-refreshed token while authorized and rejects it after revocation',async()=>{
  const {join}=await admitted(),connected=await signal(join.token);expect(connected.accepted).toBe(true);
  const identity=(await new TokenVerifier(process.env.LIVEKIT_API_KEY!,process.env.LIVEKIT_API_SECRET!).verify(join.token)).sub!;
  await sfu.updateParticipant(join.roomName,identity,{permission:{canPublish:true,canSubscribe:true,canPublishData:false,canPublishSources:[TrackSource.MICROPHONE]}});
  await eventually(async()=>connected.refreshTokens.length>0,10000);const refreshed=connected.refreshTokens.at(-1)!;
  const claims=await new TokenVerifier(process.env.LIVEKIT_API_KEY!,process.env.LIVEKIT_API_SECRET!).verify(refreshed);expect(claims.sub).toBe(identity);expect((await validate(refreshed)).status).toBe(200);
  expect((await post(`calls/${join.callId}/leave`,'viewer')).status).toBe(201);expect((await signal(refreshed)).status).toBe(403);
 });
 it('new admission never revives the previous opaque token',async()=>{
  const {room,call,join}=await admitted();expect((await post(`calls/${call.id}/leave`,'viewer')).status).toBe(201);expect((await post(`calls/${call.id}/join`,'viewer')).status).toBe(409);
  const next=await post(`rooms/${room.id}/calls`);expect(next.status).toBe(201);const second=await post(`calls/${next.body.id}/join`,'viewer');expect(second.status).toBe(201);
  expect(second.body.token).not.toBe(join.token);expect((await signal(join.token)).status).toBe(403);expect((await signal(second.body.token)).accepted).toBe(true);
 });
 it('rejects validly signed outsider identities, expired tokens, invalid signatures and foreign origins',async()=>{
  const {join}=await admitted(),outsider=new AccessToken(process.env.LIVEKIT_API_KEY!,process.env.LIVEKIT_API_SECRET!,{identity:'outsider',ttl:60});outsider.addGrant({roomJoin:true,room:join.roomName,canPublish:false,canSubscribe:true});
  expect((await signal(await outsider.toJwt())).status).toBe(403);expect((await signal(join.token,'https://foreign.invalid')).status).toBe(403);expect((await signal('invalid.signature.token')).status).toBe(401);
  const expired=new AccessToken(process.env.LIVEKIT_API_KEY!,process.env.LIVEKIT_API_SECRET!,{identity:'expired',ttl:-1});expired.addGrant({roomJoin:true,room:join.roomName});expect((await signal(await expired.toJwt())).status).toBe(401);
 });
 it('never permits a media token to use SFU administration APIs',async()=>{
  const {join}=await admitted();const res=await fetch(fixture.server+'/twirp/livekit.RoomService/CreateRoom',{method:'POST',headers:{Authorization:`Bearer ${join.token}`,'Content-Type':'application/json'},body:JSON.stringify({name:'unauthorized'})});expect(res.status).toBe(403);
 });
 it('fails closed during a database outage before permitting SFU traffic',async()=>{
  const {join}=await admitted();await pool.query('ALTER TABLE session RENAME TO session_temporarily_unavailable');
  try{expect((await validate(join.token)).status).toBe(503);expect((await signal(join.token)).status).toBe(503);expect((await participants(join.roomName)).length).toBe(0);}
  finally{await pool.query('ALTER TABLE session_temporarily_unavailable RENAME TO session');}
 });
 it('two independent revokers race safely without reporting a failed room operation',async()=>{
  const {room,join}=await admitted();expect((await signal(join.token)).accepted).toBe(true);
  await pool.query("DELETE FROM room_members WHERE room_id=$1 AND user_id='viewer'",[room.id]);
  const calls=app.get(CallsService);
  await expect(Promise.all([calls.reconcile(),calls.reconcile()])).resolves.toEqual([undefined,undefined]);
  expect((await participants(join.roomName)).length).toBe(0);
 });
 it('the bound native session must belong to the admitted member',async()=>{
  const {join}=await admitted();await pool.query("UPDATE call_admissions SET session_id='sess-owner'");
  expect((await validate(join.token)).status).toBe(403);expect((await signal(join.token)).status).toBe(403);
 });
 it('server expiry denies an otherwise unexpired signed token and never resurrects the lease',async()=>{
  const {join}=await admitted();await pool.query("UPDATE call_admissions SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute'");
  expect((await validate(join.token)).status).toBe(403);await pool.query("UPDATE call_admissions SET expires_at=now()+interval '1 day'");
  expect((await signal(join.token)).status).toBe(403);
 });
 it('self-leave and owner dissolve remove active SFU participants before returning',async()=>{
  const first=await admitted();expect((await signal(first.join.token)).accepted).toBe(true);
  const left=await request(base).delete(`/api/v1/rooms/${first.room.id}/members/viewer`).set('Cookie',cookies.viewer).set('Origin',origin);expect(left.status).toBe(200);expect((await participants(first.join.roomName)).length).toBe(0);
  const second=await admitted();expect((await signal(second.join.token)).accepted).toBe(true);
  const dissolved=await request(base).delete(`/api/v1/rooms/${second.room.id}`).set('Cookie',cookies.owner).set('Origin',origin);expect(dissolved.status).toBe(200);expect((await participants(second.join.roomName)).length).toBe(0);
  expect((await signal(second.join.token)).status).toBe(403);
 });
});
