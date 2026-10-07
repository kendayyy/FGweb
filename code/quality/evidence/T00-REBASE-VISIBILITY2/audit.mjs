import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T00-REBASE-VISIBILITY2',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
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
const pending=JSON.parse(fs.readFileSync(`${dir}/suspended-T06-work.json`));
assert.deepEqual(Object.keys(pending),['packages/database/src/schema/recruitments.ts','packages/database/migrations/meta/_journal.json']);
const consent=current.tasks.find(t=>t.id==='T06-FIX1');assert.equal(consent.status,'BLOCKED');
for(const [f,h]of Object.entries(pending)){assert(consent.writeAllowlist.includes(f));assert.equal(hash(f),h,'Suspended approved T06 work changed during metadata review');}
for(const [f,h]of latest)if(!['quality/spec-baseline.json','AGENTS.md',...Object.keys(pending)].includes(f))assert.equal(hash(f),h.toLowerCase(),f);
assert.equal(hash('../.doc/01-product-spec.md'),hash(`${dir}/spec.md`));assert.equal(hash('../.doc/task.md'),hash(`${dir}/task.md`));
console.log(JSON.stringify({baselines:6,historicPassRecordsUnchanged:previous.tasks.filter(t=>t.status==='PASS').length,frozenFiles:latest.size,checkerUnchanged:true,processOnlyAmendment:true}));
