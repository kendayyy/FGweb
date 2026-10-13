import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {parseEnv} from 'node:util';
const root=process.cwd(),dir='quality/evidence/T31';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const pins=['apps/api/test/call-admission.integration.spec.ts','apps/api/test/publishing.integration.spec.ts','quality/evidence/T27/private-gateway-fixture.mjs','quality/evidence/T29/private-gateway-fixture.mjs'].map(p=>({path:p,sha256:hash(p)}));
const parents=['.runtime/t27','.runtime/t29'];
const list=p=>fs.existsSync(p)?fs.readdirSync(p).filter(n=>/^gateway-[a-f0-9-]{36}$/.test(n)):[];
const before=Object.fromEntries(parents.map(p=>[p,list(p)]));
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const secrets=Object.entries(env).filter(([k,v])=>v&&/SECRET|PASSWORD|TOKEN|API_KEY|DATABASE_URL|REDIS_URL/.test(k)).map(([,v])=>v);
if(env.DATABASE_URL){const u=new URL(env.DATABASE_URL);if(u.password)secrets.push(decodeURIComponent(u.password));}
function redact(s){for(const v of secrets.sort((a,b)=>b.length-a.length))s=s.replaceAll(v,'[REDACTED]');return s.replace(/\beyJ[A-Za-z0-9_.-]+\b/g,'[JWT REDACTED]').replace(/access_token=[^\s"&]+/g,'access_token=[REDACTED]');}
const args=['C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js','run','test','--workspace','@fg/api','--','--runInBand','test/call-admission.integration.spec.ts','test/publishing.integration.spec.ts'];
const startedAt=new Date().toISOString(),child=spawn(process.execPath,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
for(const output of [child.stdout,child.stderr]){let pending='';output.setEncoding('utf8');output.on('data',chunk=>{pending+=chunk;const i=pending.lastIndexOf('\n');if(i>=0){process.stdout.write(redact(pending.slice(0,i+1)));pending=pending.slice(i+1);}});output.on('end',()=>{if(pending)process.stdout.write(redact(pending));});}
const result=await new Promise(resolve=>{child.once('error',()=>resolve({exitCode:1,signal:null}));child.once('close',(code,signal)=>resolve({exitCode:code??1,signal}));});
const cleanup=[];let cleanupError=null;
try{for(const pin of pins)assert.equal(hash(pin.path),pin.sha256);for(const parent of parents)for(const name of list(parent).filter(n=>!before[parent].includes(n))){const id=name.slice(8),target=path.resolve(parent,name),boundary=path.resolve(parent);assert.equal(path.dirname(target),boundary);assert.equal(fs.realpathSync(target),target);const docker=a=>execFileSync('docker',a,{encoding:'utf8',windowsHide:true,timeout:30000}).trim();assert.equal(docker(['ps','-a','--filter',`name=^fg-sfu-${id}$`,'--format','{{.ID}}']),'');assert.equal(docker(['ps','-a','--filter',`name=^fg-gateway-${id}$`,'--format','{{.ID}}']),'');assert.equal(docker(['network','ls','--filter',`name=^fg-t26-gateway-${id}$`,'--format','{{.ID}}']),'');fs.rmSync(target,{recursive:true});assert(!fs.existsSync(target));cleanup.push({path:parent+'/'+name,containersAbsent:true,networkAbsent:true,privateInputsRemoved:true});}}
catch(e){cleanupError=String(e.message);}
const receipt={startedAt,completedAt:new Date().toISOString(),...result,sourcePins:pins,sourceUnchanged:pins.every(p=>hash(p.path)===p.sha256),cleanup,cleanupError,uiRun:false,originalAssertionsAndDeadlinesUnchanged:true};
fs.writeFileSync(dir+'/original-api-regressions1.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(receipt));process.exitCode=result.exitCode||Number(cleanupError!==null);
