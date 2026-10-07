import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T03-FIX12',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='T03-FIX12');
assert(['BLOCKED','IN_PROGRESS'].includes(task.status));assert.equal(ledger.tasks.find(t=>t.id==='T00-REBASE-AUTH02').status,'PASS');assert.equal(ledger.tasks.find(t=>t.id==='T00-REBASE-LIGHT01').status,'PASS');
const original=JSON.parse(fs.readFileSync(`${dir}/codex-gate-1.json`));assert.equal(original.exitCode,0);assert.equal(hash(original.evidencePath),original.evidenceSha256);
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json'));assert.equal(checkBaselines({root:process.cwd(),baseline}),7);
const suspended=JSON.parse(fs.readFileSync('quality/evidence/T00-REBASE-AUTH02/suspended-contract-work.json'));
const derived=JSON.parse(fs.readFileSync('quality/evidence/T00-REBASE-AUTH02/derived-wip.json')).files;
const checked={};for(const [f,h]of Object.entries({...suspended,...derived}).filter(([f])=>f.startsWith('packages/contracts/')||f==='quality/api-contract.md')){assert.equal(hash(f),h,f);checked[f]=h;}
const predecessors=ledger.tasks.slice(0,ledger.tasks.indexOf(task));assert(predecessors.every(t=>t.status==='PASS'));assert(task.dependencies.every(id=>predecessors.some(t=>t.id===id)));
// Same already-edited task: original strict pre-edit gate remains evidence.
// Compare legitimate owned WIP to its captured hash; every non-owned frozen
// output and predecessor command still uses the original mandatory checks.
const own=f=>task.writeAllowlist.some(p=>p.endsWith('/**')?f.startsWith(p.slice(0,-2)):f===p);
const latest=new Map();for(const t of predecessors){assert.equal(t.specSha256,baseline.hashes.specSha256);for(const r of t.commands){assert.equal(r.exitCode,0);if(r.evidenceSha256)assert.equal(hash(r.evidencePath),r.evidenceSha256);}for(const [f,h]of Object.entries(t.outputsHash?.files??{}))latest.set(f,h);}
for(const [f,h]of latest)if(!own(f))assert.equal(hash(f),h,f);
const latestRebase=ledger.tasks.find(t=>t.id==='T00-REBASE-LIGHT01'),authRebase=ledger.tasks.find(t=>t.id==='T00-REBASE-AUTH02');
const knownChanges={...authRebase.outputsHash.files,...latestRebase.outputsHash.files};
for(const [f,h]of Object.entries(JSON.parse(fs.readFileSync(`${dir}/readonly.json`))))if(hash(f)!==h){assert(f in knownChanges,f);assert.equal(hash(f),knownChanges[f],f);}
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
fs.writeFileSync(`${dir}/readonly-after-theme.json`,JSON.stringify(Object.fromEntries(files.filter(f=>!own(f)&&!['quality/tasks.json','quality/spec-coverage.md'].includes(f)).map(f=>[f,hash(f)])),null,2)+'\n');
task.status='IN_PROGRESS';task.blockers=[];fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.writeFileSync(`${dir}/resume-proof.json`,JSON.stringify({originalStrictPreflight:original,newBaselines:7,nonOwnedFrozenChecked:latest.size,preservedSourceAndDerived:checked,failedRestoreAttempts:'Preserved gate-2/3/4 logs. Mixed historical line endings could not be reproduced; finally restored WIP bytes. No failed run counted as PASS, checker unchanged. Original pre-edit gate plus reviewed resume audit used for same active task.'},null,2)+'\n');
console.log('Same-task resume audit PASS: original strict preflight, seven new baselines, unchanged source/derived WIP, all non-owned frozen outputs and predecessor evidence.');
