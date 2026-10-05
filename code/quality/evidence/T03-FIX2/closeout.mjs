import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const records=JSON.parse(fs.readFileSync('quality/evidence/T03-FIX2/final-verification.json','utf8').replace(/^\uFEFF/,''));
assert.equal(records.length,7);for(const entry of records){assert.equal(entry.exitCode,0);assert.equal(hash(entry.evidencePath),entry.evidenceSha256);}
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8').replace(/^\uFEFF/,''));
const task=ledger.tasks.find(item=>item.id==='T03-FIX2');assert.equal(task.status,'IN_PROGRESS');
const files=['packages/contracts/src/auth.ts','packages/contracts/test/onboarding-state.test.ts','quality/api-contract.md',...fs.readdirSync('quality/evidence/T03-FIX2').map(file=>'quality/evidence/T03-FIX2/'+file)];
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands:records,evidencePaths:['quality/evidence/T03-FIX2/plan.md','quality/evidence/T03-FIX2/review.md','quality/evidence/T03-FIX2/red.txt',...records.map(item=>item.evidencePath)],outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(files.map(file=>[file,hash(file)]))},blockers:[]});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Onboarding completion/interests additive shared read contract | T03-FIX2 | 3RED then38contracts/build/API+web types/lint; T03-FIX2/final-verification.json | PASS |\n');
console.log('T03-FIX2 PASS from seven recorded checks.');
