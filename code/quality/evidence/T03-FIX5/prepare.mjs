import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const dir='quality/evidence/T03-FIX5';const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8'));assert(!ledger.tasks.some(t=>t.id==='T03-FIX5'));
const index=ledger.tasks.findIndex(t=>t.id==='T16');assert.equal(ledger.tasks[index-1].id,'T15');assert.equal(ledger.tasks[index-1].status,'PASS');
const task={id:'T03-FIX5',status:'IN_PROGRESS',dependencies:['T15'],specSha256:ledger.tasks[index].specSha256,inputsHash:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),outputsHash:null,commands:[],evidencePaths:[],startedAt:new Date().toISOString(),completedAt:null,blockers:[],writeAllowlist:['packages/contracts/src/presence.ts','packages/contracts/src/common.ts','packages/contracts/src/index.ts','packages/contracts/test/presence-contracts.test.ts','quality/api-contract.md','quality/evidence/T03-FIX5/**']};
ledger.tasks.splice(index,0,task);ledger.tasks[index+1].dependencies=['T15','T03-FIX5'];ledger.tasks[index+1].blockers=['Waiting for approved T03-FIX5 contracts prerequisite'];fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.writeFileSync(`${dir}/record-check.mjs`,fs.readFileSync('quality/evidence/T03-FIX4/record-check.mjs','utf8').replaceAll('T03-FIX4','T03-FIX5'));
fs.writeFileSync(`${dir}/baseline-status.txt`,execFileSync('git',['status','--short'],{encoding:'utf8'}));
console.log('Approved T03-FIX5 inserted before T16; pre-existing T16 metadata preserved.');
