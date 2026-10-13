import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';const d='quality/evidence/T30',run=(label,...args)=>{assert(!fs.existsSync(d+'/codex-'+label+'.json'));const code=spawnSync(process.execPath,[d+'/record.mjs',label,...args],{stdio:'inherit',windowsHide:true}).status??1;const r=JSON.parse(fs.readFileSync(d+'/codex-'+label+'.json'));fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — '+r.startedAt+'–'+r.completedAt+' exit'+code+': '+label+'; evidence code/'+d+'/codex-'+label+'.json. CODEX-ONLY/no cockpit startup/IN_PROGRESS/noT31.\n');return code;};let result=0;
try{for(const [label,args] of [
 ['t30-supabase-temporary-stop-89',['node',d+'/supabase-test-resource89.mjs','stop']],
 ['t30-auth-cost-diagnostic-1',['node',d+'/auth-cost-diagnostic1.mjs']],
 ['t30-auth-email-build21-alone-2',['node',d+'/run-build21-auth-root-regressions2.mjs','auth-email']],
 ['t30-auth-admin-build21-alone-1',['node',d+'/run-build21-auth-root-regressions2.mjs','auth-admin']],
 ['t30-lifecycle-room-read-lock-build21-green-1',['node',d+'/lifecycle-room-read-lock-control2.mjs','green']],
 ['t30-profiles-room-crypto-build21-regressions-1',['node',d+'/run-build21-auth-root-regressions1.mjs','profiles','auth-profile-read','rooms','chat-crypto-room-authority']],
 ['t30-frozen-call-build21-regressions-1',['node',d+'/run-backend-regressions.mjs','call-admission','call-gateway','call-controls']],
 ['t30-frozen-publishing-build21-alone-1',['node',d+'/run-backend-regressions-with-team-play.mjs','publishing']],
 ['t30-frozen-publishing-gateway-build21-alone-1',['node',d+'/run-backend-regressions-with-team-play.mjs','publishing-gateway']],
 ['t30-call-lease-guards-build21-green-1',['node',d+'/run-call-participant-lease-batch2.mjs']],
 ['t30-lifecycle-lease-batch-build21-green-1',['node',d+'/run-lifecycle-lease-batch2.mjs']],
 ['t30-lifecycle-noop-build21-green-1',['node',d+'/run-noop-write3.mjs']],
 ['t30-coalescing-build21-green-1',['node',d+'/probe-coalescing-build20-reviewed1.mjs','canonical']],
 ['t30-codex-gateway-normal-17',['node',d+'/probe-codex-gateway-trace17-normal.mjs','canonical']],
 ['t30-codex-gateway-media-io-17',['node',d+'/probe-codex-gateway-trace17-media-io.mjs','canonical']]
 ]){result=run(label,...args);if(result!==0)break;}}
finally{if(fs.existsSync(d+'/supabase-test-resource89.json')){const code=run('t30-supabase-restore-89','node',d+'/supabase-test-resource89.mjs','restore');if(code!==0)result=code;}}
process.exitCode=result;
