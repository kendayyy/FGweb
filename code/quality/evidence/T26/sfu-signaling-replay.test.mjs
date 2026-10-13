import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {SignalResponse} from '@livekit/protocol';
import {AccessToken,RoomServiceClient} from 'livekit-server-sdk';
const env=parseEnv(fs.readFileSync('.env.local','utf8')),url=new URL(env.LIVEKIT_URL),httpUrl=new URL(url);httpUrl.protocol=url.protocol==='wss:'?'https:':'http:';
const service=new RoomServiceClient(httpUrl.href,env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET),room=`t26_signal_${randomUUID()}`,identity=randomUUID();
const sockets=[],report={recordedAt:new Date().toISOString(),transport:'native SFU signaling; no WebRTC or audible media claim',initialJoinAccepted:false,removed:false,removedCount:null,originalTokenReplayAccepted:false,ownedRoomRemoved:false};
const dir='quality/evidence/T26/signaling-replay';fs.mkdirSync(dir,{recursive:true});
function join(token){return new Promise((resolve,reject)=>{
 const target=new URL('/rtc',url);target.searchParams.set('access_token',token);target.searchParams.set('protocol','16');target.searchParams.set('auto_subscribe','0');target.searchParams.set('sdk','js');target.searchParams.set('version','2.22.3');
 const ws=new WebSocket(target);sockets.push(ws);const timer=setTimeout(()=>{ws.terminate();reject(Error('SFU signaling timeout'));},10000);
 const settle=(accepted,detail)=>{clearTimeout(timer);resolve({accepted,detail});};
 ws.once('unexpected-response',(_req,res)=>{settle(false,`HTTP ${res.statusCode}`);res.resume();});
 ws.once('error',()=>{settle(false,'Connection rejected');});
 ws.on('message',(bytes)=>{const message=SignalResponse.fromBinary(new Uint8Array(bytes));if(message.message.case==='join')settle(true,'Native JoinResponse');if(message.message.case==='leave')settle(false,'Native LeaveResponse');});
 });}
let created=false;
try{
 const configured=await service.createRoom({name:room,maxParticipants:10,emptyTimeout:60,departureTimeout:60});created=true;assert.equal(configured.maxParticipants,10);
 const at=new AccessToken(env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET,{identity,ttl:60});at.addGrant({roomJoin:true,room,canPublish:false,canSubscribe:true,canPublishData:false});const token=await at.toJwt();
 const initial=await join(token);assert.equal(initial.accepted,true);report.initialJoinAccepted=true;
 assert.equal((await service.listParticipants(room)).filter(p=>p.identity===identity).length,1);
 await service.removeParticipant(room,identity);report.removed=true;report.removedCount=(await service.listParticipants(room)).length;assert.equal(report.removedCount,0);
 const replay=await join(token);report.originalTokenReplayAccepted=replay.accepted;report.replayDetail=replay.detail;report.replayCount=(await service.listParticipants(room)).length;
 console.log(JSON.stringify(report));
 assert.equal(replay.accepted,false,'Original short-lived token was accepted by self-hosted SFU after RemoveParticipant');
}finally{
 for(const ws of sockets)ws.terminate();
 if(created){await service.deleteRoom(room);report.ownedRoomRemoved=(await service.listRooms([room])).length===0;}
 fs.writeFileSync(`${dir}/result.json`,JSON.stringify(report,null,2)+'\n');
}
