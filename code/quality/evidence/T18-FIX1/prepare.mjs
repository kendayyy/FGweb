import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const dir='quality/evidence/T18-FIX1';
const p='quality/tasks.json', ledger=JSON.parse(fs.readFileSync(p));
const task=ledger.tasks.find(t=>t.id==='T18-FIX1');
assert.equal(task.status,'NOT_STARTED');
assert.equal(ledger.tasks.find(t=>t.id==='T03-FIX7').status,'PASS');
task.status='IN_PROGRESS';task.startedAt=new Date().toISOString();
task.inputsHash=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
fs.writeFileSync(p,JSON.stringify(ledger,null,2)+'\n');
for(const name of ['record-check.mjs','audit.mjs']) {
 fs.writeFileSync(`${dir}/${name}`,fs.readFileSync(`quality/evidence/T03-FIX7/${name}`,'utf8').replaceAll('T03-FIX7','T18-FIX1'));
}
console.log('T18-FIX1 active; approved backend scope only.');
