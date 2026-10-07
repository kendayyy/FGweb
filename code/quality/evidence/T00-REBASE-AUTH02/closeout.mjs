import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T00-REBASE-AUTH02',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const commands=['checker-1','derived-1','audit-3','lint-1','diff-1'].map(l=>JSON.parse(fs.readFileSync(`${dir}/codex-${l}.json`)));
for(const r of commands){assert.equal(r.exitCode,0);assert.equal(hash(r.evidencePath),r.evidenceSha256);}
assert.equal(JSON.parse(fs.readFileSync(`${dir}/codex-red-1.json`)).exitCode,1);
fs.writeFileSync(`${dir}/review.md`,'# AUTH02 baseline review — PASS\n\nDirect human approval from Idea and this coding/build thread is captured in authorization.json. Adopt seven mandatory sources, including approved auth mockup04. Eleven gate tests PASS after genuine RED; checker change only adds the required source, preserving all prerequisite/scope/hash/evidence checks. Historical PASS status, commands, output hashes, timestamps and evidence remain exactly unchanged; active spec provenance adopts approved amendment. Current T03-FIX12 source and test work remains byte-identical. First audit correctly caught ignored compiled WIP omitted from Git inventory; exact separate TypeScript rebuild proves all derived bytes, failed audit preserved. Original readonly/WIP snapshots retained.\n\nOrder: finish T03-FIX12, then AUTH02-DATA/BE/FE, then T24-FIX1/T25. Auth implementation and SMTP delivery are not claimed here. Recipient namvupham2004@gmail.com is authorized for real verification/reset test delivery. No auth provider, database, production application or original mockup change in this metadata checkpoint.\n');
fs.writeFileSync(`${dir}/final-verification.json`,JSON.stringify({task:'T00-REBASE-AUTH02',baselines:7,tests:11,commands,historicalPassPreserved:true,suspendedWorkPreserved:true,authImplemented:false,smtpDelivered:false},null,2)+'\n');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name).replaceAll('\\','/')]);
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='T00-REBASE-AUTH02');assert.equal(task.status,'IN_PROGRESS');
const evidence=walk(dir),outputs=['quality/spec-baseline.json','scripts/verify-task.mjs',...evidence];
Object.assign(task,{status:'PASS',completedAt:new Date().toISOString(),commands,evidencePaths:evidence,outputsHash:{specSha256:hash('../.doc/01-product-spec.md'),files:Object.fromEntries(outputs.map(f=>[f,hash(f)]))}});
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');fs.appendFileSync('quality/spec-coverage.md','| Approved AUTH02 requirements/mockup04 adopted; historical PASS and current contracts WIP preserved | T00-REBASE-AUTH02 |11 gate tests, exact derived rebuild, seven-source/frozen/scope audit, lint/diff | PASS (baseline only) |\n');
console.log('T00-REBASE-AUTH02 PASS; resume T03-FIX12 before auth implementation.');
