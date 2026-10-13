import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/T00-REBASE-CHATCRYPTO01-FIX1',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function audit(){
 const old=JSON.parse(fs.readFileSync(`${dir}/previous-ledger.json`)),ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json')),proof=JSON.parse(fs.readFileSync(`${dir}/proof.json`));
 assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,'T00-REBASE-CHATCRYPTO01-FIX1');assert.equal(checkBaselines({root:process.cwd(),baseline}),8);
 const latest=new Map();for(const t of old.tasks){const expected=structuredClone(t);if(t.id==='CHATCRYPTO-DATA')expected.dependencies=['T00-REBASE-CHATCRYPTO01-FIX1'];assert.deepEqual(ledger.tasks.find(c=>c.id===t.id),expected,t.id);if(t.status==='PASS'){for(const [p,h]of Object.entries(t.outputsHash?.files??{}))latest.set(p,h);for(const r of t.commands){assert.equal(r.exitCode,0);if(r.evidencePath)assert(fs.existsSync(r.evidencePath));if(r.evidenceSha256)assert.equal(hash(r.evidencePath),r.evidenceSha256);}}}
 for(const [p,h]of latest)if(p!=='quality/spec-coverage.md')assert.equal(hash(p),h,p);
 assert.equal(hash('quality/spec-coverage.md'),proof.currentSha256);assert.equal(hash(`${dir}/previous-coverage.md`),proof.historicalSha256);assert.equal(fs.readFileSync('quality/spec-coverage.md','utf8'),fs.readFileSync(`${dir}/previous-coverage.md`,'utf8')+proof.approvedSuffix);
 assert.deepEqual(ledger.followups,old.followups);
 return {recordedAt:new Date().toISOString(),sources:8,historicalRecordsUnchanged:true,latestOutputsChecked:latest.size,exactApprovedCoverageSuffix:true,applicationChanged:false,checkerChanged:false};
}
if(process.argv[1]?.endsWith('audit.mjs')){const r=audit();fs.writeFileSync(`${dir}/audit.json`,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));}
