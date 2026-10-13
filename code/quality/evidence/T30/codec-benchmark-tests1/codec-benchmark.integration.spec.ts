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
  const helper=await import(pathToFileURL(path.join(root,'quality/evidence/T30/private-gateway-regression-linux-reviewed1.mjs')).href) as {startGatewayFixture:(input:{databaseURL:string;key:string;secret:string;origin:string;webhookUrl:string;turnTcp:boolean})=>Promise<Fixture>};
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
 for(const codec of ['vp8','h264'] as const)it('measures actual '+codec+' screen encoding through native SFU',async()=>{
  const {call}=await roomCall(),joined=await join(call.id),browser=await chromium.launch({headless:false,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  const uiStartedAt=new Date().toISOString(),runId='t30-codec-'+codec+'-'+randomUUID().replaceAll('-',''),evidence=path.join(root,'quality/evidence/T30',runId);fs.mkdirSync(evidence);let page:Page|undefined,step=0;const helper=await import(pathToFileURL(path.join(root,'tools/telegram-bridge/demo-stream.mjs')).href),encoder=await import(pathToFileURL(path.join(root,'quality/evidence/T30/browser-encoder-observer1.mjs')).href);
  const capture=async(action:string,result:string,status='RUNNING')=>{await page!.bringToFront();await helper.captureUiStep(page!,{task:'T30',runId,step:++step,title:'FG — đo codec '+codec,action,result,status,startedAt:uiStartedAt,headed:true,privacySafe:true,maskSelectors:[]});};
  try{
   const context=await browser.newContext({permissions:['microphone']});page=await context.newPage();await page.addInitScript(({port})=>{const own=window as unknown as {t30Peers:RTCPeerConnection[]};own.t30Peers=[];const Native=window.RTCPeerConnection,translate=(c:RTCConfiguration):RTCConfiguration=>({...c,iceServers:(c?.iceServers??[]).filter(s=>[s.urls].flat().some(u=>u.startsWith('turn'))).map(s=>({...s,urls:`turn:127.0.0.1:${port}?transport=tcp`})),iceTransportPolicy:'relay'});window.RTCPeerConnection=class extends Native{constructor(c:RTCConfiguration){super(translate(c));own.t30Peers.push(this);}setConfiguration(c:RTCConfiguration){super.setConfiguration(translate(c));}};},{port:fixture.turnPort});
   await page.goto(base+'/__t30_reg_probe');await page.evaluate(codec=>{document.title='FG — codec '+codec;document.querySelector('h1')!.textContent='FG — đo codec '+codec;document.querySelector('p')!.textContent='Nguồn canvas tổng hợp 1280×720/30fps · SDK/SFU/TURN thật · chỉ chẩn đoán';},codec);await capture('Bắt đầu đo codec','Cùng nguồn tổng hợp và mức encoding720p30, chưa kết luận hiệu năng.');
   const capability=await page.evaluate(codec=>(RTCRtpSender.getCapabilities('video')?.codecs??[]).some(c=>c.mimeType.toLowerCase()==='video/'+codec),codec);fs.writeFileSync(evidence+'/capability.json',JSON.stringify({at:new Date().toISOString(),codec,supported:capability,diagnosticOnly:true})+'\n');
   if(!capability){await capture('Codec không khả dụng','Trình duyệt không công bố hỗ trợ codec này; không giả encoder/hardware.','SUCCEEDED');return;}
   expect(await page.evaluate(async join=>{const w=window as unknown as BrowserWindow;w.room=new w.LivekitClient.Room({adaptiveStream:true,dynacast:true,singlePeerConnection:false});await w.room.connect(join.sfuUrl,join.token,{autoSubscribe:true});return w.room.state==='connected';},joined)).toBe(true);
   expect((await post('calls/'+call.id+'/screen-share/claim','viewer')).status).toBe(201);await page.waitForFunction(()=>{const w=window as unknown as BrowserWindow;return w.room?.localParticipant.permissions?.canPublishSources.includes(3);});
   await page.evaluate(async codec=>{const w=window as unknown as BrowserWindow,canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;canvas.style.width='960px';canvas.style.maxWidth='90vw';document.body.appendChild(canvas);const ctx=canvas.getContext('2d')!;let n=0;const draw=()=>{ctx.fillStyle='#17334d';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#fff';ctx.font='32px sans-serif';ctx.fillText('FG — nguồn encoder tổng hợp '+codec,40,80);ctx.fillStyle='#7ac09b';ctx.fillRect(40+(n++*7)%600,160,160,160);};draw();w.screen=canvas.captureStream(30).getVideoTracks()[0];w.screenRender=setInterval(draw,1000/30);await w.room!.localParticipant.publishTrack(w.screen,{source:w.LivekitClient.Track.Source.ScreenShare,videoCodec:codec,screenShareEncoding:{...w.LivekitClient.ScreenSharePresets.h720fps30.encoding,priority:'low'}});document.getElementById('state')!.textContent='Đã phát '+codec+'; đang lấy mẫu encoder sau20giây.';},codec);
   await eventually(async()=>(await sfu.listParticipants(joined.roomName)).some(p=>p.tracks.some(t=>t.source===3)));expect((await pool.query('SELECT id FROM call_publish_slots WHERE call_group_id=$1',[call.id])).rowCount).toBe(1);
   const windows=new Map([['viewer',{page}]]);await page.waitForTimeout(1000);await encoder.captureEncoderStats(windows,evidence,'share');await capture('Bắt đầu cửa sổ đo','SFU có track SCREEN_SHARE và một slot thật.');await page.waitForTimeout(20000);await encoder.captureEncoderStats(windows,evidence,'complete');
   const samples=fs.readFileSync(evidence+'/browser-encoder-observation.jsonl','utf8').trim().split('\n').map(x=>JSON.parse(x));expect(samples.every(x=>!x.failure)).toBe(true);expect(samples.at(-1).rows.some((r:{mimeType:string;framesEncoded:number})=>r.mimeType.toLowerCase()==='video/'+codec&&r.framesEncoded>100)).toBe(true);await capture('Đã đo encoder thật','Lưu codec/frames/thời gian encode/hardware flag; chưa là nghiệm thu ứng dụng FG.');
   await page.evaluate(async()=>{const w=window as unknown as BrowserWindow;await w.room!.localParticipant.unpublishTrack(w.screen!);w.screen!.stop();clearInterval(w.screenRender);await w.room!.disconnect();document.getElementById('state')!.textContent='Đã dừng track và ngắt kết nối.';});await capture('Kết thúc đo codec','Track đã dừng, room SDK đã ngắt; tài nguyên fixture sẽ được dọn.','SUCCEEDED');
  }catch(error){if(page&&!page.isClosed())await capture('Lỗi đo codec','Giữ bằng chứng lỗi; không suy ra codec đạt.','FAILED');throw error;}finally{await browser.close();}
 });
});
