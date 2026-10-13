import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const nodeImage='node:24.21.0-bookworm-slim@sha256:51b1100cc2a83d370c6a60952e3f2989c8a43159d0e38586e090f3b3326efefd';
const sfuImage=JSON.parse(fs.readFileSync(path.join(root,'infra/media/livekit-image.json'),'utf8')).image;
const docker=args=>execFileSync('docker',args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:30000});

function getValidatedEvidenceDir(){
 const envDir=process.env.FG_T30_EVIDENCE_DIR;
 if(!envDir||typeof envDir!=='string')return null;
 const evidenceRoot=path.resolve(root,'quality/evidence/T30');
 const resolved=path.resolve(root,envDir);
 if(path.dirname(resolved)!==evidenceRoot)return null;
 const base=path.basename(resolved);
 if(!/^[a-z0-9][a-z0-9_-]{0,100}$/i.test(base))return null;
 return resolved;
}

function parseIsoString(str){
 if(typeof str==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(str)){
  const ms=Date.parse(str);
  if(Number.isFinite(ms))return str;
 }
 return null;
}

const HEALTH_ENUMS=new Set(['none','starting','healthy','unhealthy']);
function parseHealthStatus(raw){
 if(typeof raw==='undefined'||raw===null||raw==='')return 'none';
 if(typeof raw==='string'){
  if(HEALTH_ENUMS.has(raw))return raw;
  return 'unknown';
 }
 return 'unknown';
}

const ALLOWED_SIGNALS=new Set(['SIGTERM','SIGKILL','SIGINT']);
function parseSignal(raw){
 if(raw===null||typeof raw==='undefined')return null;
 if(typeof raw==='string'&&ALLOWED_SIGNALS.has(raw))return raw;
 return 'UNKNOWN';
}

function createRedactor({key,secret,databaseURL,connection}){
 const sensitiveStrings=new Set();
 const add=val=>{
  if(typeof val==='string'&&val.length>0){
   sensitiveStrings.add(val);
   try{
    const decoded=decodeURIComponent(val);
    if(decoded.length>0)sensitiveStrings.add(decoded);
   }catch{}
  }
 };
 add(key);
 add(secret);
 add(databaseURL);
 add(connection.href);
 if(connection.password)add(connection.password);
 if(connection.username)add(connection.username);
 try{
  const orig=new URL(databaseURL);
  if(orig.password)add(orig.password);
  if(orig.username)add(orig.username);
 }catch{}
 const schemaMatch=connection.href.match(/t30_screen_[a-f0-9]+/);
 if(schemaMatch)add(schemaMatch[0]);
 const sorted=[...sensitiveStrings].sort((a,b)=>b.length-a.length);

 return function redact(rawText){
  let text=String(rawText??'');
  for(const val of sorted){
   text=text.replaceAll(val,'[REDACTED]');
  }
  return text
   .replace(/access_token=[^\s"&]+/g,'access_token=[REDACTED]')
   .replace(/\beyJ[A-Za-z0-9_.-]+\b/g,'[JWT REDACTED]')
   .replace(/(?:role|user)\s+"[^"]+"/gi,'user "[REDACTED]"')
   .replace(/(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+[^;\n\r"]+/gi,'[SQL REDACTED]')
   .replace(/"(?:query|sql)":\s*"[^"]+"/g,'"query":"[SQL REDACTED]"')
   .replace(/"(?:parameters|values)":\s*\[[^\]]*\]/g,'"parameters":["[REDACTED]"]');
 };
}

export async function startGatewayFixture({databaseURL,key,secret,origin,turnTcp=false,webhookUrl}){
 const id=randomUUID(),network=`fg-t30-screen-gateway-${id}`,dir=path.resolve(root,`.runtime/t30/gateway-${id}`);
 const containers=[];let networkCreated=false;
 const connection=new URL(databaseURL);connection.hostname='host.docker.internal';
 const redactor=createRedactor({key,secret,databaseURL,connection});

 function collectDiagnostics(){
  const statuses=[];
  const parts=containers.map((container,i)=>{
   let logStatus=null;
   let logSignal=null;
   let safeError=null;
   let text='';
   try{
    const log=spawnSync('docker',['logs',container],{cwd:root,encoding:'utf8',windowsHide:true,timeout:10000});
    logStatus=Number.isInteger(log.status)?log.status:null;
    logSignal=parseSignal(log.signal);
    if(log.error){
     const code=log.error.code;
     safeError=(code==='EIO'||code==='ETIMEDOUT'||code==='ENOENT')?code:'UNKNOWN';
    }
    text=`Container ${i}\n${log.stdout??''}${log.stderr??''}`;
   }catch{
    safeError='UNKNOWN';
   }
   const isSuccess=logStatus===0&&!safeError;
   statuses.push({
    index:i,
    status:logStatus,
    signal:logSignal,
    error:safeError,
    logCaptureStatus:isSuccess?'success':'failed'
   });
   return redactor(text);
  });
  return {text:parts.join('\n'),statuses};
 }

 function diagnostics(){
  return collectDiagnostics().text;
 }

 const result={recordedAt:new Date().toISOString(),privateSignaling:true,containersRemoved:false,networkRemoved:false,webRTCVerified:false};
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(`${dir}/sfu.yaml`,`port: 7880\nbind_addresses: ["0.0.0.0"]\nrtc:\n  tcp_port: 7881\n  udp_port: 7882\n  use_external_ip: false\nroom:\n  auto_create: false\n  max_participants: 10\n${turnTcp?'turn:\n  enabled: true\n  domain: local-turn.invalid\n  tls_port: 5349\n  external_tls: true\n':''}${webhookUrl?`webhook:\n  api_key: ${JSON.stringify(key)}\n  urls: [${JSON.stringify(webhookUrl)}]\n`:''}keys:\n  ${JSON.stringify(key)}: ${JSON.stringify(secret)}\n`);
 fs.writeFileSync(`${dir}/gateway.json`,JSON.stringify({databaseURL:connection.href,key,secret,origin,upstreamURL:'http://fg-sfu:7880',port:7883}));

 async function close(){
  for(const container of [...containers].reverse())docker(['rm','-f',container]);
  if(networkCreated)docker(['network','rm',network]);
  result.containersRemoved=containers.every(c=>!docker(['ps','-a','--filter',`id=${c}`,'--format','{{.ID}}']).trim());
  result.networkRemoved=!docker(['network','ls','--filter',`name=^${network}$`,'--format','{{.Name}}']).trim();
  fs.writeFileSync(`${dir}/cleanup.json`,JSON.stringify(result,null,2)+'\n');return result;
 }

 try{
  docker(['network','create',network]);networkCreated=true;
  const sfu=docker(['run','-d','--name',`fg-sfu-${id}`,'--network',network,'--network-alias','fg-sfu',...(turnTcp?['-p','127.0.0.1::5349/tcp']:[]),'--mount',`type=bind,source=${path.resolve(dir,'sfu.yaml')},target=/etc/livekit.yaml,readonly`,sfuImage,'--config','/etc/livekit.yaml']).trim();containers.push(sfu);
  const inspect=JSON.parse(docker(['inspect',sfu]))[0];
  assert.equal(inspect.HostConfig.PortBindings?.['7880/tcp']?.length??0,0);assert.equal(inspect.NetworkSettings.Ports?.['7880/tcp']?.length??0,0);
  assert.deepEqual(Object.keys(inspect.HostConfig.PortBindings??{}),turnTcp?['5349/tcp']:[]);
  let turnPort=turnTcp?Number(inspect.NetworkSettings.Ports['5349/tcp'][0].HostPort):undefined;
  let shaperControl;
  if(turnTcp){
   const shaper=docker(['run','-d','--name',`fg-turn-shaper-${id}`,'--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','node','-p','127.0.0.1::7884/tcp','-p','127.0.0.1::7885/tcp','--mount',`type=bind,source=${path.resolve(root,'quality/evidence/T30/turn-tcp-shaper.mjs')},target=/shaper.mjs,readonly`,nodeImage,'node','/shaper.mjs']).trim();containers.push(shaper);
   const shaperInfo=JSON.parse(docker(['inspect',shaper]))[0];assert.equal(shaperInfo.State.Running,true);
   turnPort=Number(shaperInfo.NetworkSettings.Ports['7884/tcp'][0].HostPort);
   shaperControl=`http://127.0.0.1:${shaperInfo.NetworkSettings.Ports['7885/tcp'][0].HostPort}`;
  }
  const preloadMount=path.resolve(root,'quality/evidence/T30/gateway-observer-preload-reviewed2.cjs');
  const gateway=docker(['run','-d','--name',`fg-gateway-${id}`,'--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','node','-p','127.0.0.1::7883','--mount',`type=bind,source=${preloadMount},target=/gateway/preload.cjs,readonly`,'--mount',`type=bind,source=${path.resolve(root,'apps/api/dist/modules/calls')},target=/gateway/app,readonly`,'--mount',`type=bind,source=${path.resolve(root,'node_modules')},target=/gateway/node_modules,readonly`,'--mount',`type=bind,source=${path.resolve(dir,'gateway.json')},target=/gateway/input.json,readonly`,nodeImage,'node','-r','/gateway/preload.cjs','/gateway/app/gateway-main.js','/gateway/input.json']).trim();containers.push(gateway);
  const info=JSON.parse(docker(['inspect',gateway]))[0];assert.equal(info.State.Running,true,'Gateway process exited');
  const port=Number(info.NetworkSettings.Ports['7883/tcp']?.[0]?.HostPort);assert(port>0);
  const server=`http://127.0.0.1:${port}`,ws=`ws://127.0.0.1:${port}`;let ready=false;
  for(let i=0;i<40;i++){try{if((await fetch(server+'/health',{signal:AbortSignal.timeout(1000)})).status===200){ready=true;break;}}catch{/* Readiness retries until the bounded deadline; final failure remains an assertion. */}await new Promise(r=>setTimeout(r,250));}
  // Do not print container logs: failed startup can contain private DB URLs.
  assert(ready,'Private gateway failed to become ready; inspect sanitized diagnostics only');
  fs.writeFileSync(`${dir}/state.json`,JSON.stringify({recordedAt:new Date().toISOString(),containers,network,port,privateSignaling:true,nodeImage,sfuImage},null,2)+'\n');

  async function stopGatewayObservation(){
   docker(['kill','--signal','SIGUSR2',gateway]);
   const startTime=Date.now();
   let health=null;
   while(Date.now()-startTime<3000){
    await new Promise(r=>setTimeout(r,100));
    const logResult=spawnSync('docker',['logs',gateway],{cwd:root,encoding:'utf8',windowsHide:true,timeout:1000,maxBuffer:4*1024*1024});
    if(logResult.status!==0||logResult.error)throw new Error('Gateway observer log capture failed');
    const stdout=logResult.stdout??'';
    const lines=stdout.split(/\r?\n/).filter(l=>l.startsWith('[FG_GATEWAY_HEALTH] '));
    if(lines.length===0)continue;
    if(lines.length!==1){
     throw new Error('Gateway observer marker count invalid');
    }
    const rawJson=lines[0].slice('[FG_GATEWAY_HEALTH] '.length).trim();
    let parsed;
    try{
     parsed=JSON.parse(rawJson);
    }catch{
     throw new Error('Malformed JSON in gateway health marker line');
    }
    const keys=Object.keys(parsed).sort();
    const expectedKeys=['droppedCount','failureCount','histogramDisabled','observationComplete','sampleCount','timerStopped'];
    if(JSON.stringify(keys)!==JSON.stringify(expectedKeys)){
     throw new Error('Gateway observer health keys invalid');
    }
    if(!Number.isInteger(parsed.sampleCount)||parsed.sampleCount<=0){
     throw new Error('Gateway observer sample count invalid');
    }
    if(!Number.isInteger(parsed.failureCount)||parsed.failureCount!==0){
     throw new Error('Gateway observer failure count invalid');
    }
    if(!Number.isInteger(parsed.droppedCount)||parsed.droppedCount!==0){
     throw new Error('Gateway observer drop count invalid');
    }
    if(parsed.timerStopped!==true||parsed.histogramDisabled!==true||parsed.observationComplete!==true){
     throw new Error('Incomplete observation status in gateway health marker');
    }
    health=parsed;
    break;
   }
   if(!health){
    throw new Error('Gateway observer stop timed out after 3000ms without healthy health marker');
   }
   return health;
  }

  return {server,ws,turnPort,shaperControl,close,result,diagnostics,stopGatewayObservation};
 }catch(error){
  const {text:diagnosticsText,statuses:logStatuses}=collectDiagnostics();
  const logReadFailures=logStatuses.filter(s=>s.logCaptureStatus!=='success').length;
  const logSuccess=Boolean(logReadFailures===0&&logStatuses.length===containers.length);

  const safeContainerStates=[];
  let inspectFailures=0;
  for(let i=0;i<containers.length;i++){
   try{
    const inspectOutput=docker(['inspect',containers[i]]);
    const inspectObj=JSON.parse(inspectOutput)[0];
    const state=inspectObj?.State;
    safeContainerStates.push({
     index:i,
     running:typeof state?.Running==='boolean'?state.Running:null,
     exitCode:Number.isInteger(state?.ExitCode)?state.ExitCode:null,
     oomKilled:typeof state?.OOMKilled==='boolean'?state.OOMKilled:null,
     startedAt:parseIsoString(state?.StartedAt),
     finishedAt:parseIsoString(state?.FinishedAt),
     healthStatus:parseHealthStatus(state?.Health?.Status),
     inspectStatus:'inspected'
    });
   }catch{
    inspectFailures++;
    safeContainerStates.push({
     index:i,
     running:null,
     exitCode:null,
     oomKilled:null,
     startedAt:null,
     finishedAt:null,
     healthStatus:'unknown',
     inspectStatus:'failed'
    });
   }
  }
  const inspectSuccess=Boolean(inspectFailures===0&&safeContainerStates.length===containers.length);

  let logWritten=false;
  let stateWritten=false;
  let writeFailureCount=0;
  const evidenceDir=getValidatedEvidenceDir();

  if(evidenceDir){
   try{
    fs.mkdirSync(evidenceDir,{recursive:true});
   }catch{
    writeFailureCount++;
   }
   try{
    fs.writeFileSync(path.join(evidenceDir,'gateway-startup-diagnostics.txt'),diagnosticsText);
    logWritten=true;
   }catch{
    writeFailureCount++;
    logWritten=false;
   }
   try{
    const statePayload={
     recordedAt:new Date().toISOString(),
     containerCount:containers.length,
     logWritten,
     writeFailureCount,
     logReadFailures,
     inspectFailures,
     completeObservation:Boolean(logSuccess&&inspectSuccess&&logWritten&&writeFailureCount===0),
     logStatuses,
     containers:safeContainerStates
    };
    fs.writeFileSync(path.join(evidenceDir,'gateway-startup-state.json'),JSON.stringify(statePayload,null,2)+'\n');
    stateWritten=true;
   }catch{
    writeFailureCount++;
    stateWritten=false;
   }
  }else{
   writeFailureCount+=2;
  }

  for(let i=0;i<containers.length;i++){try{let log=docker(['logs',containers[i]]);for(const value of [key,secret,databaseURL,connection.href])log=log.replaceAll(value,'[REDACTED]');fs.writeFileSync(path.join(dir,`sanitized-${i}.txt`),log);}catch{/* Diagnostic collection must not hide the original setup failure or prevent cleanup. */}}

  let cleanupError=null;
  try{
   await close();
  }catch(closeErr){
   cleanupError=new Error(`Gateway resource cleanup failed: ${String(closeErr?.name||'Error').slice(0,64)} (${String(closeErr?.code||'CLEANUP_FAILED').slice(0,64)})`);
  }

  const allObservationsSucceeded=Boolean(logSuccess&&inspectSuccess&&logWritten&&stateWritten&&writeFailureCount===0);
  if(allObservationsSucceeded&&!cleanupError){
   throw error;
  }

  const errorsToThrow=[error];
  if(!allObservationsSucceeded){
   errorsToThrow.push(new Error(`Gateway diagnostic observation incomplete: logReadFailures=${logReadFailures}, inspectFailures=${inspectFailures}, logWritten=${logWritten}, stateWritten=${stateWritten}, writeFailures=${writeFailureCount}`));
  }
  if(cleanupError){
   errorsToThrow.push(cleanupError);
  }
  throw new AggregateError(errorsToThrow,'Private gateway readiness failed with diagnostic or cleanup errors');
 }
}
