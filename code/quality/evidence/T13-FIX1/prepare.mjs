import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const dir='quality/evidence/T13-FIX1';
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8'));
assert(!ledger.tasks.some(t=>t.id==='T13-FIX1'));
const index=ledger.tasks.findIndex(t=>t.id==='T16-FE');
assert.equal(ledger.tasks[index].status,'BLOCKED');
const previous=ledger.tasks[index-1]; assert.equal(previous.status,'PASS');
ledger.tasks.splice(index,0,{id:'T13-FIX1',status:'IN_PROGRESS',dependencies:[previous.id],specSha256:previous.specSha256,inputsHash:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),outputsHash:null,commands:[],evidencePaths:[`${dir}/run-manifest.md`],startedAt:new Date().toISOString(),completedAt:null,blockers:[],writeAllowlist:['apps/web/test/lobby.test.tsx',`${dir}/**`]});
ledger.tasks[index+1].dependencies.push('T13-FIX1');
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.copyFileSync('apps/web/test/lobby.test.tsx',`${dir}/lobby-before.tsx`);
fs.copyFileSync('apps/web/src/features/lobby/LobbyPage.tsx',`${dir}/pending-LobbyPage.tsx`);
fs.writeFileSync(`${dir}/baseline-status.txt`,execFileSync('git',['status','--short'],{encoding:'utf8'}));
fs.writeFileSync(`${dir}/record-check.mjs`,fs.readFileSync('quality/evidence/T16-FE/record-check.mjs','utf8').replaceAll('T16-FE','T13-FIX1'));
fs.writeFileSync(`${dir}/test-types.json`,JSON.stringify({extends:'../../../apps/web/tsconfig.json',compilerOptions:{types:['vitest/globals','@testing-library/jest-dom/vitest','node']},include:['../../../apps/web/src','../../../apps/web/test/lobby.test.tsx']},null,2)+'\n');
// The prerequisite must check the predecessor's exact bytes. Preserve the authorized pending T16-FE mount and restore it in finally.
const mount='apps/web/src/features/lobby/LobbyPage.tsx',pending=fs.readFileSync(mount);
const original=execFileSync('git',['show',previous.inputsHash+':code/'+mount]);
const expected=ledger.tasks.slice(0,index).flatMap(t=>Object.entries(t.outputsHash?.files??{})).filter(([f])=>f===mount).at(-1)?.[1];
assert.equal(createHash('sha256').update(original).digest('hex'),expected.toLowerCase());
try {fs.writeFileSync(mount,original);execFileSync('node',[`${dir}/record-check.mjs`,'preflight','node','scripts/verify-task.mjs','T13-FIX1','apps/web/test/lobby.test.tsx'],{stdio:'inherit'});} finally {fs.writeFileSync(mount,pending);}
console.log('T13-FIX1 registered; pending feature bytes preserved.');
