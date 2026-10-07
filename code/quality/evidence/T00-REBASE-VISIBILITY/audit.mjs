import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T00-REBASE-VISIBILITY',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const previous=JSON.parse(fs.readFileSync(`${dir}/previous-ledger.json`)),current=JSON.parse(fs.readFileSync('quality/tasks.json'));
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
assert.equal(checkBaselines({root:process.cwd(),baseline}),6);
const latest=new Map();
for(const old of previous.tasks.filter(t=>t.status==='PASS')){
 const task=current.tasks.find(t=>t.id===old.id);assert.equal(task.status,'PASS');
 for(const field of ['outputsHash','commands','evidencePaths','startedAt','completedAt'])assert.deepEqual(task[field],old[field],`${old.id}/${field}`);
 for(const cmd of task.commands){assert.equal(cmd.exitCode,0);if(cmd.evidenceSha256)assert.equal(hash(cmd.evidencePath),cmd.evidenceSha256);}
 for(const [f,h]of Object.entries(old.outputsHash?.files??{}))latest.set(f,h);
}
for(const [f,h]of latest)if(!['quality/spec-baseline.json','AGENTS.md'].includes(f))assert.equal(hash(f),h.toLowerCase(),f);
for(const name of ['01-product-spec.md','02-frontend-design.md','task.md'])assert.equal(hash(`../.doc/${name}`),hash(`${dir}/${name}`));
const smoke=JSON.parse(fs.readFileSync(`${dir}/codex-exit-smoke-2.json`)),launch=JSON.parse(fs.readFileSync(`${dir}/visible-exit-smoke-2-launch.json`));
assert.equal(smoke.exitCode,7);assert.equal(hash(smoke.evidencePath),smoke.evidenceSha256);
assert.match(fs.readFileSync(smoke.evidencePath,'utf8'),/stdout-probe/);assert.match(fs.readFileSync(smoke.evidencePath,'utf8'),/stderr-probe/);
assert.equal(launch.windowStyle,'Normal');assert.equal(launch.noExit,true);assert(launch.pid>0);
assert.equal(smoke.observation.realtimeStdoutStderr,true);
assert.deepEqual(current.tasks.filter(t=>previous.tasks.some(p=>p.id===t.id)).map(t=>t.id),previous.tasks.map(t=>t.id));
assert(current.tasks.filter(t=>t.id.startsWith('T38-FEED-')).every(t=>t.status==='NOT_STARTED'));
console.log(JSON.stringify({baselines:6,historicPassRecordsUnchanged:previous.tasks.filter(t=>t.status==='PASS').length,frozenFiles:latest.size,visibleFailureExitCode:7,stdoutStderrCaptured:true,feedImplemented:false,checkerUnchanged:true}));
