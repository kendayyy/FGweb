import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T13', hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const labels=['acceptance-anchor-closeout','regression-anchor-closeout','types-anchor-complete','lint-anchor-complete','build-anchor-complete','native-anchor-complete','audit-anchor-complete','diff-anchor-complete'];
const records=labels.map(label=>JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`,'utf8')));
for(const record of records){assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
assert(fs.readFileSync(`${dir}/codex-acceptance-anchor-closeout.txt`,'utf8').includes('9 passed'));
assert(fs.readFileSync(`${dir}/codex-regression-anchor-closeout.txt`,'utf8').includes('37 passed'));
assert(fs.readFileSync(`${dir}/codex-native-anchor-complete.txt`,'utf8').includes('Owned native schema and servers closed'));
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8').replace(/^\uFEFF/,'')),task=ledger.tasks.find(item=>item.id==='T13');assert.equal(task.status,'IN_PROGRESS');
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify(records,null,2)+'\n');
const files=folder=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(folder,entry.name)):[path.join(folder,entry.name).replaceAll('\\','/')]);
const outputs=[...files('apps/web/src/features/lobby'),'apps/web/src/layouts/AppShell.tsx','apps/web/src/App.tsx','apps/web/test/lobby.test.tsx',...files(dir)];
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands:records,evidencePaths:[`${dir}/preflight.txt`,`${dir}/plan.md`,`${dir}/review.md`,`${dir}/codex-red.txt`,`${dir}/final-verification.json`,...records.map(record=>record.evidencePath)],outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(outputs.map(file=>[file,hash(file)]))},blockers:[]});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Seven-game responsive Lobby, guest/member text chat, reconnect ID merge and reading position | T13 | 9 task +37 FE tests; native built-web/Nest/PG/Redis; four viewports, drawer/focus/scroll; T13/final-verification.json | PASS |\n');
console.log('T13 PASS from eight verified checks.');
