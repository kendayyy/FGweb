import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/CHATCRYPTO-FE';
const bytes=fs.readFileSync('quality/tasks.json','utf8'),ledger=JSON.parse(bytes);
const task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-FE');assert.equal(task.status,'IN_PROGRESS');
const proposal=JSON.parse(fs.readFileSync(dir+'/stale-sync-fixture-proposal.json','utf8'));
assert.equal(createHash('sha256').update(fs.readFileSync(proposal.file)).digest('hex'),proposal.beforeSha256);
task.blockers=[...(task.blockers??[]).filter(x=>!String(x).startsWith('CONTRACTS-FIXTURE-SCOPE:')),'CONTRACTS-FIXTURE-SCOPE: full contracts216/217; original legacy-candidate sync fixture omits mandatory conversation/revision/prekey-count fields. Concrete original/proposed hashes preserved; explicit human approval to add packages/contracts/test/chat-crypto-legacy-candidate.test.ts to writeAllowlist pending. Do not weaken schema/assertions or mark FE PASS.'];
task.evidencePaths=[...new Set([...task.evidencePaths,dir+'/final-acceptance-review.md',dir+'/final-verification-addendum.md',dir+'/final-scope-audit-1.json',dir+'/legacy-viewport-proof-crypto_fe_16e635589a1649ab86d8cf47c11057fe.json',dir+'/stale-sync-fixture-proposal.json',dir+'/stale-sync-fixture-proposed.ts'])];
assert.equal(fs.readFileSync('quality/tasks.json','utf8'),bytes);
for(let i=0;i<5;i++){try{fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');break;}catch(error){if(error.code!=='UNKNOWN'||i===4)throw error;await new Promise(r=>setTimeout(r,250));}}
const now=new Date();
fs.appendFileSync('E:/FGweb/.doc/history.md',`\n- Coding and build 2 — CHATCRYPTO-FE — kết thúc khoảng làm việc hiện tại ${now.toLocaleString('sv-SE',{timeZone:'Asia/Bangkok'})} +07:00. Phiên đang tiếp nối các checkpoint05:13Z trở đi, không dựng giờ bắt đầu cũ; checkpoint24 đối chiếu các vòng sửa/test/review thật. Native38/38, web236/236, headed current legacy recovery và bốn viewport thật đạt; scope/historical76/checker/env/gate verified. Contracts216/217, chưa được phép sửa fixture ngoài writeAllowlist; blocker CONTRACTS-FIXTURE-SCOPE, bản sửa nguyên assertion và ba test âm đã chuẩn bị. FE vẫn IN_PROGRESS, chưa acceptance PASS/QA/later tasks/main/production. Evidence code/${dir}/final-verification-addendum.md và checkpoint-legacy-client-progress-24.json; tiếp tục khi có xác nhận phạm vi cụ thể.\n`);
console.log(JSON.stringify({closedAt:now.toISOString(),task:task.id,status:task.status,blocker:'CONTRACTS-FIXTURE-SCOPE',proposalApplied:false,frontendComplete:false}));
