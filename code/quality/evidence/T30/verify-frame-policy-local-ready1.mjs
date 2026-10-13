import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const startedAt=new Date().toISOString(),d='quality/evidence/T30';
const deadline=Date.now()+55000;
let states;
while(Date.now()<deadline){
 const result=spawnSync('docker',['inspect','--format','{{.Name}} {{.State.Status}} {{.State.Health.Status}}','fg-local-postgres-1','fg-local-redis-1'],{encoding:'utf8',windowsHide:true,timeout:5000});
 states=result.stdout?.trim().split(/\r?\n/)??[];
 if(result.status===0&&states.length===2&&states.every(v=>v.endsWith(' running healthy')))break;
 await new Promise(resolve=>setTimeout(resolve,5000));
}
const healthy=states.length===2&&states.every(v=>v.endsWith(' running healthy'));
const pins=JSON.parse(fs.readFileSync(d+'/frame-lease-policy-red-entry-baseline-1.json')).pins;
for(const pin of pins)assert.equal(createHash('sha256').update(fs.readFileSync(pin.path)).digest('hex'),pin.sha256);
const review={startedAt,completedAt:new Date().toISOString(),healthy,states,pinsUnchanged:true,sourceChanged:false};
fs.writeFileSync(d+'/frame-policy-local-ready-1.json',JSON.stringify(review,null,2)+'\n',{flag:'wx'});
fs.appendFileSync('../.doc/history.md',`\n- Coding and build 2 — T30 — local service readiness ${review.completedAt}: actual recorded compose up postgres/redis exit0 using existing local configuration and volumes; observed readiness ${healthy}, original app/build/canonical/frozen/env/checker pins unchanged. Docker Desktop had been stopped, now running; other existing project services untouched. Evidence code/${d}/frame-policy-local-ready-1.json and codex-t30-local-service-restore-1.json. Candidate RED retry only after actual service healthy, T30 IN_PROGRESS/80priorPASS unchanged/no Anti2/no T31.\n`);
console.log(JSON.stringify(review));
assert(healthy,'Actual FG local services not healthy within bounded readiness');
