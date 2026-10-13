import assert from 'node:assert/strict';import {AsyncLocalStorage} from 'node:async_hooks';import {randomUUID,createHash} from 'node:crypto';import {AccessToken} from 'livekit-server-sdk';

// Real compiled service/owned PG/private SFU. Gates, exact injected error, and
// deferred pool.end are explicitly test-only adapters; never native acceptance.
export async function runCoalescingControls({service,inspector,group1,group2,roomId,otherRoomId}) {
 for(const id of [group1,group2])assert(/^[a-f0-9-]{36}$/.test(id));
 const groups=(await inspector.query('SELECT id,room_id,state FROM call_groups WHERE id=ANY($1::text[])',[ [group1,group2] ])).rows;assert.equal(groups.length,2);assert(groups.every(g=>g.state==='OPEN'));assert.equal(groups.find(g=>g.id===group1).room_id,roomId);assert.equal(groups.find(g=>g.id===group2).room_id,otherRoomId);
 const leases=(await inspector.query('SELECT a.id,m.user_id FROM call_admissions a JOIN call_members m ON m.id=a.call_member_id WHERE m.call_group_id=$1 AND m.left_at IS NULL AND a.revoked_at IS NULL ORDER BY a.id',[group1])).rows;assert.equal(leases.length,2);
 const slot=(await inspector.query("SELECT p.id,p.created_at AT TIME ZONE 'UTC' AS created_at,a.id AS identity FROM call_publish_slots p JOIN call_members m ON m.call_group_id=p.call_group_id AND m.user_id=p.user_id AND m.left_at IS NULL JOIN call_admissions a ON a.call_member_id=m.id AND a.revoked_at IS NULL WHERE p.call_group_id=$1",[group1])).rows[0];assert(slot);
 const scope=new AsyncLocalStorage(),originalNative=service.native,originalPublishing=service.publishing.reconcileWithin,originalPoolEnd=service.pool.end,originalClosing=service.closing,originalAfterLeave=service.calls.afterLeave;
 const controls=[],allWork=[],gates=[];let current=null,endedSeen=[],sdkReads=0,metadataRestore=null;
 const track=p=>{p.catch(()=>{});allWork.push(p);return p;};
 const barrier=()=>{let enter,release;const reached=new Promise(resolve=>{enter=resolve;}),wait=new Promise(resolve=>{release=resolve;});const gate={enter,release,reached,wait};gates.push(gate);return gate;};
 const bounded=async p=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Coalescing control barrier not reached')),5000);})]);}finally{clearTimeout(timer);}};
 const request=(id=group1,ended)=>track(scope.run(current.token,()=>service.reconcileGroup(id,ended)));
 const begin=name=>{process.send?.({kind:'phase',name:'coalescing-control-'+(controls.length+1)});current={name,token:{},attempts:0,reads:0,groups:new Set(),hooks:new Map(),snapshots:[],fault:null};return current;};
 service.native=function(...args){
  const client=Reflect.apply(originalNative,this,args);
  const rooms=client.listRooms,people=client.listParticipants;
  client.listRooms=async function(...callArgs){
   const c=current;if(!c||!Array.isArray(callArgs[0])||!callArgs[0].some(name=>name===`fg-call_${group1}`||name===`fg-call_${group2}`))return Reflect.apply(rooms,this,callArgs);
   const ordinal=++c.attempts;if(c.fault)throw c.fault;
   const value=await Reflect.apply(rooms,this,callArgs);sdkReads++;c.reads++;c.groups.add(callArgs[0]?.[0]===`fg-call_${group1}`?'group1':callArgs[0]?.[0]===`fg-call_${group2}`?'group2':'other');
   c.snapshots.push(value[0]?.metadata??'');const gate=c.hooks.get(ordinal);if(gate){gate.enter();await gate.wait;}return value;
  };
  client.listParticipants=function(...callArgs){return Reflect.apply(people,this,callArgs);};return client;
 };
 service.publishing.reconcileWithin=function(...args){if(current&&[group1,group2].includes(args[1])&&args[4])endedSeen.push({identity:args[4].identity,at:args[4].at});return Reflect.apply(originalPublishing,this,args);};
 const joined=async work=>{const settled=await Promise.allSettled(work);const bad=settled.find(x=>x.status==='rejected');if(bad)throw bad.reason;};
 try{
  if(service.inFlight.size)await bounded(Promise.allSettled(Array.from(service.inFlight)));
  let c=begin('fixed burst and fresh native trailing snapshot'),gate=barrier();c.hooks.set(1,gate);
  const native=Reflect.apply(originalNative,service,[]),name=`fg-call_${group1}`,room=(await native.listRooms([name]))[0];assert(room);metadataRestore={native,name,value:room.metadata};if(service.inFlight.size)await bounded(Promise.allSettled(Array.from(service.inFlight)));
  const marker='coalescing-test-'+randomUUID(),first=request();await bounded(gate.reached);const burst=[first,request(),request(),request()];await native.updateRoomMetadata(name,marker);gate.release();await joined(burst);
  assert.equal(c.reads,2);assert.notEqual(c.snapshots[0],marker);assert.equal(c.snapshots[1],marker);await native.updateRoomMetadata(name,metadataRestore.value);metadataRestore=null;
  controls.push({name:c.name,requests:4,nativeReads:c.reads,freshTrailingSnapshot:true});

  c=begin('different groups independent actual native reads');await joined([request(group1),request(group2)]);assert.equal(c.reads,2);assert(c.groups.has('group1')&&c.groups.has('group2'));controls.push({name:c.name,nativeReads:2});

  c=begin('trigger during trailing read starts fresh third pass');const firstGate=barrier(),secondGate=barrier();c.hooks.set(1,firstGate);c.hooks.set(2,secondGate);const a=request();await bounded(firstGate.reached);const b=request();firstGate.release();await bounded(secondGate.reached);const third=request();secondGate.release();await joined([a,b,third]);assert.equal(c.reads,3);controls.push({name:c.name,nativeReads:3});

  c=begin('distinct ended payloads and actual stale-slot guard');endedSeen=[];const stale={identity:slot.identity,at:slot.created_at.getTime()-1},other={identity:leases.find(l=>l.id!==slot.identity).id,at:slot.created_at.getTime()+1};await joined([request(group1,stale),request(group1,other)]);assert.equal(c.reads,2);assert.deepEqual(endedSeen,[stale,other]);assert.equal((await inspector.query('SELECT id FROM call_publish_slots WHERE id=$1',[slot.id])).rowCount,1);const fresh={identity:slot.identity,at:slot.created_at.getTime()+1};await request(group1,fresh);assert.deepEqual(endedSeen,[stale,other,fresh]);assert.equal((await inspector.query('SELECT id FROM call_publish_slots WHERE id=$1',[slot.id])).rowCount,0);controls.push({name:c.name,distinctActualLeasePayloads:true,staleSlotRetained:true,freshEndedSlotReleased:true});

  c=begin('exact synthetic SDK fault object and fresh recovery');const fault=Error('Owned synthetic SDK fault');c.fault=fault;const failures=await Promise.allSettled([request(),request(),request()]);assert(failures.every(r=>r.status==='rejected'&&r.reason===fault));c.fault=null;await request();assert.equal(c.reads,1);controls.push({name:c.name,failedCallers:3,sameErrorObject:true,recoveryActualSDKRead:true});

  c=begin('signed duplicate webhook persists once and reconciles twice');const id=randomUUID(),raw=JSON.stringify({id,event:'participant_joined',createdAt:String(Math.floor(Date.now()/1000)),room:{name:`fg-call_${group1}`}}),signer=new AccessToken(process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET,{ttl:60});signer.sha256=createHash('sha256').update(raw).digest('base64');const authorization=await signer.toJwt();const one=await track(scope.run(c.token,()=>service.receive(raw,authorization))),two=await track(scope.run(c.token,()=>service.receive(raw,authorization)));assert(one.success&&!one.duplicate&&two.success&&two.duplicate);assert.equal(c.reads,2);assert.equal((await inspector.query('SELECT id FROM webhook_events WHERE event_id=$1',[id])).rowCount,1);await assert.rejects(service.receive(raw),error=>error.getStatus?.()===401);controls.push({name:c.name,actualSignature:true,durableRows:1,nativeReads:2,unsignedDenied:true});

  c=begin('shutdown drains accepted ordinary and ended work');gate=barrier();c.hooks.set(1,gate);endedSeen=[];const acceptedFirst=request();await bounded(gate.reached);const ended={identity:slot.identity,at:Date.now()},accepted=[acceptedFirst,request(),request(group1,ended)];let poolEndCalled=false;
  service.pool.end=async function(){assert.equal(service.coalescers.size,0);assert.equal(service.inFlight.size,0);assert.equal(c.reads,3);assert.deepEqual(endedSeen,[ended]);poolEndCalled=true;};
  const destroyed=track(service.onModuleDestroy());await assert.rejects(service.reconcileGroup(group1),error=>error.getStatus?.()===503);assert.equal(poolEndCalled,false);gate.release();await joined([...accepted,destroyed]);assert(poolEndCalled);controls.push({name:c.name,acceptedCallers:3,acceptedResolved:true,newRejected503:true,deferredPoolEndAfterDrain:true,syntheticPoolEndAdapter:true});
 }finally{
  for(const gate of gates)gate.release();await Promise.allSettled(allWork);
  service.native=originalNative;service.publishing.reconcileWithin=originalPublishing;service.pool.end=originalPoolEnd;service.closing=originalClosing;service.calls.setAfterLeave(originalAfterLeave);
  if(metadataRestore)await metadataRestore.native.updateRoomMetadata(metadataRestore.name,metadataRestore.value);
  scope.disable();
 }
 assert.equal(controls.length,7);return {controls,passed:7,actualSDKReads:sdkReads,allAcceptedPromisesSettled:true,wrappersRestored:true,syntheticGatesFaultAndDeferredPoolEnd:true,nativeAcceptance:false};
}
