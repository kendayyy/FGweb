import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const dir='quality/evidence/T16-FE',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const labels=['closeout-preflight','independent-task-final','independent-review-final','independent-lint-final','independent-types-final','independent-build-final','independent-native-final','closeout-audit'];
const records=labels.map(l=>JSON.parse(fs.readFileSync(`${dir}/codex-${l}.json`,'utf8')));
records.push(JSON.parse(fs.readFileSync('quality/evidence/T13-FIX1/codex-independent-full-web.json','utf8')));
for(const r of records){assert.equal(r.exitCode,0);assert.equal(hash(r.evidencePath),r.evidenceSha256);}
assert(fs.readFileSync(`${dir}/codex-independent-task-final.txt`,'utf8').includes('21 passed'));assert(fs.readFileSync(`${dir}/codex-independent-review-final.txt`,'utf8').includes('24 passed'));assert.equal(fs.readFileSync(`${dir}/refactor-8-exit.txt`,'utf8').trim(),'0');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8')),task=ledger.tasks.find(t=>t.id==='T16-FE');assert.equal(task.status,'IN_PROGRESS');assert.equal(ledger.tasks.find(t=>t.id==='T13-FIX1').status,'PASS');
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify(records,null,2)+'\n');
const files=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):[path.join(d,e.name).replaceAll('\\','/')]);
const outputs=[...files('apps/web/src/features/presence'),'apps/web/src/features/lobby/OnlineUsers.tsx','apps/web/src/features/lobby/LobbyPage.tsx','apps/web/test/presence.test.tsx',...files(dir)];
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands:records,evidencePaths:[...new Set([...task.evidencePaths,`${dir}/closeout-review.md`,`${dir}/final-verification.json`,...records.flatMap(r=>[r.evidencePath,r.evidencePath.replace(/\.txt$/,'.json')])])],outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(outputs.map(f=>[f,hash(f)]))},blockers:[]});
assert.equal(ledger.tasks.find(t=>t.id==='T17-BE').status,'NOT_STARTED');
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Lobby online panel, independent chosen status, tab deduplication, authenticated lifecycle and profile links | T16-FE | 21task+24reviewer;68FE with T13-FIX1; native built web/Nest/PG/Redis,4 viewports; types/lint/build/frozen audit; T16-FE/final-verification.json | PASS |\n');
console.log('T16-FE PASS after independent review; T17-BE ready for preflight.');
