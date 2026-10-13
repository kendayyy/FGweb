import fs from 'node:fs';import {spawnSync} from 'node:child_process';const d='quality/evidence/T30';const run=args=>spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true}).status??1;let result=0;
try{for(const args of [
 [d+'/record.mjs','t30-supabase-temporary-stop-5','node',d+'/supabase-test-resource5.mjs','stop'],
 [d+'/record.mjs','t30-native52-service-health-1','docker','inspect','--format','{{.Name}} {{.State.Status}} {{.State.Health.Status}}','fg-local-postgres-1','fg-local-redis-1'],
 [d+'/enter-native52-reviewed1.mjs'],
 [d+'/record.mjs','headed-t30-native-52','node',d+'/run-native43-parent1.mjs']
]){result=run(args);if(result!==0)break;}}
finally{if(fs.existsSync(d+'/supabase-test-resource5.json')){const code=run([d+'/record.mjs','t30-supabase-restore-5','node',d+'/supabase-test-resource5.mjs','restore']);if(code!==0)result=code;}}
process.exitCode=result;
