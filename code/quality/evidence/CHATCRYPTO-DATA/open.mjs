import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {checkBaselines,checkGate} from '../../../scripts/verify-task.mjs';
const dir='quality/evidence/CHATCRYPTO-DATA',hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),baseline=JSON.parse(fs.readFileSync('quality/spec-baseline.json')),task=ledger.tasks.find(t=>t.id==='CHATCRYPTO-DATA');
// Historical metadata contains a private delivery-test address. Preserve hashes,
// but never duplicate that address into this task's evidence snapshot.
if(baseline.additionalRequirements?.['AUTH-CHANGE-02'])delete baseline.additionalRequirements['AUTH-CHANGE-02'].testEmail;
assert.equal(ledger.tasks.find(t=>t.status!=='PASS').id,task.id);assert.equal(task.status,'NOT_STARTED');assert.equal(checkBaselines({root:process.cwd(),baseline}),8);checkGate({root:process.cwd(),tasks:ledger.tasks,id:task.id,specHash:baseline.hashes.specSha256});
const owned=p=>task.writeAllowlist.some(x=>x.endsWith('/**')?p.startsWith(x.slice(0,-2)):p===x),paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>p&&!p.startsWith('../')&&fs.existsSync(p)&&p!=='quality/tasks.json'&&!p.startsWith('.runtime/')&&!p.startsWith('.cache/'));
const frozen=new Map(paths.filter(p=>!owned(p)).map(p=>[p,hash(p)]));for(const old of ledger.tasks.filter(t=>t.status==='PASS'))for(const p of Object.keys(old.outputsHash?.files??{}))if(!owned(p))frozen.set(p,hash(p));
task.status='IN_PROGRESS';task.startedAt=new Date().toISOString();task.evidencePaths=[`${dir}/before.json`];
fs.writeFileSync(`${dir}/before.json`,JSON.stringify({recordedAt:task.startedAt,readonly:Object.fromEntries(frozen),historical:ledger.tasks.filter(t=>t.status==='PASS'),configuration:{env:hash('.env.local')},baseline},null,2)+'\n',{flag:'wx'});fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
fs.appendFileSync('../.doc/history.md',`\n## ${new Date(task.startedAt).toLocaleString('sv-SE',{timeZone:'Asia/Bangkok'})} +07:00 — CHATCRYPTO-DATA\n- Codex; rebase PASS/8baseline/stock owner gate kiểm thật trước mở. Chỉ context/threat-model/library/protocol/migration proposal trước lựa chọn còn mở; chưa cài deps, code crypto/contracts/migration hoặc chuyển BE. Giữ old data/main env; PostgreSQL inventory chỉ counts/metadata, không đọc nội dung tin hoặc secrets.\n`);
console.log(JSON.stringify({task:task.id,status:task.status,stockGate:'PASS',protocolChoice:'PENDING',readonlyFiles:frozen.size}));
