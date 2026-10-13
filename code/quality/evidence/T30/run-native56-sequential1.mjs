import fs from 'node:fs';import {spawnSync} from 'node:child_process';const d='quality/evidence/T30';
const run=args=>spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true}).status??1;let result=0;
try{
 for(const args of [
  [d+'/record.mjs','t30-supabase-temporary-stop-11','node',d+'/supabase-test-resource11.mjs','stop'],
  [d+'/record.mjs','t30-native56-service-health-1','docker','inspect','--format','{{.Name}} {{.State.Status}} {{.State.Health.Status}}','fg-local-postgres-1','fg-local-redis-1'],
  [d+'/enter-native56-reviewed1.mjs'],
  [d+'/record.mjs','headed-t30-native-56','node',d+'/rtp-window-reviewed3/run-parent.mjs']
 ]){result=run(args);if(result!==0)break;}
}finally{if(fs.existsSync(d+'/supabase-test-resource11.json')){const restored=run([d+'/record.mjs','t30-supabase-restore-11','node',d+'/supabase-test-resource11.mjs','restore']);if(restored!==0)result=restored;}}
process.exitCode=result;
