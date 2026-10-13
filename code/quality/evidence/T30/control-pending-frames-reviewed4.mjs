import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createHash} from 'node:crypto';
import {SignalRequest,UpdateSubscription,ParticipantTracks} from '@livekit/protocol';
import {pendingFramesSnapshot,decodePendingFrames} from './rtp-window-reviewed4/pending-subscriptions.mjs';
import {observeFailure,persistSanitizedFailure,persistFailureStatus} from './rtp-window-reviewed4/failure-observer.mjs';
const d='quality/evidence/T30',results=[],now=Date.now(),h=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const packet=(subscribe=true,sids=['TR_ControlNewVideo'])=>Array.from(new SignalRequest({message:{case:'subscription',value:new UpdateSubscription({subscribe,trackSids:sids,participantTracks:[new ParticipantTracks({participantSid:'PRIVATE_IDENTITY_NOT_PERSISTED',trackSids:sids})]})}}).toBinary());
const frame=(data=packet(),at=now)=>({at,data,privateExtra:'PRIVATE_EXTRA_NOT_PERSISTED'});
function decodeQueue(queue,actor='viewer'){
 const previous=globalThis.window;try{globalThis.window={t30SubscriptionFrames:queue};const snapshot=pendingFramesSnapshot();assert.equal(globalThis.window.t30SubscriptionFrames,queue);return decodePendingFrames(snapshot,actor);}finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
}
const control=(name,fn)=>{fn();results.push({name,passed:true});};
control('actual protobuf subscribe/unsubscribe/new SID/duplicate SID privacy',()=>{
 const queue=Object.freeze([Object.freeze(frame(packet(false,['TR_ControlOldVideo']))),Object.freeze(frame())]);const r=decodeQueue(queue);assert(r.health.observationComplete);assert.deepEqual(r.frames.map(x=>({subscribe:x.subscribe,trackSids:x.trackSids})),[{subscribe:false,trackSids:['TR_ControlOldVideo']},{subscribe:true,trackSids:['TR_ControlNewVideo']}]);assert(!JSON.stringify(r).includes('PRIVATE_'));assert.equal(queue.length,2);
});
control('257 browser frames cannot silently truncate GREEN after proposal RED',()=>{const r=decodeQueue(Array.from({length:257},()=>frame()));assert.equal(r.health.sampleCount,257);assert.equal(r.health.decodedCount,256);assert.equal(r.health.droppedCount,1);assert.equal(r.health.observationComplete,false);});
control('oversize original byte length is preserved through bounded snapshot',()=>{const r=decodeQueue([frame([...packet(),...Array(8192).fill(0)])]);assert.equal(r.frames.length,0);assert.equal(r.health.droppedCount,1);assert(!r.health.observationComplete);});
control('malformed protobuf error is sanitized',()=>{const r=decodeQueue([frame([50,255])]);assert.equal(r.health.errorCount,1);assert(!r.health.observationComplete);});
control('non-subscription frames rejected',()=>{const r=decodeQueue([frame([8,1])]);assert.equal(r.health.droppedCount,1);assert(!r.health.observationComplete);});
control('negative oversized fractional byte numbers cannot coerce to valid payload',()=>{for(const byte of [-1,256,1.5]){const data=packet();data.push(byte);const r=decodeQueue([frame(data)]);assert.equal(r.health.droppedCount,1);assert.equal(r.health.decodedCount,0);}});
control('invalid SID and SID length/count overflow rejected',()=>{for(const sids of [['PRIVATE_TOKEN'],['TR_'+ 'a'.repeat(65)],Array.from({length:17},(_,i)=>'TR_Control'+i)]){const r=decodeQueue([frame(packet(true,sids))]);assert.equal(r.health.droppedCount,1);assert(!r.health.observationComplete);}});
control('empty real queue complete; absent queue incomplete',()=>{assert(decodeQueue([]).health.observationComplete);assert(!decodeQueue(undefined).health.observationComplete);});
control('actor fixed enum and positive integer actual timestamps',()=>{assert(!decodeQueue([frame()],'PRIVATE_ACTOR').health.observationComplete);for(const at of [-1,0,1.5,Infinity,8640000000000001])assert(!decodeQueue([frame(packet(),at)]).health.observationComplete);});
control('declared count/length mismatch incomplete',()=>{const r=decodePendingFrames({queuePresent:true,totalCount:2,frames:[{at:now,dataLength:packet().length,data:packet()}]},'viewer');assert(r.health.errorCount>0);assert(!r.health.observationComplete);});
const source=fs.readFileSync(d+'/rtp-window-reviewed4/screen-share-diagnostic.spec.ts','utf8'),start=source.indexOf(' }catch(error){let failureRecorded='),end=source.indexOf('\n});',start);assert(start>0&&end>start);const body=source.slice(start+' }catch(error){'.length,end-1);assert(body.endsWith('throw error;'));const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor,handler=new AsyncFunction('error','evidence','windows','activePage','persistSanitizedFailure','observeFailure','checkpoint','persistFailureStatus',body);
for(const mode of ['success','pending-decode-reject','pending-evaluate-reject','observer-deadline','pending-write-io']){
 const root=path.resolve(d),target=path.join(root,'t30-native-'+randomUUID().replaceAll('-',''));assert.equal(path.dirname(target),root);assert(!fs.existsSync(target));fs.mkdirSync(target);
 try{
  if(mode==='pending-write-io')fs.mkdirSync(path.join(target,'pending-subscription-frames.json'));
  let pendingCalls=0;const mockPage={isClosed:()=>false,evaluate:async fn=>{
   if(fn.name==='actorSnapshot')return {at:now,visibilityState:'visible',rows:[{type:'inbound-rtp',kind:'video',bytesReceived:1234}],captureTracks:[],videos:[]};
   assert.equal(fn.name,'pendingFramesSnapshot');pendingCalls++;
   if(mode==='pending-evaluate-reject')throw Error('PRIVATE_EVALUATION');
   if(mode==='observer-deadline'){await new Promise(resolve=>setTimeout(resolve,30));}
   const previous=globalThis.window;try{globalThis.window={t30SubscriptionFrames:mode==='pending-decode-reject'?[frame([50,255])]:[frame()]};return fn();}finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
  }};
  const original=Object.assign(new Error('PRIVATE_ORIGINAL_FAILURE'),{name:'AssertionError',matcherResult:{name:'toHaveLength'}});original.stack='private\n at screen-share-diagnostic.spec.ts:60:405';let caught,checkpoints=0;
  try{await handler(original,target,new Map([['viewer',{page:mockPage}]]),{isClosed:()=>false},persistSanitizedFailure,(e,w)=>observeFailure(e,w,{timeoutMs:mode==='observer-deadline'?5:5000}),async()=>{checkpoints++;},persistFailureStatus);}catch(error){caught=error;}
  assert.equal(caught,original);assert.equal(checkpoints,1);assert.equal(pendingCalls,1);
  const status=JSON.parse(fs.readFileSync(path.join(target,'sanitized-failure-status.json')));assert.equal(status.observerComplete,mode==='success');assert(status.failureRecorded&&status.checkpointComplete);assert.equal(status.nativeAcceptance,false);
  const media=JSON.parse(fs.readFileSync(path.join(target,'post-failure-media-state.json')));assert.equal(media.actors[0].rows[0].bytesReceived,1234);
  if(mode!=='pending-write-io'){
   const pendingPath=path.join(target,'pending-subscription-frames.json'),bytes=fs.readFileSync(pendingPath,'utf8'),pending=JSON.parse(bytes);assert(!bytes.includes('PRIVATE_')&&!bytes.includes('dataLength')&&!bytes.includes('participantSid')&&!bytes.includes('data":'));assert.equal(pending.health.observationComplete,mode==='success');
   if(mode==='success'){assert.equal(pending.frames[0].trackSids[0],'TR_ControlNewVideo');assert.equal(pending.frames[0].at,now);}
   if(mode==='observer-deadline'){const before=h(pendingPath);await new Promise(resolve=>setTimeout(resolve,40));assert.equal(h(pendingPath),before);}
  }
  results.push({name:mode,actualExtractedFailureCatchExecuted:true,originalErrorIdentity:true,originalMediaObservationRetained:true,passed:true});
 }finally{assert.equal(path.dirname(path.resolve(target)),root);fs.rmSync(target,{recursive:true,force:true});assert(!fs.existsSync(target));}
}
assert.equal(h(d+'/rtp-window-reviewed4/screen-share-diagnostic.spec.ts'),h(d+'/rtp-window-reviewed3/screen-share-diagnostic.spec.ts'));
fs.writeFileSync(d+'/pending-frames-controls-review4.json',JSON.stringify({recordedAt:new Date().toISOString(),controls:results.length,results,actualGeneratedProtobufRoundTrip:true,browserEvaluatedSnapshotFunctionExercisedWithSyntheticFrozenQueues:true,actualBrowserNotClaimed:true,actualObserverPersistenceIoAndDeadlineFaults:true,exactOriginalFailureIdentity:true,nativeAcceptance:false},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({controls:results.length,green:true,actualBrowserNotClaimed:true,nativeAcceptance:false}));
