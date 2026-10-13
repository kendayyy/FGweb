import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T30',draft=d+'/antigravity-native42-api-spans-correction-1/api-lock-spans-observer.mjs';let s=fs.readFileSync(draft,'utf8');const replace=(a,b)=>{assert(s.includes(a),a.slice(0,90));s=s.replace(a,b);};
const red=JSON.parse(fs.readFileSync(d+'/api42-core-red1/result.json','utf8'));assert.equal(red.fatalControlFailure,false);assert.deepEqual(red.failedChecks,['httpNextCalledExactlyOnce','observerThenGetterCannotReplaceReturn','rpcAfterCommitDoesNotUseStalePid','duplicatePoolInstallRejectedBeforeMutation']);assert(Object.values(red.cleanup).every(Boolean));
replace('    pids: new Set(),','    pids: new Set(),\n    activeTransactions: new Map(),');
replace('  app.use((req, res, next) => {\n    try {','  app.use((req, res, next) => {\n    let continueInContext=null;\n    try {');
replace('          return als.run(ctx, () => next());','          continueInContext=ctx;');
replace('    return next();\n  });','    return continueInContext ? als.run(continueInContext,()=>next()) : next();\n  });');
replace('const registeredPools = new Set();','const registeredPools = new Set();\nconst poolMetadata=new WeakMap();\nlet poolsInstalled=false,sdkInstalled=false,servicesInstalled=false,transactionSequence=0;');
replace('export function instrumentOwnedApiPools(pg, evidence) {\n  evidenceDir = evidence;',"export function instrumentOwnedApiPools(pg, evidence) {\n  if(poolsInstalled)throw new Error('Owned pool observation already installed');\n  poolsInstalled=true;\n  evidenceDir = evidence;");
replace('      this.__fg_pool_index = poolIndex;','      poolMetadata.set(this,poolIndex);');
replace('          clientActiveLocks.set(client, { roomAcquired: null, groupAcquired: null });','          clientActiveLocks.set(client, { roomAcquired: null, groupAcquired: null,transactionIndex:null,ownerContext:null });');
replace("    if (typeof lastArg === 'function') {","    if (typeof lastArg === 'function' || typeof args[0]?.callback==='function' || typeof args[0]?.submit==='function') {");
replace("        const lockState = clientActiveLocks.get(this);\n        if (lockState) {\n          lockState.roomAcquired = null;\n          lockState.groupAcquired = null;\n        }",'        // Lock state changes only after actual successful BEGIN below.');
replace('    const poolIndex = clientPoolMap.get(this) ?? null;','    const poolIndex = clientPoolMap.get(this) ?? null;\n    const transactionBefore=clientActiveLocks.get(this)?.transactionIndex??null;');
replace('        if (ok) {\n          if (kind === \'lock-room\' && lockMode === \'update\') lockState.roomAcquired = nowMonotonic;',`        if (ok) {
          if(kind==='begin'){
            if(lockState.transactionIndex!==null)failureCount++;
            else {lockState.roomAcquired=null;lockState.groupAcquired=null;lockState.transactionIndex=++transactionSequence;lockState.ownerContext=ctx;
              if(ctx)ctx.activeTransactions.set(lockState.transactionIndex,{backendPid,transactionIndex:lockState.transactionIndex});}
          }
          if (kind === 'lock-room' && lockMode === 'update' && lockState.transactionIndex!==null) lockState.roomAcquired = nowMonotonic;`);
replace("          if (kind === 'lock-group' && lockMode === 'update') lockState.groupAcquired = nowMonotonic;","          if (kind === 'lock-group' && lockMode === 'update' && lockState.transactionIndex!==null) lockState.groupAcquired = nowMonotonic;");
replace("        if (ok && (kind === 'commit' || kind === 'rollback')) {",`        const transactionIndex=kind==='begin'?lockState.transactionIndex:transactionBefore;
        if (ok && (kind === 'commit' || kind === 'rollback')) {
          lockState.ownerContext?.activeTransactions.delete(lockState.transactionIndex);
          lockState.transactionIndex=null;lockState.ownerContext=null;`);
replace('          groupHoldMs,\n          poolIndex,','          groupHoldMs,\n          transactionIndex,\n          poolIndex,');
replace('export function instrumentRoomServiceClient(RoomServiceClient, evidence) {\n  evidenceDir = evidence;',"export function instrumentRoomServiceClient(RoomServiceClient, evidence) {\n  if(sdkInstalled)throw new Error('Owned SDK observation already installed');sdkInstalled=true;\n  evidenceDir = evidence;");
replace("      const ctx = als.getStore();\n      const startedAt = new Date().toISOString();\n      const startMonotonic = performance.now();",`      const ctx = als.getStore();
      const binding=ctx?.activeTransactions?.size===1?[...ctx.activeTransactions.values()][0]:null;
      const startedAt = new Date().toISOString();
      const startMonotonic = performance.now();`);
replace('            backendPid: ctx ? Array.from(ctx.pids)[0] ?? null : null,','            backendPid:binding?.backendPid??null,\n            transactionIndex:binding?.transactionIndex??null,');
replace('export function instrumentOwnedApiServices({ CallsService, CallLifecycleService }) {',"export function instrumentOwnedApiServices({ CallsService, CallLifecycleService }) {\n  if(servicesInstalled)throw new Error('Owned service observation already installed');servicesInstalled=true;");
replace('          poolIndex: pool.__fg_pool_index ?? null,','          poolIndex: poolMetadata.get(pool) ?? null,');
// Safe side attachment cannot change the original return value, sync error or promise identity.
const helper=`function observeResult(result,complete,recordSync=true){
  try{
    const then=result?.then;
    if(typeof then==='function')Reflect.apply(then,result,[()=>{try{complete(true,null);}catch{failureCount++;}},error=>{try{complete(false,error);}catch{failureCount++;}}]);
    else if(recordSync)complete(true,null);
  }catch{failureCount++;}
}
`;
replace('// 1. HTTP Before-Guard Context Middleware',helper+'\n// 1. HTTP Before-Guard Context Middleware');
const queryBlock=`    if (result && typeof result.then === 'function') {
      result.then(
        () => { recordCompletion(true, null); },
        (err) => { recordCompletion(false, err); }
      );
      return result;
    }

    return result;`;
replace(queryBlock,'    observeResult(result,recordCompletion,false);\n    return result;');
const sdkBlock=`      if (result && typeof result.then === 'function') {
        result.then(
          () => { recordCompletion(true, null); },
          (err) => { recordCompletion(false, err); }
        );
        return result;
      }

      return result;`;
replace(sdkBlock,'      observeResult(result,recordCompletion);\n      return result;');
const serviceBlock=`          if (result && typeof result.then === 'function') {
            result.then(
              () => { recordEnd(true, null); },
              (err) => { recordEnd(false, err); }
            );
            return result;
          }

          recordEnd(true, null);
          return result;`;
replace(serviceBlock,'          observeResult(result,recordEnd);\n          return result;');
const lifecycleBlock=`        if (result && typeof result.then === 'function') {
          result.then(
            () => { recordEnd(true, null); },
            (err) => { recordEnd(false, err); }
          );
          return result;
        }

        recordEnd(true, null);
        return result;`;
replace(lifecycleBlock,'        observeResult(result,recordEnd);\n        return result;');
replace('    let written = 0;\n    while (written < buf.length) {','    let written = 0,attempts=0;\n    while (written < buf.length && attempts++<4) {');
replace('      written += bytes;\n    }\n  } catch {','      written += bytes;\n    }\n    if(written!==buf.length)failureCount++;\n  } catch {');
assert(!s.includes('__fg_pool_index'));assert(!s.includes('Array.from(ctx.pids)[0]'));assert(!s.includes("if (result && typeof result.then"));
fs.writeFileSync(d+'/api42-observer-reviewed1.mjs',s,{flag:'wx'});const recordedAt=new Date().toISOString();
fs.writeFileSync(d+'/api42-observer-core-review1.json',JSON.stringify({recordedAt,reviewer:'Codex',draft:{path:draft,sha256:createHash('sha256').update(fs.readFileSync(draft)).digest('hex')},reviewed:{path:d+'/api42-observer-reviewed1.mjs',sha256:createHash('sha256').update(s).digest('hex')},actualRed:red,corrections:['Actual next runs once outside observation catch','Safe side handlers preserve unusual then getter outcome','Successful transaction binding and clear after commit; RPC captures binding at start','Duplicate installers rejected before mutation','Pool metadata WeakMap and bounded partial-write loop','Callbacks/configcallbacks/submittables exact passthrough with explicitly excluded telemetry'],sourceApplicationUnchanged:true,controlsGreenPending:true,fixtureNotAdopted:true},null,2)+'\n',{flag:'wx'});
fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — API diagnostic actual core RED/source correction '+recordedAt+': isolated realPG ownschema/SDKHTTP/service identity core actual11:03:18.142Z–11:03:20.773Z exit1; eightcontrols pass/fourbehavioral failures (nexttwice/thengetter originalreturn/staleRPCPID/duplicatePoolInstall). All schema/pool/HTTP cleanup true. Root reviewed copy fixes four defects plus actual successfulTX binding, safe side attachment, poolWeakMap and bounded partialwrite; proposal preserved, no app/runtime source adoption. Evidence code/quality/evidence/T30/api42-observer-core-review1.json; actual GREEN/full identity+IOcontrols/canonical fixture reconstruction/smokes pending/IN_PROGRESS/source121/build11/80priorPASS unchanged/no Anti2/no T31.\n');console.log('Reviewed observer core fixes prepared; actual GREEN required.');
