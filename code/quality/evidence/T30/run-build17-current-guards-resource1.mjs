import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';const d='quality/evidence/T30',run=(label,...args)=>{assert(!fs.existsSync(d+'/codex-'+label+'.json'));const code=spawnSync(process.execPath,[d+'/record.mjs',label,...args],{stdio:'inherit',windowsHide:true}).status??1;const r=JSON.parse(fs.readFileSync(d+'/codex-'+label+'.json'));fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — '+r.startedAt+'–'+r.completedAt+' exit'+code+': '+label+'; evidence code/'+d+'/codex-'+label+'.json. CODEX-ONLY/no cockpit startup/IN_PROGRESS/noT31.\n');return code;};let result=0;
try{for(const [label,args] of [
 ['t30-supabase-temporary-stop-71',['node',d+'/supabase-test-resource71.mjs','stop']],
 ['t30-rooms-pool-reuse-green-1',['node',d+'/rooms-pool-reuse-control1.mjs','green']],
 ['t30-calls-pool-reuse-green-1',['node',d+'/calls-pool-reuse-control1.mjs','green']],
 ['t30-room-crypto-build17-regressions-1',['node',d+'/run-build15-room-crypto-root-regressions1.mjs','rooms','chat-crypto-room-authority']],
 ['t30-frozen-call-build17-regressions-1',['node',d+'/run-backend-regressions.mjs','call-admission','call-gateway','call-controls']],
 ['t30-frozen-publishing-build17-alone-1',['node',d+'/run-backend-regressions-with-team-play.mjs','publishing']],
 ['t30-frozen-publishing-gateway-build17-alone-1',['node',d+'/run-backend-regressions-with-team-play.mjs','publishing-gateway']],
 ['t30-call-lease-guards-build17-green-1',['node',d+'/run-call-participant-lease-batch2.mjs']],
 ['t30-lifecycle-lease-batch-build17-green-1',['node',d+'/run-lifecycle-lease-batch1.mjs']],
 ['t30-lifecycle-noop-build17-green-1',['node',d+'/run-noop-write3.mjs']],
 ['t30-coalescing-build17-green-1',['node',d+'/probe-coalescing-build17-reviewed1.mjs','canonical']],
 ['t30-codex-gateway-normal-10',['node',d+'/probe-codex-gateway-trace10-normal.mjs','canonical']],
 ['t30-codex-gateway-media-io-10',['node',d+'/probe-codex-gateway-trace10-media-io.mjs','canonical']]
 ]){result=run(label,...args);if(result!==0)break;}}
finally{if(fs.existsSync(d+'/supabase-test-resource71.json')){const code=run('t30-supabase-restore-71','node',d+'/supabase-test-resource71.mjs','restore');if(code!==0)result=code;}}
process.exitCode=result;
