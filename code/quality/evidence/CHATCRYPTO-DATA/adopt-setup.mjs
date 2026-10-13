import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/CHATCRYPTO-DATA',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-DATA');
assert.equal(task.status,'BLOCKED');assert.equal(ledger.activeCheckpoint,null);
assert.equal(checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),8);
const original=JSON.parse(fs.readFileSync(`${dir}/before.json`));
for(const old of original.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old,old.id);
assert.equal(hash('.env.local'),original.configuration.env);
const adopted={};
for(const id of task.setupPrerequisiteCheckpoints){
 const setup=ledger.followups.find(t=>t.id===id);assert.equal(setup.status,'PASS',id);
 for(const [p,h]of Object.entries(setup.outputsHash.files)){assert.equal(hash(p),h,p);adopted[p]=h;}
 for(const r of setup.commands){assert.equal(r.exitCode,0);assert.equal(hash(r.evidencePath),r.evidenceSha256);}
 const r=JSON.parse(fs.readFileSync(`quality/evidence/${id}/codex-close-1.json`));assert.equal(r.exitCode,0);assert.equal(hash(r.evidencePath),r.evidenceSha256);
 for(const p of [r.evidencePath,`quality/evidence/${id}/codex-close-1.json`])adopted[p]=hash(p);
}
for(const [p,h]of Object.entries(original.readonly))assert.equal(hash(p),adopted[p]??h,p);
const at=new Date().toISOString();
task.writeAllowlist=[...new Set([...task.writeAllowlist,...Object.keys(adopted)])];
task.approvedScopeAmendments.push({adoptedAt:at,source:'Approved Matrix/OpenBao proposal and persisted broad-scope authorization',reason:'Read-only adoption of reviewed setup owner outputs for stock next-task closure; no rewriting original PASS. Original DATA snapshot remains intact.',paths:Object.keys(adopted),evidence:`${dir}/setup-adoption.json`});
task.status='IN_PROGRESS';task.blockers=[];
task.setupOutputAdoption={recordedAt:at,checkpointIds:task.setupPrerequisiteCheckpoints,evidence:`${dir}/setup-adoption.json`,files:adopted};
// Future owners must include actual producers; these are scope pins only.
for(const [id,paths]of [
 ['CHATCRYPTO-BE',['apps/api/src/modules/chat/**','apps/api/src/modules/realtime/**','apps/api/src/modules/social/**']],
 ['CHATCRYPTO-FE',['apps/web/src/features/direct-messages/**','apps/web/src/features/lobby/**']],
]){const future=ledger.tasks.find(t=>t.id===id);assert.equal(future.status,'NOT_STARTED');future.writeAllowlist=[...new Set([...future.writeAllowlist,...paths])];future.approvedScopeAmendments.push({adoptedAt:at,source:'Approved protocol producer-path proposal and persisted broad scope',paths,evidence:`${dir}/setup-adoption.json`,reason:'Pin existing actual producer paths, not fabricated modules; future task remains NOT_STARTED'});}
const result={recordedAt:at,task:task.id,status:'IN_PROGRESS',approvedChoice:'Matrix WASM18.6.0 + OpenBao2.7.1',setupCheckpoints:task.setupPrerequisiteCheckpoints,files:adopted,readonlyHashExceptions:Object.fromEntries(Object.entries(adopted).filter(([p])=>Object.hasOwn(original.readonly,p))),historicalPassRecordsUnchanged:original.historical.length,environmentUnchanged:true,baselines:8,manualPrerequisiteGate:'PASS',stockCheckerUnchanged:true,stockClosureRequired:true,cryptoFeatureImplemented:false};
fs.writeFileSync(`${dir}/setup-adoption.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('../.doc/history.md',`\n- CHATCRYPTO-DATA resume ${new Date(at).toLocaleString('sv-SE',{timeZone:'Asia/Bangkok'})} +07:00: T01-FIX4/T02-FIX3 reviewed PASS exact outputs/commands/closing records xác minh; adopt setup outputs read-only theo precedent T26, original snapshot/PASS không sửa.8baseline/main env/history giữ nguyên; manual prerequisite gate PASS, unchanged stock checker vẫn bắt buộc tại closure với adopted latest owner outputs. Pin actual chat/realtime/social và direct-messages/lobby cho future owners; BE/FE chưa mở. Proposal-audit3 decision text vẫn là template pending; authorization.json và setup-adoption.json ghi quyết định human đã chốt, không suy chưa duyệt. Tiếp contracts/schema RED, chưa E2EE toàn FG/main migration.\n`);
console.log(JSON.stringify({task:task.id,status:task.status,setupCheckpoints:task.setupPrerequisiteCheckpoints,adoptedFiles:Object.keys(adopted).length,manualPrerequisiteGate:'PASS'}));
