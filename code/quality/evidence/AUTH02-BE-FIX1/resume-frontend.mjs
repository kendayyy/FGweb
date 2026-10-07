import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='quality/evidence/AUTH02-BE-FIX1',feDir='quality/evidence/AUTH02-FE',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),owner=ledger.tasks.find(t=>t.id==='AUTH02-BE-FIX1'),fe=ledger.tasks.find(t=>t.id==='AUTH02-FE');
assert.equal(owner.status,'PASS');assert.equal(fe.status,'BLOCKED');
execFileSync(process.execPath,[`${feDir}/record.mjs`,'gate-2','node','scripts/verify-task.mjs','AUTH02-FE'],{stdio:'inherit'});
const captured=JSON.parse(fs.readFileSync(`${dir}/suspended-frontend.json`));
for(const [f,v]of Object.entries(captured.files)){assert.equal(hash(f),v.frozenSha256);assert.equal(hash(v.backup),v.wipSha256);}
const readonly=JSON.parse(fs.readFileSync(`${feDir}/readonly.json`)),overrides={owner:owner.id,files:{}};
for(const [f,h]of Object.entries(readonly))if(hash(f)!==h){assert.equal(hash(f),owner.outputsHash.files[f],`Unowned change: ${f}`);overrides.files[f]={previousSha256:h,currentSha256:hash(f)};}
fs.writeFileSync(`${feDir}/producer-override.json`,JSON.stringify(overrides,null,2)+'\n');
fe.status='IN_PROGRESS';fe.blockers=[];fe.resumeEvidence=[`${feDir}/codex-gate-2.json`,`${dir}/suspended-frontend.json`,`${feDir}/producer-override.json`];
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
for(const [f,v]of Object.entries(captured.files))fs.writeFileSync(f,fs.readFileSync(v.backup));
console.log(JSON.stringify({frontend:'IN_PROGRESS',strictResumeGate:true,restoredWipFiles:Object.keys(captured.files).length,producerReadonlyUpdates:Object.keys(overrides.files).length}));
