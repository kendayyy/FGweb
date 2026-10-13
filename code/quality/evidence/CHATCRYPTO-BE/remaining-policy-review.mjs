import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkBaselines,checkGate} from '../../../scripts/verify-task.mjs';

const dir='quality/evidence/CHATCRYPTO-BE';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>fs.readFileSync(p,'utf8');
const ledger=JSON.parse(read('quality/tasks.json'));
const before=JSON.parse(read(`${dir}/before.json`));
const progress=JSON.parse(read(`${dir}/progress-review.json`));
const baseline=JSON.parse(read('quality/spec-baseline.json'));
const task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-BE');
assert.equal(task.status,'IN_PROGRESS');
assert.equal(ledger.tasks.find(t=>t.id==='T37').status,'NOT_STARTED');
assert.equal(task.banProducerDecision.implementationTask,'T37');
assert.equal(task.banProducerDecision.acceptanceSatisfied,false);
for(const row of before.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===row.id),row);
assert.equal(hash('scripts/verify-task.mjs'),before.readonly['scripts/verify-task.mjs']);
for(const [p,digest]of Object.entries(progress.sourceHashes))assert.equal(hash(p),digest,`Current checkpoint changed: ${p}`);
assert.equal(progress.lastFullRegressionCurrentForAllSource,false);
const files={contracts:'packages/contracts/src/chat-crypto.ts',parser:'apps/api/src/modules/chat-crypto/http-body-parsers.ts',relay:'apps/api/src/modules/chat-crypto/crypto-relay.service.ts',devices:'apps/api/src/modules/chat-crypto/crypto-devices.service.ts',sweep:'apps/api/src/modules/chat-crypto/crypto-sweep-loop.ts',reports:'apps/api/src/modules/chat-crypto/crypto-reports.service.ts',custody:'apps/api/src/modules/chat-crypto/crypto-custody.module.ts'};
const sources=Object.fromEntries(Object.entries(files).map(([key,p])=>[key,read(p)]));
function anchor(key,needle){
 const lines=sources[key].split(/\r?\n/),index=lines.findIndex(line=>line.includes(needle));
 assert(index>=0,`Missing reviewed source anchor: ${key}: ${needle}`);
 return {file:files[key],line:index+1,needle};
}
const controls=[
 {scope:'normal JSON body',value:'100 KiB',anchor:anchor('parser',"json({limit:'100kb'})")},
 {scope:'crypto JSON body',value:'256 KiB',anchor:anchor('parser',"json({limit:'256kb'})")},
 {scope:'private message JSON body',value:'192 KiB',anchor:anchor('parser',"json({limit:'192kb'})")},
 {scope:'recovery JSON body',value:'17 MiB',anchor:anchor('parser',"json({limit:'17mb'})")},
 {scope:'private ciphertext image',value:'5 MiB per object',anchor:anchor('contracts','MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES=5*1024*1024')},
 {scope:'selected mention routing',value:'1000 distinct IDs per message, subject to body ceiling',anchor:anchor('contracts','z.array(opaque).max(1000)')},
 {scope:'registered devices',value:'100 total records per user, including revoked records',anchor:anchor('devices','if(count>=100)')},
 {scope:'available prekeys',value:'100 unclaimed keys per device',anchor:anchor('devices','if(available>100)')},
 {scope:'verification queue retention',value:'10 minutes',anchor:anchor('relay',"now()+interval '10 minutes'")},
 {scope:'to-device queue retention',value:'1 day',anchor:anchor('relay',"now()+interval '1 day'")},
 {scope:'queue expiry work',value:'at most 100 unlocked expired rows per queue per sweep',anchor:anchor('relay','WHERE expires_at<=now() ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED')},
 {scope:'sweep timer',value:'60000 ms default, no catch-up throughput guarantee',anchor:anchor('sweep','intervalMs=60000')},
 {scope:'report retention',value:'explicit operator configuration required, no chosen default',anchor:anchor('custody','FG_REPORT_RETENTION_SECONDS')},
];
const records=['crypto-cache-regression-1','custody-deadline-regression-1','stock-spec-snapshot-review-1'];
const verifiedRecords=records.map(label=>{
 const r=JSON.parse(read(`${dir}/codex-${label}.json`));
 assert.equal(r.exitCode,0);assert.equal(hash(r.evidencePath),r.evidenceSha256);
 return {label,completedAt:r.completedAt,evidencePath:r.evidencePath,evidenceSha256:r.evidenceSha256};
});
const documents=checkBaselines({root:process.cwd(),baseline});
let reason='';try{checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:hash('../.doc/01-product-spec.md')});}catch(error){reason=error.message;}
assert.equal(reason,'spec baseline changed');
const result={recordedAt:new Date().toISOString(),task:task.id,kind:'read-only source and recorded-evidence review',runtimeTestExecuted:false,backendComplete:false,stockGateAccepted:false,stockGateReason:reason,documentHashesVerified:documents,historicalPassRowsUnchanged:before.historical.length,currentCheckpointSourcesVerified:Object.keys(progress.sourceHashes).length,sourceHashes:Object.fromEntries(Object.values(files).map(p=>[p,hash(p)])),controls,verifiedRecords,currentScopedRegression:'crypto-cache-regression-1',lastBroadRegression:'custody-deadline-regression-1',lastBroadRegressionCurrentForAllSource:false,aggregateIngressPolicyApproved:false,aggregateStorageQuotaVerified:false,periodicCleanupSloVerified:false,nominalQueueSweepCeilingRowsPerMinute:100,nominalCeilingLimitations:'Per queue, default single loop; locks, failures and long runs can reduce throughput. Manual benchmark is not a periodic SLO.',requiredPolicyDecisions:['Fair aggregate pending rows and ciphertext bytes by authenticated sender and recipient; separate durable history from expiring transport.','Quota admission must be atomic across instances and retries; rejected requests leave no queue, outbox, object or dedup residue.','Define backlog and expiry objectives before changing timer/batch limits; retain one thousand selected mentions and one thousand call/live target.','Choose report retention and deploy separately scoped off-machine custody before production activation.'],banProducer:{task:'T37',implemented:false,acceptanceSatisfied:false,gateWaived:false},productionActivated:false};
const output=`${dir}/remaining-policy-review.json`;assert(!fs.existsSync(output),'Preserve prior review');
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,controls:result.controls.length,sourceHashes:undefined}));
