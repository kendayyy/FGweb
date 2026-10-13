import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';const d='quality/evidence/T30',run=(label,...args)=>{assert(!fs.existsSync(d+'/codex-'+label+'.json'));const code=spawnSync(process.execPath,[d+'/record.mjs',label,...args],{stdio:'inherit',windowsHide:true}).status??1;const r=JSON.parse(fs.readFileSync(d+'/codex-'+label+'.json'));fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — '+r.startedAt+'–'+r.completedAt+' exit'+code+': '+label+'; evidence code/'+d+'/codex-'+label+'.json. CODEX-ONLY/no cockpit startup/IN_PROGRESS/noT31.\n');return code;};let result=0;
try{for(const [label,args] of [
 ['t30-supabase-temporary-stop-60',['node',d+'/supabase-test-resource60.mjs','stop']],
 ['t30-teams-pool-reuse-green-1',['node',d+'/teams-pool-reuse-control2.mjs','green']],
 ['t30-teams-pool-build15-regressions-1',['node','C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js','run','test','--workspace','@fg/api','--','--runInBand','test/team-approval.integration.spec.ts','test/rooms.integration.spec.ts','test/room-play-sessions.integration.spec.ts','test/play-sessions.integration.spec.ts','test/play-session-capacity.integration.spec.ts','test/invitations.integration.spec.ts','test/chat-crypto-room-authority.integration.spec.ts']],
 ['t30-frozen-call-build15-regressions-1',['node',d+'/run-backend-regressions.mjs','call-admission','call-gateway','call-controls']],
 ['t30-frozen-publishing-build15-alone-1',['node',d+'/run-backend-regressions-with-team-play.mjs','publishing']],
 ['t30-frozen-publishing-gateway-build15-alone-1',['node',d+'/run-backend-regressions-with-team-play.mjs','publishing-gateway']],
 ['t30-lifecycle-noop-build15-green-1',['node',d+'/run-noop-write3.mjs']]
 ]){result=run(label,...args);if(result!==0)break;}}
finally{if(fs.existsSync(d+'/supabase-test-resource60.json')){const code=run('t30-supabase-restore-60','node',d+'/supabase-test-resource60.mjs','restore');if(code!==0)result=code;}}
process.exitCode=result;
