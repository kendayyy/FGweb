import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const dir='quality/evidence/T13-FIX1',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const labels=['preflight','independent-full-web','independent-types','independent-lint','independent-audit'];
const records=labels.map(l=>JSON.parse(fs.readFileSync(`${dir}/codex-${l}.json`,'utf8')));for(const r of records){assert.equal(r.exitCode,0);assert.equal(hash(r.evidencePath),r.evidenceSha256);}
assert(fs.readFileSync(`${dir}/codex-independent-full-web.txt`,'utf8').includes('68 passed'));assert.equal(fs.readFileSync(`${dir}/antigravity-exit.txt`,'utf8').trim(),'0');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8')),task=ledger.tasks.find(t=>t.id==='T13-FIX1');assert.equal(task.status,'IN_PROGRESS');
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify(records,null,2)+'\n');
const files=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):[path.join(d,e.name).replaceAll('\\','/')]);
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands:records,evidencePaths:[`${dir}/review.md`,`${dir}/run-manifest.md`,`${dir}/codex-red.txt`,`${dir}/final-verification.json`,...records.flatMap(r=>[r.evidencePath,r.evidencePath.replace(/\.txt$/,'.json')])],outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(['apps/web/test/lobby.test.tsx',...files(dir)].map(f=>[f,hash(f)]))},blockers:[]});
const next=ledger.tasks.find(t=>t.id==='T16-FE');assert.equal(next.status,'BLOCKED');next.status='IN_PROGRESS';next.blockers=[];
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Presence-compatible Lobby test adapter; original 9 behaviors/assertions preserved | T13-FIX1 | 8RED; independent68FE, types/lint/assertion+baseline audit; T13-FIX1/final-verification.json | PASS |\n');
console.log('T13-FIX1 PASS; T16-FE resumed for its own closeout; T17 remains closed.');
