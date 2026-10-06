import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T19',out=`${dir}/partial-at-quota`;
assert(!fs.existsSync(out));fs.mkdirSync(out);
const files=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):[path.join(d,e.name).replaceAll('\\','/')]);
const sources=['apps/web/src/App.tsx','apps/web/test/rooms.test.tsx',...files('apps/web/src/features/rooms')];
const hashes={};for(const f of sources){const data=fs.readFileSync(f),dst=path.join(out,f+'.txt');fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,data);hashes[f]=createHash('sha256').update(data).digest('hex');}
fs.writeFileSync(`${dir}/codex-quota-stop-source-hashes.json`,JSON.stringify({capturedAt:new Date().toISOString(),sources:hashes,partial:true,notPass:true},null,2)+'\n');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='T19');assert.equal(task.status,'IN_PROGRESS');
task.status='BLOCKED';task.blockers=['Antigravity429 RESOURCE_EXHAUSTED individual quota; refactor3 exit3 with incomplete source. Need user choice of Codex direct implementation or same-model retry after reset. See quality/evidence/T19/review-quota-stop.md.'];
task.blockedAt=new Date().toISOString();task.quotaStopEvidence='quality/evidence/T19/review-quota-stop.md';
fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
console.log('T19 BLOCKED honestly; partial source preserved; no PASS or next task opened.');
