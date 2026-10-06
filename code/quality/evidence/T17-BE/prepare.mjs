import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const dir='quality/evidence/T17-BE',ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8')),task=ledger.tasks.find(t=>t.id==='T17-BE');assert.equal(task.status,'NOT_STARTED');
Object.assign(task,{status:'IN_PROGRESS',startedAt:new Date().toISOString(),inputsHash:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),writeAllowlist:['apps/api/src/modules/social/**','apps/api/test/social.integration.spec.ts',`${dir}/**`],blockers:[]});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');fs.writeFileSync(`${dir}/record-check.mjs`,fs.readFileSync('quality/evidence/T16-FE/record-check.mjs','utf8').replaceAll('T16-FE','T17-BE'));
fs.writeFileSync(`${dir}/baseline-status.txt`,execFileSync('git',['status','--short'],{encoding:'utf8'}));
