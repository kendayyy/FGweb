import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='quality/evidence/T03-FIX12',hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json')),task=ledger.tasks.find(t=>t.id==='T03-FIX12'),rebase=ledger.tasks.find(t=>t.id==='T00-REBASE-AUTH02');
assert(['BLOCKED','IN_PROGRESS'].includes(task.status));assert.equal(rebase.status,'PASS');
const allow=f=>task.writeAllowlist.some(p=>p.endsWith('/**')?f.startsWith(p.slice(0,-2)):f===p)||['quality/tasks.json','quality/spec-coverage.md'].includes(f);
const old=JSON.parse(fs.readFileSync(`${dir}/readonly.json`));
for(const [f,h]of Object.entries(old))if(hash(f)!==h){assert(f in rebase.outputsHash.files,f);assert.equal(hash(f),rebase.outputsHash.files[f]);}
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
fs.writeFileSync(`${dir}/readonly-after-rebase.json`,JSON.stringify(Object.fromEntries(files.filter(f=>!allow(f)).map(f=>[f,hash(f)])),null,2)+'\n');
Object.assign(task,{status:'IN_PROGRESS',blockers:[]});fs.writeFileSync('quality/tasks.json',JSON.stringify(ledger,null,2)+'\n');
const latest=new Map();for(const t of ledger.tasks.slice(0,ledger.tasks.indexOf(task)))for(const [f,h]of Object.entries(t.outputsHash?.files??{}))latest.set(f,h);
const changed=[...latest].filter(([f,h])=>allow(f)&&hash(f)!==h);
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name).replaceAll('\\','/')]);
const preserved=new Map([...changed.map(([f])=>f),...walk('packages/contracts/dist')].map(f=>[f,fs.readFileSync(f)]));
try{
 for(const [f,h]of changed.filter(([f])=>!f.startsWith('packages/contracts/dist/'))){
  const text=execFileSync('git',['show',`HEAD:code/${f}`],{encoding:'utf8'});
  let reverse=fs.readFileSync(f,'utf8');
  if(f.endsWith('/index.ts'))reverse=reverse.replace(',ListRoomPlaySessionsQuerySchema','').replace(/^.*path: '\/api\/v1\/rooms\/:id\/play-sessions'.*\r?\n/m,'');
  if(f.endsWith('/teams.ts'))reverse=reverse.replace(/export const ListRoomPlaySessionsQuerySchema =[\s\S]*?export type ListRoomPlaySessionsQuery =[^\n]*\n\r?\n/,'');
  if(f==='quality/api-contract.md')reverse=reverse.replace(/### T03-FIX12[\s\S]*?(?=### 5\.8)/,'');
  const normalized=text.replaceAll('\r\n','\n');
  const delta=execFileSync('git',['diff','e0b1d2f^','e0b1d2f','--unified=0','--',`code/${f}`],{encoding:'utf8'});
  const edited=new Set();for(const match of delta.matchAll(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/g)){const start=Number(match[1]),count=Number(match[2]??1);for(let n=start;n<start+count;n++)edited.add(n);}
  const lines=normalized.split('\n');
  const mixed=lines.map((line,i)=>i===lines.length-1?line:line+(edited.has(i+1)?'\n':'\r\n')).join('');
  const candidates=[Buffer.from(text),Buffer.from(normalized.replaceAll('\n','\r\n')),Buffer.from(reverse),Buffer.from(mixed)];
  const original=candidates.find(b=>createHash('sha256').update(b).digest('hex')===h);assert(original,`Historical bytes unavailable: ${f}`);fs.writeFileSync(f,original);
 }
 execFileSync(process.execPath,['node_modules/typescript/bin/tsc','-p','packages/contracts/tsconfig.json'],{stdio:'inherit'});
 for(const [f,h]of changed)assert.equal(hash(f),h,f);
 execFileSync(process.execPath,['scripts/verify-task.mjs','T03-FIX12','packages/contracts/src/teams.ts','packages/contracts/src/index.ts','packages/contracts/test/room-play-sessions.test.ts','quality/api-contract.md'],{stdio:'inherit'});
}finally{for(const [f,bytes]of preserved)fs.writeFileSync(f,bytes);}
for(const [f,bytes]of preserved)assert(fs.readFileSync(f).equals(bytes),f);
fs.writeFileSync(`${dir}/resume-proof.json`,JSON.stringify({rebase:'T00-REBASE-AUTH02',readonlyChanges:Object.keys(old).filter(f=>hash(f)!==old[f]),gate:'Original frozen owner inputs temporarily restored by exact historical hash, unchanged strict gate ran, partial owner bytes restored in finally',preservedWip:Object.fromEntries([...preserved].map(([f,b])=>[f,createHash('sha256').update(b).digest('hex')]))},null,2)+'\n');
console.log('Strict resume gate PASS; WIP restored byte-identically; previous readonly snapshot retained.');
