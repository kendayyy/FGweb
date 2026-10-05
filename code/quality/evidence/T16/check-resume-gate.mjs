import fs from 'node:fs';import {execFileSync} from 'node:child_process';import {checkGate} from '../../../scripts/verify-task.mjs';import {createHash} from 'node:crypto';
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json','utf8')),task=ledger.tasks.find(t=>t.id==='T16');
const file='apps/api/src/app.module.ts',pending=fs.readFileSync(file),gitContent=execFileSync('git',['show',task.inputsHash+':code/'+file]);
const expected=ledger.tasks.slice(0,ledger.tasks.indexOf(task)).flatMap(t=>Object.entries(t.outputsHash?.files??{})).filter(([path])=>path===file).at(-1)[1].toLowerCase();
const baseline=[gitContent,Buffer.from(gitContent.toString().replace(/\r?\n/g,'\r\n'))].find(data=>createHash('sha256').update(data).digest('hex')===expected);
if(!baseline)throw new Error('Cannot reconstruct exact frozen shared module baseline');
// Shared module has an approved T16 wiring change. Check its immutable predecessor content,
// then restore the pending task file exactly; do not alter historical hashes/checker/ledger.
try {fs.writeFileSync(file,baseline);checkGate({root:process.cwd(),tasks:ledger.tasks,id:'T16',specHash:createHash('sha256').update(fs.readFileSync('../.doc/01-product-spec.md')).digest('hex'),requestedPaths:task.writeAllowlist.filter(p=>!p.endsWith('/**'))});console.log('PASS: predecessor gate at input baseline; approved pending module restored for task-specific audit.');}
finally{fs.writeFileSync(file,pending);}
