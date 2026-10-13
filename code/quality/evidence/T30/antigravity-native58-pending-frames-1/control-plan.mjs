import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SignalRequest, UpdateSubscription, ParticipantTracks} from '@livekit/protocol';
import {
 decodePendingFrames,
 observeFailure,
 persistSanitizedFailure,
 persistFailureStatus,
 actorSnapshot,
 sourceSnapshot,
 pendingFramesSnapshot
} from './failure-observer.mjs';

// Evidence output directory for control verification
const d='quality/evidence/T30/antigravity-native58-pending-frames-1';

export async function runControls(){
 const results=[];

 // --- Control Group 1: SignalRequest Serialization / Deserialization & Sanitization ---

 // 1.1 Valid subscribe frame
 {
  const sub=new UpdateSubscription({
   subscribe:true,
   trackSids:['TR_VSciSJqs4supYX'],
   participantTracks:[]
  });
  const req=new SignalRequest({message:{case:'subscription',value:sub}});
  const binary=Array.from(req.toBinary());
  assert.equal(binary[0],50,'First byte must be 50 (field 6 length-delimited tag)');
  const decoded=decodePendingFrames([{at:1791735215653,data:binary}],'viewer');
  assert.equal(decoded.health.decodedCount,1);
  assert.equal(decoded.health.droppedCount,0);
  assert.equal(decoded.health.errorCount,0);
  assert.equal(decoded.health.observationComplete,true);
  assert.deepEqual(decoded.rows,[{
   actor:'viewer',
   at:1791735215653,
   subscribe:true,
   trackSids:['TR_VSciSJqs4supYX']
  }]);
  results.push({name:'valid-subscribe',passed:true});
 }

 // 1.2 Valid unsubscribe frame
 {
  const unsub=new UpdateSubscription({
   subscribe:false,
   trackSids:['TR_VS8RdZTwPGz5m9'],
   participantTracks:[]
  });
  const req=new SignalRequest({message:{case:'subscription',value:unsub}});
  const binary=Array.from(req.toBinary());
  const decoded=decodePendingFrames([{at:1791735215652,data:binary}],'viewer');
  assert.equal(decoded.health.decodedCount,1);
  assert.deepEqual(decoded.rows[0],{
   actor:'viewer',
   at:1791735215652,
   subscribe:false,
   trackSids:['TR_VS8RdZTwPGz5m9']
  });
  results.push({name:'valid-unsubscribe',passed:true});
 }

 // 1.3 Duplicate SIDs and participantTracks privacy (no participantSid persisted)
 {
  const sub=new UpdateSubscription({
   subscribe:true,
   trackSids:['TR_VSciSJqs4supYX'],
   participantTracks:[
    new ParticipantTracks({
     participantSid:'PA_PRIVATE_SHOULD_NEVER_LEAK_123',
     trackSids:['TR_VSciSJqs4supYX','TR_VSRCHZx3KhoXJW']
    })
   ]
  });
  const req=new SignalRequest({message:{case:'subscription',value:sub}});
  const binary=Array.from(req.toBinary());
  const decoded=decodePendingFrames([{at:1791735215654,data:binary}],'viewer');
  assert.equal(decoded.health.decodedCount,1);
  assert.deepEqual(decoded.rows[0].trackSids,['TR_VSciSJqs4supYX','TR_VSRCHZx3KhoXJW']);
  const serialized=JSON.stringify(decoded.rows);
  assert(!serialized.includes('PA_PRIVATE'),'Participant identities must never leak into persisted rows');
  results.push({name:'duplicate-sids-and-participant-privacy',passed:true});
 }

 // 1.4 Malformed bytes and non-subscription message handling
 {
  // Corrupt bytes
  const corrupt=[50,255,255,255,255,255,255];
  const corruptDecoded=decodePendingFrames([{at:1791735215655,data:corrupt}],'viewer');
  assert.equal(corruptDecoded.health.errorCount,1);
  assert.equal(corruptDecoded.health.observationComplete,false);

  // Tag not 50
  const wrongTag=[42,1,2,3];
  const wrongTagDecoded=decodePendingFrames([{at:1791735215656,data:wrongTag}],'viewer');
  assert.equal(wrongTagDecoded.health.droppedCount,1);
  assert.equal(wrongTagDecoded.health.observationComplete,false);

  // Non-subscription SignalRequest (e.g. ping)
  const pingReq=new SignalRequest({message:{case:'ping',value:BigInt(1791735215000)}});
  const pingBinary=Array.from(pingReq.toBinary());
  const pingDecoded=decodePendingFrames([{at:1791735215657,data:pingBinary}],'viewer');
  assert.equal(pingDecoded.health.droppedCount,1);
  assert.equal(pingDecoded.health.observationComplete,false);
  results.push({name:'malformed-and-non-subscription',passed:true});
 }

 // 1.5 Invalid SID format, oversize data, and count bounds
 {
  // Invalid SID regex (contains illegal symbols or wrong prefix)
  const invalidSidSub=new UpdateSubscription({
   subscribe:true,
   trackSids:['INVALID_SID_WITHOUT_TR_PREFIX','TR_INVALID!@#$'],
   participantTracks:[]
  });
  const invalidSidReq=new SignalRequest({message:{case:'subscription',value:invalidSidSidSub??invalidSidSub}});
  const invalidSidDecoded=decodePendingFrames([{at:1791735215658,data:Array.from(invalidSidReq.toBinary())}],'viewer');
  assert.equal(invalidSidDecoded.health.droppedCount,1);
  assert.equal(invalidSidDecoded.rows.length,0);

  // Count overflow (> 16 SIDs per frame)
  const overflowSids=Array.from({length:20},(_,i)=>`TR_VSfakeSidNumber${i}`);
  const overflowSub=new UpdateSubscription({subscribe:true,trackSids:overflowSids,participantTracks:[]});
  const overflowReq=new SignalRequest({message:{case:'subscription',value:overflowSub}});
  const overflowDecoded=decodePendingFrames([{at:1791735215659,data:Array.from(overflowReq.toBinary())}],'viewer');
  assert.equal(overflowDecoded.health.droppedCount,1);
  assert.equal(overflowDecoded.rows.length,0);

  // Oversize frame data (> 8192 bytes)
  const oversizeData=new Array(8193).fill(50);
  const oversizeDecoded=decodePendingFrames([{at:1791735215660,data:oversizeData}],'viewer');
  assert.equal(oversizeDecoded.health.droppedCount,1);
  results.push({name:'invalid-sid-oversize-and-overflow',passed:true});
 }

 // --- Control Group 2: observeFailure Integration & Error Preservation ---

 const root=path.resolve('quality/evidence/T30');
 for(const mode of ['normal-success','eval-reject','deadline-timeout','file-collision']){
  const targetDir=path.join(root,'t30-native-'+randomUUID().replaceAll('-',''));
  fs.mkdirSync(targetDir);
  try{
   const originalError=Object.assign(new Error('ORIGINAL_ASSERTION_FAILURE'),{
    name:'AssertionError',
    matcherResult:{name:'toHaveLength',actual:0,expected:1}
   });
   originalError.stack='AssertionError: toHaveLength\n at screen-share-diagnostic.spec.ts:60:5';

   // Create mock windows map
   const sub=new UpdateSubscription({subscribe:true,trackSids:['TR_VSciSJqs4supYX'],participantTracks:[]});
   const rawFrame={at:1791735215653,data:Array.from(new SignalRequest({message:{case:'subscription',value:sub}}).toBinary())};

   const mockPage={
    isClosed:()=>false,
    evaluate:async(fn)=>{
     if(mode==='eval-reject')throw Error('BROWSER_EVALUATION_FAILED');
     if(mode==='deadline-timeout')await new Promise(r=>setTimeout(r,100)); // Will exceed timeoutMs if timeoutMs is small
     if(fn===pendingFramesSnapshot)return [rawFrame];
     if(fn===actorSnapshot)return {at:Date.now(),visibilityState:'visible',rows:[],captureTracks:[],videos:[]};
     if(fn===sourceSnapshot)return {at:Date.now(),visibilityState:'visible',animations:[]};
     return null;
    }
   };
   const mockWindows=new Map([['viewer',{page:mockPage,source:null,context:{}}]]);

   if(mode==='file-collision'){
    fs.writeFileSync(path.join(targetDir,'pending-subscription-frames.json'),'PREEXISTING');
   }

   let observerThrew=false;
   try{
    await observeFailure(targetDir,mockWindows,{timeoutMs:mode==='deadline-timeout'?10:5000});
   }catch{
    observerThrew=true;
   }

   if(mode==='normal-success'){
    assert.equal(observerThrew,false);
    assert(fs.existsSync(path.join(targetDir,'post-failure-media-state.json')));
    assert(fs.existsSync(path.join(targetDir,'pending-subscription-frames.json')));
    const pendingJson=JSON.parse(fs.readFileSync(path.join(targetDir,'pending-subscription-frames.json'),'utf8'));
    assert.equal(pendingJson.frames.length,1);
    assert.equal(pendingJson.frames[0].actor,'viewer');
    assert.equal(pendingJson.frames[0].subscribe,true);
    assert.deepEqual(pendingJson.frames[0].trackSids,['TR_VSciSJqs4supYX']);
    assert.equal(pendingJson.health.observationComplete,true);
   }else{
    // In failure modes, observeFailure must throw so catch can preserve original error identity
    assert.equal(observerThrew,true);
   }

   // Test catch block error identity preservation
   let caughtAfterHandler=null;
   try{
    // Emulate spec catch block:
    try{
     persistSanitizedFailure(targetDir,originalError);
    }catch{}
    try{
     await observeFailure(targetDir,mockWindows,{timeoutMs:mode==='deadline-timeout'?10:5000});
    }catch{}
    persistFailureStatus(targetDir,{failureRecorded:true,observerComplete:!observerThrew,checkpointComplete:true});
    throw originalError;
   }catch(err){
    caughtAfterHandler=err;
   }
   assert.equal(caughtAfterHandler,originalError,'Original error identity must remain strictly preserved');

   results.push({name:`observer-integration-${mode}`,passed:true});
  }finally{
   fs.rmSync(targetDir,{recursive:true,force:true});
  }
 }

 return {
  recordedAt:new Date().toISOString(),
  totalControls:results.length,
  results,
  allPassed:results.every(r=>r.passed),
  diagnosticScopeOnly:true,
  nativeAcceptance:false
 };
}
