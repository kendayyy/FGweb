import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';const d='quality/evidence/T30',run=(label,...args)=>{assert(!fs.existsSync(d+'/codex-'+label+'.json'));const code=spawnSync(process.execPath,[d+'/record.mjs',label,...args],{stdio:'inherit',windowsHide:true}).status??1;const r=JSON.parse(fs.readFileSync(d+'/codex-'+label+'.json'));fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — '+r.startedAt+'–'+r.completedAt+' exit'+code+': '+label+'; evidence code/'+d+'/codex-'+label+'.json. CODEX-ONLY/no cockpit startup/IN_PROGRESS/noT31.\n');return code;};let result=0;
try{for(const [label,args] of [
 ['t30-supabase-temporary-stop-65',['node',d+'/supabase-test-resource65.mjs','stop']],
 ['t30-frozen-call-build16-regressions-1',['node',d+'/run-backend-regressions.mjs','call-admission','call-gateway','call-controls']],
 ['t30-frozen-publishing-build16-alone-1',['node',d+'/run-backend-regressions-with-team-play.mjs','publishing']],
 ['t30-frozen-publishing-gateway-build16-alone-1',['node',d+'/run-backend-regressions-with-team-play.mjs','publishing-gateway']],
 ['t30-call-lease-guards-build16-green-1',['node',d+'/run-call-participant-lease-batch2.mjs']],
 ['t30-lifecycle-noop-build16-green-1',['node',d+'/run-noop-write3.mjs']],
 ['t30-coalescing-build16-green-1',['node',d+'/probe-coalescing-build16-reviewed1.mjs','canonical']],
 ['t30-codex-gateway-normal-9',['node',d+'/probe-codex-gateway-trace9-normal.mjs','canonical']],
 ['t30-codex-gateway-media-io-9',['node',d+'/probe-codex-gateway-trace9-media-io.mjs','canonical']]
 ]){result=run(label,...args);if(result!==0)break;}}
finally{if(fs.existsSync(d+'/supabase-test-resource65.json')){const code=run('t30-supabase-restore-65','node',d+'/supabase-test-resource65.mjs','restore');if(code!==0)result=code;}}
process.exitCode=result;
