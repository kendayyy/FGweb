import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T30';const result=JSON.parse(fs.readFileSync(d+'/api42-core-green1/result.json','utf8'));assert.equal(result.fatalControlFailure,false);assert.deepEqual(result.failedChecks,[]);assert.equal(Object.keys(result.checks).length,12);assert(Object.values(result.cleanup).every(Boolean));
let probe=fs.readFileSync(d+'/antigravity-native42-api-spans-correction-1/probe-api-lock-spans-child.mjs','utf8');const replace=(a,b)=>{assert(probe.includes(a),a.slice(0,90));probe=probe.replace(a,b);};
replace("from './api-lock-spans-observer.mjs';","from './api42-observer-reviewed1.mjs';");replace('quality/evidence/T30/antigravity-native42-api-spans-correction-1/control-${mode}','quality/evidence/T30/api42-full-controls1/control-${mode}');
replace("  async list(user, session, roomId) {\n    return { ok: true, roomId };\n  }",`  async list(user, session, roomId) {
    if(typeof user==='function')return user();
    return { ok: true, roomId };
  }`);
replace('return run({ query: () => Promise.resolve({ rows: [] }) }, { id });','return run();');
replace('instrumentOwnedApiServices({\n  CallsService: MockCallsService,',`const serviceCaptured=[];
for(const [Type,methods] of [[MockCallsService,['list','participants','withControlGroup']],[MockCallLifecycleService,['reconcileGroup']]])for(const method of methods){
  const original=Type.prototype[method];Type.prototype[method]=function(...args){const result=Reflect.apply(original,this,args);serviceCaptured.push({method,self:this,args,result,context:als.getStore()});return result;};
}
instrumentOwnedApiServices({
  CallsService: MockCallsService,`);
replace("    // Test buffer drop mode by writing > 5000 queries before flush",`    // Controlled simultaneous service contexts use distinct real PostgreSQL clients.
    const second=await pool.connect();
    try{
      const contexts=[];
      const operations=[client,second].map((db,index)=>{
        const callback=async()=>{const current=als.getStore();contexts.push({index,current});await db.query('SELECT pg_sleep(0.01)');assert(current.pids.has(db.processID));};
        const originalCount=serviceCaptured.length;
        const promise=callsInst.withControlGroup('synthetic','synthetic','synthetic',callback);
        const captured=serviceCaptured[originalCount];assert.equal(promise,captured.result);assert.equal(captured.self,callsInst);assert.equal(captured.args[3],callback);return promise;
      });
      await Promise.all(operations);assert.equal(contexts.length,2);assert.notEqual(contexts[0].current.spanIndex,contexts[1].current.spanIndex);
      assert.notEqual(client.processID,second.processID);for(const {index,current} of contexts)assert.equal(current.pids.size,1);
      let outer,inner;await callsInst.withControlGroup('synthetic','synthetic','nested',async()=>{outer=als.getStore();await callsInst.list(async()=>{inner=als.getStore();await client.query('SELECT 1');});assert.equal(als.getStore(),outer);});
      assert.notEqual(inner.spanIndex,outer.spanIndex);assert.equal(inner.parentSpanIndex,outer.spanIndex);assert(inner.pids.has(client.processID));
      checks.push('concurrent distinct real PG service contexts and nested inner parent/promise/args/this identities');
    }finally{second.release();}

    // Fill the bounded event buffer using real wrapper calls in one microtask turn; no 5100 DB roundtrips.`);
replace('for (let i = 0; i < 5100; i++) {\n        // Run lightweight query to fill buffer\n        await client.query(\'SELECT 1\');\n      }',"for (let i = 0; i < 3000; i++) await callsInst.list('synthetic','synthetic','synthetic');");
replace("          message: err?.message ?? 'unknown',","          message: 'Controlled probe assertion failed',");
const target=d+'/api42-full-controls1';fs.mkdirSync(target);fs.writeFileSync(d+'/probe-api42-full1.mjs',probe,{flag:'wx'});
const recordedAt=new Date().toISOString();fs.writeFileSync(d+'/api42-core-green-review1.json',JSON.stringify({recordedAt,result,commandEvidence:d+'/codex-t30-api42-core-green-1.json',helperSha256:createHash('sha256').update(fs.readFileSync(d+'/api42-observer-reviewed1.mjs')).digest('hex'),fullControlsPending:true,applicationSourceChanged:false},null,2)+'\n',{flag:'wx'});
fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — API diagnostic core GREEN '+recordedAt+': actual11:05:19.499Z–11:05:21.908Z exit0/12controls, actual schema/pool/HTTP cleanup true. Exact originalservice promises/this/args/sync/rejectederror, nextonce/erroridentity, thengetter observationfailure preservingoriginalobject, actual nativeRPC underTX PID and null afterCOMMIT, duplicatePoolinstall rejected, innerparentcontext verified. Full actual SDK6method/PGcallbacks/concurrentALS/IO/drop/finalhealth controls prepared with bounded microtask service-buffer flood, no5100PGqueries/rawerrors. Evidence code/quality/evidence/T30/api42-core-green-review1.json; no fixture adoption or nativePASS/source121/build11/80priorPASS unchanged/IN_PROGRESS/no Anti2/no T31.\n');console.log('Core GREEN12 reviewed; full controls prepared without app/fixture adoption.');
