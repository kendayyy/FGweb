import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';const d='quality/evidence/T30',run=(label,...args)=>{assert(!fs.existsSync(d+'/codex-'+label+'.json'));const code=spawnSync(process.execPath,[d+'/record.mjs',label,...args],{stdio:'inherit',windowsHide:true}).status??1;const r=JSON.parse(fs.readFileSync(d+'/codex-'+label+'.json'));fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — '+r.startedAt+'–'+r.completedAt+' exit'+code+': '+label+'; evidence code/'+d+'/codex-'+label+'.json. CODEX-ONLY/no cockpit startup/IN_PROGRESS/noT31.\n');return code;};let result=0;
try{for(const [label,args] of [
 ['t30-lifecycle-room-read-lock-green-1',['node',d+'/lifecycle-room-read-lock-control1.mjs','green']],
 ['t30-profiles-room-crypto-build19-regressions-1',['node',d+'/run-build18-profile-room-root-regressions2.mjs','profiles','auth-profile-read','rooms','chat-crypto-room-authority']],
 ['t30-frozen-call-build19-regressions-1',['node',d+'/run-backend-regressions.mjs','call-admission','call-gateway','call-controls']],
 ['t30-frozen-publishing-build19-alone-1',['node',d+'/run-backend-regressions-with-team-play.mjs','publishing']],
 ['t30-frozen-publishing-gateway-build19-alone-1',['node',d+'/run-backend-regressions-with-team-play.mjs','publishing-gateway']],
 ['t30-call-lease-guards-build19-green-1',['node',d+'/run-call-participant-lease-batch2.mjs']],
 ['t30-lifecycle-lease-batch-build19-green-1',['node',d+'/run-lifecycle-lease-batch1.mjs']],
 ['t30-lifecycle-noop-build19-green-1',['node',d+'/run-noop-write3.mjs']],
 ['t30-coalescing-build19-green-1',['node',d+'/probe-coalescing-build19-reviewed1.mjs','canonical']],
 ['t30-codex-gateway-normal-12',['node',d+'/probe-codex-gateway-trace12-normal.mjs','canonical']],
 ['t30-codex-gateway-media-io-12',['node',d+'/probe-codex-gateway-trace12-media-io.mjs','canonical']]
 ]){result=run(label,...args);if(result!==0)break;}}
finally{if(false){const code=run('t30-supabase-restore-77','node',d+'/supabase-test-resource77.mjs','restore');if(code!==0)result=code;}}
process.exitCode=result;
