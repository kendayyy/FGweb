import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T03-FIX10',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const records=['gate-1','contracts-2','build-1','test-types-1','lint-1','api-types-1','web-types-2','restore-docs-1','audit-3','diff-1'].map(l=>JSON.parse(fs.readFileSync(`${dir}/codex-${l}.json`)));
for(const r of records){assert.equal(r.exitCode,0);assert.equal(hash(r.evidencePath),r.evidenceSha256);}
assert.equal(JSON.parse(fs.readFileSync(`${dir}/codex-red-3.json`)).exitCode,1);
assert(fs.readFileSync(`${dir}/codex-contracts-2.txt`,'utf8').includes('81 passed'));
fs.writeFileSync(`${dir}/review.md`,'# T03-FIX10 Codex review: PASS\n\n7 new cases observed6 missing-behavior failures and1 old-transport compatibility pass before implementation.81 complete contracts tests PASS. Optional UTC consent fields preserve old DTOs, immutable target approval mapping selects only delegated helper permissions, new GET settings/PUT grants reuse existing schemas and retain PATCH aliases. Strict invitation mutation schemas reject client actor/consent overrides. Shared DTOs, API/web source and new-test types, build/lint, baseline/frozen/read-only/secrets scope audit and whitespace pass. No producer/database/frontend source changed; T06-FIX1 then T23 enforce runtime consent/current ACL and transactional admission. Failed runner attempts retained; no tests weakened or configuration changed.\n');
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify({task:'T03-FIX10',tests:81,newTests:7,checks:records,producerImplemented:false,failedRunsPreserved:true},null,2)+'\n');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name).replaceAll('\\','/')]);
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='T03-FIX10'),evidence=walk(dir);
assert.equal(task.status,'IN_PROGRESS');
const outputs=['packages/contracts/src/teams.ts','packages/contracts/src/index.ts','packages/contracts/test/invitation-transport.test.ts','quality/api-contract.md',...walk('packages/contracts/dist'),...evidence];
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands:records,evidencePaths:evidence,outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(outputs.map(f=>[f,hash(f)]))}});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Invitation optional persisted consent DTO, target-specific delegated permissions, GET settings/PUT grants aliases, strict actor fields and old routes | T03-FIX10 |7 new/81 contracts tests,build,lint,source/test/API/web types,scope audit | PASS (contracts) |\n');
console.log('T03-FIX10 PASS; T06-FIX1 next.');
