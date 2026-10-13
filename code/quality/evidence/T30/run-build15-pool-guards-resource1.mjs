import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';const d='quality/evidence/T30',run=(label,...args)=>{assert(!fs.existsSync(d+'/codex-'+label+'.json'));const code=spawnSync(process.execPath,[d+'/record.mjs',label,...args],{stdio:'inherit',windowsHide:true}).status??1;const r=JSON.parse(fs.readFileSync(d+'/codex-'+label+'.json'));fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — '+r.startedAt+'–'+r.completedAt+' exit'+code+': '+label+'; evidence code/'+d+'/codex-'+label+'.json. CODEX-ONLY/no cockpit startup/IN_PROGRESS/noT31.\n');return code;};let result=0;
try{for(const [label,args] of [
 ['t30-supabase-temporary-stop-59',['node',d+'/supabase-test-resource59.mjs','stop']],
 ['t30-api-build15-snapshot-1',['node',d+'/snapshot-api-build15.mjs']],
 ['t30-api-build-15',['node','node_modules/typescript/bin/tsc','-p','apps/api/tsconfig.json','--incremental','false']],
 ['t30-api-build-adoption-15-1',['node',d+'/adopt-api-build-15-reviewed1.mjs']],
 ['t30-teams-pool-reuse-green-1',['node',d+'/teams-pool-reuse-control2.mjs','green']],
 ['t30-teams-pool-build15-regressions-1',['node','C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js','run','test','--workspace','@fg/api','--','--runInBand','test/team-approval.integration.spec.ts','test/rooms.integration.spec.ts','test/room-play-sessions.integration.spec.ts','test/play-sessions.integration.spec.ts','test/play-session-capacity.integration.spec.ts','test/invitations.integration.spec.ts','test/chat-crypto-room-authority.integration.spec.ts']]
 ]){result=run(label,...args);if(result!==0)break;}}
finally{if(fs.existsSync(d+'/supabase-test-resource59.json')){const code=run('t30-supabase-restore-59','node',d+'/supabase-test-resource59.mjs','restore');if(code!==0)result=code;}}
process.exitCode=result;
