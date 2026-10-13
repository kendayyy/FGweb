import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const dir='quality/evidence/CHATCRYPTO-BE',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8')),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-BE');
assert.equal(task.status,'PASS');for(const [p,h]of Object.entries(task.outputsHash.files))assert.equal(hash(p),h);
const others=ledger.tasks.filter(t=>t.id!==task.id).map(t=>JSON.stringify(t)),previous=task.failedAttempts,byPath=new Map();
for(const item of previous){const record=item.record??item;assert(record.evidencePath);assert.equal(hash(record.evidencePath),record.evidenceSha256);assert.notEqual(record.exitCode,0);if(byPath.has(record.evidencePath)){const first=byPath.get(record.evidencePath),old=first.record??first;assert.deepEqual(old,record);}else byPath.set(record.evidencePath,item);}
const realRecords=fs.readdirSync(dir).filter(p=>/^codex-.*\.json$/.test(p)).map(p=>JSON.parse(fs.readFileSync(`${dir}/${p}`,'utf8'))).filter(r=>r.exitCode!==0);
assert.deepEqual([...byPath.keys()].sort(),realRecords.map(r=>r.evidencePath).sort());assert.equal(previous.length,499);assert.equal(byPath.size,251);
const snapshot=`${dir}/closure-failed-attempts-before.json`,correctionPath=`${dir}/closure-correction.json`;
fs.writeFileSync(snapshot,JSON.stringify(previous,null,2)+'\n',{flag:'wx'});
const correction={recordedAt:new Date().toISOString(),task:task.id,statusUnchanged:'PASS',runtimeSourceChanged:false,historicalClosureUnchanged:true,oldClosurePath:`${dir}/closure.json`,oldClosureSha256:hash(`${dir}/closure.json`),beforeEntries:previous.length,distinctFailedCommandRecords:byPath.size,removedDuplicateMetadataEntries:previous.length-byPath.size,originalEntriesSnapshot:snapshot,originalEntriesSha256:hash(snapshot),reason:'Closure merger tested item.record only; older saved failures are flat command records. Preserve the first original entry and every actual failed command/log; no failure is erased or reclassified.'};
fs.writeFileSync(correctionPath,JSON.stringify(correction,null,2)+'\n',{flag:'wx'});
task.failedAttempts=[...byPath.values()];task.failedAttemptsCorrection=correctionPath;task.evidencePaths.push(snapshot,correctionPath);
for(const p of [snapshot,correctionPath,`${dir}/correct-failed-attempts.mjs`])task.outputsHash.files[p]=hash(p);
assert.deepEqual(ledger.tasks.filter(t=>t.id!==task.id).map(t=>JSON.stringify(t)),others);
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('../.doc/history.md',`\n- Coding and build 2 — CHATCRYPTO-BE — ${new Date().toLocaleString('sv-SE',{timeZone:'Asia/Bangkok'})} +07:00: đính chính metadata closure trước mở FE. Entry11:50 ghi499failed runs theo số entry, thực tế251command thất bại phân biệt; close merger không nhận dạng248flat records cũ nên thêm bản wrapper trùng. Lưu nguyên499entry vào closure-failed-attempts-before.json, giữ tất cả251logs/record hashes và từng entry gốc; closure.json/history/source/output2743files cũ không sửa. Chỉ dedupe metadata BE và bổ sung proof closure-correction.json; PASS/spec/commands/75historicPASS/95otherrows/runtime/main/production không đổi. Không gọi251 là testfail chưa sửa; gồm RED và vòng fixture/review lỗi được bảo tồn. FE gate trước đó fail spec baseline, FE chưa coding/IN_PROGRESS.\n`);
console.log(JSON.stringify(correction));
