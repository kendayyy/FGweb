import fs from 'node:fs';
const path='quality/tasks.json',ledger=JSON.parse(fs.readFileSync(path,'utf8'));
const task=ledger.tasks.find(t=>t.id==='T16');
task.status='BLOCKED';task.completedAt=null;task.outputsHash=null;
task.blockers=['Antigravity stopped after two refactor loops: revoked-session lease remains online (independent real integration FAIL), non-atomic Redis transitions and missing native acceptance proof. See quality/evidence/T16/review-blocked.md. User decision needed to change implementer to Codex direct repair.'];
task.evidencePaths=[...new Set([...task.evidencePaths,'quality/evidence/T16/review-blocked.md','quality/evidence/T16/codex-green-task-refactor2.json','quality/evidence/T16/codex-full-api-regression-v2.json','quality/evidence/T16/codex-independent-session-review.json','quality/evidence/T16/refactor-2-prompt.txt'])];
task.commands=['codex-green-task-refactor2','codex-full-api-regression-v2','codex-independent-session-review'].map(label=>JSON.parse(fs.readFileSync(`quality/evidence/T16/${label}.json`,'utf8')));
fs.writeFileSync(path,JSON.stringify(ledger,null,2)+'\n');
console.log('T16 BLOCKED; T16-FE remains NOT_STARTED; no PASS or next-task unlock.');
