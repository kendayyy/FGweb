import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/CHATCRYPTO-DATA',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),before=JSON.parse(fs.readFileSync(`${dir}/before.json`));
const task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-DATA');assert.equal(task.status,'IN_PROGRESS');assert.equal(ledger.activeCheckpoint,null);
for(const id of ['T01-FIX4','T02-FIX3']){const t=ledger.followups.find(t=>t.id===id);assert.equal(t.status,'PASS');for(const [p,h]of Object.entries(t.outputsHash.files))assert.equal(hash(p),h,p);}
for(const [p,h]of Object.entries(task.setupOutputAdoption.files))assert.equal(hash(p),h,p);
for(const old of before.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old,old.id);
assert.equal(hash('.env.local'),before.configuration.env);
assert.equal(checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json'))}),8);
for(const id of ['CHATCRYPTO-BE','CHATCRYPTO-FE','CHATCRYPTO-QA','T29'])assert.equal(ledger.tasks.find(t=>t.id===id).status,'NOT_STARTED',id);
for(const label of ['resume-lint-1','resume-diff-1']){const r=JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`));assert.equal(r.exitCode,0);assert.equal(hash(r.evidencePath),r.evidenceSha256);}
const at=new Date().toISOString(),result={recordedAt:at,setupPrerequisites:'PASS',task:'CHATCRYPTO-DATA',status:'IN_PROGRESS',nextWork:'ADR/encrypted contracts and additive PostgreSQL migrations with RED tests',baselines:8,setupOutputsVerified:Object.keys(task.setupOutputAdoption.files).length,historicalPassRecordsUnchanged:before.historical.length,environmentUnchanged:true,mainMigrationPerformed:false,cryptoFeatureImplemented:false,backendFrontendQaNotStarted:true};
fs.writeFileSync(`${dir}/session-review.json`,JSON.stringify(result,null,2)+'\n');
fs.appendFileSync('../.doc/history.md',`\n- Phiên setup/CHATCRYPTO-DATA bàn giao ${new Date(at).toLocaleString('sv-SE',{timeZone:'Asia/Bangkok'})} +07:00: resume-lint1/diff1 exit0 và reviewed setup outputs/old PASS/8baseline/env kiểm lại. T01-FIX4/T02-FIX3 PASS; DATA IN_PROGRESS, contracts/schema/migrations chưa triển khai, không đánh PASS hoặc mở BE/FE/QA/T29. Việc tiếp theo ADR/wire DTO/database RED thật theo implementation-plan; không còn blocker quyết định protocol, không main migration. Evidence code/quality/evidence/CHATCRYPTO-DATA/session-review.json.\n`);
console.log(JSON.stringify(result));
