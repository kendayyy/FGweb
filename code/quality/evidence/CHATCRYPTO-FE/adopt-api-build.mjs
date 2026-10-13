import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkGate} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/CHATCRYPTO-FE';
const hash=path=>createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const digest=value=>createHash('sha256').update(value).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8')),index=ledger.tasks.findIndex(row=>row.id==='CHATCRYPTO-FE'),task=ledger.tasks[index];
const before=JSON.parse(fs.readFileSync(`${dir}/api-build-before.json`,'utf8'));
const start=JSON.parse(fs.readFileSync(`${dir}/before.json`,'utf8'));
for(const row of ledger.tasks.filter(row=>row.id!==task.id))assert.equal(digest(JSON.stringify(row)),before.rows[row.id]);
for(const [path,sha]of Object.entries(start.readonly).filter(([path])=>path.startsWith('apps/api/src/')))assert.equal(hash(path),sha);
const config='apps/api/tsconfig.json';
const original=fs.readFileSync(`${dir}/api-build-original/${config}`,'utf8');
assert.equal(fs.readFileSync(config,'utf8'),original.replace('"allowSyntheticDefaultImports": true,','"allowSyntheticDefaultImports": true,\n    "esModuleInterop": true,'));
const proofPaths=[`${dir}/api-build-before.json`,`${dir}/api-build-scope-review.md`];
for(const label of ['api-build-1','frontend-http-native-3']){
 const path=`${dir}/codex-${label}.json`,record=JSON.parse(fs.readFileSync(path,'utf8'));assert.equal(hash(record.evidencePath),record.evidenceSha256);
 if(label==='api-build-1')assert.equal(record.exitCode,0);
 else {assert.equal(record.exitCode,1);const log=fs.readFileSync(record.evidencePath,'utf8');assert(log.includes('"realAppModuleStarted":true,"twoRealSignedSessions":true,"twoNativeDevicesRegistered":true,"realStateRevision":3'));assert(log.includes('status: 500'));assert(!log.includes("reading 'basename'"));}
 proofPaths.push(path,record.evidencePath);
}
const latest=new Map();for(const row of ledger.tasks.slice(0,index))for(const [path,sha]of Object.entries(row.outputsHash?.files??{}))latest.set(path,{id:row.id,sha});
const manifest=JSON.parse(fs.readFileSync(task.gateRebaseline.manifestPath,'utf8'));
const amendment=task.approvedScopeAmendments.find(value=>value.source===`${dir}/api-build-scope-review.md`);assert(amendment);
const changed=Object.entries(before.files).filter(([path,sha])=>hash(path)!==sha).map(([path])=>path);
assert(changed.includes(config));assert(changed.length>1);
for(const path of changed){
 const prior=latest.get(path);if(!prior)continue;
 assert.equal(prior.sha,before.files[path]);assert(!manifest.outputTransitions.some(entry=>entry.path===path));
 manifest.outputTransitions.push({path,previousTaskId:prior.id,beforeSha256:prior.sha,afterSha256:hash(path),scopeSha256:digest(JSON.stringify(amendment)),requiredEvidence:proofPaths.map(path=>({path,sha256:hash(path)}))});
}
const manifestPath=`${dir}/api-build-gate-manifest.json`;fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
task.gateRebaseline={version:1,manifestPath,manifestSha256:hash(manifestPath)};
checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:task.specSha256,requestedPaths:[config,'apps/api/dist/app.module.js']});
const adoption={recordedAt:new Date().toISOString(),task:task.id,changedFiles:changed,apiBusinessSourcesUnchanged:true,oneCompilerOption:true,generatedRuntimeStartupVerified:true,syntheticAuthAndDeviceRegistrationVerified:true,nativeSasStillFailsDatabaseGuard:true,bootstrapEvidenceOnly:true,historicalPassRowsUnchanged:true,mainMutation:false,productionActivation:false,frontendComplete:false,manifestPath};
fs.writeFileSync(`${dir}/api-build-adoption.json`,JSON.stringify(adoption,null,2)+'\n',{flag:'wx'});
task.evidencePaths=[...new Set([...task.evidencePaths,...proofPaths,manifestPath,`${dir}/api-build-adoption.json`])];fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({task:task.id,changedFiles:changed.length,generatedRuntimeStartupVerified:true,fullNativeHttpTestPassed:false,pass:false}));
