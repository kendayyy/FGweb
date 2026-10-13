import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const methods={RoomsService:['getRoomDetail','buildRoomDto','listOwnRooms','checkActorSessionAndBan'],ProfilesService:['getPublicProfile','getPublicProfiles']};
export function installOwnedRoomTiming({app,evidenceDir}){
 const root=path.resolve('quality/evidence/T30'),target=path.resolve(evidenceDir);assert(target.startsWith(root+path.sep));
 const saved=[],instances=new Set(),records=[];let stopped=false,failureCount=0,droppedCount=0,sequence=0;
 const record=r=>{if(stopped)return;try{if(records.length>=10000){droppedCount++;return;}records.push(r);}catch{failureCount++;}};
 for(const module of app.container.getModules().values())for(const provider of module.providers.values()){
  const instance=provider.instance,service=instance?.constructor?.name;if(!methods[service]||instances.has(instance))continue;instances.add(instance);
  for(const method of methods[service]){
   const original=instance[method];assert.equal(typeof original,'function');const descriptor=Object.getOwnPropertyDescriptor(instance,method),prototype=Object.getPrototypeOf(instance),prototypeMethod=prototype[method];
   const wrapped=function(...args){const id=++sequence,start=performance.now();record({type:'start',service,method,id,at:new Date().toISOString()});const finish=ok=>record({type:'finish',service,method,id,ok,at:new Date().toISOString(),durationMs:Math.round((performance.now()-start)*100)/100});let result;try{result=Reflect.apply(original,this,args);}catch(error){finish(false);throw error;}if(result&&typeof result.then==='function')result.then(()=>finish(true),()=>finish(false));else finish(true);return result;};
   instance[method]=wrapped;saved.push({instance,method,original,descriptor,wrapped,prototype,prototypeMethod});
  }
 }
 const sample=()=>{for(const instance of instances){try{const pool=instance.pool;if(pool&&Array.isArray(pool._clients))record({type:'pool',service:instance.constructor.name,at:new Date().toISOString(),total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount,pids:pool._clients.map(c=>c.processID).filter(Number.isInteger)});}catch{failureCount++;}}};
 const timer=setInterval(sample,1000);timer.unref();let health;
 return {stop(){if(stopped)return health;sample();stopped=true;clearInterval(timer);for(const s of saved){if(s.instance[s.method]!==s.wrapped){failureCount++;continue;}if(s.descriptor)Object.defineProperty(s.instance,s.method,s.descriptor);else delete s.instance[s.method];}health={at:new Date().toISOString(),methodCount:saved.length,failureCount,droppedCount,timerStopped:true,instancesRestored:saved.every(s=>s.instance[s.method]===s.original),prototypesUnchanged:saved.every(s=>s.prototype[s.method]===s.prototypeMethod),records:records.length};fs.writeFileSync(path.join(target,'owned-room-timing.jsonl'),records.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx'});fs.writeFileSync(path.join(target,'owned-room-timing-health.json'),JSON.stringify(health,null,2)+'\n',{flag:'wx'});return health;}};
}
