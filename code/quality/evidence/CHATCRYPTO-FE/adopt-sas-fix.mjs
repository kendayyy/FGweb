import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkGate} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/CHATCRYPTO-FE';
const hash=path=>createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const digest=value=>createHash('sha256').update(value).digest('hex');
const before=JSON.parse(fs.readFileSync(`${dir}/sas-before.json`,'utf8'));
const start=JSON.parse(fs.readFileSync(`${dir}/before.json`,'utf8'));
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8'));
const index=ledger.tasks.findIndex(row=>row.id==='CHATCRYPTO-FE'),task=ledger.tasks[index];
assert.equal(task.status,'IN_PROGRESS');
const amendment=task.approvedScopeAmendments.find(value=>value.source===`${dir}/sas-scope-review.md`);assert(amendment);
for(const row of ledger.tasks.filter(row=>row.id!==task.id))assert.equal(digest(JSON.stringify(row)),before.rows[row.id]);
const changed=[];
const mutableTestCaches=[];
const externalWorkspaceChanges=[];
const historicalOutputs=new Set(ledger.tasks.slice(0,index).flatMap(row=>Object.keys(row.outputsHash?.files??{})));
const cachePath='packages/contracts/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json';
for(const [path,sha]of Object.entries(start.readonly)){
  const actual=hash(path);if(actual===sha)continue;
  if(path===cachePath){
    const cached=JSON.parse(fs.readFileSync(path,'utf8'));
    assert.equal(cached.version,'5.0.3');assert.equal(cached.results.length,29);
    for(const [file,result]of cached.results){assert(/^:test\/[^/]+\.test\.ts$/.test(file));assert.equal(result.failed,false);assert(Number.isFinite(result.duration));}
    mutableTestCaches.push({path,beforeSha256:sha,afterSha256:actual,producer:`${dir}/codex-contracts-regression-2.json`,cachedEntries:29,actualRunFiles:28,reason:'Vitest default mutable duration/result cache retaining an older entry, captured as readonly by startup inventory; cache is not test evidence or an application/historical PASS output'});
    continue;
  }
  if(path.startsWith('tools/telegram-bridge/')&&!historicalOutputs.has(path)){
    const stat=fs.statSync(path);
    externalWorkspaceChanges.push({path,beforeSha256:sha,observedSha256:actual,observedModifiedAt:stat.mtime.toISOString(),ownership:'Outside FG task/application and all historical PASS output maps; not written by this FE session, provenance not independently verified, preserved without modification'});
    continue;
  }
  assert(amendment.paths.includes(path),`Unexpected frozen output mutation: ${path}`);changed.push(path);
}
assert.deepEqual(changed.sort(),Object.keys(before.paths).sort());
const requiredEvidence=[`${dir}/sas-before.json`,`${dir}/sas-scope-review.md`,`${dir}/codex-verification-contract-red-2.json`,`${dir}/codex-verification-contract-red-2.txt`];
for(const label of ['contracts-build-1','verification-contract-green-1','contracts-regression-2']){
  const path=`${dir}/codex-${label}.json`,record=JSON.parse(fs.readFileSync(path,'utf8'));
  assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);requiredEvidence.push(path,record.evidencePath);
}
const latest=new Map();for(const row of ledger.tasks.slice(0,index))for(const [path,sha]of Object.entries(row.outputsHash?.files??{}))latest.set(path,{id:row.id,sha});
const manifest=JSON.parse(fs.readFileSync(task.gateRebaseline.manifestPath,'utf8'));
for(const path of changed){
  const prior=latest.get(path);assert(prior);assert.equal(prior.sha,before.paths[path]);
  manifest.outputTransitions.push({path,previousTaskId:prior.id,beforeSha256:prior.sha,afterSha256:hash(path),scopeSha256:digest(JSON.stringify(amendment)),requiredEvidence:requiredEvidence.map(path=>({path,sha256:hash(path)}))});
}
const manifestPath=`${dir}/sas-gate-manifest.json`;
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
task.gateRebaseline={version:1,manifestPath,manifestSha256:hash(manifestPath)};
checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:task.specSha256,requestedPaths:amendment.paths});
const adoption={recordedAt:new Date().toISOString(),task:task.id,changedFiles:changed,mutableTestCaches,externalWorkspaceChanges,beforeSha256:hash(`${dir}/sas-before.json`),manifestPath,manifestSha256:hash(manifestPath),historicalRowsUnchanged:true,readonlyOtherFilesUnchanged:Object.keys(start.readonly).length-changed.length-mutableTestCaches.length-externalWorkspaceChanges.length,protocolUnchanged:true,checkerUnchanged:true,mainMutation:false,productionActivation:false,frontendComplete:false};
fs.writeFileSync(`${dir}/sas-adoption.json`,JSON.stringify(adoption,null,2)+'\n',{flag:'wx'});
task.evidencePaths=[...new Set([...task.evidencePaths,...requiredEvidence,manifestPath,`${dir}/sas-adoption.json`])];
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify(adoption));
