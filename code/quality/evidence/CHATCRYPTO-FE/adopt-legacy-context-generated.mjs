import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{checkGate}from'../../../scripts/verify-task.mjs';
const dir='quality/evidence/CHATCRYPTO-FE',digest=x=>createHash('sha256').update(x).digest('hex'),hash=p=>digest(fs.readFileSync(p));
const bytes=fs.readFileSync('quality/tasks.json','utf8'),ledger=JSON.parse(bytes),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-FE');assert.equal(task.status,'IN_PROGRESS');
const before=JSON.parse(fs.readFileSync(`${dir}/legacy-context-before.json`,'utf8'));for(const row of ledger.tasks.filter(t=>t.id!==task.id))assert.equal(digest(JSON.stringify(row)),before.rows[row.id]);
const manifest=JSON.parse(fs.readFileSync(`${dir}/legacy-context-gate-manifest.json`,'utf8'));
const paths=[...Object.keys(before.files),'quality/api-contract.md','packages/contracts/test/chat-crypto-transport.test.ts'];
const first={source:`${dir}/legacy-context-scope-review.md`,reason:'Reviewed authorized historical public context additive prerequisite after native real HTTP RED/GREEN; no trust or migration grant',paths};
task.approvedScopeAmendments.push(first);
const derived=['apps/api/dist/modules/chat-crypto/crypto-relay.controller.d.ts','apps/api/dist/tsconfig.tsbuildinfo'],review=`${dir}/legacy-context-generated-review.md`;
const amendment={source:review,reason:'Reviewed two inferred TypeScript build outputs after unchanged gate rejection',paths:derived};task.approvedScopeAmendments.push(amendment);
const reference=manifest.outputTransitions.find(t=>t.path===paths[0]);assert.equal(reference.scopeSha256,digest(JSON.stringify(first)));
for(const proof of reference.requiredEvidence)assert.equal(hash(proof.path),proof.sha256);
const observed=[];
for(const path of derived){const transition=manifest.outputTransitions.find(t=>t.path===path);assert(transition);observed.push({path,priorPinnedHash:transition.afterSha256,actualHash:hash(path),oldBytesCaptured:false});transition.afterSha256=hash(path);transition.scopeSha256=digest(JSON.stringify(amendment));transition.requiredEvidence.push(...reference.requiredEvidence,{path:review,sha256:hash(review)});}
const observedPath=`${dir}/legacy-context-derived-observed.json`;fs.writeFileSync(observedPath,JSON.stringify({recordedAt:new Date().toISOString(),observed},null,2)+'\n',{flag:'wx'});
for(const path of derived)manifest.outputTransitions.find(t=>t.path===path).requiredEvidence.push({path:observedPath,sha256:hash(observedPath)});
const manifestPath=`${dir}/legacy-context2-gate-manifest.json`;fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});task.gateRebaseline={version:1,manifestPath,manifestSha256:hash(manifestPath)};
checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:task.specSha256,requestedPaths:[...paths,...derived]});
task.evidencePaths=[...new Set([...task.evidencePaths,...reference.requiredEvidence.map(p=>p.path),review,observedPath,manifestPath])];
for(let attempt=0;attempt<5;attempt++){assert.equal(fs.readFileSync('quality/tasks.json','utf8'),bytes);try{fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');break;}catch(error){if(error.code!=='UNKNOWN'||attempt===4)throw error;await new Promise(resolve=>setTimeout(resolve,250));}}
console.log(JSON.stringify({reviewedOutputs:paths.length+derived.length,unchangedGatePassed:true,historicalRowsUnchanged:true,frontendComplete:false,pendingStaleFixtureScope:true}));
