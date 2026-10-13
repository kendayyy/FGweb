/* global window, document */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {AccessToken,RoomServiceClient} from 'livekit-server-sdk';
import {chromium} from '@playwright/test';
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const isolated=process.argv.includes('--isolated'),state=process.env.FG_T26_SFU_STATE??'.runtime/t26/isolated-sfu.json',url=new URL(isolated?JSON.parse(fs.readFileSync(state)).url:env.LIVEKIT_URL),apiUrl=new URL(url);apiUrl.protocol=url.protocol==='wss:'?'https:':'http:';
const client=new RoomServiceClient(apiUrl.href,env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET);
const room=`t26_probe_${randomUUID()}`,identity=randomUUID(),dir=process.env.FG_T26_PROBE_DIR??(isolated?'quality/evidence/T26/sfu-probe-isolated':'quality/evidence/T26/sfu-probe');
fs.mkdirSync(dir,{recursive:true});
const server=http.createServer((req,res)=>{
 if(req.url==='/sdk.js'){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync('node_modules/livekit-client/dist/livekit-client.umd.js'));return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>FG — T26 SFU thật</title><style>body{background:#202832;color:#d8e0e8;font:20px system-ui;padding:40px}pre{white-space:pre-wrap}</style><h1>FG — kiểm tra thu hồi token LiveKit</h1><pre id="status">Đang kết nối SFU thực tế…</pre><script src="/sdk.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.cache/ms-playwright');
let browser,page,created=false;
const evidence={recordedAt:new Date().toISOString(),headed:true,isolated,serverImage:'livekit/livekit-server:v1.8.4',initialConnected:false,removed:false,removedCount:null,originalTokenReplayConnected:false,replayCount:null,expectedReplayBlocked:true};
try{
 const configured=await client.createRoom({name:room,maxParticipants:10,emptyTimeout:120,departureTimeout:120});created=true;assert.equal(configured.maxParticipants,10);
 const at=new AccessToken(env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET,{identity,ttl:60});
 at.addGrant({roomJoin:true,room,canSubscribe:true,canPublish:false,canPublishData:false});
 const token=await at.toJwt();
 browser=await chromium.launch({headless:false,args:process.argv.includes('--no-mdns')?['--disable-features=WebRtcHideLocalIpsWithMdns']:[]});page=await browser.newPage({viewport:{width:1000,height:650}});
 await page.addInitScript(({tcpOnly})=>{
  window.probePeers=[];window.probeCandidates=[];const Native=window.RTCPeerConnection;
  const capture=(direction,c)=>{const parts=c.split(' ');if(parts.length>=8)window.probeCandidates.push({direction,protocol:parts[2],address:parts[4],port:parts[5],type:parts[7]});};
  window.RTCPeerConnection=class extends Native{
   constructor(...args){super(...args);window.probePeers.push(this);this.addEventListener('icecandidate',e=>{if(e.candidate)capture('local',e.candidate.candidate);});}
   addIceCandidate(c,...args){if(c?.candidate){capture('remote',c.candidate);if(tcpOnly&&c.candidate.split(' ')[2].toLowerCase()==='udp')return Promise.resolve();}return super.addIceCandidate(c,...args);}
   setRemoteDescription(d,...args){d.sdp?.split('\r\n').filter(l=>l.startsWith('a=candidate:')).forEach(l=>capture('remote',l.slice(2)));if(tcpOnly)d={...d,sdp:d.sdp?.split('\r\n').filter(l=>!l.startsWith('a=candidate:')||l.split(' ')[2].toLowerCase()!=='udp').join('\r\n')};return super.setRemoteDescription(d,...args);}
  };
 },{tcpOnly:process.argv.includes('--tcp-only')});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 // Tokens stay in memory and are never placed in URLs, screenshots or console.
 evidence.initialConnected=await page.evaluate(async ({sfu,token})=>{
  const r=new window.LivekitClient.Room();window.probeRoom=r;
  await r.connect(sfu,token,{autoSubscribe:false,websocketTimeout:15000,peerConnectionTimeout:15000});
  document.querySelector('#status').textContent='Đã kết nối SFU bằng token ngắn hạn. Đang kiểm tra RemoveParticipant…';return r.state==='connected';
 },{sfu:url.href,token});
 assert.equal(evidence.initialConnected,true);
 const initial=await client.listParticipants(room);assert.equal(initial.filter(p=>p.identity===identity).length,1);
 await client.removeParticipant(room,identity);evidence.removed=true;
 await page.waitForFunction(()=>window.probeRoom.state==='disconnected',{timeout:15000});
 evidence.removedCount=(await client.listParticipants(room)).length;assert.equal(evidence.removedCount,0);
 const replay=await page.evaluate(async ({sfu,token})=>{
  const r=new window.LivekitClient.Room();window.probeRoom=r;
  try{await r.connect(sfu,token,{autoSubscribe:false,websocketTimeout:15000,peerConnectionTimeout:15000});return {connected:r.state==='connected'};}catch{return {connected:false};}
 },{sfu:url.href,token});
 evidence.originalTokenReplayConnected=replay.connected;evidence.replayCount=(await client.listParticipants(room)).length;
 evidence.platformRequirementPass=!replay.connected;
 await page.evaluate(result=>{document.querySelector('#status').textContent=JSON.stringify(result,null,2);},evidence);
 await page.screenshot({path:`${dir}/replay.png`});
 console.log(JSON.stringify(evidence));
 assert.equal(evidence.originalTokenReplayConnected,false,'Self-hosted SFU accepted the original token after removal; direct tokens do not meet FG replay/revoke requirements');
}finally{
 if(page)try{
  evidence.signaledCandidates=await page.evaluate(()=>window.probeCandidates);
  evidence.iceDiagnostics=await page.evaluate(async()=>Promise.all(window.probePeers.map(async p=>{
   const stats=await p.getStats(),candidates=[];
   stats.forEach(s=>{if(['local-candidate','remote-candidate','candidate-pair'].includes(s.type))candidates.push({type:s.type,candidateType:s.candidateType,address:s.address,port:s.port,protocol:s.protocol,state:s.state,nominated:s.nominated});});
   return {state:p.connectionState,iceState:p.iceConnectionState,candidates};
  })));
 }catch{evidence.diagnosticsUnavailable=true;}
 try{await browser?.close();}finally{
  try{if(created){await client.deleteRoom(room);evidence.ownedRoomRemoved=(await client.listRooms([room])).length===0;}}
  finally{await new Promise(resolve=>server.close(resolve));fs.writeFileSync(`${dir}/result.json`,JSON.stringify(evidence,null,2)+'\n');}
 }
}
