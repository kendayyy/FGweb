import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {checkBaselines,checkGate} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T00-REBASE-CHATCRYPTO01',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function audit(){
 const old=JSON.parse(fs.readFileSync(`${dir}/previous-ledger.json`)),ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json')),before=JSON.parse(fs.readFileSync(`${dir}/previous-baseline.json`));
 const owner=ledger.tasks.find(t=>t.id==='T00-REBASE-CHATCRYPTO01');assert.equal(owner.status,'IN_PROGRESS');assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,owner.id);
 const readonly=JSON.parse(fs.readFileSync(`${dir}/readonly-after-bootstrap.json`)),originalReadonly=JSON.parse(fs.readFileSync(`${dir}/readonly.json`)),seal=JSON.parse(fs.readFileSync(`${dir}/bootstrap-seal.json`));
 const reviewed={...originalReadonly};for(const p of Object.keys(seal.files))delete reviewed[p];assert.deepEqual(readonly,reviewed);
 for(const [p,h]of Object.entries(readonly))assert.equal(hash(p),h,p);
 for(const [p,h]of Object.entries(seal.files)){assert(owner.writeAllowlist.includes(p));assert.equal(hash(p),h,p);}
 const amendment=baseline.amendments.at(-1);assert.equal(amendment.amendment,'CHAT-CRYPTO-01');assert.deepEqual(amendment.previousHashes,before.hashes);
 const adopted={amendment:amendment.amendment,evidence:amendment.evidence,authorization:amendment.authorization,adoptedAt:amendment.adoptedAt};
 for(const previous of old.tasks){const expected=structuredClone(previous);expected.baselineAdoptions??=[];expected.baselineAdoptions.push({...adopted,previousSpecSha256:previous.specSha256,currentSpecSha256:baseline.hashes.specSha256});expected.specSha256=baseline.hashes.specSha256;if(previous.id==='T29')expected.dependencies=['CHATCRYPTO-QA'];assert.deepEqual(ledger.tasks.find(t=>t.id===previous.id),expected,`Historical task changed: ${previous.id}`);}
 assert.deepEqual(ledger.followups,old.followups);
 for(const key of Object.keys(before.hashes).filter(k=>!['specSha256','taskSha256'].includes(k)))assert.equal(baseline.hashes[key],before.hashes[key],key);
 assert.equal(checkBaselines({root:process.cwd(),baseline}),8);
 for(const [name,p]of Object.entries({spec:'../.doc/01-product-spec.md',task:'../.doc/task.md',rootAgents:'../AGENTS.md',backendRule:'../.agents/rules/05-backend-services.md',contractsRule:'../.agents/rules/07-contracts.md'}))assert.equal(hash(p),hash(`${dir}/${name}.md`),p);
 const ids=ledger.tasks.map(t=>t.id),oldIds=old.tasks.map(t=>t.id);assert.deepEqual(ids.filter(id=>oldIds.includes(id)),oldIds);
 const chain=['T00-REBASE-CHATCRYPTO01','CHATCRYPTO-DATA','CHATCRYPTO-BE','CHATCRYPTO-FE','CHATCRYPTO-QA','T29'];assert.deepEqual(ids.slice(ids.indexOf(owner.id),ids.indexOf('T29')+1),chain);
 for(const [index,id]of chain.entries()){if(!index)continue;const t=ledger.tasks.find(t=>t.id===id);assert.deepEqual(t.dependencies,[chain[index-1]]);assert.equal(t.status,'NOT_STARTED');assert.equal(t.commands.length,0);if(id!=='T29')assert.equal(t.outputsHash,null);}
 assert.throws(()=>checkGate({root:process.cwd(),tasks:ledger.tasks,id:'T29',specHash:baseline.hashes.specSha256}),/prerequisite not PASS/);
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p));
 for(const p of files)if(!p.startsWith(`${dir}/`)&&!['quality/tasks.json','quality/spec-baseline.json','quality/spec-coverage.md'].includes(p)&&!Object.hasOwn(seal.files,p))assert(Object.hasOwn(readonly,p),`New outside metadata scope: ${p}`);
 for(const name of fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p))){const r=JSON.parse(fs.readFileSync(`${dir}/${name}`));assert.equal(hash(r.evidencePath),r.evidenceSha256,name);}
 return {recordedAt:new Date().toISOString(),sources:8,changedApprovedSources:2,readonlyFiles:Object.keys(readonly).length,historicalPass:old.tasks.filter(t=>t.status==='PASS').length,historicalStatusOutputsCommandsEvidenceTimestampsPreserved:true,activeSpecProvenanceAdopted:true,checkerUnchanged:true,applicationAndEnvironmentUnchanged:true,newCryptoCheckpoints:4,skipT29Rejected:true,cryptoImplemented:false};
}
if(process.argv[1]?.endsWith('audit.mjs')){const result=audit();fs.writeFileSync(`${dir}/audit.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
