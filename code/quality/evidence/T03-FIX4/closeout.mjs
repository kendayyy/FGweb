import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T03-FIX4';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const records=['build','contracts-regression','api-types','web-types','lint','diff','audit'].map(label=>JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`,'utf8')));
for(const record of records){assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
assert(fs.readFileSync(`${dir}/codex-contracts-regression.txt`,'utf8').includes('44 passed'));
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8').replace(/^\uFEFF/,''));
const task=ledger.tasks.find(item=>item.id==='T03-FIX4');assert.equal(task.status,'IN_PROGRESS');
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify(records,null,2)+'\n');
const outputs=['packages/contracts/src/uploads.ts','packages/contracts/src/index.ts','packages/contracts/test/uploads.test.ts','quality/api-contract.md',...fs.readdirSync(dir).map(file=>`${dir}/${file}`)];
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands:records,evidencePaths:[`${dir}/plan.md`,`${dir}/review.md`,`${dir}/codex-red-registry.txt`,`${dir}/final-verification.json`,...records.map(record=>record.evidencePath)],outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(outputs.map(file=>[file,hash(file)]))},blockers:[]});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Multipart upload and protected image content transport contracts | T03-FIX4 | 2RED;44 contracts tests, build/types/lint/audit; T03-FIX4/final-verification.json | PASS |\n');
console.log('T03-FIX4 PASS from seven verified checks.');
