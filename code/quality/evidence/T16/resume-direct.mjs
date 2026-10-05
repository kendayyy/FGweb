import fs from 'node:fs';
const file='quality/tasks.json',ledger=JSON.parse(fs.readFileSync(file,'utf8'));
const task=ledger.tasks.find(t=>t.id==='T16');task.status='IN_PROGRESS';task.blockers=[];
task.evidencePaths.push('quality/evidence/T16/direct-resume.md');
fs.writeFileSync(file,JSON.stringify(ledger,null,2)+'\n');
fs.writeFileSync('quality/evidence/T16/direct-resume.md','# T16 direct repair\n\nUser replied "tiếp tục làm" to the concrete proposal to let Codex repair T16 directly, test and review, then restore Antigravity for T16-FE. Authorization accepted; no new scope, contracts, database or design changes. Earlier BLOCKED report/failures remain historical evidence. T16 IN_PROGRESS, T16-FE locked.\n\nRoot cause: validate(socket) throws for revoked session before heartbeat cleanup inner authorize catch; cached actor and Redis lease remain. Independently reproduced with real services. Redis lease transitions also interleave between service instances. Fixes follow behavior RED/PASS within current allowlist.\n');
