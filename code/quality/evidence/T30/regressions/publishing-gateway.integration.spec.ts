import 'reflect-metadata';
import {jest} from '@jest/globals';
import {NestFactory} from '@nestjs/core';
import type {INestApplication} from '@nestjs/common';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseEnv} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import request from 'supertest';
import {raw,type Request,type Response} from 'express';
import {chromium,type Page} from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.cache/ms-playwright');
import WebSocket from 'ws';
import {SignalResponse} from '@livekit/protocol';
import {AccessToken,RoomServiceClient,TokenVerifier} from 'livekit-server-sdk';
import * as tables from '@fg/database';
import {AppModule} from '../../../../apps/api/src/app.module.js';
import {CallsService} from '../../../../apps/api/src/modules/calls/calls.service.js';
import {createSignedSessionCookie} from '../../../../apps/api/test/test-cookie-helper.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..'),authSecret='t29-gateway-cookie-key-at-least-32-characters';
let origin='http://localhost:5173';
type Fixture={server:string;ws:string;turnPort:number;close:()=>Promise<{containersRemoved:boolean;networkRemoved:boolean}>};
type BrowserWindow=Window&{LivekitClient:typeof import('livekit-client');room?:import('livekit-client').Room;screen?:MediaStreamTrack;screenRender?:ReturnType<typeof setInterval>};
type Lifecycle={setClock:(fn?:()=>number)=>void;sweep:()=>Promise<void>};
jest.setTimeout(90000);
describe('T29 existing lifecycle plus native screen webhook',()=>{
 let app:INestApplication,pool:pg.Pool,base:string,fixture:Fixture,sfu:RoomServiceClient,game:{id:string;title:string},created=false,dropWebhooks=false;
 const owned=`t30_reg_publishing_gateway_${randomUUID().replaceAll('-','')}`,saved={...process.env},cookies:Record<string,string>={},sockets:WebSocket[]=[];
 const lifecycle=()=>app.get<Lifecycle>('FG_CALL_LIFECYCLE');
 beforeAll(async()=>{
  const env=parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8')),db=new URL(env.DATABASE_URL!);db.searchParams.set('options',`-c search_path=${owned}`);
  pool=new pg.Pool({connectionString:db.href,max:20,connectionTimeoutMillis:5000,statement_timeout:15000});await pool.query(`CREATE SCHEMA "${owned}"`);created=true;
  await migrate(drizzle(pool),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:owned});await tables.seedGames(drizzle(pool,{schema:tables}));game=(await pool.query("SELECT id,title FROM games WHERE title='Valorant'")).rows[0];
  for(const id of ['owner','viewer']){
   await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())',[id,`${id}@fixture.invalid`]);
   await pool.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$1)',[id]);await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$1,$2)',[id,game.id]);cookies[id]=await createSignedSessionCookie(authSecret,`tok-${id}`);
  }
  Object.assign(process.env,env,{DATABASE_URL:db.href,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:authSecret,LIVEKIT_SERVER_URL:'http://127.0.0.1:1',LIVEKIT_ADMISSION_URL:'ws://127.0.0.1:1'});
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false,rawBody:true});
  app.use('/api/media/webhook',raw({type:()=>true,limit:'64kb'}));
  app.getHttpAdapter().get('/__t30_reg_sdk',(_req:Request,res:Response)=>res.type('application/javascript').send(fs.readFileSync(path.join(root,'node_modules/livekit-client/dist/livekit-client.umd.js'))));
  app.getHttpAdapter().get('/__t30_reg_probe',(_req:Request,res:Response)=>res.type('html').send('<!doctype html><meta charset="utf-8"><title>FG — webhook RTC thật</title><style>body{background:#202832;color:#d8e0e8;font:20px system-ui;padding:36px}</style><h1>FG — T29 webhook từ RTC thật</h1><p>Native SDK/SFU · microphone tổng hợp · không dùng camera</p><p id="state">Đang kết nối…</p><script src="/__t30_reg_sdk"></script>'));
  // A network fault fixture acknowledges selected real SFU webhooks without
  // processing them. It does not forge SDK/SFU state or production responses.
  app.use((req:{url:string},res:{status:(code:number)=>{end:()=>void}},next:()=>void)=>{if(dropWebhooks&&req.url==='/api/media/webhook')res.status(204).end();else next();});
  await app.listen(0,'0.0.0.0');base=await app.getUrl();base=base.replace('0.0.0.0','127.0.0.1');
  origin=base;Object.assign(process.env,{PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin});
  const helper=await import(pathToFileURL(path.join(root,'quality/evidence/T30/private-gateway-fixture.mjs')).href) as {startGatewayFixture:(input:{databaseURL:string;key:string;secret:string;origin:string;webhookUrl:string;turnTcp:boolean})=>Promise<Fixture>};
  const webhook=new URL('/api/media/webhook',base);webhook.hostname='host.docker.internal';
  fixture=await helper.startGatewayFixture({databaseURL:db.href,key:env.LIVEKIT_API_KEY!,secret:env.LIVEKIT_API_SECRET!,origin,webhookUrl:webhook.href,turnTcp:true});
  Object.assign(process.env,{LIVEKIT_SERVER_URL:fixture.server,LIVEKIT_ADMISSION_URL:fixture.ws});sfu=new RoomServiceClient(fixture.server,env.LIVEKIT_API_KEY!,env.LIVEKIT_API_SECRET!);
 });
 afterAll(async()=>{
  try{for(const socket of sockets)socket.terminate();await app?.close();if(fixture){const cleanup=await fixture.close();expect(cleanup.containersRemoved).toBe(true);expect(cleanup.networkRemoved).toBe(true);}if(created){expect(owned).toMatch(/^t30_reg_publishing_gateway_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA "${owned}" CASCADE`);expect((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[owned])).rowCount).toBe(0);}}
  finally{await pool?.end();process.env=saved;}
 });
 beforeEach(async()=>{
  dropWebhooks=false;try{lifecycle().setClock();}catch{/* RED: lifecycle provider is not implemented yet. */}
  for(const socket of sockets.splice(0))socket.terminate();for(const room of await sfu.listRooms())try{await sfu.deleteRoom(room.name);}catch(error){if((await sfu.listRooms([room.name])).length)throw error;}
  await pool.query('DELETE FROM rooms;DELETE FROM webhook_events;DELETE FROM session');await pool.query("DELETE FROM conversations WHERE kind='ROOM'");
  for(const id of ['owner','viewer'])await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[`sess-${id}`,id,`tok-${id}`]);
 });
 const post=(route:string,user='owner')=>request(base).post('/api/v1/'+route).set('Cookie',cookies[user]).set('Origin',origin).send({});
 async function roomCall(){
  const room=await request(base).post('/api/v1/rooms').set('Cookie',cookies.owner).set('Origin',origin).send({name:'T27 persistent room',gameId:game.id,gameTitle:game.title,visibility:'PRIVATE',playerCapacity:2});expect(room.status).toBe(200);
  await pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,'viewer','MEMBER')",[randomUUID(),room.body.id]);await pool.query("INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,'viewer')",[randomUUID(),room.body.conversationId]);
  const call=await post(`rooms/${room.body.id}/calls`);expect(call.status).toBe(201);return {room:room.body,call:call.body};
 }
 async function join(callId:string,user='viewer'){const joined=await post(`calls/${callId}/join`,user);expect(joined.status).toBe(201);return joined.body as {callId:string;roomName:string;token:string;sfuUrl:string};}
 async function signal(token:string):Promise<{accepted:boolean;ws:WebSocket;status?:number}>{return new Promise((resolve,reject)=>{
  const url=new URL('/rtc',fixture.ws);url.searchParams.set('access_token',token);url.searchParams.set('protocol','16');url.searchParams.set('sdk','js');url.searchParams.set('version','2.22.3');
  const ws=new WebSocket(url,{headers:{Origin:origin}});sockets.push(ws);const timer=setTimeout(()=>{ws.terminate();reject(Error('Native join timed out'));},10000);
  const finish=(accepted:boolean,status?:number)=>{clearTimeout(timer);resolve({accepted,status,ws});};
  ws.once('unexpected-response',(_r,res)=>{finish(false,res.statusCode);res.resume();});ws.once('error',()=>finish(false));ws.on('message',bytes=>{const msg=SignalResponse.fromBinary(new Uint8Array(bytes as Buffer));if(msg.message.case==='join')finish(true);if(msg.message.case==='leave')finish(false);});
 });}
 async function eventually(run:()=>Promise<boolean>,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){if(await run())return;await new Promise(r=>setTimeout(r,100));}throw Error('Expected actual lifecycle state was not reached');}
 const identity=async(token:string)=>(await new TokenVerifier(process.env.LIVEKIT_API_KEY!,process.env.LIVEKIT_API_SECRET!).verify(token)).sub!;
 async function state(id:string){return (await pool.query('SELECT state FROM call_groups WHERE id=$1',[id])).rows[0]?.state;}
 async function signed(event:object){const raw=JSON.stringify(event),token=new AccessToken(process.env.LIVEKIT_API_KEY!,process.env.LIVEKIT_API_SECRET!,{ttl:60});token.sha256=createHash('sha256').update(raw).digest('base64');return {raw,authorization:await token.toJwt()};}
 async function sendWebhook(event:object){const body=await signed(event);return request(base).post('/api/media/webhook').set('Content-Type','application/webhook+json').set('Authorization',body.authorization).send(body.raw);}
 it('rejects missing signature and altered raw payload without persisting an event',async()=>{
  const event={id:randomUUID(),event:'room_started',createdAt:String(Math.floor(Date.now()/1000)),room:{name:'fg-call_invalid'}},body=await signed(event);
  expect((await request(base).post('/api/media/webhook').set('Content-Type','application/webhook+json').send(body.raw)).status).toBe(401);
  expect((await request(base).post('/api/media/webhook').set('Content-Type','application/webhook+json').set('Authorization',body.authorization).send(body.raw+' ')).status).toBe(401);
  expect((await pool.query('SELECT id FROM webhook_events WHERE event_id=$1',[event.id])).rowCount).toBe(0);
 });
 it('receives genuine signed native participant events and deduplicates parallel deliveries durably',async()=>{
  const {call}=await roomCall(),joined=await join(call.id),browser=await chromium.launch({headless:false,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  const uiStartedAt=new Date().toISOString(),runId='t30-reg-webhook-'+randomUUID().replaceAll('-','');let page:Page|undefined,step=0;const helper=await import(pathToFileURL(path.join(root,'tools/telegram-bridge/demo-stream.mjs')).href);const capture=async(title:string,result:string,status='RUNNING')=>{expect(page).toBeDefined();await page!.bringToFront();await helper.captureUiStep(page!,{task:'T30',runId,step:++step,title,action:'Kiểm webhook ký native SFU và quota screen trên fixture riêng',result,status,startedAt:uiStartedAt,headed:true,privacySafe:true,maskSelectors:[]});};
  try{
   const context=await browser.newContext({permissions:['microphone']});page=await context.newPage();
   // Exact transport mapping from verified T01-FIX3: endpoint only, not grants.
   await page.addInitScript(({port})=>{
    const Native=window.RTCPeerConnection;
    const translate=(config:RTCConfiguration):RTCConfiguration=>({...config,iceServers:(config?.iceServers??[]).filter(s=>[s.urls].flat().some(u=>u.startsWith('turn'))).map(s=>({...s,urls:`turn:127.0.0.1:${port}?transport=tcp`})),iceTransportPolicy:'relay'});
    window.RTCPeerConnection=class extends Native {constructor(config:RTCConfiguration){super(translate(config));}setConfiguration(config:RTCConfiguration){return super.setConfiguration(translate(config));}};
   },{port:fixture.turnPort});
   await page.goto(base+'/__t30_reg_probe');await capture('Bắt đầu native webhook','Browser headed, API/PG/SFU thật riêng; thiết bị tổng hợp.');
   expect(await page.evaluate(async join=>{const w=window as unknown as BrowserWindow;w.room=new w.LivekitClient.Room();await w.room.connect(join.sfuUrl,join.token,{autoSubscribe:true});await w.room.localParticipant.setMicrophoneEnabled(true);document.getElementById('state')!.textContent='WebRTC đã kết nối và phát microphone; đang kiểm webhook có chữ ký.';return w.room.state==='connected';},joined)).toBe(true);
   await eventually(async()=>Number((await pool.query("SELECT count(*) AS n FROM webhook_events WHERE event_type='participant_joined'")).rows[0].n)>0);
   const event={id:randomUUID(),event:'participant_joined',createdAt:String(Math.floor(Date.now()/1000)),room:{name:joined.roomName},participant:{identity:await identity(joined.token)}};
   const results=await Promise.all([sendWebhook(event),sendWebhook(event)]);expect(results.map(r=>r.status)).toEqual([200,200]);expect((await pool.query('SELECT id,payload FROM webhook_events WHERE event_id=$1',[event.id])).rowCount).toBe(1);
   expect((await pool.query('SELECT payload FROM webhook_events WHERE event_id=$1',[event.id])).rows[0].payload).not.toContain(joined.token);
   await capture('Native participant webhook và dedup','Webhook participant_joined ký thật được lưu; duplicate song song chỉ1receipt, payload không chứa token.');
   expect((await post('calls/'+call.id+'/screen-share/claim','viewer')).status).toBe(201);
   await page.waitForFunction(()=>{const w=window as unknown as BrowserWindow;return w.room?.localParticipant.permissions?.canPublishSources.includes(3);});
   await page.evaluate(async()=>{const w=window as unknown as BrowserWindow,canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;canvas.style.width='480px';document.body.appendChild(canvas);const ctx=canvas.getContext('2d')!;w.screen=canvas.captureStream(15).getVideoTracks()[0];let n=0;w.screenRender=setInterval(()=>{ctx.fillStyle=n++%2?'#78aaf2':'#88b9fa';ctx.fillRect(0,0,640,360);ctx.fillStyle='#142034';ctx.font='24px sans-serif';ctx.fillText('FG synthetic webhook frame '+n,20,150);},66);await w.room!.localParticipant.publishTrack(w.screen,{source:w.LivekitClient.Track.Source.ScreenShare});});
   await eventually(async()=>(await sfu.listParticipants(joined.roomName)).some(p=>p.tracks.some(t=>t.source===3)));
   expect((await pool.query('SELECT id FROM call_publish_slots WHERE call_group_id=$1',[call.id])).rowCount).toBe(1);
   await capture('Screen native có RTP và slot thật','SFU có SCREEN_SHARE; API cấp đúng1quota, microphone độc lập.');
   await page.waitForFunction(original=>{const w=window as unknown as BrowserWindow;const engine=(w.room as unknown as {engine:{token?:string}}).engine;return Boolean(engine.token&&engine.token!==original);},joined.token);
   const refreshedToken=await page.evaluate(()=>((window as unknown as BrowserWindow).room as unknown as {engine:{token?:string}}).engine.token);expect(refreshedToken).toBeTruthy();expect(refreshedToken).not.toBe(joined.token);const refreshedClaims=await new TokenVerifier(process.env.LIVEKIT_API_KEY!,process.env.LIVEKIT_API_SECRET!).verify(refreshedToken!);expect(refreshedClaims.sub).toBe(await identity(joined.token));expect(refreshedClaims.exp!).toBeGreaterThan(Date.now()/1000);
   const priorUnpublished=Number((await pool.query("SELECT count(*) AS n FROM webhook_events WHERE event_type='track_unpublished'")).rows[0].n);
   await page.evaluate(async()=>{const w=window as unknown as BrowserWindow;await w.room!.localParticipant.unpublishTrack(w.screen!);w.screen!.stop();clearInterval(w.screenRender);});
   await eventually(async()=>Number((await pool.query("SELECT count(*) AS n FROM webhook_events WHERE event_type='track_unpublished'")).rows[0].n)>priorUnpublished);
   await eventually(async()=>(await pool.query('SELECT id FROM call_publish_slots WHERE call_group_id=$1',[call.id])).rowCount===0);
   expect((await sfu.listParticipants(joined.roomName)).some(p=>p.tracks.some(t=>t.source===2))).toBe(true);
   await capture('Native signed track_unpublished trả quota','Webhook thật được nhận; slot về0, mic vẫn tồn tại trên SFU.');
   expect((await request(base).post('/api/v1/calls/'+call.id+'/moderation').set('Cookie',cookies.owner).set('Origin',origin).send({action:'KICK',targetUserId:'viewer'})).status).toBe(201);
   await page.waitForFunction(()=>(window as unknown as BrowserWindow).room?.state==='disconnected');expect(refreshedClaims.exp!).toBeGreaterThan(Date.now()/1000);
   expect(await page.evaluate(async join=>{const w=window as unknown as BrowserWindow,attempt=new w.LivekitClient.Room();try{await attempt.connect(join.sfuUrl,join.token,{websocketTimeout:5000,peerConnectionTimeout:5000});await attempt.disconnect();return false;}catch{return true;}},{...joined,token:refreshedToken!})).toBe(true);
   expect((await pool.query("SELECT id FROM room_members WHERE room_id=(SELECT room_id FROM call_groups WHERE id=$1) AND user_id='viewer'",[call.id])).rowCount).toBe(1);
   await capture('SFU-refreshed token không bypass kick','Token SDK nhận từ SFU có chữ ký và chưa hết hạn; native kick ngắt peer và chặn reconnect, room membership còn.','SUCCEEDED');
  }catch(error){if(page&&!page.isClosed())await capture('Native webhook assertion thất bại','Run FAILED; giữ log/assertions thật.','FAILED');throw error;}finally{await browser.close();}
 });
 it('unused screen reservation expires after30s without consuming microphone or call seat',async()=>{const {call}=await roomCall(),joined=await join(call.id);expect((await signal(joined.token)).accepted).toBe(true);expect((await post('calls/'+call.id+'/screen-share/claim','viewer')).status).toBe(201);const timestamp=(await pool.query("SELECT created_at AT TIME ZONE 'UTC' AS created_at FROM call_publish_slots WHERE call_group_id=$1",[call.id])).rows[0].created_at as Date;lifecycle().setClock(()=>timestamp.getTime()+29999);await lifecycle().sweep();expect((await pool.query('SELECT id FROM call_publish_slots WHERE call_group_id=$1',[call.id])).rowCount).toBe(1);lifecycle().setClock(()=>timestamp.getTime()+30001);await lifecycle().sweep();expect((await pool.query('SELECT id FROM call_publish_slots WHERE call_group_id=$1',[call.id])).rowCount).toBe(0);expect(await state(call.id)).toBe('OPEN');expect((await sfu.listParticipants(joined.roomName))[0].permission!.canPublishSources).toEqual([2]);lifecycle().setClock();});
 it('last explicit leave closes only the call, preserves room/chat/team and denies closed-call revival',async()=>{
  const {room,call}=await roomCall(),joined=await join(call.id);expect((await signal(joined.token)).accepted).toBe(true);
  const playId=randomUUID();await pool.query("INSERT INTO play_sessions(id,room_id,host_user_id,player_capacity,timing_type,state) VALUES($1,$2,'owner',2,'now','ACTIVE')",[playId,room.id]);
  await pool.query("INSERT INTO team_members(id,play_session_id,user_id,slot_index,player_capacity,is_host) VALUES($1,$2,'owner',1,2,true)",[randomUUID(),playId]);await pool.query("INSERT INTO active_play_slots(user_id,play_session_id,slot_index) VALUES('owner',$1,1)",[playId]);
  expect((await post(`calls/${call.id}/leave`,'viewer')).status).toBe(201);expect(await state(call.id)).toBe('CLOSED');
  expect((await pool.query('SELECT id FROM rooms WHERE id=$1',[room.id])).rowCount).toBe(1);expect((await pool.query('SELECT id FROM conversations WHERE id=$1',[room.conversationId])).rowCount).toBe(1);expect((await pool.query("SELECT id FROM room_members WHERE room_id=$1 AND user_id='viewer'",[room.id])).rowCount).toBe(1);
  expect((await pool.query('SELECT left_at FROM call_members WHERE call_group_id=$1',[call.id])).rows[0].left_at).not.toBeNull();expect((await post(`calls/${call.id}/join`,'viewer')).status).toBe(409);expect((await signal(joined.token)).accepted).toBe(false);
  expect((await pool.query('SELECT state FROM play_sessions WHERE id=$1',[playId])).rows[0].state).toBe('ACTIVE');expect((await pool.query('SELECT id FROM team_members WHERE play_session_id=$1',[playId])).rowCount).toBe(1);expect((await pool.query('SELECT user_id FROM active_play_slots WHERE play_session_id=$1',[playId])).rowCount).toBe(1);
 });
 it('leaving one of two participants keeps the call open',async()=>{
  const {call}=await roomCall();await join(call.id,'owner');await join(call.id,'viewer');expect((await post(`calls/${call.id}/leave`,'viewer')).status).toBe(201);expect(await state(call.id)).toBe('OPEN');
  expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1 AND left_at IS NULL',[call.id])).rowCount).toBe(1);
 });
 it('reconnects before thirty seconds with the same identity and single reserved seat',async()=>{
  const {call}=await roomCall(),joined=await join(call.id),connected=await signal(joined.token),id=await identity(joined.token);expect(connected.accepted).toBe(true);connected.ws.terminate();
  await eventually(async()=>!(await sfu.listParticipants(joined.roomName)).length);
  await lifecycle().sweep();expect(await state(call.id)).toBe('OPEN');
  const again=await join(call.id);expect(await identity(again.token)).toBe(id);expect((await signal(again.token)).accepted).toBe(true);
  await lifecycle().sweep();expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1 AND left_at IS NULL',[call.id])).rowCount).toBe(1);expect((await pool.query('SELECT disconnected_at FROM call_admissions WHERE id=$1',[id])).rows[0].disconnected_at).toBeNull();
 });
 it('lost leave webhook is reconciled, grace expiry closes and old tokens cannot resurrect the group',async()=>{
  const {call}=await roomCall(),joined=await join(call.id),connected=await signal(joined.token),id=await identity(joined.token);expect(connected.accepted).toBe(true);dropWebhooks=true;connected.ws.terminate();
  await eventually(async()=>!(await sfu.listParticipants(joined.roomName)).length);await lifecycle().sweep();
  const disconnected=(await pool.query('SELECT disconnected_at FROM call_admissions WHERE id=$1',[id])).rows[0].disconnected_at;expect(disconnected).not.toBeNull();
  lifecycle().setClock(()=>disconnected.getTime()+29999);await lifecycle().sweep();expect(await state(call.id)).toBe('OPEN');
  lifecycle().setClock(()=>disconnected.getTime()+30001);await lifecycle().sweep();expect(await state(call.id)).toBe('CLOSED');expect((await signal(joined.token)).accepted).toBe(false);expect((await post(`calls/${call.id}/join`,'viewer')).status).toBe(409);
 });
 it('late participant-left or room-finished events do not close a currently reconnected native participant',async()=>{
  const {call}=await roomCall(),joined=await join(call.id);expect((await signal(joined.token)).accepted).toBe(true);
  for(const event of ['participant_left','room_finished'])expect((await sendWebhook({id:randomUUID(),event,createdAt:String(Math.floor(Date.now()/1000)-20),room:{name:joined.roomName},participant:{identity:await identity(joined.token)}})).status).toBe(200);
  expect(await state(call.id)).toBe('OPEN');expect((await pool.query('SELECT disconnected_at FROM call_admissions WHERE id=$1',[await identity(joined.token)])).rows[0].disconnected_at).toBeNull();
 });
 it('cleanup racing a new participant never closes a group containing a valid new seat',async()=>{
  const {call}=await roomCall(),joined=await join(call.id),connected=await signal(joined.token);expect(connected.accepted).toBe(true);connected.ws.terminate();await eventually(async()=>!(await sfu.listParticipants(joined.roomName)).length);
  const id=await identity(joined.token);await lifecycle().sweep();const time=(await pool.query('SELECT disconnected_at FROM call_admissions WHERE id=$1',[id])).rows[0].disconnected_at;lifecycle().setClock(()=>time.getTime()+30001);
  const results=await Promise.all([lifecycle().sweep(),post(`calls/${call.id}/join`,'owner')]);const joinedOther=results[1];
  if(joinedOther.status===201){expect(await state(call.id)).toBe('OPEN');expect((await signal(joinedOther.body.token)).accepted).toBe(true);}else{expect(joinedOther.status).toBe(409);expect(await state(call.id)).toBe('CLOSED');}
  const active=(await pool.query('SELECT count(*) AS n FROM call_members WHERE call_group_id=$1 AND left_at IS NULL',[call.id])).rows[0].n;expect(Number(active)).toBe(joinedOther.status===201?1:0);
 });
 it('releases expired unconnected reservations and never reopens from a late signed join event',async()=>{
  const {call}=await roomCall(),joined=await join(call.id),id=await identity(joined.token);
  await pool.query("UPDATE call_admissions SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id=$1",[id]);await lifecycle().sweep();expect(await state(call.id)).toBe('CLOSED');
  expect((await sendWebhook({id:randomUUID(),event:'participant_joined',createdAt:String(Math.floor(Date.now()/1000)-60),room:{name:joined.roomName},participant:{identity:id}})).status).toBe(200);expect(await state(call.id)).toBe('CLOSED');expect((await signal(joined.token)).accepted).toBe(false);
 });
 it('SFU administration outage cannot discard authorized seats or close their call',async()=>{
  const {call}=await roomCall(),joined=await join(call.id);expect((await signal(joined.token)).accepted).toBe(true);
  const server=process.env.LIVEKIT_SERVER_URL;process.env.LIVEKIT_SERVER_URL='http://127.0.0.1:1';
  try{await expect(lifecycle().sweep()).rejects.toThrow();expect(await state(call.id)).toBe('OPEN');expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1 AND left_at IS NULL',[call.id])).rowCount).toBe(1);}
  finally{process.env.LIVEKIT_SERVER_URL=server;}
 });
 it('retry after durable webhook receipt but failed processing still reconciles the group',async()=>{
  const {call}=await roomCall(),joined=await join(call.id),id=await identity(joined.token),event={id:randomUUID(),event:'participant_left',createdAt:String(Math.floor(Date.now()/1000)),room:{name:joined.roomName},participant:{identity:id}};
  await pool.query("UPDATE call_admissions SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id=$1",[id]);
  const server=process.env.LIVEKIT_SERVER_URL;process.env.LIVEKIT_SERVER_URL='http://127.0.0.1:1';
  try{expect((await sendWebhook(event)).status).toBe(500);expect((await pool.query('SELECT id FROM webhook_events WHERE event_id=$1',[event.id])).rowCount).toBe(1);}
  finally{process.env.LIVEKIT_SERVER_URL=server;}
  const retried=await sendWebhook(event);expect(retried.status).toBe(200);expect(retried.body.duplicate).toBe(true);expect(await state(call.id)).toBe('CLOSED');expect((await pool.query('SELECT id FROM webhook_events WHERE event_id=$1',[event.id])).rowCount).toBe(1);
 });
 it('last native participant removed after membership cascade closes the empty group and keeps its room',async()=>{
  const {room,call}=await roomCall(),joined=await join(call.id);expect((await signal(joined.token)).accepted).toBe(true);dropWebhooks=true;
  await pool.query("DELETE FROM room_members WHERE room_id=$1 AND user_id='viewer'",[room.id]);
  expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1',[call.id])).rowCount).toBe(0);
  await app.get(CallsService).reconcile();await lifecycle().sweep();
  expect(await state(call.id)).toBe('CLOSED');expect((await sfu.listRooms([joined.roomName])).length).toBe(0);
  expect((await pool.query('SELECT id FROM rooms WHERE id=$1',[room.id])).rowCount).toBe(1);expect((await signal(joined.token)).accepted).toBe(false);
 });
 it('native room expiration closes its empty database group while fresh empty groups remain joinable',async()=>{
  const {call}=await roomCall();dropWebhooks=true;await lifecycle().sweep();expect(await state(call.id)).toBe('OPEN');
  await sfu.deleteRoom(`fg-call_${call.id}`);await lifecycle().sweep();expect(await state(call.id)).toBe('CLOSED');
  expect((await post(`calls/${call.id}/join`)).status).toBe(409);
 });
 it('repeated reconciliation of a closed call is idempotent when its native room is already absent',async()=>{
  const {call}=await roomCall();await join(call.id);expect((await post(`calls/${call.id}/leave`,'viewer')).status).toBe(201);
  expect(await state(call.id)).toBe('CLOSED');await expect(lifecycle().sweep()).resolves.toBeUndefined();await expect(lifecycle().sweep()).resolves.toBeUndefined();
  expect((await sfu.listRooms([`fg-call_${call.id}`])).length).toBe(0);
 });
 it('API restart repairs a persisted lost disconnect after grace without reviving the call or deleting its room',async()=>{
  const {room,call}=await roomCall(),joined=await join(call.id),connected=await signal(joined.token),id=await identity(joined.token);expect(connected.accepted).toBe(true);dropWebhooks=true;connected.ws.terminate();
  await eventually(async()=>!(await sfu.listParticipants(joined.roomName)).length);await lifecycle().sweep();
  expect((await pool.query('SELECT disconnected_at FROM call_admissions WHERE id=$1',[id])).rows[0].disconnected_at).not.toBeNull();
  await app.close();await pool.query("UPDATE call_admissions SET disconnected_at=now()-interval '31 seconds' WHERE id=$1",[id]);
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});app.use('/api/media/webhook',raw({type:()=>true,limit:'64kb'}));await app.listen(0,'127.0.0.1');base=await app.getUrl();
  await lifecycle().sweep();expect(await state(call.id)).toBe('CLOSED');expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1 AND left_at IS NULL',[call.id])).rowCount).toBe(0);
  expect((await pool.query('SELECT id FROM rooms WHERE id=$1',[room.id])).rowCount).toBe(1);expect((await signal(joined.token)).accepted).toBe(false);expect((await post(`calls/${call.id}/join`,'viewer')).status).toBe(409);
  expect((await sendWebhook({id:randomUUID(),event:'participant_joined',room:{name:joined.roomName},participant:{identity:id}})).status).toBe(200);expect(await state(call.id)).toBe('CLOSED');
 });
});
