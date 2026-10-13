import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkGate,checkBaselines} from '../../../scripts/verify-task.mjs';

const dir='quality/evidence/CHATCRYPTO-FE',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),digest=value=>createHash('sha256').update(value).digest('hex');
const before=read(`${dir}/gate-before.json`),ledger=read('quality/tasks.json'),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-FE'),be=ledger.tasks.find(t=>t.id==='CHATCRYPTO-BE');
assert.equal(task.status,'NOT_STARTED');assert.equal(be.status,'PASS');assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,task.id);
for(const row of ledger.tasks)assert.equal(digest(JSON.stringify(row)),before.ledgerRowHashes[row.id]);
assert.equal(hash('scripts/verify-task.mjs'),before.checkerSha256);assert.equal(hash('quality/spec-baseline.json'),before.baselineSha256);checkBaselines({root:process.cwd(),baseline:read('quality/spec-baseline.json')});
const section=text=>{const s=text.replaceAll('\r\n','\n'),start=s.indexOf('## 17.'),end=s.indexOf('\n## ',start+1);assert(start>=0);return s.slice(start,end<0?undefined:end).trim();};
const originalSection=section(fs.readFileSync('quality/evidence/CHATCRYPTO-BE/spec-gate-original-spec.md','utf8')),currentSection=section(fs.readFileSync('../.doc/01-product-spec.md','utf8'));assert.equal(currentSection,originalSection);assert.equal(digest(currentSection),'7b44b33a0869c0df42baf7c0b5811de7eb444fe3b76b93abdaaeaceea0c9aacd');
const previous=ledger.tasks.slice(0,ledger.tasks.indexOf(task));assert.equal(previous.length,76);for(const row of previous)assert.equal(row.status,'PASS');
const latest=new Map();for(const row of previous)for(const [p,h]of Object.entries(row.outputsHash?.files??{}))latest.set(p,h);for(const [p,h]of latest)assert.equal(hash(p),h,p);
const priorManifest=read(be.gateRebaseline.manifestPath),manifest=structuredClone(priorManifest);manifest.taskId=task.id;manifest.historicalRows=previous.map(row=>({id:row.id,sha256:digest(JSON.stringify(row))}));manifest.outputTransitions=[];
for(const transition of manifest.transitions){if(!transition.affectedTaskIds.includes(task.id))transition.affectedTaskIds.push(task.id);transition.requiredEvidence.push({path:`${dir}/gate-scope-review.md`,sha256:hash(`${dir}/gate-scope-review.md`)});}
const manifestPath=`${dir}/gate-manifest.json`;fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
task.gateRebaseline={version:1,manifestPath,manifestSha256:hash(manifestPath)};
assert.equal(checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:before.specSha256}),task);
for(const row of ledger.tasks.filter(t=>t.id!==task.id))assert.equal(digest(JSON.stringify(row)),before.ledgerRowHashes[row.id]);
const adoption={recordedAt:new Date().toISOString(),task:task.id,statusUnchanged:'NOT_STARTED',authority:priorManifest.approval,continuationInstruction:'tiếp tục đến khi hoàn thành',scopeReviewed:true,cryptoRequirementUnchanged:true,historicalPassRecordsUnchanged:76,checkerUnchanged:true,mainMutation:false,productionActivation:false,frontendComplete:false,manifestPath,manifestSha256:hash(manifestPath),scopeReviewSha256:hash(`${dir}/gate-scope-review.md`),beforeSha256:hash(`${dir}/gate-before.json`)};
fs.writeFileSync(`${dir}/gate-adoption.json`,JSON.stringify(adoption,null,2)+'\n',{flag:'wx'});task.evidencePaths=[...new Set([...task.evidencePaths,`${dir}/gate-before.json`,`${dir}/gate-scope-review.md`,manifestPath,`${dir}/gate-adoption.json`])];
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify(adoption));
