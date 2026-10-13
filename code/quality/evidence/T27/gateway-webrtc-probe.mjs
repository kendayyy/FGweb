/* global window,document */
import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {NestFactory} from '@nestjs/core';
import {makeSignature} from 'better-auth/crypto';
import {RoomServiceClient,TokenVerifier} from 'livekit-server-sdk';
import {chromium} from '@playwright/test';
import * as tables from '@fg/database';
import {AppModule} from '../../../apps/api/dist/app.module.js';
import {startGatewayFixture} from './private-gateway-fixture.mjs';
const env=parseEnv(fs.readFileSync('.env.local','utf8')),owned=`t27_rtc_${randomUUID().replaceAll('-','')}`,dir=process.argv[2]??'quality/evidence/T27/gateway-rtc';
assert(dir.startsWith('quality/evidence/T27/'));fs.mkdirSync(dir,{recursive:true});
const db=new URL(env.DATABASE_URL);db.searchParams.set('options',`-c search_path=${owned}`);
const pool=new pg.Pool({connectionString:db.href,max:20,connectionTimeoutMillis:5000,statement_timeout:10000}),authSecret='t26-headless-false-probe-cookie-key-at-least-32';
const report={recordedAt:new Date().toISOString(),headed:true,privateSfuSignaling:true,localTransport:'Native embedded TURN via loopback TCP; test-only RTC endpoint translation',senderConnected:false,receiverConnected:false,nativeAudioTrack:false,inboundAudioBytes:0,reconnectSameIdentity:false,reconnectSingleSeat:false,revokedDisconnected:false,replayBlocked:false,newAdmissionConnected:false,webRTCVerified:false,audibleQualityVerified:false,productionTurnTlsVerified:false,ownedSchemaRemoved:false,containersRemoved:false};
let app,fixture,browser,sfu,created=false,base,origin,sender,receiver;
const display=createServer((req,res)=>{
 if(req.url==='/sdk.js'){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync('node_modules/livekit-client/dist/livekit-client.umd.js'));return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>FG — T26 WebRTC thật</title><style>body{background:#202832;color:#d8e0e8;font:20px system-ui;padding:36px}pre{white-space:pre-wrap}</style><h1>FG — kiểm tra gateway và WebRTC</h1><p>SFU riêng · RTP qua TURN TCP local · thiết bị âm thanh tổng hợp chỉ kiểm transport</p><pre id="status">Đang chuẩn bị kết nối thật…</pre><script src="/sdk.js"></script>');
});
await new Promise(r=>display.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${display.address().port}`;
const cookies={};
async function post(route,user,body={}){const res=await fetch(base+'/api/v1/'+route,{method:'POST',headers:{Cookie:cookies[user],Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});assert([200,201].includes(res.status),`Native API ${route.split('/')[0]} returned ${res.status}`);return res.json();}
async function pageFor(label){
 const context=await browser.newContext({viewport:{width:1000,height:650},permissions:['microphone']}),page=await context.newPage();
 await page.addInitScript(({turnPort})=>{
  // Translate only the local fixture's external-TLS TURN advertisement. Preserve
  // native per-participant TURN credentials and native DTLS/SRTP negotiation.
  // No production SDK/configuration is patched, and no signaling grant is changed.
  const Native=window.RTCPeerConnection;window.probePeers=[];
  const translate=config=>({...config,iceServers:(config?.iceServers??[]).filter(s=>[s.urls].flat().some(u=>u.startsWith('turn'))).map(s=>({...s,urls:`turn:127.0.0.1:${turnPort}?transport=tcp`})),iceTransportPolicy:'relay'});
  window.RTCPeerConnection=class extends Native {constructor(config){super(translate(config));window.probePeers.push(this);}setConfiguration(config){return super.setConfiguration(translate(config));}};
 },{turnPort:fixture.turnPort});
 page.on('console',msg=>{let text=msg.text();for(const value of [env.LIVEKIT_API_SECRET,env.DATABASE_URL,db.href])text=text.replaceAll(value,'[REDACTED]');text=text.replace(/(?:access_token|join_request)=[^\s"&]+/g,'private_parameter=[REDACTED]').replace(/\beyJ[A-Za-z0-9_.-]+\b/g,'[JWT REDACTED]');fs.appendFileSync(`${dir}/browser-sanitized.txt`,`${msg.type()}: ${text}\n`);});
 await page.goto(origin);await page.evaluate(label=>{document.querySelector('#status').textContent=label;window.LivekitClient.setLogLevel('debug');},label);return page;
}
try{
 await pool.query(`CREATE SCHEMA "${owned}"`);created=true;await migrate(drizzle(pool),{migrationsFolder:'packages/database/migrations',migrationsSchema:owned});await tables.seedGames(drizzle(pool,{schema:tables}));const game=(await pool.query("SELECT id,title FROM games WHERE title='Valorant'")).rows[0];
 for(const id of ['sender','receiver']){
  const token=`t26-rtc-${id}-${randomUUID()}`;cookies[id]=`better-auth.session_token=${token}.${await makeSignature(token,authSecret)}`;
  await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())',[id,`${id}@fixture.invalid`]);await pool.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$1)',[id]);await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$1,$2)',[id,game.id]);await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$1,$2,now()+interval '1 day',now(),now())",[id,token]);
 }
 fixture=await startGatewayFixture({databaseURL:db.href,key:env.LIVEKIT_API_KEY,secret:env.LIVEKIT_API_SECRET,origin,turnTcp:true});assert(fixture.turnPort>0);
 Object.assign(process.env,env,{DATABASE_URL:db.href,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:authSecret,LIVEKIT_SERVER_URL:fixture.server,LIVEKIT_ADMISSION_URL:fixture.ws});
 sfu=new RoomServiceClient(fixture.server,env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET);app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});await app.listen(0,'127.0.0.1');base=await app.getUrl();
 const room=await post('rooms','sender',{name:'T26 real RTC private',gameId:game.id,gameTitle:game.title,visibility:'PRIVATE',playerCapacity:1});
 await pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,'receiver','MEMBER')",[randomUUID(),room.id]);await pool.query("INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,'receiver')",[randomUUID(),room.conversationId]);
 const call=await post(`rooms/${room.id}/calls`,'sender');
 process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.cache/ms-playwright');browser=await chromium.launch({headless:false,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 sender=await pageFor('Người gửi: đang nối WebRTC thật qua gateway…');receiver=await pageFor('Người nhận: chờ audio track thực tế…');
 const admitted=await post(`calls/${call.id}/join`,'sender');
 report.senderConnected=await sender.evaluate(async join=>{window.room=new window.LivekitClient.Room();window.states=[];window.room.on(window.LivekitClient.RoomEvent.ConnectionStateChanged,state=>window.states.push(state));window.room.on(window.LivekitClient.RoomEvent.Disconnected,reason=>window.disconnectReason=reason);await window.room.connect(join.sfuUrl,join.token,{autoSubscribe:true,websocketTimeout:10000,peerConnectionTimeout:15000});window.stateBeforeMic=window.room.state;window.offerAnswers=[];const pub=window.room.engine.pcManager.publisher;const nativeAnswer=pub.setRemoteDescription.bind(pub);pub.setRemoteDescription=async(sd,id)=>{window.offerAnswers.push({offerId:id,latestOfferId:pub.latestOfferId});return nativeAnswer(sd,id);};document.querySelector('#status').textContent='Người gửi: WebRTC đã kết nối. Đang publish microphone của thiết bị tổng hợp.';await window.room.localParticipant.setMicrophoneEnabled(true);return window.room.state==='connected';},admitted);assert(report.senderConnected);
 const joinedReceiver=await post(`calls/${call.id}/join`,'receiver');
 report.receiverConnected=await receiver.evaluate(async join=>{window.room=new window.LivekitClient.Room();window.audioTracks=0;window.room.on(window.LivekitClient.RoomEvent.TrackSubscribed,track=>{if(track.kind==='audio')window.audioTracks++;});await window.room.connect(join.sfuUrl,join.token,{autoSubscribe:true,websocketTimeout:10000,peerConnectionTimeout:15000});document.querySelector('#status').textContent='Người nhận: WebRTC đã kết nối, đang kiểm audio RTP.';return window.room.state==='connected';},joinedReceiver);assert(report.receiverConnected);
 await receiver.waitForFunction(()=>window.audioTracks>0,null,{timeout:15000});
 const participants=await sfu.listParticipants(admitted.roomName);report.nativeAudioTrack=participants.some(p=>p.tracks.some(t=>t.type===0));assert(report.nativeAudioTrack);
 await receiver.waitForFunction(async()=>{let bytes=0;for(const pc of window.probePeers){const stats=await pc.getStats();stats.forEach(s=>{if(s.type==='inbound-rtp'&&s.kind==='audio')bytes+=s.bytesReceived??0;});}return bytes>0;},null,{timeout:15000});
 report.inboundAudioBytes=await receiver.evaluate(async()=>{let bytes=0;for(const pc of window.probePeers){const stats=await pc.getStats();stats.forEach(s=>{if(s.type==='inbound-rtp'&&s.kind==='audio')bytes+=s.bytesReceived??0;});}return bytes;});assert(report.inboundAudioBytes>0);
 const previousIdentity=(await new TokenVerifier(env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET).verify(joinedReceiver.token)).sub;
 await receiver.evaluate(()=>window.room.disconnect());
 await app.get('FG_CALL_LIFECYCLE').sweep();
 const reconnect=await post(`calls/${call.id}/join`,'receiver');
 report.reconnectSameIdentity=(await new TokenVerifier(env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET).verify(reconnect.token)).sub===previousIdentity;assert(report.reconnectSameIdentity);
 await receiver.evaluate(async join=>{window.room=new window.LivekitClient.Room();await window.room.connect(join.sfuUrl,join.token,{autoSubscribe:true});document.querySelector('#status').textContent='Đã nối lại trong grace30s, giữ identity và một chỗ trong cuộc gọi.';},reconnect);
 report.reconnectSingleSeat=Number((await pool.query("SELECT count(*) AS n FROM call_members WHERE user_id='receiver' AND left_at IS NULL")).rows[0].n)===1;assert(report.reconnectSingleSeat);
 await post(`calls/${call.id}/leave`,'sender');await sender.waitForFunction(()=>window.room.state==='disconnected',null,{timeout:15000});report.revokedDisconnected=true;
 assert((await new TokenVerifier(env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET).verify(admitted.token)).exp>Date.now()/1000,'Replay must occur before original JWT expires');
 report.replayBlocked=await sender.evaluate(async join=>{const r=new window.LivekitClient.Room();try{await r.connect(join.sfuUrl,join.token,{autoSubscribe:true,websocketTimeout:10000,peerConnectionTimeout:10000});await r.disconnect();return false;}catch{return true;}},admitted);assert(report.replayBlocked);
 const fresh=await post(`calls/${call.id}/join`,'sender');report.newAdmissionConnected=await sender.evaluate(async join=>{window.room=new window.LivekitClient.Room();await window.room.connect(join.sfuUrl,join.token,{websocketTimeout:10000,peerConnectionTimeout:15000});return window.room.state==='connected';},fresh);assert(report.newAdmissionConnected);
 report.webRTCVerified=true;
 for(const [page,name]of [[sender,'sender'],[receiver,'receiver']]){await page.evaluate(report=>{document.querySelector('#status').textContent=JSON.stringify(report,null,2);},report);await page.screenshot({path:`${dir}/${name}.png`});}
 report.playSlots=Number((await pool.query('SELECT count(*) AS n FROM active_play_slots')).rows[0].n);assert.equal(report.playSlots,0);
 console.log(JSON.stringify({headed:true,privateSfuSignaling:true,webRTCVerified:true,inboundAudioBytes:report.inboundAudioBytes,replayBlocked:true,newAdmissionConnected:true,audibleQualityVerified:false,productionTurnTlsVerified:false}));
}catch(error){report.failure={name:error.name,message:String(error.message).replaceAll(env.LIVEKIT_API_SECRET,'[REDACTED]').replaceAll(env.DATABASE_URL,'[REDACTED]')};throw error;}
finally{
 try{
  if(fixture)fs.writeFileSync(`${dir}/containers-sanitized.txt`,fixture.diagnostics());
  if(created)report.leaseDiagnostics=(await pool.query('SELECT a.connected_at,a.disconnected_at,a.expires_at,a.revoked_at,m.left_at FROM call_admissions a JOIN call_members m ON m.id=a.call_member_id')).rows;
  if(sender)report.peerDiagnostics=await sender.evaluate(async()=>({offerAnswers:window.offerAnswers,stateBeforeMic:window.stateBeforeMic,state:window.room?.state,states:window.states,disconnectReason:window.disconnectReason,peers:await Promise.all(window.probePeers.map(async pc=>{const entries=[];(await pc.getStats()).forEach(s=>{if(['candidate-pair','local-candidate','remote-candidate','inbound-rtp','outbound-rtp'].includes(s.type))entries.push({type:s.type,state:s.state,nominated:s.nominated,protocol:s.protocol,relayProtocol:s.relayProtocol,candidateType:s.candidateType,address:s.address,port:s.port,kind:s.kind,bytesSent:s.bytesSent,bytesReceived:s.bytesReceived});});return {connectionState:pc.connectionState,iceState:pc.iceConnectionState,entries};}))}));
 }catch{report.diagnosticsIncomplete=true;}
 try{await browser?.close();await app?.close();if(fixture){const cleanup=await fixture.close();report.containersRemoved=cleanup.containersRemoved&&cleanup.networkRemoved;}if(created){assert(/^t27_rtc_[a-f0-9]{32}$/.test(owned));await pool.query(`DROP SCHEMA "${owned}" CASCADE`);report.ownedSchemaRemoved=(await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[owned])).rowCount===0;}}
 finally{await pool.end();await new Promise(r=>display.close(r));fs.writeFileSync(`${dir}/result.json`,JSON.stringify(report,null,2)+'\n');}
}
