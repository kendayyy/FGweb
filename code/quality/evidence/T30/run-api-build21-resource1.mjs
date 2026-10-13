import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';const d='quality/evidence/T30';
const run=(label,args)=>{assert(!fs.existsSync(d+'/codex-'+label+'.json'));const code=spawnSync(process.execPath,[d+'/record.mjs',label,...args],{stdio:'inherit',windowsHide:true}).status??1;const r=JSON.parse(fs.readFileSync(d+'/codex-'+label+'.json'));assert.equal(r.exitCode,code);fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — '+r.startedAt+'–'+r.completedAt+' exit'+code+': '+label+'; evidence code/'+d+'/codex-'+label+'.json. CODEX-ONLY/no cockpit startup/IN_PROGRESS/noT31.\n');return code;};let result=0;
try{result=run('t30-supabase-temporary-stop-88',['node',d+'/supabase-test-resource88.mjs','stop']);if(result===0)result=run('t30-api-build21-snapshot-1',['node',d+'/snapshot-api-build21.mjs']);
if(result===0)result=run('t30-api-build-21',['node','node_modules/typescript/bin/tsc','-p','apps/api/tsconfig.json','--incremental','false']);
if(result===0)result=run('t30-api-build-adoption-21-1',['node',d+'/adopt-api-build-21-reviewed1.mjs']);
if(result===0)result=run('t30-auth-pool-reuse-build21-green-1',['node',d+'/auth-pool-reuse-control2.mjs','green']);
if(result===0)result=run('t30-auth-pool-startup-fault-build21-1',['node',d+'/auth-pool-startup-fault-control2.mjs']);
if(result===0)result=run('t30-auth-security-build21-alone-1',['node',d+'/run-build21-auth-root-regressions1.mjs','auth']);
if(result===0)result=run('t30-auth-email-build21-alone-1',['node',d+'/run-build21-auth-root-regressions1.mjs','auth-email']);
if(result===0)result=run('t30-auth-admin-build21-alone-1',['node',d+'/run-build21-auth-root-regressions1.mjs','auth-admin']);}
finally{if(fs.existsSync(d+'/supabase-test-resource88.json')){const code=run('t30-supabase-restore-88',['node',d+'/supabase-test-resource88.mjs','restore']);if(code!==0)result=code;}}process.exitCode=result;
