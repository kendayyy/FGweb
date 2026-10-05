import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const [label,command,...args]=process.argv.slice(2);
assert(label&&/^[a-z0-9-]+$/.test(label)&&command,'Usage: label command args');
const dir='quality/evidence/T03-FIX5';
const evidencePath=`${dir}/codex-${label}.txt`;
assert(!fs.existsSync(evidencePath),'Preserve previous execution; use a new label');
const startedAt=new Date().toISOString();
const stream=fs.createWriteStream(evidencePath);
const child=spawn(command,args,{cwd:process.cwd(),shell:false,env:process.env,stdio:['ignore','pipe','pipe']});
child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
const result=await new Promise(resolve=>{child.once('error',error=>{stream.write(String(error));resolve({exitCode:1,signal:null});});child.once('close',(exitCode,signal)=>resolve({exitCode:exitCode??1,signal}));});
await new Promise(resolve=>stream.end(resolve));
const record={command:[command,...args].join(' '),cwd:process.cwd(),startedAt,completedAt:new Date().toISOString(),...result,evidencePath,evidenceSha256:createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')};
fs.writeFileSync(`${dir}/codex-${label}.json`,JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record));process.exitCode=result.exitCode;




