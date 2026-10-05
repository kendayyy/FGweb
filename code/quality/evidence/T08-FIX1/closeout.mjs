import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const records=JSON.parse(fs.readFileSync('quality/evidence/T08-FIX1/final-verification.json','utf8').replace(/^\uFEFF/,''));
assert.equal(records.length,10);for(const entry of records){assert.equal(entry.exitCode,0);assert.equal(hash(entry.evidencePath),entry.evidenceSha256);}
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8').replace(/^\uFEFF/,''));
const task=ledger.tasks.find(item=>item.id==='T08-FIX1');assert.equal(task.status,'IN_PROGRESS');
const files=['apps/api/src/modules/auth/auth.service.ts','apps/api/test/auth-profile-read.integration.spec.ts',...fs.readdirSync('quality/evidence/T08-FIX1').map(file=>'quality/evidence/T08-FIX1/'+file)];
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands:records,evidencePaths:['quality/evidence/T08-FIX1/review.md','quality/evidence/T08-FIX1/plan.md','quality/evidence/T08-FIX1/red.txt',...records.map(item=>item.evidencePath)],outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(files.map(file=>[file,hash(file)]))},blockers:[]});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Persisted onboarding/interest read and cleared owner avatar | T08-FIX1 | 5RED;6new+37BE+9FE tests, build/types/lint, native10 and cleanup/secret audit; T08-FIX1/final-verification.json | PASS |\n');
console.log('T08-FIX1 PASS from ten recorded checks.');
