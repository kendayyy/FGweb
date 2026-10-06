import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const dir='quality/evidence/T19',p='quality/tasks.json',ledger=JSON.parse(fs.readFileSync(p));
const t=ledger.tasks.find(t=>t.id==='T19');assert.equal(t.status,'NOT_STARTED');assert.equal(ledger.tasks.find(t=>t.id==='T18-FIX1').status,'PASS');
t.status='IN_PROGRESS';t.startedAt=new Date().toISOString();t.inputsHash=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
fs.writeFileSync(p,JSON.stringify(ledger,null,2)+'\n');
for(const name of ['record-check.mjs','audit.mjs'])fs.writeFileSync(`${dir}/${name}`,fs.readFileSync(`quality/evidence/T18-FIX1/${name}`,'utf8').replaceAll('T18-FIX1','T19'));
console.log('T19 active after approved prerequisites PASS.');
