import {SignalRequest} from '@livekit/protocol';
const actors=new Set(['sender','receiver','viewer','third','fourth','denied']);
const maxFrames=256,maxBytes=8192,maxSids=16,maxSidLength=64;
// Called only after the original assertion failed. Read and copy, never clear/focus/mutate.
export function pendingFramesSnapshot(){
 const queue=window.t30SubscriptionFrames;
 if(!Array.isArray(queue))return {queuePresent:false,totalCount:0,frames:[]};
 return {queuePresent:true,totalCount:queue.length,frames:queue.slice(0,256).map(f=>({
  at:f?.at,dataLength:Array.isArray(f?.data)?f.data.length:null,
  data:Array.isArray(f?.data)?f.data.slice(0,8192):null
 }))};
}
export function decodePendingFrames(snapshot,actor){
 const frames=[],health={sampleCount:0,decodedCount:0,droppedCount:0,errorCount:0,observationComplete:false};
 const bad=()=>{health.errorCount++;return {frames,health};};
 if(!actors.has(actor)||!snapshot||snapshot.queuePresent!==true||!Number.isSafeInteger(snapshot.totalCount)||snapshot.totalCount<0||!Array.isArray(snapshot.frames))return bad();
 health.sampleCount=snapshot.totalCount;
 if(snapshot.frames.length!==Math.min(snapshot.totalCount,maxFrames))return bad();
 health.droppedCount=Math.max(0,snapshot.totalCount-maxFrames);
 for(const frame of snapshot.frames){
  if(!frame||!Number.isSafeInteger(frame.at)||frame.at<=0||frame.at>8640000000000000||!Array.isArray(frame.data)||frame.dataLength!==frame.data.length||frame.data.length<1||frame.data.length>maxBytes||frame.data[0]!==50||!frame.data.every(v=>Number.isInteger(v)&&v>=0&&v<=255)){health.droppedCount++;continue;}
  let request;try{request=SignalRequest.fromBinary(Uint8Array.from(frame.data));}catch{health.errorCount++;continue;}
  if(request.message.case!=='subscription'){health.droppedCount++;continue;}
  const sub=request.message.value;
  if(typeof sub.subscribe!=='boolean'){health.droppedCount++;continue;}
  const sids=[...sub.trackSids,...sub.participantTracks.flatMap(p=>p.trackSids)];
  if(sids.length>maxSids||sids.some(s=>typeof s!=='string'||s.length>maxSidLength||!/^TR_[A-Za-z0-9]+$/.test(s))){health.droppedCount++;continue;}
  frames.push({actor,at:frame.at,subscribe:sub.subscribe,trackSids:[...new Set(sids)]});health.decodedCount++;
 }
 health.observationComplete=health.droppedCount===0&&health.errorCount===0;
 return {frames,health};
}
