import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T07-FIX1';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const records=['build','regression-serial','test-types','api-types','lint-final','diff','audit-statement-check'].map(label=>JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`,'utf8')));
for(const record of records){assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
assert(fs.readFileSync(`${dir}/codex-regression-serial.txt`,'utf8').includes('40 passed'));
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8'));
const task=ledger.tasks.find(item=>item.id==='T07-FIX1');assert.equal(task.status,'IN_PROGRESS');
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify(records,null,2)+'\n');
const files=folder=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(folder,entry.name)):[path.join(folder,entry.name).replaceAll('\\','/')]);
const outputs=['packages/database/src/schema/realtime-outbox.ts','packages/database/src/index.ts','packages/database/test/realtime-outbox.test.ts','packages/database/migrations/0004_demonic_tenebrous.sql','packages/database/migrations/meta/0004_snapshot.json','packages/database/migrations/meta/_journal.json',...files(dir)];
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands:records,evidencePaths:[`${dir}/plan.md`,`${dir}/review.md`,`${dir}/codex-red.txt`,`${dir}/final-verification.json`,...records.map(record=>record.evidencePath)],outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(outputs.map(file=>[file,hash(file)]))},blockers:[]});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Durable message creation outbox prerequisite | T07-FIX1 | 4RED;40 PostgreSQL tests; build/types/lint/audit; T07-FIX1/final-verification.json | PASS |\n');
console.log('T07-FIX1 PASS from seven verified checks.');
