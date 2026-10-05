import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const dir='quality/evidence/T16',hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const labels=['direct-preflight-baseline-v2','direct-task-final','direct-api-regression-final','direct-build-final','direct-native-final-v2','direct-test-types-final','direct-lint-closeout','direct-audit-closeout','direct-diff-final'];
const records=labels.map(label=>JSON.parse(fs.readFileSync(dir+'/codex-'+label+'.json','utf8')));
for(const record of records){assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
assert(fs.readFileSync(dir+'/codex-direct-task-final.txt','utf8').includes('25 passed'));
assert(fs.readFileSync(dir+'/codex-direct-api-regression-final.txt','utf8').includes('89 passed'));
assert(fs.readFileSync(dir+'/codex-direct-native-final-v2.txt','utf8').includes('"apiInstances":2'));
fs.writeFileSync(dir+'/final-verification.json',JSON.stringify(records,null,2)+'\n');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8')),task=ledger.tasks.find(t=>t.id==='T16');assert.equal(task.status,'IN_PROGRESS');
const files=folder=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(folder,e.name)):[path.join(folder,e.name).replaceAll('\\','/')]);
const outputs=[...files('apps/api/src/modules/presence'),'apps/api/src/app.module.ts','apps/api/test/presence.integration.spec.ts',...files(dir)];
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands:records,evidencePaths:[dir+'/review.md',dir+'/direct-resume.md',dir+'/contract-alignment.md',dir+'/final-verification.json',...records.map(r=>r.evidencePath)],outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(outputs.map(file=>[file,hash(file)]))},blockers:[]});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Atomic scoped presence leases, current session/private ACL, chosen status and cross-instance realtime | T16 | 25 task +89 API regression;6 compiled native checks with real PG/Redis/two instances; build/types/lint/audit; T16/final-verification.json | PASS |\n');
console.log('T16 PASS from nine verified checks; T16-FE gate required next.');
