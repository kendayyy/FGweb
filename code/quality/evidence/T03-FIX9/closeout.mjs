import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T03-FIX9',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const records=['gate-1','contracts-1','build-1','test-types-1','lint-1','api-types-1','web-types-1','audit-1'].map(l=>JSON.parse(fs.readFileSync(`${dir}/codex-${l}.json`)));
for(const r of records){assert.equal(r.exitCode,0);assert.equal(hash(r.evidencePath),r.evidenceSha256);}
assert.equal(JSON.parse(fs.readFileSync(`${dir}/codex-red-1.json`)).exitCode,1);
assert(fs.readFileSync(`${dir}/codex-contracts-1.txt`,'utf8').includes('74 passed'));
fs.writeFileSync(`${dir}/review.md`,'# Contract-only Codex review: PASS\n\n5 new tests observed four missing-transport failures and one existing-compatibility pass before implementation.74 complete contracts tests now PASS, including all existing cases. Shared TeamSnapshotSchema replaces no fields and is identical for member-only REST/socket validation. Apply/approve/reject aliases retain old transports and exact owner/helper permission metadata. Body cannot select applicant/action; enforcement belongs to T22. Build, changed-source lint, source/new-test/API/web types and read-only/frozen/spec/secrets scope audit pass. No backend/database/UI source changed. Derived dist files rebuilt from approved source; explicit ledger ownership recorded.\n');
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify({task:'T03-FIX9',checks:records,tests:74,backendImplemented:false,producerTask:'T22',failedRunsPreserved:true},null,2)+'\n');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name).replaceAll('\\','/')]);
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),t=ledger.tasks.find(t=>t.id==='T03-FIX9'),evidence=walk(dir);
const files=['packages/contracts/src/index.ts','packages/contracts/test/team-approval-transport.test.ts','quality/api-contract.md',...walk('packages/contracts/dist'),...evidence];
Object.assign(t,{status:'PASS',completedAt:new Date().toISOString(),commands:records,evidencePaths:evidence,outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(files.map(f=>[f,hash(f)]))}});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Team apply/approve/reject aliases; shared member-only REST/socket roster snapshot; old routes compatible | T03-FIX9 |5 new/74 contracts tests,build,lint,consumer/test types,scope audit | PASS (contracts; producer T22 pending) |\n');
console.log('T03-FIX9 PASS; T22 ready.');
