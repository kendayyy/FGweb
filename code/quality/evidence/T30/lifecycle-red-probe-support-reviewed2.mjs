import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';

// Test-only diagnostic. Actual compiled lifecycle/PG/native SDK execute unchanged.
// The 40ms delay and first-read gate are synthetic; no load/capacity claim.
export async function runLifecycleProbe({service,inspector,callGroupId,roomId}) {
 assert(/^[a-f0-9-]{36}$/.test(callGroupId));
 const before=(await inspector.query('SELECT id,room_id,state FROM call_groups WHERE id=$1',[callGroupId])).rows[0];
 assert.equal(before?.room_id,roomId);assert.equal(before.state,'OPEN');
 const membersBefore=(await inspector.query('SELECT id,user_id,left_at FROM call_members WHERE call_group_id=$1 ORDER BY id',[callGroupId])).rows;
 assert(membersBefore.some(m=>m.left_at===null));
 const scope=new AsyncLocalStorage(),token={},ownedPids=new Set(),queries=[],clients=new Map(),blocking=[];
 const originalNative=service.native,servicePool=service.pool;
 let reads=0,participants=0,sampling=true,sampleFailure=false,completed=0,failed=0;
 let releaseFirst,enteredFirst;
 const gate=new Promise(resolve=>{releaseFirst=resolve;});
 const entered=new Promise(resolve=>{enteredFirst=resolve;});
 const operations=new Set();
 const acquire=db=>{
  if(clients.has(db))return;
  const original=db.query;clients.set(db,original);
  db.query=function(...args){
   if(scope.getStore()===token){
    const text=typeof args[0]==='string'?args[0]:args[0]?.text;
    const operation=text==='SELECT id FROM rooms WHERE id=$1 FOR UPDATE'?'room-update-lock':
     text==='SELECT id,room_id,state FROM call_groups WHERE id=$1 FOR UPDATE'?'group-update-lock':
     (args[0]?.name==='fg_live_call_admission_v1'||args[0]?.name==='fg_live_call_admissions_v1')?'live-lease-guard':
     typeof text==='string'&&text.includes('FOR UPDATE OF m')?'member-update-lock':null;
    if(operation){ownedPids.add(Number(db.processID));operations.add(operation);if(queries.length<128)queries.push({pid:Number(db.processID),operation});}
   }
   return Reflect.apply(original,this,args);
  };
 };
 servicePool.on('acquire',acquire);
 service.native=function(...args){
  const client=Reflect.apply(originalNative,this,args);
  if(scope.getStore()!==token)return client;
  const originalRooms=client.listRooms,originalParticipants=client.listParticipants;
  client.listRooms=async function(...callArgs){
   reads++;if(reads===1){enteredFirst();await gate;}
   await new Promise(resolve=>setTimeout(resolve,40));
   return Reflect.apply(originalRooms,this,callArgs);
  };
  client.listParticipants=async function(...callArgs){
   participants++;await new Promise(resolve=>setTimeout(resolve,40));
   return Reflect.apply(originalParticipants,this,callArgs);
  };
  return client;
 };
 const sample=(async()=>{
  while(sampling){
   if(ownedPids.size)try{
    const rows=(await inspector.query('SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=ANY($1::int[])',[Array.from(ownedPids)])).rows;
    for(const row of rows)if(row.wait_event_type==='Lock'&&blocking.length<128)blocking.push({at:new Date().toISOString(),pid:Number(row.pid),waitEvent:row.wait_event,ownBlockingPids:row.blockers.filter(pid=>ownedPids.has(Number(pid))).map(Number)});
   }catch{sampleFailure=true;}
   await new Promise(resolve=>setTimeout(resolve,15));
  }
 })();
 const work=[],started=performance.now();let entryTimer;
 const start=()=>{const task=scope.run(token,()=>service.reconcileGroup(callGroupId)).then(()=>{completed++;},error=>{failed++;throw error;});task.catch(()=>{});work.push(task);};
 let outcomes;
 try{
  start();await Promise.race([entered,new Promise((_,reject)=>{entryTimer=setTimeout(()=>reject(Error('Probe first native read not reached')),5000);})]);
  clearTimeout(entryTimer);for(let i=0;i<3;i++)start();releaseFirst();
  outcomes=await Promise.allSettled(work);
  const rejected=outcomes.find(result=>result.status==='rejected');if(rejected)throw rejected.reason;
 }finally{
  clearTimeout(entryTimer);releaseFirst();await Promise.allSettled(work);
  sampling=false;await sample;servicePool.removeListener('acquire',acquire);
  service.native=originalNative;for(const [db,original]of clients)db.query=original;
  scope.disable();
 }
 assert.equal(sampleFailure,false,'Owned PG sampling failed');assert.equal(completed,4);assert.equal(failed,0);
 for(const operation of ['room-update-lock','group-update-lock','member-update-lock','live-lease-guard'])assert(operations.has(operation),'Missing actual SQL operation '+operation);
 const after=(await inspector.query('SELECT id,room_id,state FROM call_groups WHERE id=$1',[callGroupId])).rows[0];assert.deepEqual(after,before);
 const membersAfter=(await inspector.query('SELECT id,user_id,left_at FROM call_members WHERE call_group_id=$1 ORDER BY id',[callGroupId])).rows;assert.deepEqual(membersAfter,membersBefore);
 return {requested:4,completed,failed,actualListRoomsCalls:reads,actualListParticipantsCalls:participants,requestBurstDurationMs:performance.now()-started,syntheticDelayMs:40,firstReadGate:true,sqlOperations:Array.from(operations),queries,ownedPids:Array.from(ownedPids),blockingSamples:blocking,ownLockQueueObserved:blocking.some(row=>row.ownBlockingPids.length>0),rowsUnchanged:true,nativeAcceptance:false};
}
