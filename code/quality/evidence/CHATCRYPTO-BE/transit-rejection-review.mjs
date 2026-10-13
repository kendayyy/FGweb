import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export function reviewTransitRejection(dir){
 const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 const adoption=read(`${dir}/transit-rejection-adoption.json`),prior=read(`${dir}/transit-rejection-prior-review.json`),source='apps/api/src/modules/chat-crypto/openbao-transit.ts';
 assert.equal(adoption.backendComplete,false);assert.equal(adoption.quotaIntegratedAtNativeProof,false);assert.equal(adoption.mainMutation,false);
 assert.equal(hash(`${dir}/transit-rejection-prior-review.json`),adoption.priorReviewSha256);
 const audit=read(`${dir}/codex-progress-audit-60.json`);assert.equal(audit.exitCode,0);assert.equal(hash(audit.evidencePath),audit.evidenceSha256);
 const {sourceHashes:unused,failedAttemptsRetained,...summary}=prior;void unused;
 const logs=fs.readFileSync(audit.evidencePath,'utf8').trim().split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));assert.deepEqual(logs.find(item=>item.recordedAt===prior.recordedAt),{...summary,failedAttemptsRetained:failedAttemptsRetained.length});
 assert.equal(hash(`${dir}/transit-rejection-before.ts`),prior.sourceHashes[source]);
 const text=fs.readFileSync(source,'utf8'),start='  try{\n',end='  }catch(error){bytes.fill(0);throw error;}\n';
 const anchor="  const bytes=Buffer.from(data.plaintext,'base64');\n";assert.equal(text.split(anchor+start).length,2);assert.equal(text.split(end).length,2);
 assert.equal(createHash('sha256').update(text.replace(anchor+start,anchor).replace(end,'')).digest('hex'),prior.sourceHashes[source]);
 for(const [p,h]of Object.entries(adoption.afterHashes))assert.equal(hash(p),h);
 for(const [label,expected]of [['transit-rejection-red-1',1],['transit-rejection-green-1',0],['transit-rejection-api-build-1',0],['transit-rejection-regression-1',0]]){const record=read(`${dir}/codex-${label}.json`);assert.equal(record.exitCode,expected);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
 const full=read(`${dir}/report-regression-custody-transit-rejection-1-result.json`);for(const flag of ['reportHttpNative','ownedBackupRestore'])assert.equal(full[flag],true);
 const log=fs.readFileSync(`${dir}/codex-transit-rejection-regression-1.txt`,'utf8');assert.match(log,/Tests:\s+301 passed,\s+301 total/);assert.match(log,/Test Suites:\s+17 passed,\s+17 total/);
 const cachePath=`${dir}/crypto-cache-review.mjs`,gatePath=`${dir}/spec-gate-review.mjs`;
 let cache=fs.readFileSync(cachePath,'utf8').replace('reviewCryptoCache(dir,appTransitions={}){','reviewCryptoCache(dir){');
 cache=cache.replace("for(const [p,digest]of Object.entries(prior.sourceHashes))if((p.startsWith('apps/')||p.startsWith('packages/'))&&p!==source){if(appTransitions[p])assert.equal(appTransitions[p].before,digest);assert.equal(hash(p),appTransitions[p]?.after??digest,'Unrelated application/suite changed');}","for(const [p,digest]of Object.entries(prior.sourceHashes))if((p.startsWith('apps/')||p.startsWith('packages/'))&&p!==source)assert.equal(hash(p),digest,'Unrelated application/suite changed');");
 assert.equal(createHash('sha256').update(cache).digest('hex'),hash(`${dir}/transit-rejection-prior-cache-review.mjs`));assert.equal(hash(`${dir}/transit-rejection-prior-cache-review.mjs`),prior.sourceHashes[cachePath]);
 let gate=fs.readFileSync(gatePath,'utf8').replace('reviewSpecGate(dir,ledger,appTransitions={},guardTexts={}){','reviewSpecGate(dir,ledger){').replace("guardTexts[cachePath]??fs.readFileSync(cachePath,'utf8')","fs.readFileSync(cachePath,'utf8')");
 gate=gate.replace("for(const [p,h]of Object.entries(state.sourceHashes))if(p!==custodyPath&&p!==cachePath&&p!=='quality/spec-baseline.json'){if(appTransitions[p])assert.equal(appTransitions[p].before,h);assert.equal(hash(p),appTransitions[p]?.after??h,`App checkpoint changed during gate adoption: ${p}`);}","for(const [p,h]of Object.entries(state.sourceHashes))if(p!==custodyPath&&p!==cachePath&&p!=='quality/spec-baseline.json')assert.equal(hash(p),h,`App checkpoint changed during gate adoption: ${p}`);");
 assert.equal(createHash('sha256').update(gate).digest('hex'),hash(`${dir}/transit-rejection-prior-gate-review.mjs`));assert.equal(hash(`${dir}/transit-rejection-prior-gate-review.mjs`),prior.sourceHashes[gatePath]);
 return {transitions:{[source]:{before:prior.sourceHashes[source],after:hash(source)}},guardTexts:{[cachePath]:cache},paths:[...Object.keys(adoption.afterHashes),`${dir}/transit-rejection-review.mjs`,`${dir}/transit-rejection-adoption.json`,`${dir}/transit-rejection-plan.md`]};
}
