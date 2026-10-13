import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import {fork} from 'node:child_process';
import WebSocket from 'ws';

const variant=process.argv[2]||'diagnostic';
assert(['diagnostic','canonical'].includes(variant));
const fixturePath='quality/evidence/T30/antigravity-native46-combined-correlation-1/fixture-server-combined-reviewed1.mjs';
const d='quality/evidence/T30/antigravity-native46-combined-correlation-1';
const folder=path.join(d,'smoke-health-io-1');
const runtime=path.resolve('.runtime/t30');
const temp=path.join(runtime,'temporary-combined-smoke-fault-'+randomUUID());

assert(!fs.existsSync(folder));
fs.mkdirSync(folder,{recursive:true});
fs.mkdirSync(runtime,{recursive:true});
const before=new Set(fs.readdirSync(runtime));
fs.mkdirSync(temp);

const h=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const privateValues=Object.entries(env)
 .filter(([k,v])=>/SECRET|PASSWORD|TOKEN|KEY|DATABASE_URL/.test(k)&&typeof v==='string'&&v.length>7)
 .map(([,v])=>v);
if(new URL(env.DATABASE_URL).password)privateValues.push(decodeURIComponent(new URL(env.DATABASE_URL).password));

const sanitize=s=>{
 for(const v of privateValues)s=s.split(v).join('[REDACTED]');
 return s
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED_JWT]')
  .replace(/(?:postgres(?:ql)?|redis):\/\/[^@\s]+@/g,'[REDACTED_CONNECTION]@');
};

const child=fork(fixturePath,[],{
 cwd:process.cwd(),
 env:{...process.env,TEMP:temp,TMP:temp,FG_T30_EVIDENCE_DIR:folder},
 windowsHide:true,
 stdio:['ignore','pipe','pipe','ipc']
});

for(const stream of [child.stdout,child.stderr]){
 let pending='';
 stream.setEncoding('utf8');
 stream.on('data',chunk=>{
  pending+=chunk;
  const end=pending.lastIndexOf('\n');
  if(end>=0){
   process.stdout.write(sanitize(pending.slice(0,end+1)));
   pending=pending.slice(end+1);
  }
 });
 stream.on('end',()=>{if(pending)process.stdout.write(sanitize(pending));});
}

const exitPromise=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
const phases=[],checks=[],errors=[];
let ready,closed,ws;
let requestId=100;
const pending=new Map();

const ask=async kind=>{
 const id=++requestId;
 const reply=new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));
 child.send({id,kind});
 try{return await bounded(reply,15000,'owned inspection');}
 finally{pending.delete(id);}
};

const bounded=(p,ms,label)=>{
 let timer;
 return Promise.race([
  p,
  new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timeout')),ms);})
 ]).finally(()=>clearTimeout(timer));
};

let readyResolve,readyReject;
const readyPromise=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
readyPromise.catch(()=>{});

child.on('message',message=>{
 const request=pending.get(message.id);
 if(request){
  if(message.failed)request.reject(new Error('Owned inspection failed'));
  else request.resolve(message);
 }
 if(message.kind==='phase')phases.push({at:new Date().toISOString(),phase:message.name});
 if(message.kind==='ready')readyResolve(message);
 if(message.kind==='failed')readyReject(new Error('Owned fixture failed at '+message.phase));
});
child.on('error',readyReject);

try{
 ready=await bounded(readyPromise,90000,'fixture ready');
 // Inject simulated directory conflict fault for API stop status to test incomplete observation handling
 fs.mkdirSync(path.join(folder,'api-lock-spans-health.json'),{recursive:true});

 for(const actor of Object.values(ready.actors))privateValues.push(actor.cookie);

 const response=await fetch(ready.origin+'/rooms/'+ready.roomId,{headers:{Accept:'text/html'},signal:AbortSignal.timeout(10000)});
 assert.equal(response.status,200);

 const api=await fetch(ready.origin+'/api/v1/rooms/'+ready.roomId,{
  headers:{Cookie:'better-auth.session_token='+ready.actors.sender.cookie,Origin:ready.origin},
  signal:AbortSignal.timeout(10000)
 });
 assert.equal(api.status,200);

 await bounded(new Promise((resolve,reject)=>{
  ws=new WebSocket(ready.origin.replace('http:','ws:')+'/socket.io/?EIO=4&transport=websocket',{
   headers:{Origin:ready.origin,Cookie:'better-auth.session_token='+ready.actors.sender.cookie}
  });
  ws.once('error',reject);
  ws.once('message',data=>{
   try{
    assert(String(data).startsWith('0{'));
    ws.close();
    resolve();
   }catch(error){reject(error);}
  });
 }),10000,'actual websocket handshake');

 assert(Number.isInteger(ready.inspectorPid)&&ready.inspectorPid>0);

 const post=async route=>{
  const res=await fetch(ready.origin+'/api/v1/'+route,{
   method:'POST',
   headers:{Cookie:'better-auth.session_token='+ready.actors.sender.cookie,Origin:ready.origin,'Content-Type':'application/json'},
   body:'{}',
   signal:AbortSignal.timeout(10000)
  });
  assert([200,201].includes(res.status));
  return res.json();
 };

 const call=await post('rooms/'+ready.roomId+'/calls');
 const joined=await post('calls/'+call.id+'/join');
 assert(typeof joined.token==='string');
 privateValues.push(joined.token);

 checks.push({kind:'fault mode initialization verified, preparing controlled error propagation'});
}
catch(error){
 errors.push({name:error?.name??'Error',phase:phases.at(-1)?.phase??'setup',message:sanitize(String(error.message)).replace(/(?:wss?|https?):\/\/[^\s]+/g,'[URL REDACTED]')});
}
finally{
 ws?.terminate();
 if(child.connected)child.send({kind:'stop',id:1});
 try{closed=await bounded(exitPromise,60000,'owned cleanup');}
 catch(error){errors.push({name:error.name,message:sanitize(error.message)});child.kill();closed=await bounded(exitPromise,10000,'fixture termination').catch(()=>({code:null,signal:'unknown'}));}
}

const cleanupPath=path.join(folder,'cleanup.json');
const cleanup=fs.existsSync(cleanupPath)?JSON.parse(fs.readFileSync(cleanupPath,'utf8')):null;
if(!cleanup||!Object.values(cleanup).every(v=>v===true))errors.push({phase:'cleanup',message:'Owned cleanup not confirmed'});

const removed=[],retained=[];
for(const name of fs.readdirSync(runtime)){
 if(before.has(name))continue;
 const p=path.resolve(runtime,name);
 assert.equal(path.dirname(p),runtime);
 assert(p.startsWith(runtime+path.sep));
 if(name===path.basename(temp)){
  try{fs.rmSync(p,{recursive:true,force:true});removed.push(name);}
  catch{retained.push(name);}
  continue;
 }
 if(/^gateway-[a-f0-9-]{36}$/i.test(name)){
  const proof=path.join(p,'cleanup.json');
  if(fs.existsSync(proof)){
   const j=JSON.parse(fs.readFileSync(proof,'utf8'));
   if(j.containersRemoved&&j.networkRemoved){
    fs.writeFileSync(path.join(folder,'gateway-cleanup.json'),JSON.stringify(j,null,2)+'\n',{flag:'wx'});
    fs.rmSync(p,{recursive:true,force:true});
    removed.push(name);
    continue;
   }
  }
  retained.push(name);
 }
}

try{
 const health=JSON.parse(fs.readFileSync(path.join(folder,'api-observer-stop-status.json'),'utf8'));
 assert(health.sampleCount>0&&health.timerStopped&&health.histogramDisabled);
 assert.equal(health.observationComplete,false);
 assert(health.failureCount>0);
 assert.equal(closed?.code,1);
 checks.push({kind:'fault condition properly detected and surfaced with non-zero exit code',exitCode:closed?.code});
}catch{
 errors.push({phase:'fault verification',message:'Fault propagation or error exit assertion failed'});
}

const result={
 recordedAt:new Date().toISOString(),
 reviewer:'Codex',
 fixture:{path:fixturePath,sha256:h(fixturePath)},
 phases,
 checks,
 closed,
 cleanup,
 removed,
 retained,
 errors,
 scope:'Combined diagnostic fixture fault probe verifying failure propagation and complete resource teardown under error conditions',
 nativeAcceptance:false
};

fs.writeFileSync(path.join(d,'combined-fixture-smoke-review1-fault.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({checks,closed,cleanup,retained,errors,nativeAcceptance:false},null,2));
if(errors.length||retained.length||closed?.code!==1)process.exitCode=1;
