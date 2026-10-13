import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const before=JSON.parse(fs.readFileSync('quality/evidence/T26/gateway-before.json'));
assert.equal(createHash('sha256').update(fs.readFileSync('.env.local')).digest('hex'),before.configuration.env);
let ready=false;
for(let i=0;i<40;i++){
 const result=spawnSync('docker',['info','--format','{{.ServerVersion}}'],{encoding:'utf8',windowsHide:true,timeout:3000});
 if(result.status===0){ready=true;break;}await new Promise(r=>setTimeout(r,1000));
}
assert(ready,'Docker engine remains unavailable');
const list=execFileSync('docker',['ps','-a','--format','{{.Names}}'],{encoding:'utf8',windowsHide:true});
const names=['fg-local-postgres-1','fg-local-redis-1'];for(const name of names)assert(list.split(/\r?\n/).includes(name),`Expected existing local container missing: ${name}`);
// Start existing containers only; no reset/recreate of volumes or media version.
execFileSync('docker',['start',...names],{stdio:'pipe',windowsHide:true,timeout:30000});
let healthy=false;
for(let i=0;i<30;i++){
 const states=names.map(name=>execFileSync('docker',['inspect','--format','{{.State.Health.Status}}',name],{encoding:'utf8',windowsHide:true}).trim());
 if(states.every(s=>s==='healthy')){healthy=true;break;}await new Promise(r=>setTimeout(r,1000));
}
assert(healthy,'Local PG/Redis recovery failed');
const report={recordedAt:new Date().toISOString(),startedExistingContainers:names,healthy:true,reset:false,mediaRestarted:false,envUnchanged:true};
fs.writeFileSync('quality/evidence/T26/service-recovery.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
