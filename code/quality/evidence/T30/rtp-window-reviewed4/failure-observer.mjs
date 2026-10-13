import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

import {pendingFramesSnapshot,decodePendingFrames} from './pending-subscriptions.mjs';

// Browser-evaluated function: fixed fields only, no URLs, payloads, errors or private text.
export async function actorSnapshot(){
 const own=window,rows=[];
 if(!Array.isArray(own.t30Peers)||!Array.isArray(own.t30Captures))throw Error('missing capture observation');
 const n=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
 const track=t=>({kind:t.kind==='video'?'video':'audio',readyState:t.readyState==='live'?'live':'ended',enabled:t.enabled,muted:t.muted});
 for(const pc of own.t30Peers){
  const report=await pc.getStats(); // Errors propagate; an absent report is never called complete.
  for(const s of report.values()){
   if(!['outbound-rtp','inbound-rtp','media-source'].includes(s.type)||s.isRemote)continue;
   const row={type:s.type,kind:['video','audio'].includes(s.kind??s.mediaType)?(s.kind??s.mediaType):'unknown'};
   for(const key of ['bytesSent','packetsSent','framesEncoded','framesSent','frameWidth','frameHeight','framesPerSecond','bytesReceived','packetsReceived','packetsLost','jitter','framesDecoded','framesReceived','width','height','frames'])row[key]=n(s[key]);
   row.qualityLimitationReason=['none','cpu','bandwidth','other'].includes(s.qualityLimitationReason)?s.qualityLimitationReason:null;
   rows.push(row);
  }
 }
 const videos=[...document.querySelectorAll('.fg-live-stage video')].map(el=>{
  const rect=el.getBoundingClientRect();
  return {readyState:el.readyState,paused:el.paused,videoWidth:el.videoWidth,videoHeight:el.videoHeight,clientWidth:el.clientWidth,clientHeight:el.clientHeight,boundingRect:{width:rect.width,height:rect.height},tracks:el.srcObject instanceof MediaStream?el.srcObject.getTracks().map(track):[]};
 });
 return {at:Date.now(),visibilityState:document.visibilityState,rows,captureTracks:own.t30Captures.flatMap(s=>s.getTracks().map(track)),videos};
}
export function sourceSnapshot(){return {at:Date.now(),visibilityState:document.visibilityState,animations:document.getAnimations().map(a=>({playState:a.playState,currentTime:typeof a.currentTime==='number'?a.currentTime:null}))};}

export async function observeFailure(evidence,windows,{timeoutMs=5000}={}){
 const root=path.resolve('quality/evidence/T30'),target=path.resolve(evidence);
 assert.equal(path.dirname(target),root);assert(/^t30-native-[a-f0-9]{32}$/.test(path.basename(target)));
 assert(Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=5000);
 const allowed=new Set(['sender','receiver','viewer','third','fourth','denied']);
 const record={startedAt:new Date().toISOString(),afterFailureOnly:true,notMeasuredWindow:true,actors:[],observationComplete:false};
 const pendingRecord={recordedAt:new Date().toISOString(),afterFailureOnly:true,frames:[],observedActors:0,health:{sampleCount:0,decodedCount:0,droppedCount:0,errorCount:0,observationComplete:false}};
 let timer,failed=false;
 try{
  // Total deadline, no foreground/focus/scroll mutation. Browser close in original afterAll settles timed-out evaluations.
  const work=(async()=>{for(const [key,win]of windows){assert(allowed.has(key));if(win.page.isClosed())throw Error('actor closed');const actor=await win.page.evaluate(actorSnapshot);const source=win.source&&!win.source.isClosed()?await win.source.evaluate(sourceSnapshot):null;record.actors.push({actorKey:key,...actor,source});const decoded=decodePendingFrames(await win.page.evaluate(pendingFramesSnapshot),key);pendingRecord.frames.push(...decoded.frames);pendingRecord.observedActors++;for(const field of ['sampleCount','decodedCount','droppedCount','errorCount'])pendingRecord.health[field]+=decoded.health[field];}})();
  await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('observation deadline')),timeoutMs);})]);
  record.observationComplete=true;
 }catch{failed=true;record.failure='POST_FAILURE_OBSERVATION_FAILED';}
 finally{clearTimeout(timer);record.completedAt=new Date().toISOString();fs.writeFileSync(path.join(target,'post-failure-media-state.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
 pendingRecord.completedAt=new Date().toISOString();pendingRecord.health.observationComplete=!failed&&record.observationComplete&&pendingRecord.observedActors===windows.size&&pendingRecord.health.droppedCount===0&&pendingRecord.health.errorCount===0;
 fs.writeFileSync(path.join(target,'pending-subscription-frames.json'),JSON.stringify(pendingRecord,null,2)+'\n',{flag:'wx'});
 if(!pendingRecord.health.observationComplete)failed=true;
 if(failed)throw Error('Post-failure media observation incomplete; inspect sanitized evidence');
}

function failureTarget(evidence){const root=path.resolve('quality/evidence/T30'),target=path.resolve(evidence);assert.equal(path.dirname(target),root);assert(/^t30-native-[a-f0-9]{32}$/.test(path.basename(target)));return target;}
export function persistSanitizedFailure(evidence,error){
 const target=failureTarget(evidence),known=new Set(['toBe','toEqual','toHaveLength','toHaveCount','toBeGreaterThan','toBeGreaterThanOrEqual','toBeLessThan','toBeLessThanOrEqual','toBeVisible','toContainText','toBeTruthy','toBeFalsy','toBeNull','toBeFocused','toHaveAttribute']);
 const matcher=error?.matcherResult?.name,errorKind=error?.name==='TimeoutError'?'TIMEOUT_ERROR':error?.name==='AssertionError'||error?.matcherResult?'ASSERTION_ERROR':'GENERIC_ERROR';
 const match=typeof error?.stack==='string'?error.stack.match(/(?:screen-share-diagnostic\.spec\.ts|screen-share\.spec\.ts):(\d+)(?::\d+)?/):null;
 const line=match?Number(match[1]):null;
 const record={recordedAt:new Date().toISOString(),errorKind,matcher:typeof matcher==='string'?(known.has(matcher)?matcher:'CUSTOM_MATCHER'):null,location:match&&Number.isSafeInteger(line)&&line>0?{file:'screen-share-diagnostic.spec.ts',line}:null,sanitized:true};
 fs.writeFileSync(path.join(target,'sanitized-failure-record.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});return record;
}
export function persistFailureStatus(evidence,status){const target=failureTarget(evidence);assert.deepEqual(Object.keys(status).sort(),['checkpointComplete','failureRecorded','observerComplete']);assert(Object.values(status).every(x=>typeof x==='boolean'));fs.writeFileSync(path.join(target,'sanitized-failure-status.json'),JSON.stringify({recordedAt:new Date().toISOString(),...status,nativeAcceptance:false},null,2)+'\n',{flag:'wx'});}
