import {spawnSync} from 'node:child_process';
const d='quality/evidence/T30';
for(const args of [
 [d+'/record.mjs','t30-native48-service-health-1','docker','inspect','--format','{{.Name}} {{.State.Status}} {{.State.Health.Status}}','fg-local-postgres-1','fg-local-redis-1'],
 [d+'/enter-native48-reviewed1.mjs'],
 [d+'/record.mjs','headed-t30-native-48','node',d+'/rtp-window-reviewed2/run-parent.mjs']
]){const result=spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true});if(result.status!==0){process.exitCode=result.status??1;break;}}
