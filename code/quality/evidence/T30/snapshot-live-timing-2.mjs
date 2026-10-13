import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const root=path.resolve('.runtime/t30'),folders=fs.readdirSync(root).filter(n=>/^gateway-[a-f0-9-]{36}$/.test(n)&&fs.existsSync(path.join(root,n,'state.json')));assert.equal(folders.length,1);
const state=JSON.parse(fs.readFileSync(path.join(root,folders[0],'state.json'),'utf8')),rows=[];
for(const id of state.containers){assert(/^[a-f0-9]{64}$/.test(id));let raw='';try{raw=execFileSync('docker',['logs',id],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:10000});}catch{continue;}
 for(const line of raw.split(/\r?\n/)){if(!line.startsWith('{"t30Diagnostic2":'))continue;let r;try{r=JSON.parse(line);}catch{continue;}assert(['db-query','lease-duration','signal-queue','drain-error'].includes(r.t30Diagnostic2));rows.push(r);}
}
const groups={};for(const r of rows){const label=r.t30Diagnostic2+(r.kind?':'+r.kind:r.direction?':'+r.direction:'');(groups[label]??=[]).push(r.durationMs??r.queueMs??0);}
const summary=Object.fromEntries(Object.entries(groups).map(([label,v])=>{v.sort((a,b)=>a-b);return [label,{count:v.length,p50:v[Math.floor((v.length-1)*.5)],p95:v[Math.floor((v.length-1)*.95)],max:v.at(-1)}];}));
const result={recordedAt:new Date().toISOString(),snapshotOnly:true,summary,errors:rows.filter(r=>r.ok===false||r.t30Diagnostic2==='drain-error'),rawPayloadSaved:false};
fs.writeFileSync('quality/evidence/T30/gateway-timing-live-1.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
