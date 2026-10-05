import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const records=JSON.parse(fs.readFileSync('quality/evidence/T10/final-verification.json','utf8').replace(/^\uFEFF/,''));
assert.equal(records.length,9);for(const record of records){assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8').replace(/^\uFEFF/,''));
const task=ledger.tasks.find(item=>item.id==='T10');assert.equal(task.status,'IN_PROGRESS');
const sourceFiles=fs.readdirSync('apps/api/src/modules/profiles').map(file=>'apps/api/src/modules/profiles/'+file);
const evidenceFiles=fs.readdirSync('quality/evidence/T10').filter(file=>fs.statSync('quality/evidence/T10/'+file).isFile()).map(file=>'quality/evidence/T10/'+file);
const files=[...sourceFiles,'apps/api/src/app.module.ts','apps/api/test/profiles.integration.spec.ts',...evidenceFiles];
task.status='PASS';task.completedAt=new Date().toISOString();task.blockers=[];task.commands=records;
task.outputsHash={specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(files.map(file=>[file,hash(file)]))};
task.evidencePaths=['quality/evidence/T10/final-verification.json','quality/evidence/T10/codex-review.md',...records.map(record=>record.evidencePath),'quality/evidence/T10/delegated-behavior-red.txt','quality/evidence/T10/codex-http500-red.txt'];
task.antigravity.result='REVIEWED_PASS_WITH_CODEX_CLOSEOUT';
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
let coverage=fs.readFileSync('quality/spec-coverage.md','utf8');coverage=coverage.replace('| Product API/UI features, media1000, PWA, release | T10–T42 | not implemented; task.md acceptance owns future evidence | NOT_STARTED |','| Profile APIs/security and transactional game interests | T10 | 15acceptance+31auth/profile regression+7independent, build/types/lint, native7/cleanup/secret audit; T10/final-verification.json and codex-review.md | PASS |\n| Product UI/realtime features, media1000, PWA, release | T11–T42 | task.md acceptance owns future evidence | NOT_STARTED |');
fs.writeFileSync('quality/spec-coverage.md',coverage);
console.log('T10 PASS based on nine independently recorded checks.');
