import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';const d='quality/evidence/T30',run=(label,...args)=>{assert(!fs.existsSync(d+'/codex-'+label+'.json'));const code=spawnSync(process.execPath,[d+'/record.mjs',label,...args],{stdio:'inherit',windowsHide:true}).status??1;const r=JSON.parse(fs.readFileSync(d+'/codex-'+label+'.json'));fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — '+r.startedAt+'–'+r.completedAt+' exit'+code+': '+label+'; evidence code/'+d+'/codex-'+label+'.json. CODEX-ONLY/no cockpit startup/IN_PROGRESS/noT31.\n');return code;};let result=0;
try{for(const [label,args] of [
 ['t30-supabase-temporary-stop-78',['node',d+'/supabase-test-resource78.mjs','stop']],
 ['t30-profiles-room-crypto-build18-regressions-3',['node',d+'/run-build18-profile-room-root-regressions2.mjs','profiles','auth-profile-read','rooms','chat-crypto-room-authority']]

 ]){result=run(label,...args);if(result!==0)break;}}
finally{if(fs.existsSync(d+'/supabase-test-resource78.json')){const code=run('t30-supabase-restore-78','node',d+'/supabase-test-resource78.mjs','restore');if(code!==0)result=code;}}
process.exitCode=result;
