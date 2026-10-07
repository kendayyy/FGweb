import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkBaselines} from '../../../scripts/verify-task.mjs';

const directory='quality/evidence/AUTH-ADMIN-SINGLE';
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));
const task=ledger.tasks.find(item=>item.id==='AUTH-ADMIN-SINGLE');
const hash=path=>createHash('sha256').update(fs.readFileSync(path)).digest('hex');
assert.equal(task.status,'BLOCKED');
assert.equal(checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),8);
for(const [path,expected] of Object.entries(task.pendingOutputsHash.files))assert.equal(hash(path),expected,path);
for(const label of ['gate-1','admin-local-input-3']){
 const record=JSON.parse(fs.readFileSync(`${directory}/codex-${label}.json`));
 assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);
}
const input=JSON.parse(fs.readFileSync(`${directory}/codex-admin-local-input-3.txt`));
assert.equal(input.ready,true);
task.resumeHistory=[...(task.resumeHistory??[]),{resumedAt:new Date().toISOString(),previousBlockedAt:task.blockedAt,previousBlockers:task.blockers,reason:'Human confirmed saved local input; flags-only validation passed. Main ownership and activation remain pending.'}];
task.status='IN_PROGRESS';task.blockers=[];
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({task:task.id,status:task.status,baselines:8,resumeFingerprintMatches:true,privateInputValid:true,mainOwnershipPending:true}));
