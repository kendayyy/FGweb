import fs from 'node:fs';
import assert from 'node:assert/strict';
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='T26'),at=ledger.tasks.indexOf(task);
assert.equal(task.status,'IN_PROGRESS');assert(!ledger.tasks.some(t=>t.id==='T07-FIX2'));
const specSha256=task.specSha256,now=new Date().toISOString();
const approval={recordedAt:now,source:'Human reply in this chat: Duyệt gateway self-hosted (đề xuất)',proposal:'quality/evidence/T26/prerequisite-proposal.md',decision:'Gateway admission, keep self-hosted LiveKit; owner prerequisites before returning to T26; no paid service or weaker replay requirement'};
fs.writeFileSync('quality/evidence/T26/gateway-approval.json',JSON.stringify(approval,null,2)+'\n',{flag:'wx'});
const definitions=[
 ['T07-FIX2',['T25'],['packages/database/src/schema/call-admissions.ts','packages/database/src/index.ts','packages/database/test/call-admissions.test.ts','packages/database/migrations/meta/_journal.json','packages/database/migrations/0007_call_admissions.sql','packages/database/migrations/meta/0007_snapshot.json','packages/database/dist/index.js','packages/database/dist/index.d.ts','packages/database/dist/index.js.map','packages/database/dist/schema/call-admissions.js','packages/database/dist/schema/call-admissions.d.ts','packages/database/dist/schema/call-admissions.js.map','quality/evidence/T07-FIX2/**','.runtime/t07-fix2/**','quality/spec-coverage.md']],
 ['T01-FIX2',['T07-FIX2'],['apps/api/package.json','package-lock.json','quality/evidence/T01-FIX2/**','.runtime/t01-fix2/**','.cache/t01-fix2/**']],
 ['T03-FIX14',['T01-FIX2'],['packages/contracts/src/calls.ts','packages/contracts/src/index.ts','packages/contracts/test/call-admission.test.ts','packages/contracts/dist/**','quality/api-contract.md','quality/evidence/T03-FIX14/**','quality/spec-coverage.md']]
];
const entries=definitions.map(([id,dependencies,writeAllowlist])=>({id,status:'NOT_STARTED',dependencies,specSha256,inputsHash:null,outputsHash:null,commands:[],evidencePaths:[],startedAt:null,completedAt:null,blockers:[],writeAllowlist,approval}));
task.status='BLOCKED';task.dependencies=['T03-FIX14'];task.blockers=['Approved gateway prerequisites T07-FIX2, T01-FIX2, T03-FIX14 before production T26; native WebRTC ICE still unverified'];task.evidencePaths.push('quality/evidence/T26/gateway-approval.json','quality/evidence/T26/prerequisite-proposal.md','quality/evidence/T26/signaling-replay/result.json');
ledger.tasks.splice(at,0,...entries);fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({task:'T26',status:task.status,approvedPrerequisites:entries.map(t=>t.id),first:'T07-FIX2'}));
