import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
const root=path.resolve('.runtime/t30'),id=randomUUID(),temp=path.join(root,'temporary-native-'+id);
fs.mkdirSync(root,{recursive:true});const before=new Set(fs.readdirSync(root));fs.mkdirSync(temp);
const hostSamples=[];let hostDropped=0;let previousCpu=os.cpus();
const sampleHost=()=>{const current=os.cpus();let idle=0,total=0;for(let i=0;i<current.length;i++){if(!previousCpu[i])continue;for(const [name,value]of Object.entries(current[i].times)){const delta=Math.max(0,value-previousCpu[i].times[name]);total+=delta;if(name==='idle')idle+=delta;}}previousCpu=current;if(hostSamples.length>=480){hostDropped++;return;}hostSamples.push({at:new Date().toISOString(),logicalCpuCount:current.length,totalMemoryBytes:os.totalmem(),freeMemoryBytes:os.freemem(),cpuBusyPercent:total>0?Math.round((1-idle/total)*10000)/100:null});};
sampleHost();const hostTimer=setInterval(sampleHost,1000);hostTimer.unref();
const child=spawn(process.execPath,['C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js','run','test:e2e','--','quality/evidence/T30/native-browser-timing19.spec.ts','--config','quality/evidence/T30/playwright-browser-timing19.config.ts','--headed','--workers=1'],{cwd:process.cwd(),env:{...process.env,TEMP:temp,TMP:temp,npm_config_cache:path.resolve('.cache/t30/npm')},windowsHide:true,stdio:['ignore','inherit','inherit']});
const exitCode=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('close',code=>resolve(code??1));});
clearInterval(hostTimer);sampleHost();fs.writeFileSync('quality/evidence/T30/native-host-observation-'+id+'.json',JSON.stringify({startedAt:hostSamples[0]?.at,completedAt:new Date().toISOString(),exitCode,droppedCount:hostDropped,timerStopped:true,fileIoDuringTest:false,samples:hostSamples},null,2)+'\n',{flag:'wx'});
const removed=[],retained=[];
for(const name of fs.readdirSync(root)){
 if(before.has(name))continue;
 const candidate=path.resolve(root,name);assert.equal(path.dirname(candidate),root);assert(candidate.startsWith(root+path.sep));
 if(name===path.basename(temp)){
  try{fs.rmSync(candidate,{recursive:true,force:true});removed.push(name);}catch{retained.push({name,reason:'Browser temporary files could not be removed'});}continue;
 }
 if(/^gateway-[a-f0-9-]{36}$/i.test(name)){
  const proofPath=path.join(candidate,'cleanup.json');
  if(fs.existsSync(proofPath)){const proof=JSON.parse(fs.readFileSync(proofPath,'utf8'));if(proof.containersRemoved&&proof.networkRemoved){fs.writeFileSync('quality/evidence/T30/native-runtime-cleanup-'+name.slice(8)+'.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx'});fs.rmSync(candidate,{recursive:true,force:true});removed.push(name);continue;}}
  retained.push({name,reason:'No confirmed container/network cleanup proof'});
 }
}
fs.writeFileSync('quality/evidence/T30/native-runtime-review-'+id+'.json',JSON.stringify({completedAt:new Date().toISOString(),exitCode,removed,retained,privateRuntimeRemoved:retained.length===0,hostNetworkChanged:false},null,2)+'\n',{flag:'wx'});
process.exitCode=exitCode||Number(retained.length>0);
