import fs from 'node:fs'; import assert from 'node:assert/strict'; import {createHash} from 'node:crypto'; import {checkGate} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/CHATCRYPTO-FE',digest=value=>createHash('sha256').update(value).digest('hex'),hash=file=>digest(fs.readFileSync(file));
const bytes=fs.readFileSync('quality/tasks.json','utf8'),ledger=JSON.parse(bytes),task=ledger.tasks.find(row=>row.id==='CHATCRYPTO-FE');assert.equal(task.status,'IN_PROGRESS');
const before=JSON.parse(fs.readFileSync(`${dir}/legacy-context-before.json`,'utf8'));for(const row of ledger.tasks.filter(row=>row.id!==task.id))assert.equal(digest(JSON.stringify(row)),before.rows[row.id]);
const manifest=JSON.parse(fs.readFileSync(task.gateRebaseline.manifestPath,'utf8'));
for(const [file,oldHash] of Object.entries(before.files))assert.equal(manifest.outputTransitions.find(t=>t.path===file)?.afterSha256,oldHash);
const docBefore=JSON.parse(fs.readFileSync(`${dir}/legacy-context-api-doc-before.json`,'utf8'));assert.equal(manifest.outputTransitions.find(t=>t.path===docBefore.path)?.afterSha256,docBefore.sha256);
const testPath='packages/contracts/test/chat-crypto-transport.test.ts',test=fs.readFileSync(testPath,'utf8');
const start=test.indexOf(" it('historical contexts remain bounded"),end=test.indexOf(" it('retains the existing",start);assert(start>0&&end>start);
const reconstructed=test.slice(0,start)+test.slice(end);assert.equal(digest(reconstructed),manifest.outputTransitions.find(t=>t.path===testPath)?.afterSha256,'Only reviewed historical context test may differ');
fs.writeFileSync(`${dir}/legacy-context-transport-original.txt`,reconstructed,{flag:'wx'});
const proofs=[`${dir}/legacy-context-before.json`,`${dir}/legacy-context-api-doc-before.json`,`${dir}/legacy-context-scope-review.md`,`${dir}/legacy-cohort-sas-review.md`,`${dir}/legacy-context-transport-original.txt`,`${dir}/legacy-context-native-source.ts`];
for(const label of ['legacy-context-contracts-build-1','legacy-context-api-build-1','legacy-context-contracts-targeted-1','legacy-context-native-green-2','legacy-cohort-sas-native-green-1']){const file=`${dir}/codex-${label}.json`,record=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);proofs.push(file,record.evidencePath);}
const nativeSource=`${dir}/legacy-cohort-sas-native-source.ts`;fs.writeFileSync(nativeSource,fs.readFileSync('apps/web/test/crypto-legacy-context.native.ts'),{flag:'wx'});proofs.push(nativeSource);
const paths=[...Object.keys(before.files),docBefore.path,testPath];
const amendment={source:`${dir}/legacy-context-scope-review.md`,reason:'Reviewed authorized historical public context additive prerequisite after native real HTTP RED/GREEN; no trust or migration grant',paths};task.approvedScopeAmendments.push(amendment);
for(const file of paths){const transition=manifest.outputTransitions.find(t=>t.path===file);assert(transition);transition.afterSha256=hash(file);transition.scopeSha256=digest(JSON.stringify(amendment));transition.requiredEvidence.push(...proofs.map(file=>({path:file,sha256:hash(file)})));}
const manifestPath=`${dir}/legacy-context-gate-manifest.json`;fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});task.gateRebaseline={version:1,manifestPath,manifestSha256:hash(manifestPath)};
checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:task.specSha256,requestedPaths:paths});
task.evidencePaths=[...new Set([...task.evidencePaths,...proofs,manifestPath])];
for(let attempt=0;attempt<5;attempt++){assert.equal(fs.readFileSync('quality/tasks.json','utf8'),bytes,'Concurrent ledger edit');try{fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');break;}catch(error){if(error.code!=='UNKNOWN'||attempt===4)throw error;await new Promise(resolve=>setTimeout(resolve,250));}}
console.log(JSON.stringify({paths,historicalRowsUnchanged:true,unchangedGatePassed:true,fullRegressionHasPendingStaleFixtureScope:true,frontendComplete:false,mainMutation:false}));
