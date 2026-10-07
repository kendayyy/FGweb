import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T23',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const read=label=>JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`));
const checks=['gate-1','types-2','lint-2','audit-1','diff-1'].map(read);
for(const record of checks){assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
const red=read('red-2'),log=fs.readFileSync(red.evidencePath,'utf8');
assert.equal(red.exitCode,1);assert.equal(hash(red.evidencePath),red.evidenceSha256);
assert(log.includes('14 failed'));assert(log.includes('Received: 404'));assert(!log.includes('EACCES'));
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name).replaceAll('\\','/')]);
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='T23');
assert.equal(task.status,'IN_PROGRESS');
Object.assign(task,{status:'BLOCKED',commands:[...checks,red],evidencePaths:walk(dir),blockers:['User approved prerequisite-proposal.md; waiting for T03-FIX10 contracts and T06-FIX1 consent migration to PASS, then exact InvitationsModule AppModule wiring'],outputsHash:null});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
console.log('T23 waiting on approved prerequisite tasks; behavioral RED retained, no PASS or later task.');
