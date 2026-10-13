import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkGate} from '../../../scripts/verify-task.mjs';

export function reviewSpecGate(dir,ledger){
 const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 const adoption=read(`${dir}/spec-gate-adoption.json`),state=read(`${dir}/spec-gate-before.json`),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-BE');
 assert.equal(adoption.approval.text,'xác nhận');assert.equal(adoption.backendComplete,false);assert.equal(adoption.producerTask,'T37');assert.equal(adoption.producerImplemented,false);
 assert.equal(hash('scripts/verify-task.mjs'),adoption.checkerAfter);assert.equal(hash(`${dir}/spec-gate-before.mjs`),adoption.checkerBefore);assert.equal(adoption.checkerBefore,state.checkerBefore);
 assert(task.approvedScopeAmendments.some(a=>JSON.stringify(a)===JSON.stringify(adoption.scope)));assert(task.writeAllowlist.includes('scripts/verify-task.mjs'));
 assert.equal(hash('quality/spec-baseline.json'),adoption.baselineAfter);assert.equal(hash('../.doc/task.md'),adoption.taskDocAfter);assert.equal(hash(`${dir}/spec-gate-task-before.md`),adoption.taskDocBefore);
 assert.equal(hash(adoption.manifestPath),adoption.manifestSha256);assert.equal(task.gateRebaseline.manifestSha256,adoption.manifestSha256);
 for(const row of ledger.tasks.filter(t=>t.id!==task.id))assert.equal(createHash('sha256').update(JSON.stringify(row)).digest('hex'),state.ledgerRowHashes[row.id]);
 const custodyPath=`${dir}/custody-deadline-review.mjs`,cachePath=`${dir}/crypto-cache-review.mjs`;
 const undoCustody=text=>text.replace("restoreBanT37Baseline(baseline,dir,taskDocument='../.doc/task.md'){","restoreBanT37Baseline(baseline,dir){").replace('hash(taskDocument)','hash(\'../.doc/task.md\')').replace("fs.readFileSync(taskDocument,'utf8')","fs.readFileSync('../.doc/task.md','utf8')");
 assert.equal(createHash('sha256').update(undoCustody(fs.readFileSync(custodyPath,'utf8'))).digest('hex'),state.sourceHashes[custodyPath]);
 const addedCacheLine=" if(fs.existsSync(`${dir}/spec-gate-adoption.json`))previous=previous.replace(\"restoreBanT37Baseline(baseline,dir,taskDocument='../.doc/task.md'){\",\"restoreBanT37Baseline(baseline,dir){\").replace('hash(taskDocument)',\"hash('../.doc/task.md')\").replace(\"fs.readFileSync(taskDocument,'utf8')\",\"fs.readFileSync('../.doc/task.md','utf8')\");\n";
 const cache=fs.readFileSync(cachePath,'utf8'),inlineCacheLine=addedCacheLine.trim();assert.equal(cache.split(inlineCacheLine).length,2);assert.equal(createHash('sha256').update(cache.replace(inlineCacheLine,'')).digest('hex'),state.sourceHashes[cachePath]);
 assert.equal(state.sourceHashes['quality/spec-baseline.json'],adoption.baselineBefore);
 for(const [p,h]of Object.entries(state.sourceHashes))if(p!==custodyPath&&p!==cachePath&&p!=='quality/spec-baseline.json')assert.equal(hash(p),h,`App checkpoint changed during gate adoption: ${p}`);
 assert.equal(checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:hash('../.doc/01-product-spec.md')}),task);
 return {owned:['scripts/verify-task.mjs'],taskDocument:`${dir}/spec-gate-task-before.md`,paths:[`${dir}/spec-gate-review.mjs`,`${dir}/spec-gate-adoption.json`,`${dir}/spec-gate-manifest.json`,'scripts/verify-task.mjs']};
}
export function restoreSpecGateBaseline(baseline,dir){
 const adoption=JSON.parse(fs.readFileSync(`${dir}/spec-gate-adoption.json`,'utf8'));
 const sha=v=>createHash('sha256').update(JSON.stringify(v,null,2)+'\n').digest('hex');
 assert.equal(sha(baseline),adoption.baselineAfter);baseline.hashes.taskSha256=adoption.originalTaskDocHash;
 assert.equal(sha(baseline),adoption.baselineBefore);return baseline;
}
