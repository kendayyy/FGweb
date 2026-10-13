import fs from 'node:fs';
import assert from 'node:assert/strict';
const d='quality/evidence/T30';
const write=(name,value)=>fs.writeFileSync(d+'/'+name,value,{flag:'wx'});
write('supabase-test-resource12.mjs',fs.readFileSync(d+'/supabase-test-resource11.mjs','utf8').replaceAll('supabase-test-resource11','supabase-test-resource12'));
write('enter-native57-reviewed1.mjs',fs.readFileSync(d+'/enter-native56-reviewed1.mjs','utf8').replaceAll('native56','native57').replaceAll('diagnostic56','diagnostic57'));
assert.equal(JSON.parse(fs.readFileSync(d+'/codex-headed-t30-native-56.json')).exitCode,1);
write('run-native57-sequential1.mjs',`import fs from 'node:fs';import {spawnSync} from 'node:child_process';const d='quality/evidence/T30';
const run=args=>spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true}).status??1;let result=0;
try {
 for(const args of [
  [d+'/record.mjs','t30-supabase-temporary-stop-12','node',d+'/supabase-test-resource12.mjs','stop'],
  [d+'/record.mjs','t30-cockpit-temporary-stop-2','powershell.exe','-NoProfile','-File',d+'/cockpit-test-resource2.ps1','stop'],
  [d+'/record.mjs','t30-native57-service-health-1','docker','inspect','--format','{{.Name}} {{.State.Status}} {{.State.Health.Status}}','fg-local-postgres-1','fg-local-redis-1'],
  [d+'/enter-native57-reviewed1.mjs'],
  [d+'/record.mjs','headed-t30-native-57','node',d+'/rtp-window-reviewed3/run-parent.mjs']
 ]) { result=run(args);if(result!==0)break; }
} finally {
 if(fs.existsSync('.runtime/t30/cockpit-restart2.json')) { const restored=run([d+'/record.mjs','t30-cockpit-restore-2','powershell.exe','-NoProfile','-File',d+'/cockpit-test-resource2.ps1','restore']);if(restored!==0)result=restored; }
 if(fs.existsSync(d+'/supabase-test-resource12.json')) { const restored=run([d+'/record.mjs','t30-supabase-restore-12','node',d+'/supabase-test-resource12.mjs','restore']);if(restored!==0)result=restored; }
}
process.exitCode=result;
`);
fs.appendFileSync('../.doc/history.md','\n- Coding and build 2 — T30 — authorized resource review '+new Date().toISOString()+': native56 RED 16:00:38.696Z–16:01:43.359Z exit1/browser closed during first join; original25s assertion aborted, no captures/joins/connection errors. Allfivecleanup/inspector/18actualPG-ready phases complete; postfailure snapshot/checkpoint incomplete. Two actual viewport photos root viewed; Telegram receipts pending verification. Supabase11 restored16:01:43.821Z–16:02:03.770Z exit0. Cockpit process absent on inspection but close/private records absent: exact close time unproven, cannot attribute browser closure. Actual authorized executable restarted16:07:32.851Z–16:07:35.332Z/PID63384/running; evidence cockpit-restoration1.json. Fresh resource2 exact process/private argument validation and finallyrestore prepared before native57; user permissions persist. No app/assertion/deadline change/PASS/Anti2/T31.\n');
console.log('Fresh sequential headed entry and both resource restoration paths prepared.');
