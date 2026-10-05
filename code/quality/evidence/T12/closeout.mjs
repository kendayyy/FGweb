import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T12';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const records=['regression-root-entry','acceptance-final','build-readable','types-readable','web-types','lint-closeout','diff-final','audit-final'].map(label=>JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`,'utf8')));
for(const record of records){assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
assert(fs.readFileSync(`${dir}/codex-regression-root-entry.txt`,'utf8').includes('53 passed'));
assert(fs.readFileSync(`${dir}/codex-acceptance-final.txt`,'utf8').includes('16 passed'));
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8').replace(/^\uFEFF/,''));
const task=ledger.tasks.find(item=>item.id==='T12');assert.equal(task.status,'IN_PROGRESS');
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify(records,null,2)+'\n');
const files=folder=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(folder,entry.name)):[path.join(folder,entry.name).replaceAll('\\','/')]);
const outputs=[...files('apps/api/src/modules/chat'),...files('apps/api/src/modules/realtime'),'apps/api/src/app.module.ts','apps/api/test/lobby.integration.spec.ts',...files(dir)];
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands:records,evidencePaths:[`${dir}/preflight.txt`,`${dir}/plan.md`,`${dir}/review.md`,`${dir}/codex-red-valid-fixture.txt`,`${dir}/codex-red-onboarding.txt`,`${dir}/final-verification.json`,...records.map(record=>record.evidencePath)],outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(outputs.map(file=>[file,hash(file)]))},blockers:[]});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Lobby history, native Socket.IO text chat, current session/private ACL, committed durable Redis events | T12 | 16 native tests;53 API regression tests; build/types/lint/audit; T12/final-verification.json | PASS |\n');
console.log('T12 PASS from eight verified checks; no media/load claim.');
