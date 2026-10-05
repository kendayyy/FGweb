import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T11';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const labels=['final-unit-stable','final-regression-stable','final-review-tests','build-touch-repair','final-types-web','types-owner-edits','lint-owner-edits','final-diff','e2e-final-owner-edits','audit-owner-edits'];
const records=labels.map(label=>JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`,'utf8')));
for(const record of records){assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
assert(fs.readFileSync(`${dir}/codex-final-unit-stable.txt`,'utf8').includes('12 passed'));
assert(fs.readFileSync(`${dir}/codex-final-regression-stable.txt`,'utf8').includes('28 passed'));
assert(fs.readFileSync(`${dir}/codex-final-review-tests.txt`,'utf8').includes('7 passed'));
assert(fs.readFileSync(`${dir}/codex-e2e-final-owner-edits.txt`,'utf8').includes('1 passed'));
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8').replace(/^\uFEFF/,''));
const task=ledger.tasks.find(item=>item.id==='T11');assert.equal(task.status,'IN_PROGRESS');
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify(records,null,2)+'\n');
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name).replaceAll('\\','/')]);}
const outputs=[...files('apps/web/src/features/profiles'),...files('apps/web/src/features/onboarding'),'apps/web/src/App.tsx','apps/web/src/features/auth/HeaderAuthWidget.tsx','apps/web/test/profiles.test.tsx','tests/e2e/onboarding.spec.ts',...files(dir)];
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands:records,evidencePaths:[`${dir}/review.md`,`${dir}/final-verification.json`,...records.map(record=>record.evidencePath)],outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(outputs.map(file=>[file,hash(file)]))},blockers:[],executor:'Codex direct repair/review after authorized Anti2 delegation'});
task.antigravity.result='STOPPED_AFTER_TWO_INCOMPLETE_REFACTOR_LOOPS';task.antigravity.refactorLoops=2;
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Onboarding, owner/public profiles and account-safe mutations | T11 | 12 task +28 frontend +7 reviewer; real PG/API E2E, four viewports and cleanup; quality/evidence/T11/final-verification.json | PASS |\n');
console.log(`T11 PASS: ${records.length} verified checks, ${outputs.length} frozen outputs.`);
