import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export function reviewCryptoCache(dir,appTransitions={}){
 const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p));
 const adoption=read(`${dir}/crypto-cache-adoption.json`),prior=read(`${dir}/crypto-cache-prior-review.json`);
 assert.equal(adoption.task,'CHATCRYPTO-BE');for(const flag of ['newSchema','newContract','quotaChange','mainMutation','backendPass','fullRegressionRepeated'])assert.equal(adoption[flag],false);
 assert.equal(hash(`${dir}/crypto-cache-prior-review.json`),adoption.priorReviewSha256);const audit=read(`${dir}/codex-progress-audit-54.json`);assert.equal(audit.exitCode,0);assert.equal(hash(audit.evidencePath),audit.evidenceSha256);
 const {sourceHashes:unused,failedAttemptsRetained,...summary}=prior;void unused;const logs=fs.readFileSync(audit.evidencePath,'utf8').trim().split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));assert.deepEqual(logs.find(item=>item.recordedAt===prior.recordedAt),{...summary,failedAttemptsRetained:failedAttemptsRetained.length});
 const source='apps/api/src/modules/chat-crypto/http-body-parsers.ts';assert.equal(hash(`${dir}/crypto-cache-before.ts`),prior.sourceHashes[source]);assert.equal(adoption.beforeSha256,prior.sourceHashes[source]);
 const line=" app.use('/api/v1/crypto',(_req:Parameters<typeof recovery>[0],res:Parameters<typeof recovery>[1],next:Parameters<typeof recovery>[2])=>{res.setHeader('Cache-Control','no-store');next();});\n";
 const text=fs.readFileSync(source,'utf8');assert.equal(text.split(line).length,2);assert.equal(createHash('sha256').update(text.replace(line,'')).digest('hex'),adoption.beforeSha256);assert.equal(hash(source),adoption.afterHashes[source]);
 for(const [p,digest]of Object.entries(adoption.afterHashes))assert.equal(hash(p),digest);
 for(const [p,digest]of Object.entries(prior.sourceHashes))if((p.startsWith('apps/')||p.startsWith('packages/'))&&p!==source){if(appTransitions[p])assert.equal(appTransitions[p].before,digest);assert.equal(hash(p),appTransitions[p]?.after??digest,'Unrelated application/suite changed');}
 for(const [label,digest]of Object.entries(adoption.commands)){
  const file=`${dir}/codex-${label}.json`,record=read(file),log=fs.readFileSync(record.evidencePath,'utf8');assert.equal(hash(file),digest);assert.equal(hash(record.evidencePath),record.evidenceSha256);assert.equal(record.exitCode,label.includes('-red-')?1:0);
  if(label.endsWith('red-1'))assert.match(log,/conversation_kind_shape_check/);
  if(label.endsWith('red-2')){assert.match(log,/Tests:\s+6 failed,\s+6 total/);assert.equal((log.match(/Expected: "no-store"\s+Received: undefined/g)||[]).length,6);}
  if(label.endsWith('green-1'))assert.match(log,/Tests:\s+6 passed,\s+6 total/);
  if(label.endsWith('regression-1')){assert.match(log,/Tests:\s+10 passed,\s+10 total/);assert.match(log,/Test Suites:\s+2 passed,\s+2 total/);}
 }
 const guard=`${dir}/custody-deadline-review.mjs`;assert.equal(hash(`${dir}/crypto-cache-prior-custody-review.mjs`),prior.sourceHashes[guard]);let previous=fs.readFileSync(guard,'utf8').replace('reviewCustodyDeadline(dir,cacheTransitions={}){','reviewCustodyDeadline(dir){');previous=previous.replace("else{if(cacheTransitions[p])assert.equal(cacheTransitions[p].before,before);assert.equal(hash(p),cacheTransitions[p]?.after??before,'Unrelated runtime/suite changed without scoped cache proof');}","else assert.equal(hash(p),before,'Unrelated runtime/suite changed');");if(fs.existsSync(`${dir}/spec-gate-adoption.json`))previous=previous.replace("restoreBanT37Baseline(baseline,dir,taskDocument='../.doc/task.md'){","restoreBanT37Baseline(baseline,dir){").replace('hash(taskDocument)',"hash('../.doc/task.md')").replace("fs.readFileSync(taskDocument,'utf8')","fs.readFileSync('../.doc/task.md','utf8')");assert.equal(createHash('sha256').update(previous).digest('hex'),prior.sourceHashes[guard]);
 return {transitions:{[source]:{before:adoption.beforeSha256,after:adoption.afterHashes[source]}},paths:[...Object.keys(adoption.afterHashes),`${dir}/crypto-cache-adoption.json`,`${dir}/crypto-cache-review.mjs`,`${dir}/crypto-cache-review.md`,`${dir}/crypto-cache-prior-review.json`,`${dir}/crypto-cache-before.ts`,`${dir}/crypto-cache-prior-custody-review.mjs`]};
}
