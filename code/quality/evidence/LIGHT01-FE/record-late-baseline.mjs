import fs from 'node:fs';
import {createHash} from 'node:crypto';
const dir='quality/evidence/LIGHT01-FE',ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='LIGHT01-FE'),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
const mapping={specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md'};
const delta=Object.entries(mapping).map(([key,file])=>({file,approvedSha256:baseline.hashes[key],currentSha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
fs.writeFileSync(`${dir}/late-baseline-delta.json`,JSON.stringify({recordedAt:new Date().toISOString(),sources:delta,trustedRequest:{threadId:'01a114a3-ab20-70e2-b020-db31d489bffd',title:'Idea',turnId:'01a116cd-d5f8-72d1-9284-28178d493aec',userRequest:'bản kiếm các logo của các game gắn vào đi'},baselineUpdated:false,logoImplemented:false},null,2)+'\n');
task.status='BLOCKED';task.blockers=['Required user light appearance review per spec15/design12.','Late approved GAME-LOGO-01 docs amendment from Idea changed3 baseline hashes after technical tests; reviewed metadata migration still required before task closure/next strict gate.'];
for(const label of ['pending-report-lint-1','pending-report-audit-1','pending-report-diff-1']){const record=JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`));task.commands.push(record);task.evidencePaths.push(record.evidencePath);}
task.evidencePaths.push(`${dir}/baseline-change-review.md`,`${dir}/late-baseline-delta.json`);
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync(`${dir}/review.md`,'\nLate amendment: final14:45Z baseline audit FAILED after additive GAME-LOGO-01 documents from user-authorized Idea work. See baseline-change-review.md/late-baseline-delta.json. Earlier technical checks retain real PASS; current overall gate is BLOCKED for light visual review and metadata migration. No next task, checker/baseline modification or document revert.\n');
fs.appendFileSync('quality/spec-coverage.md','\nLIGHT01-FE late status: technical tests preserved; GAME-LOGO-01 changed3 source baseline hashes after successful audit. Overall closure also waits reviewed metadata migration;see evidence/LIGHT01-FE/baseline-change-review.md.\n');
console.log('Late approved logo amendment recorded; true baseline failure preserved; no baseline/checker/doc reset or next task.');
