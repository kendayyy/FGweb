import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p));
const digest=value=>createHash('sha256').update(value).digest('hex');

export function restoreBanT37Baseline(baseline,dir,taskDocument='../.doc/task.md'){
 if(!fs.existsSync(`${dir}/ban-t37-baseline-review.json`))return baseline;
 const review=read(`${dir}/ban-t37-baseline-review.json`),decision=read(`${dir}/ban-producer-t37-decision.json`);
 assert.equal(review.authority,'Direct user message: để vào task 37');assert.equal(review.gateWaived,false);assert.equal(decision.gateWaived,false);assert.equal(decision.producerImplemented,false);
 assert.equal(digest(JSON.stringify(baseline,null,2)+'\n'),review.baselineAfterSha256);
 assert.equal(hash(taskDocument),review.taskAfterSha256);assert.equal(baseline.hashes.taskSha256,review.taskAfterSha256);
 assert.equal(Object.values(decision.beforeDocumentHashes)[0],review.taskBeforeSha256);
 let task=fs.readFileSync(taskDocument,'utf8');assert.equal(task.split(review.decisionBlock).length,2);task=task.replace(review.decisionBlock,'');assert.equal(task.split(review.t37Handoff).length,2);task=task.replace(review.t37Handoff,'');
 const previous=review.priorTaskCrlf?task.replace(/\n/g,'\r\n'):task;assert.equal(digest(previous),review.taskBeforeSha256);
 baseline.hashes.taskSha256=review.taskBeforeSha256;assert.equal(digest(JSON.stringify(baseline,null,2)+'\n'),review.baselineBeforeSha256);return baseline;
}

export function reviewCustodyDeadline(dir,cacheTransitions={}){
 const adoption=read(`${dir}/custody-deadline-adoption.json`),prior=read(`${dir}/custody-deadline-prior-review.json`);
 assert.equal(adoption.task,'CHATCRYPTO-BE');for(const key of ['mainMutation','backendPass','moderationProducerComplete','policyChange'])assert.equal(adoption[key],false);
 assert.equal(hash(`${dir}/custody-deadline-prior-review.json`),adoption.priorReviewSha256);
 const audit=read(`${dir}/codex-progress-audit-53.json`);assert.equal(audit.exitCode,0);assert.equal(hash(audit.evidencePath),audit.evidenceSha256);
 const {sourceHashes:unused,failedAttemptsRetained,...summary}=prior;void unused;const logged=fs.readFileSync(audit.evidencePath,'utf8').trim().split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));assert.deepEqual(logged.find(item=>item.recordedAt===prior.recordedAt),{...summary,failedAttemptsRetained:failedAttemptsRetained.length});
 const source='apps/api/src/modules/chat-crypto/crypto-custody.module.ts';assert.equal(hash(`${dir}/custody-deadline-before.ts`),prior.sourceHashes[source]);assert.equal(adoption.sourceBeforeSha256,prior.sourceHashes[source]);assert.equal(hash(source),adoption.sourceAfterSha256);
 const change="const deadline=setTimeout(()=>req.destroy(),5000);req.on('close',()=>clearTimeout(deadline));";const current=fs.readFileSync(source,'utf8');assert.equal(current.split(change).length,2);assert.equal(digest(current.replace(change,'')),adoption.sourceBeforeSha256);
 for(const [p,expected]of Object.entries(adoption.afterHashes))assert.equal(hash(p),expected);
 const test=fs.readFileSync('apps/api/test/chat-crypto-custody-deadline.integration.spec.ts','utf8');assert.equal(test.split('elapsed:number|undefined;').length,2);assert.equal(digest(test.replace('elapsed:number|undefined;','elapsed=0;')),adoption.testBeforeLintSha256);assert(Object.hasOwn(adoption.commands,'custody-deadline-green-2'));
 for(const [label,expected]of Object.entries(adoption.commands)){
  const path=`${dir}/codex-${label}.json`,record=read(path),log=fs.readFileSync(record.evidencePath,'utf8');assert.equal(hash(path),expected);assert.equal(hash(record.evidencePath),record.evidenceSha256);assert.equal(record.exitCode,label.includes('-red-')?1:0);
  if(label.includes('-red-')){assert.match(log,/Tests:\s+1 failed,\s+1 total/);assert.match(log,/Expected: 0\s+Received: 1/);}
  if(label.includes('-green-'))assert.match(log,/Tests:\s+1 passed,\s+1 total/);
 }
 const label='custody-deadline-regression-1',record=read(`${dir}/codex-${label}.json`),native=read(`${dir}/report-regression-custody-deadline-1-result.json`);assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);const log=fs.readFileSync(record.evidencePath,'utf8');assert.match(log,/Tests:\s+301 passed,\s+301 total/);assert.match(log,/Test Suites:\s+17 passed,\s+17 total/);
 const {recordedAt,...nativeSummary}=native;assert.deepEqual(JSON.parse(log.trim().split(/\r?\n/).at(-1)),nativeSummary);assert(Date.parse(recordedAt)>=Date.parse(record.startedAt)&&Date.parse(recordedAt)<=Date.parse(record.completedAt));
 for(const key of ['reportHttpNative','tlsVerified','untrustedTlsDenied','ownedBackupRestore','backupKeySeparation','cleanup','transitRoundtrip','nonceRandomized','tamperDenied','appCannotManageKeys','appCannotReadReports','keyExportDenied','operatorRotationRewrap','restartPersistence','sealedDenied','outageDenied','appRoleSecretRevocation','auditPlaintextAbsent','adapterReportAclDenied','fixtureTokenLiveBeforePost','fixtureSecretLiveBeforeRevocation','fixtureTokenLiveBeforeRevocation','adapterRevokedTokenDenied'])assert.equal(native[key],true);for(const key of ['mainDatabaseChanged','mainEnvironmentChanged','productionReady'])assert.equal(native[key],false);assert.equal(native.fixtureCredentialLifetimeSeconds,1200);
 const backlogPath=`${dir}/expiry-backlog-review.mjs`,priorBacklog=`${dir}/custody-deadline-prior-backlog-review.mjs`;assert.equal(hash(priorBacklog),prior.sourceHashes[backlogPath]);let backlog=fs.readFileSync(backlogPath,'utf8');backlog=backlog.replace('reviewExpiryBacklog(dir,transitions={}){','reviewExpiryBacklog(dir){').replace("for(const [p,digest]of Object.entries(actualSources)){if(transitions[p])assert.equal(transitions[p].before,digest);assert.equal(hash(p),transitions[p]?.after??digest,'App/prior suite changed without verified fresh custody proof');}","for(const [p,digest]of Object.entries(actualSources))assert.equal(hash(p),digest,'App/prior suite changed since current full301 proof');");assert.equal(digest(backlog),hash(priorBacklog));
 const transitions={};for(const [p,before]of Object.entries(prior.sourceHashes))if(p.startsWith('apps/')||p.startsWith('packages/')){if(p===source)transitions[p]={before,after:adoption.sourceAfterSha256};else{if(cacheTransitions[p])assert.equal(cacheTransitions[p].before,before);assert.equal(hash(p),cacheTransitions[p]?.after??before,'Unrelated runtime/suite changed without scoped cache proof');}}
 return {transitions,paths:[source,'apps/api/dist/modules/chat-crypto/crypto-custody.module.js','apps/api/dist/modules/chat-crypto/crypto-custody.module.d.ts','apps/api/test/chat-crypto-custody-deadline.integration.spec.ts',`${dir}/custody-deadline-adoption.json`,`${dir}/custody-deadline-review.mjs`,`${dir}/custody-deadline-review.md`,`${dir}/custody-deadline-prior-review.json`,`${dir}/custody-deadline-before.ts`,`${dir}/custody-deadline-prior-backlog-review.mjs`,`${dir}/report-regression-custody-deadline-1-result.json`,`${dir}/ban-t37-baseline-review.json`,`${dir}/ban-producer-t37-decision.json`,`${dir}/ban-producer-gate-review.md`]};
}
