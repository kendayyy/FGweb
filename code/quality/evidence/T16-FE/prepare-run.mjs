import fs from 'node:fs';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const file='quality/tasks.json',ledger=JSON.parse(fs.readFileSync(file,'utf8')),task=ledger.tasks.find(t=>t.id==='T16-FE');assert.equal(task.status,'NOT_STARTED');assert.equal(ledger.tasks.find(t=>t.id==='T16').status,'PASS');
Object.assign(task,{status:'IN_PROGRESS',startedAt:new Date().toISOString(),inputsHash:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),writeAllowlist:['apps/web/src/features/presence/**','apps/web/src/features/lobby/OnlineUsers.tsx','apps/web/test/presence.test.tsx','apps/web/src/features/lobby/LobbyPage.tsx','quality/evidence/T16-FE/**'],blockers:[]});
fs.writeFileSync(file,JSON.stringify(ledger,null,2)+'\n');
fs.writeFileSync('quality/evidence/T16-FE/record-check.mjs',fs.readFileSync('quality/evidence/T16/record-check.mjs','utf8').replaceAll('T16','T16-FE'));
fs.writeFileSync('quality/evidence/T16-FE/baseline-status.txt',execFileSync('git',['status','--short'],{encoding:'utf8'}));
console.log('T16-FE activated after T16 review/commit/gate. Existing LobbyPage allowed only minimal panel mount required by task Build; no redesign/chat logic change.');
