import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T30';const red=JSON.parse(fs.readFileSync(d+'/api42-core-pool-red1/result.json','utf8'));assert.deepEqual(red.failedChecks,['poolPromiseDurationObserved']);assert(!red.fatalControlFailure);assert(Object.values(red.cleanup).every(Boolean));
let s=fs.readFileSync(d+'/api42-observer-reviewed1.mjs','utf8');const anchor='  class PatchedPool extends OrigPool {\n';assert.equal(s.split(anchor).length,2);
s=s.replace(anchor,`  const originalPoolQuery=OrigPool.prototype.query;
  class PatchedPool extends OrigPool {
    query(...args){
      if(typeof args.at(-1)==='function'||typeof args[0]?.callback==='function'||typeof args[0]?.submit==='function')return Reflect.apply(originalPoolQuery,this,args);
      const ctx=als.getStore(),poolIndex=poolMetadata.get(this)??null;
      const startedAt=new Date().toISOString(),startMonotonic=performance.now();
      const complete=(ok,error)=>{
        try{bufferRecord({type:'pool-query',poolIndex,backendPid:null,spanIndex:ctx?.spanIndex??null,parentSpanIndex:ctx?.parentSpanIndex??null,owner:ctx?.owner??'unassociated',startedAt,completedAt:new Date().toISOString(),durationMs:Math.round((performance.now()-startMonotonic)*100)/100,ok,sqlState:typeof error?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code)?error.code:null});}catch{failureCount++;}
      };
      let result;try{result=Reflect.apply(originalPoolQuery,this,args);}catch(error){complete(false,error);throw error;}
      observeResult(result,complete,false);return result;
    }
`);
fs.writeFileSync(d+'/api42-observer-reviewed2.mjs',s,{flag:'wx'});
const recordedAt=new Date().toISOString();fs.writeFileSync(d+'/api42-observer-pool-review2.json',JSON.stringify({recordedAt,actualRed:red,reviewedSha256:createHash('sha256').update(s).digest('hex'),poolPromiseIdentityPreserved:true,callbacksExcluded:true,poolBackendPidExplicitlyNull:true,sourceApplicationUnchanged:true,greenPending:true},null,2)+'\n',{flag:'wx'});
fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — Pool query actual RED/correction '+recordedAt+': actual11:15:02.948Z–11:15:05.233Z exit1,13controls pass/only outerPool duration missing; real schema/pool/HTTP cleanup true. Reviewed immutable helper2 preserves original Pool query promise/args/this/errors and callback passthrough; safe outer timing has explicit null PID (no inferred client identity). No application or mutable fixture changes. Evidence code/quality/evidence/T30/api42-observer-pool-review2.json; actual GREEN14/full fivecontrols/real fixture smokes pending/IN_PROGRESS/80priorPASS unchanged/no Anti2/no T31.\n');
console.log('Reviewed pool observation copy prepared.');
