import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T18-FIX1';
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),t=ledger.tasks.find(t=>t.id==='T18-FIX1'),next=ledger.tasks.find(t=>t.id==='T19');
assert.equal(t.status,'IN_PROGRESS');assert.equal(next.status,'BLOCKED');assert.equal(ledger.tasks.find(t=>t.id==='T03-FIX7').status,'PASS');
const labels=['preflight-1','provider-audit-1','review-guards-2','api-build-1','api-regression-2','required-rooms-1','native-bridge-1','native-rooms-1','native-list-1','native-session-1','final-lint-1','final-types-1','cleanup-1','final-audit-2','final-diff-2'];
const records=labels.map(l=>JSON.parse(fs.readFileSync(`${dir}/codex-${l}.json`)));
for(const r of records){assert.equal(r.exitCode,0,r.command);assert.equal(hash(r.evidencePath),r.evidenceSha256);assert(Date.parse(r.startedAt)>=Date.parse(t.startedAt));}
assert(fs.readFileSync(`${dir}/codex-api-regression-2.txt`,'utf8').includes('9 passed'));assert(fs.readFileSync(`${dir}/codex-api-regression-2.txt`,'utf8').includes('152 passed'));
assert(fs.readFileSync(`${dir}/codex-required-rooms-1.txt`,'utf8').includes('23 passed'));
assert.equal(JSON.parse(fs.readFileSync(`${dir}/codex-api-regression-1.json`)).exitCode,1);
assert.equal(JSON.parse(fs.readFileSync(`${dir}/codex-review-guards-1.json`)).exitCode,1);
const red=[24,31,43].map(i=>JSON.parse(fs.readFileSync(`${dir}/codex-recovered-red-${i}.json`)));
for(const r of red){assert.equal(r.exitCode,1);assert.equal(hash(r.evidencePath),r.evidenceSha256);}
assert(fs.readFileSync(`${dir}/review.md`,'utf8').includes('Codex review: PASS'));
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify({verifiedChecks:records,preProducerRed:red,initialInterrupted:true,preservedFailedRuns:['codex-api-regression-1.json','codex-review-guards-1.json']},null,2)+'\n');
const files=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):[path.join(d,e.name).replaceAll('\\','/')]);
const outputs=['apps/api/src/modules/rooms/rooms.service.ts','apps/api/test/rooms.integration.spec.ts',...files(dir)];
Object.assign(t,{status:'PASS',completedAt:new Date().toISOString(),commands:records,evidencePaths:files(dir),outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(outputs.map(f=>[f,hash(f)]))},blockers:[]});
next.status='NOT_STARTED';next.blockers=[];
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Authenticated room-to-chat identity uses persisted conversation FK on all RoomDTO projections; private membership/REST/socket revocation preserved | T03-FIX7 + T18-FIX1 |64 contracts,23 rooms,152 API; real compiled API/PG/Redis identity bridge,10 ownership races,session/list revocation; types/lint/build/frozen/scope/cleanup | PASS |\n');
console.log('T18-FIX1 PASS after independent Codex review; T19 unlocked for approved frontend preflight.');
