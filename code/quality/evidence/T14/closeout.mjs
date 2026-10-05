import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T14', hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const labels=['acceptance-closeout','api-regression-interop-root','test-types-final','lint-sanitization','build-final','native-compiled-closeout','audit-closeout','diff-closeout'];
const records=labels.map(label=>JSON.parse(fs.readFileSync(`${dir}/codex-${label}.json`,'utf8')));
for(const record of records){assert.equal(record.exitCode,0);assert.equal(hash(record.evidencePath),record.evidenceSha256);}
assert(fs.readFileSync(`${dir}/codex-acceptance-closeout.txt`,'utf8').includes('11 passed'));
assert(fs.readFileSync(`${dir}/codex-api-regression-interop-root.txt`,'utf8').includes('64 passed'));
assert(fs.readFileSync(`${dir}/codex-native-compiled-closeout.txt`,'utf8').includes('Owned compiled API/schema/storage closed'));
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8').replace(/^\uFEFF/,'')),task=ledger.tasks.find(item=>item.id==='T14');assert.equal(task.status,'IN_PROGRESS');
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify(records,null,2)+'\n');
const files=folder=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(folder,entry.name)):[path.join(folder,entry.name).replaceAll('\\','/')]);
const outputs=[...files('apps/api/src/modules/uploads'),'apps/api/src/modules/chat/chat.service.ts','apps/api/src/modules/chat/chat.exception-filter.ts','apps/api/src/modules/chat/attachment-dto.ts','apps/api/src/app.module.ts','apps/api/test/chat-rich.integration.spec.ts',...files(dir)];
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands:records,evidencePaths:[`${dir}/preflight-resume.txt`,`${dir}/plan.md`,`${dir}/review.md`,`${dir}/codex-red-native.txt`,`${dir}/final-verification.json`,...records.map(record=>record.evidencePath)],outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(outputs.map(file=>[file,hash(file)]))},blockers:[]});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('quality/spec-coverage.md','| Protected durable image uploads, atomic rich messages/replies/mentions and 24h orphan cleanup | T14 | 11 task +64 API regression tests; compiled Nest/PG/Redis upload/restart/membership revocation; T14/final-verification.json | PASS |\n');
console.log('T14 PASS from eight verified checks.');
