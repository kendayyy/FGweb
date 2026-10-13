import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {checkBaselines,checkGate} from '../../../scripts/verify-task.mjs';
import {reviewTransportBudget} from './transport-budget-review.mjs';
import {reviewTransitRejection} from './transit-rejection-review.mjs';

export const dir='quality/evidence/CHATCRYPTO-BE';
export const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export async function audit(){
 const stage=read(`${dir}/closure-stage-3.json`),prior=read(stage.sourceCheckpointPath),before=read(`${dir}/before.json`),ledger=read('quality/tasks.json'),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-BE'),oldLedger=read(stage.ledgerBeforePath);
 assert.equal(task.status,'IN_PROGRESS');assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,task.id);assert.equal(stage.backendComplete,false);assert.equal(stage.productionActivation,false);
 assert.equal(hash(stage.sourceCheckpointPath),stage.sourceCheckpointSha256);assert.equal(hash(stage.ledgerBeforePath),stage.ledgerBeforeSha256);assert.equal(hash(stage.coverageBeforePath),stage.coverageBeforeSha256);assert.equal(hash('quality/spec-coverage.md'),stage.coverageAfterSha256);
 assert.equal(fs.readFileSync('quality/spec-coverage.md','utf8'),fs.readFileSync(stage.coverageBeforePath,'utf8')+stage.appendedText);
 assert.equal(hash(`${dir}/backend-acceptance-review.md`),stage.reviewSha256);
 const auditRecord=read(`${dir}/codex-progress-audit-67.json`);assert.equal(auditRecord.exitCode,0);assert.equal(hash(auditRecord.evidencePath),auditRecord.evidenceSha256);
 const {sourceHashes:unused,failedAttemptsRetained,...summary}=prior;void unused;
 assert.deepEqual(fs.readFileSync(auditRecord.evidencePath,'utf8').trim().split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).find(item=>item.recordedAt===prior.recordedAt),{...summary,failedAttemptsRetained:failedAttemptsRetained.length});
 for(const [p,h]of Object.entries(prior.sourceHashes)){if(p==='quality/spec-coverage.md')assert.equal(h,stage.coverageBeforeSha256);else assert.equal(hash(p),h,`Reviewed source changed: ${p}`);}
 for(const [p,h]of Object.entries(before.readonly))assert.equal(hash(p),prior.sourceHashes[p]??h,`Frozen or separately reviewed source changed: ${p}`);
 assert.equal(hash('.env.local'),before.configuration.env);
 for(const old of before.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old);
 for(const old of oldLedger.tasks.filter(t=>t.id!==task.id))assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old);
 assert.equal(hash('scripts/verify-task.mjs'),stage.checkerSha256);assert.equal(stage.checkerSha256,read(`${dir}/spec-gate-adoption.json`).checkerAfter);
 checkBaselines({root:process.cwd(),baseline:read('quality/spec-baseline.json')});
 const oldManifest=read(stage.oldManifestPath),manifest=read(stage.newManifestPath);assert.equal(hash(stage.oldManifestPath),stage.oldManifestSha256);assert.equal(hash(stage.newManifestPath),stage.nextManifestSha256);
 assert.deepEqual(manifest.approval,oldManifest.approval);assert.deepEqual(manifest.transitions,oldManifest.transitions);assert.deepEqual(manifest.historicalRows,oldManifest.historicalRows);assert.equal(manifest.outputTransitions.length,oldManifest.outputTransitions.length);
 for(let i=0;i<manifest.outputTransitions.length;i++){
  const old=oldManifest.outputTransitions[i],current=manifest.outputTransitions[i];
  if(old.path==='quality/spec-coverage.md'){
   const expected=structuredClone(old);expected.afterSha256=stage.coverageAfterSha256;
   for(const p of [`${dir}/backend-acceptance-review.md`,`${dir}/codex-transport-budget-regression-2.json`,`${dir}/codex-transport-budget-scoped-regression-1.json`])expected.requiredEvidence.push({path:p,sha256:hash(p)});
   assert.deepEqual(current,expected);assert.equal(old.afterSha256,stage.coverageBeforeSha256);
  }else assert.deepEqual(current,old);
 }
 assert.deepEqual(task.gateRebaseline,{version:1,manifestPath:stage.newManifestPath,manifestSha256:stage.nextManifestSha256});assert.equal(task.specSha256,stage.specSha256);assert.equal(stage.specSha256,hash('../.doc/01-product-spec.md'));
 checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:stage.specSha256});
 reviewTransitRejection(dir);reviewTransportBudget(dir);
 const labels=['transport-budget-regression-2','transport-budget-scoped-regression-1','transport-budget-api-build-1','lint-84','diff-61','progress-audit-67','progress-save-55','closure-stage-3'];
 for(const label of labels){const r=read(`${dir}/codex-${label}.json`);assert.equal(r.exitCode,0,label);assert.equal(hash(r.evidencePath),r.evidenceSha256);}
 const records=fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p)).map(p=>read(`${dir}/${p}`));for(const r of records)assert.equal(hash(r.evidencePath),r.evidenceSha256);
 const env=parseEnv(fs.readFileSync('.env.local','utf8')),db=new pg.Pool({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000});
 try{assert.equal((await db.query("SELECT to_regclass('public.chat_crypto_state') IS NULL AS absent")).rows[0].absent,true);assert.equal(Number((await db.query("SELECT count(*) FROM information_schema.schemata WHERE schema_name ~ '^crypto_be_[a-f0-9]{32}$'")).rows[0].count),0);}finally{await db.end();}
 const containers=execFileSync('docker',['ps','-a','--filter','label=fg.task=CHATCRYPTO-BE','--format','{{.Names}}'],{encoding:'utf8'}).trim();assert.equal(containers,'');
 const runtime=path.resolve('.runtime/chatcrypto-be'),remaining=fs.existsSync(runtime)?fs.readdirSync(runtime).filter(p=>/^(?:transit-|crypto_be_)[a-f0-9]{32}$/.test(p)):[];assert.equal(remaining.length,0);
 return {recordedAt:new Date().toISOString(),task:task.id,status:'REVIEWED_FOR_LOCAL_BE_CLOSURE',specSha256:stage.specSha256,sourceCheckpointVerified:true,environmentUnchanged:true,originalFrozenFilesVerified:Object.keys(before.readonly).length,currentSourceHashesVerified:Object.keys(prior.sourceHashes).length,historicalPassUnchanged:before.historical.length,otherTaskRowsUnchanged:oldLedger.tasks.length-1,coverageAppendOnly:true,checkerUnchangedSinceApprovedRebaseline:true,stockCurrentGateAccepted:true,nativeCoreTests:301,scopedTests:28,commandRecordsVerified:records.length,failedAttemptsRetained:records.filter(r=>r.exitCode!==0).length,mainCryptoAbsent:true,ownedSchemasRemaining:0,ownedContainersRemaining:0,ownedRuntimeFixturesRemaining:0,productionActivation:false,frontendAcceptance:false,independentQaAcceptance:false,banProducerImplemented:false,mediaCapacityClaim:false};
}
if(process.argv[1]?.endsWith('final-audit.mjs')){const result=await audit();fs.writeFileSync(`${dir}/final-audit.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
