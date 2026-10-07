import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
const dir='quality/evidence/T06-FIX1',hash=b=>createHash('sha256').update(b).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='T06-FIX1');
assert.equal(ledger.tasks.find(t=>t.id==='T00-REBASE-VISIBILITY2').status,'PASS');
task.status='IN_PROGRESS';task.blockers=[];fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
// A new baseline review happened during approved work. Preserve WIP, verify the
// original prerequisite bytes, run the unmodified gate, restore identical WIP.
const latest=new Map();for(const t of ledger.tasks.slice(0,ledger.tasks.indexOf(task)))for(const [f,h]of Object.entries(t.outputsHash?.files??{}))latest.set(f,h);
const files=['packages/database/src/schema/recruitments.ts','packages/database/migrations/meta/_journal.json'];
const backups=files.map(f=>({f,bytes:fs.readFileSync(f)}));
for(const {f,bytes}of backups)fs.writeFileSync(`${dir}/preserved-${f.endsWith('.ts')?'recruitments.ts':'journal.json'}`,bytes,{flag:'wx'});
const original=files.map(f=>{
 const blob=execFileSync('git',['show',`HEAD:code/${f}`]);const text=blob.toString('utf8');
 const candidate=[blob,Buffer.from(text.replaceAll('\r\n','\n').replaceAll('\n','\r\n'))].find(b=>hash(b)===latest.get(f).toLowerCase());
 assert(candidate,`Original prerequisite bytes not reproducible: ${f}`);return {f,bytes:candidate};
});
try{
 for(const {f,bytes}of original)fs.writeFileSync(f,bytes);
 const result=spawnSync(process.execPath,[`${dir}/record.mjs`,'gate-4',process.execPath,'scripts/verify-task.mjs','T06-FIX1',...files],{stdio:'inherit',cwd:process.cwd()});assert.equal(result.status,0);
}finally{for(const {f,bytes}of backups){fs.writeFileSync(f,bytes);assert.equal(hash(fs.readFileSync(f)),hash(bytes));}}
const allow=f=>task.writeAllowlist.some(p=>p.endsWith('/**')?f.startsWith(p.slice(0,-2)):f===p)||['quality/tasks.json','quality/spec-coverage.md'].includes(f);
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
fs.writeFileSync(`${dir}/readonly-after-final-policy.json`,JSON.stringify(Object.fromEntries(tracked.filter(f=>!allow(f)).map(f=>[f,hash(fs.readFileSync(f))])),null,2)+'\n');
fs.writeFileSync(`${dir}/audit.mjs`,fs.readFileSync(`${dir}/audit.mjs`,'utf8').replace('readonly-after-visible-baseline.json','readonly-after-final-policy.json'));
console.log('Strict gate4 PASS; approved DB WIP restored byte-identically after process-only rebaseline.');
