import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkGate,checkBaselines} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/CHATCRYPTO-QA',digest=x=>createHash('sha256').update(x).digest('hex'),hash=p=>digest(fs.readFileSync(p));
const bytes=fs.readFileSync('quality/tasks.json','utf8'),ledger=JSON.parse(bytes),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-QA');
assert.equal(task.status,'IN_PROGRESS');
const proposal=JSON.parse(fs.readFileSync(dir+'/csp-scope-proposal.json','utf8')),now=new Date().toISOString();
for(const item of proposal.paths){assert.equal(hash(item.proposed),item.proposedSha256);if(item.beforeSha256)assert.equal(hash(item.path),item.beforeSha256);else assert(!fs.existsSync(item.path));}
fs.appendFileSync('../.doc/history.md',`\n- Coding and build 2 — CHATCRYPTO-QA — bắt đầu phiên áp dụng CSP ${new Date(now).toLocaleString('sv-SE',{timeZone:'Asia/Bangkok'})} +07:00. Người dùng xác nhận “áp dụng”; đối chiếu đúng ba file/hash proposal trước sửa. Phạm vi hẹp Vite config/header helper/declaration; giữ historical PASS/checker/env, kiểm actual dev/preview và headed native trước review QA. Phiên đang chạy; chưa PASS.\n`);
const approvalPath=dir+'/csp-human-approval.json';
fs.writeFileSync(approvalPath,JSON.stringify({recordedAt:now,humanText:'áp dụng',scope:proposal.paths.map(x=>x.path),proposalSha256:hash(dir+'/csp-scope-proposal.json'),note:'Current user message explicitly authorizes reviewed three-file CSP proposal; recordedAt is observation time, not inferred message timestamp.'},null,2)+'\n',{flag:'wx'});
const amendment={source:approvalPath,reason:'Explicit human approval áp dụng of reviewed three-file CSP proposal',paths:proposal.paths.map(x=>x.path)};
task.writeAllowlist=[...new Set([...task.writeAllowlist,...amendment.paths])];task.approvedScopeAmendments=[...(task.approvedScopeAmendments??[]),amendment];
checkBaselines({root:process.cwd(),baseline:JSON.parse(fs.readFileSync('quality/spec-baseline.json','utf8'))});
checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:task.specSha256,requestedPaths:amendment.paths});
const manifest=JSON.parse(fs.readFileSync(task.gateRebaseline.manifestPath,'utf8'));
manifest.approval={approvedAt:now,text:'Human áp dụng authorizes exact reviewed CSP files; preserve prior spec lineage and all historic rows',scope:'Only approved three-file CSP application and QA ownership transition'};
const prior=ledger.tasks.find(t=>t.id==='CHATCRYPTO-FE');assert.equal(prior.outputsHash.files[proposal.paths[0].path],proposal.paths[0].beforeSha256);
for(const item of proposal.paths)fs.writeFileSync(item.path,fs.readFileSync(item.proposed),item.beforeSha256?{}:{flag:'wx'});
manifest.outputTransitions.push({path:proposal.paths[0].path,previousTaskId:prior.id,beforeSha256:proposal.paths[0].beforeSha256,afterSha256:proposal.paths[0].proposedSha256,scopeSha256:digest(JSON.stringify(amendment)),requiredEvidence:[approvalPath,dir+'/csp-scope-proposal.json',...proposal.paths.map(x=>x.proposed),proposal.paths[0].original].map(path=>({path,sha256:hash(path)}))});
const manifestPath=dir+'/csp-approved-gate-manifest.json';fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});task.gateRebaseline={version:1,manifestPath,manifestSha256:hash(manifestPath)};
checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:task.specSha256,requestedPaths:amendment.paths});
task.blockers=[];task.evidencePaths=[...new Set([...task.evidencePaths,approvalPath,manifestPath])];
for(let i=0;i<5;i++){assert.equal(fs.readFileSync('quality/tasks.json','utf8'),bytes);try{fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');break;}catch(e){if(e.code!=='UNKNOWN'||i===4)throw e;await new Promise(r=>setTimeout(r,250));}}
const proof={recordedAt:new Date().toISOString(),approvedFiles:proposal.paths.map(x=>({path:x.path,sha256:hash(x.path)})),historicalRowsPreserved:manifest.historicalRows.length,gateAccepted:true,qaStatus:task.status,actualApplicationVerificationPending:true};
fs.writeFileSync(dir+'/csp-applied-proof.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(proof));
