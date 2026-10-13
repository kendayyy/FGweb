import fs from 'node:fs';import {spawnSync} from 'node:child_process';const d='quality/evidence/T30';
const run=args=>spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true}).status??1;let result=0;
try{
 for(const args of [
  [d+'/record.mjs','t30-supabase-temporary-stop-13','node',d+'/supabase-test-resource13.mjs','stop'],
  [d+'/record.mjs','t30-native58-service-health-1','docker','inspect','--format','{{.Name}} {{.State.Status}} {{.State.Health.Status}}','fg-local-postgres-1','fg-local-redis-1'],
  [d+'/enter-native58-reviewed1.mjs'],
  [d+'/record.mjs','headed-t30-native-58','node',d+'/rtp-window-reviewed3/run-parent.mjs']
 ]){result=run(args);if(result!==0)break;}
}finally{if(fs.existsSync(d+'/supabase-test-resource13.json')){const restored=run([d+'/record.mjs','t30-supabase-restore-13','node',d+'/supabase-test-resource13.mjs','restore']);if(restored!==0)result=restored;}}
process.exitCode=result;
