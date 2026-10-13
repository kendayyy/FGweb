import fs from 'node:fs';const d='quality/evidence/T30',read=n=>fs.readFileSync(d+'/'+n,'utf8'),write=(n,s)=>fs.writeFileSync(d+'/'+n,s,{flag:'wx'});
write('supabase-test-resource108.mjs',read('supabase-test-resource107.mjs').replaceAll('resource107','resource108'));
write('probe-coalescing-build22-reviewed1.mjs',read('probe-coalescing-build20-reviewed1.mjs').replaceAll('coalescing-build20','coalescing-build22'));
for(const mode of ['normal','media-io'])write('probe-codex-gateway-linux3-'+mode+'.mjs',read('probe-codex-gateway-linux2-'+mode+'.mjs').replaceAll('smoke2','smoke3').replaceAll('review2-','review3-'));
const runs=[
 ['t30-supabase-temporary-stop-108',['node',d+'/supabase-test-resource108.mjs','stop']],
 ['t30-lifecycle-room-read-lock-build22-green-1',['node',d+'/lifecycle-room-read-lock-control2.mjs','green']],
 ['t30-frozen-call-build22-regressions-1',['node',d+'/run-backend-regressions.mjs','call-admission','call-gateway','call-controls']],
 ['t30-frozen-publishing-build22-alone-1',['node',d+'/run-backend-regressions-with-team-play.mjs','publishing']],
 ['t30-frozen-publishing-gateway-build22-alone-1',['node',d+'/run-backend-regressions-with-team-play.mjs','publishing-gateway']],
 ['t30-call-lease-guards-build22-green-1',['node',d+'/run-call-participant-lease-batch2.mjs']],
 ['t30-lifecycle-lease-batch-build22-green-1',['node',d+'/run-lifecycle-lease-batch2.mjs']],
 ['t30-lifecycle-noop-build22-green-1',['node',d+'/run-noop-write3.mjs']],
 ['t30-coalescing-build22-green-1',['node',d+'/probe-coalescing-build22-reviewed1.mjs','canonical']],
 ['t30-codex-gateway-linux-normal-3',['node',d+'/probe-codex-gateway-linux3-normal.mjs','canonical']],
 ['t30-codex-gateway-linux-media-io-3',['node',d+'/probe-codex-gateway-linux3-media-io.mjs','canonical']]
];
write('run-build22-guards-resource108.mjs',`import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';const d='quality/evidence/T30',runs=${JSON.stringify(runs)};const run=(label,...args)=>{assert(!fs.existsSync(d+'/codex-'+label+'.json'));const code=spawnSync(process.execPath,[d+'/record.mjs',label,...args],{stdio:'inherit',windowsHide:true}).status??1;const r=JSON.parse(fs.readFileSync(d+'/codex-'+label+'.json'));fs.appendFileSync('../.doc/history.md','\\n- Coding and build 2 — T30 — '+r.startedAt+'–'+r.completedAt+' exit'+code+': '+label+'; evidence code/'+d+'/codex-'+label+'.json. Build22/noCockpit/noT31.\\n');return code;};let result=0;try{for(const[label,args]of runs){result=run(label,...args);if(result!==0)break;}}finally{if(fs.existsSync(d+'/supabase-test-resource108.json')){const code=run('t30-supabase-restore-108','node',d+'/supabase-test-resource108.mjs','restore');if(code!==0)result=code;}}process.exitCode=result;\n`);
