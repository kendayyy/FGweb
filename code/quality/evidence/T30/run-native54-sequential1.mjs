import fs from 'node:fs';import {spawnSync} from 'node:child_process';const d='quality/evidence/T30';
const run=args=>spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true}).status??1;let result=0;
try{
 for(const args of [
  [d+'/record.mjs','t30-supabase-temporary-stop-7','node',d+'/supabase-test-resource7.mjs','stop'],
  [d+'/record.mjs','t30-native54-service-health-1','docker','inspect','--format','{{.Name}} {{.State.Status}} {{.State.Health.Status}}','fg-local-postgres-1','fg-local-redis-1'],
  [d+'/enter-native54-reviewed1.mjs'],
  [d+'/record.mjs','headed-t30-native-54','node',d+'/rtp-window-reviewed3/run-parent.mjs']
 ]){result=run(args);if(result!==0)break;}
}finally{if(fs.existsSync(d+'/supabase-test-resource7.json')){const restored=run([d+'/record.mjs','t30-supabase-restore-7','node',d+'/supabase-test-resource7.mjs','restore']);if(restored!==0)result=restored;}}
process.exitCode=result;
