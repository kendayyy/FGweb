import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {checkBaselines,checkGate} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T26',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json')),task=ledger.tasks.find(t=>t.id==='T26'),before=JSON.parse(fs.readFileSync(`${dir}/before.json`));
assert.equal(task.status,'BLOCKED');checkBaselines({root:process.cwd(),baseline});checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:baseline.hashes.specSha256});assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,task.id);
const latest=new Map();for(const t of ledger.tasks.filter(t=>t.status==='PASS'))for(const [p,h]of Object.entries(t.outputsHash?.files||{}))latest.set(p,{id:t.id,hash:h});
const adoptions=[];for(const [p,h]of Object.entries(before.readonly)){if(hash(p)!==h){const owner=latest.get(p);assert(owner&&owner.hash===hash(p),`Unowned modification: ${p}`);adoptions.push({path:p,previous:h,current:owner.hash,owner:owner.id});}}
assert.equal(hash('.env.local'),before.configuration.env);
const additions=['apps/api/src/app.module.ts','apps/api/src/modules/auth/auth.service.ts','apps/api/src/modules/rooms/rooms.service.ts','apps/api/test/call-gateway.integration.spec.ts','apps/api/dist/app.module.js','apps/api/dist/app.module.d.ts','apps/api/dist/modules/calls/**','apps/api/dist/modules/auth/auth.service.js','apps/api/dist/modules/auth/auth.service.d.ts','apps/api/dist/modules/rooms/rooms.service.js','apps/api/dist/modules/rooms/rooms.service.d.ts','quality/spec-coverage.md'];
task.writeAllowlist=[...new Set([...task.writeAllowlist,...additions])];
const allow=p=>task.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p)&&p!=='quality/tasks.json'&&!p.startsWith('.runtime/')&&!p.startsWith('.cache/'));
const snapshot={recordedAt:new Date().toISOString(),approval:'gateway-approval.json',adoptions,readonly:Object.fromEntries(files.filter(p=>!allow(p)).map(p=>[p,hash(p)])),historical:ledger.tasks.filter(t=>t.status==='PASS'),configuration:{env:hash('.env.local')},writeAllowlist:task.writeAllowlist};
fs.writeFileSync(`${dir}/gateway-before.json`,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
task.status='IN_PROGRESS';task.blockers=[];task.evidencePaths.push(`${dir}/gateway-before.json`);task.approvedScopeAmendments??=[];task.approvedScopeAmendments.push({id:'T26-GATEWAY-APPROVED',source:'Human approved gateway self-hosted and prerequisites',evidence:`${dir}/gateway-before.json`,paths:additions});fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify({task:task.id,status:task.status,gate:'PASS',adoptedOwnerOutputs:adoptions.length,scopePinnedBeforeLogic:true}));
