import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkGate} from '../../../scripts/verify-task.mjs';

const dir='quality/evidence/CHATCRYPTO-BE',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const round=process.argv[2]??'1';assert.match(round,/^\d+$/);const stagePath=`${dir}/closure-stage-${round}.json`;
const ledger=read('quality/tasks.json'),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-BE'),review=read(`${dir}/progress-review.json`);
assert.equal(task.status,'IN_PROGRESS');assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,task.id);
for(const [p,h]of Object.entries(review.sourceHashes))assert.equal(hash(p),h,p);
for(const label of ['transport-budget-regression-2','transport-budget-scoped-regression-1','transport-budget-api-build-1','lint-84','diff-61','progress-audit-67','progress-save-55','transport-budget-stock-1']){const record=read(`${dir}/codex-${label}.json`);assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
const oldManifestPath=task.gateRebaseline.manifestPath,oldManifest=read(oldManifestPath),oldLedger=fs.readFileSync('quality/tasks.json'),oldCoverage=fs.readFileSync('quality/spec-coverage.md');
const coverageEntry=oldManifest.outputTransitions.find(item=>item.path==='quality/spec-coverage.md');assert(coverageEntry);assert.equal(hash('quality/spec-coverage.md'),coverageEntry.afterSha256);
const appendedText='\n| CHAT-CRYPTO-01 BE local acceptance review | Ciphertext routing/current session-BAN-device-membership-cohort ACL; public Lobby AEAD/key separation/rotation; selected report ACL/audit; encrypted native backup/restore and staged legacy capabilities; generic notifications; atomic retained transport quotas and rejected Transit buffer clearing | Native OpenBao core17 suites/301 tests; current quota/cache/body/Transit4 suites/28 tests; existing room/admission/backlog/worker/legacy evidence retained | quality/evidence/CHATCRYPTO-BE/backend-acceptance-review.md and closure.json (status only valid after closure); native commands transport-budget-regression-2/scoped-regression-1; no main/production activation, FE/QA/T37 producer or1,000media capacity PASS |\n';
const freeze=(p,bytes)=>{if(fs.existsSync(p))assert(fs.readFileSync(p).equals(bytes));else fs.writeFileSync(p,bytes,{flag:'wx'});};
freeze(`${dir}/closure-ledger-before.json`,oldLedger);freeze(`${dir}/closure-coverage-before.md`,oldCoverage);freeze(`${dir}/closure-source-checkpoint.json`,fs.readFileSync(`${dir}/progress-review.json`));
const manifest=structuredClone(oldManifest),nextEntry=manifest.outputTransitions.find(item=>item.path===coverageEntry.path);
const nextManifestPath=`${dir}/closure-gate-manifest-${round}.json`;
try{
 fs.appendFileSync('quality/spec-coverage.md',appendedText);nextEntry.afterSha256=hash('quality/spec-coverage.md');
 for(const path of [`${dir}/backend-acceptance-review.md`,`${dir}/codex-transport-budget-regression-2.json`,`${dir}/codex-transport-budget-scoped-regression-1.json`])nextEntry.requiredEvidence.push({path,sha256:hash(path)});
 fs.writeFileSync(nextManifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 task.gateRebaseline={version:1,manifestPath:nextManifestPath,manifestSha256:hash(nextManifestPath)};
 task.specSha256=hash('../.doc/01-product-spec.md');
 const stage={recordedAt:new Date().toISOString(),task:task.id,backendComplete:false,productionActivation:false,authority:oldManifest.approval,checkerSha256:hash('scripts/verify-task.mjs'),oldManifestPath,oldManifestSha256:hash(oldManifestPath),newManifestPath:nextManifestPath,nextManifestSha256:hash(nextManifestPath),coverageBeforePath:`${dir}/closure-coverage-before.md`,coverageBeforeSha256:coverageEntry.afterSha256,coverageAfterSha256:nextEntry.afterSha256,appendedText,ledgerBeforePath:`${dir}/closure-ledger-before.json`,ledgerBeforeSha256:hash(`${dir}/closure-ledger-before.json`),sourceCheckpointPath:`${dir}/closure-source-checkpoint.json`,sourceCheckpointSha256:hash(`${dir}/closure-source-checkpoint.json`),reviewSha256:hash(`${dir}/backend-acceptance-review.md`),specSha256:task.specSha256};
 fs.writeFileSync(stagePath,JSON.stringify(stage,null,2)+'\n',{flag:'wx'});
 checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:stage.specSha256});
 task.evidencePaths=[...new Set([...task.evidencePaths,`${dir}/backend-acceptance-review.md`,stagePath,nextManifestPath])];
 fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
 console.log(JSON.stringify({task:task.id,status:task.status,coverageAppendOnly:true,historicalRowsUnchanged:true,currentSpecPinned:true,stockGateAccepted:true}));
}catch(error){const failures=[];for(const [p,bytes]of [['quality/spec-coverage.md',oldCoverage],['quality/tasks.json',oldLedger]])try{if(!fs.readFileSync(p).equals(bytes))fs.writeFileSync(p,bytes);}catch(rollback){failures.push(rollback);}if(failures.length)throw new AggregateError([error,...failures],'Closure staging failed and rollback requires inspection',{cause:error});throw error;}
