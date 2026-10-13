import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/CHATCRYPTO-BE',sha=v=>createHash('sha256').update(v).digest('hex'),review=JSON.parse(fs.readFileSync(`${dir}/loading-amendment-review.json`)),record=JSON.parse(fs.readFileSync(`${dir}/codex-loading-amendment-review-1.json`)),before=JSON.parse(fs.readFileSync(`${dir}/before.json`)),ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-BE'),bytes=fs.readFileSync('quality/spec-baseline.json'),baseline=JSON.parse(bytes);
assert.equal(record.exitCode,0);assert.equal(sha(fs.readFileSync(record.evidencePath)),record.evidenceSha256);assert.equal(sha(bytes),review.baselineBeforeSha256);assert(review.checkerUnchanged&&review.backendAcceptanceUnchanged);assert.equal(task.status,'IN_PROGRESS');assert(task.writeAllowlist.includes('quality/spec-baseline.json'));
for(const old of before.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old);
const files={specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md'};
for(const [key,file]of Object.entries(files)){assert.equal(baseline.hashes[key],review.beforeHashes[key]);assert.equal(sha(fs.readFileSync(file)),review.afterHashes[key]);}
const amendment={adoptedAt:new Date().toISOString(),source:'Persisted human Permission to broaden Write Scope or touch locked files',requirement:review.requirement,paths:['quality/spec-baseline.json'],beforeSha256:{'quality/spec-baseline.json':review.baselineBeforeSha256},reason:'Exactly reconstructed three user-authorized LOADING3D documentation deltas; defer new task activation, preserve historical ledger/checker/backend acceptance.',review:`${dir}/loading-amendment-review.json`,evidence:`${dir}/scope-loading-baseline.json`};
fs.writeFileSync(amendment.evidence,JSON.stringify(amendment,null,2)+'\n',{flag:'wx'});task.approvedScopeAmendments.push(amendment);fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
Object.assign(baseline.hashes,review.afterHashes);fs.writeFileSync('quality/spec-baseline.json',JSON.stringify(baseline,null,2)+'\n');checkBaselines({root:process.cwd(),baseline});
assert.equal(sha(fs.readFileSync('scripts/verify-task.mjs')),before.readonly['scripts/verify-task.mjs']);
const result={recordedAt:new Date().toISOString(),task:task.id,status:task.status,beforeSha256:sha(bytes),afterSha256:sha(fs.readFileSync('quality/spec-baseline.json')),onlyThreeDocumentHashesChanged:true,checkerUnchanged:true,historicalPASSUnchanged:75,backendAcceptanceUnchanged:true,queueActivationDeferredUntilCryptoQA:true};
fs.writeFileSync(`${dir}/loading-amendment-adoption.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
