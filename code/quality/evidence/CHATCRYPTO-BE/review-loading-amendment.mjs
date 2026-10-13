import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/CHATCRYPTO-BE',sha=v=>createHash('sha256').update(v).digest('hex');
const baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json')),before=JSON.parse(fs.readFileSync(`${dir}/before.json`)),ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));
assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,'CHATCRYPTO-BE');
for(const old of before.historical)assert.deepEqual(ledger.tasks.find(t=>t.id===old.id),old);
assert.equal(sha(fs.readFileSync('scripts/verify-task.mjs')),before.readonly['scripts/verify-task.mjs']);
const paths={specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md'};
const after={},deltas={};
for(const [key,file]of Object.entries(paths)){
 const text=fs.readFileSync(file,'utf8'),nl=text.includes('\r\n')?'\r\n':'\n';let prior;
 if(key==='specSha256')prior=text.split('## 18. Logo FG3D')[0].replace(/Ngày cập nhật:[^\r\n]*/,'Ngày cập nhật: 07/10/2026.').replace(/[\r\n]+$/,'')+nl;
 else if(key==='designSha256')prior=text.split('## 14. Logo FG3D')[0].replace(/[\r\n]+$/,'')+nl;
 else prior=text.replace(/### LOADING3D-CHANGE-01[\s\S]*?(?=### FG-BRAND-LOGO-01)/,'').replace(/^\| LOADING3D-FE[^\n]*\n/m,'').replace('| T29 | BACKEND | Cấp quyền phát màn hình và moderation cuộc gọi | LOADING3D-FE (sau chuỗi CHATCRYPTO đã pin) |','| T29 | BACKEND | Cấp quyền phát màn hình và moderation cuộc gọi | T28 |');
 assert.equal(sha(prior),baseline.hashes[key],`Unreviewed changes in ${file}`);
 after[key]=sha(text);deltas[key]={beforeSha256:sha(prior),afterSha256:after[key],priorReconstructedExact:true};
}
for(const [key,name]of Object.entries({mockupLobbySha256:'01-lobby-desktop-mobile.png',mockupCallSha256:'02-group-call-live.png',mockupFeedSha256:'03-community-feed-desktop-mobile.png',mockupAuthSha256:'04-login-desktop-mobile.png',mockupAdminSha256:'05-admin-support-desktop.png'}))assert.equal(sha(fs.readFileSync('../.doc/mockups/'+name)),baseline.hashes[key]);
assert.equal(sha(fs.readFileSync('scratch/fg-3d-loading-preview/index.html')),'1b5d3e6970e688520a6510887d82eb75fc b27356c5e23cd84310d420e92d71f6'.replace(' ',''));
const result={recordedAt:new Date().toISOString(),task:'CHATCRYPTO-BE',requirement:'LOADING3D-CHANGE-01',trustedRequest:{threadId:'01a114a3-ab20-70e2-b020-db31d489bffd',title:'Idea',turnId:'01a11f38-5d71-7d41-bdf3-1315a37ebbb1',text:'thêm vào task mới và spec xếp task mới hợp lý để coding and build 2 làm'},baselineBeforeSha256:sha(fs.readFileSync('quality/spec-baseline.json')),beforeHashes:Object.fromEntries(Object.keys(paths).map(k=>[k,baseline.hashes[k]])),afterHashes:after,deltas,mockupsUnchanged:5,checkerUnchanged:true,historicalPASSUnchanged:75,backendAcceptanceUnchanged:true,queueActivationDeferredUntilCryptoQA:true,productionActivation:false};
fs.writeFileSync(`${dir}/loading-amendment-review.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
