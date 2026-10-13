import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {spawn} from 'node:child_process';
import path from 'node:path';
// Original T08 fixture uses 5173. Keep services local and credentials in memory.
Object.assign(process.env,parseEnv(fs.readFileSync('.env.local','utf8')),{PUBLIC_ORIGIN:'http://localhost:5173',BETTER_AUTH_URL:'http://localhost:5173'});
const tests=['auth','auth-email','auth-admin','auth-profile-read','rooms'].map(name=>`apps/api/test/${name}.integration.spec.ts`);
if(process.argv.includes('--isolated-suites')){
 const results=[];
 for(const test of tests){
  const startedAt=new Date().toISOString();
  const child=spawn(process.execPath,['--experimental-vm-modules','node_modules/jest/bin/jest.js','--config','apps/api/jest.config.js','--runInBand',test],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:'inherit'});
  const exitCode=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('exit',code=>resolve(code??1));});
  results.push({test,startedAt,completedAt:new Date().toISOString(),exitCode});
 }
 const resultPath=process.argv.find(arg=>arg.startsWith('--result='))?.slice('--result='.length)??'quality/evidence/T26/regression-isolated.json';
 if(!resultPath.startsWith('quality/evidence/T26/'))throw Error('Result must stay in task evidence');
 fs.writeFileSync(resultPath,JSON.stringify({recordedAt:new Date().toISOString(),reason:'Separate processes isolate mutable auth/SMTP/native environment and Jest VM state; all original suites and timeout assertions retained',results},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({isolatedSuites:results.length,passed:results.filter(r=>r.exitCode===0).length}));
 process.exit(results.every(r=>r.exitCode===0)?0:1);
}
const diagnostics=process.argv.includes('--latency')?['--verbose','--setupFilesAfterEnv',path.resolve('quality/evidence/T26/latency-probe.cjs')]:[];
const child=spawn(process.execPath,['--experimental-vm-modules','node_modules/jest/bin/jest.js','--config','apps/api/jest.config.js','--runInBand',...tests,...diagnostics],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:'inherit'});
child.on('error',()=>{process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
