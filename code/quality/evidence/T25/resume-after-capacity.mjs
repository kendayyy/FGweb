import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {checkBaselines,checkGate} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T25',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json')),owner=ledger.tasks.find(t=>t.id==='T25'),previous=JSON.parse(fs.readFileSync(`${dir}/resume-before.json`));
checkBaselines({root:process.cwd(),baseline});checkGate({root:process.cwd(),tasks:ledger.tasks,id:owner.id,specHash:baseline.hashes.specSha256});assert.equal(owner.status,'BLOCKED');assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,owner.id);
for(const old of previous.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old);
const latest=new Map();for(const t of ledger.tasks.slice(0,ledger.tasks.indexOf(owner)))for(const [p,h] of Object.entries(t.outputsHash?.files??{}))latest.set(p,{owner:t.id,hash:h});
const replacements=[];for(const [p,h] of Object.entries(previous.readonly)){const actual=hash(p);if(actual===h)continue;const current=latest.get(p);assert(['T03-FIX13','T24-FIX2'].includes(current?.owner));assert.equal(current.hash,actual);replacements.push({path:p,previousHash:h,currentHash:actual,owner:current.owner});}
const allow=p=>owner.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p)&&p!=='quality/tasks.json'&&!p.startsWith('.cache/')&&!p.startsWith('.runtime/'));
const before={recordedAt:new Date().toISOString(),readonly:Object.fromEntries(files.filter(p=>!allow(p)).map(p=>[p,hash(p)])),historical:ledger.tasks.filter(t=>t.status==='PASS'),configuration:{env:hash('.env.local')},replacements,previousSnapshot:`${dir}/resume-before.json`};
fs.writeFileSync(`${dir}/resume-after-capacity-before.json`,JSON.stringify(before,null,2)+'\n',{flag:'wx'});owner.status='IN_PROGRESS';owner.resumedAt=new Date().toISOString();owner.blockers=[];owner.evidencePaths.push(`${dir}/resume-after-capacity-before.json`);fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({task:owner.id,status:owner.status,strictGate:'PASS',acceptedPredecessorReplacements:replacements.length,readonly:Object.keys(before.readonly).length}));
