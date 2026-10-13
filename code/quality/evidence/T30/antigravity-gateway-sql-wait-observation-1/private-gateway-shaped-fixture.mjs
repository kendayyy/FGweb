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
export async function startGatewayFixture({databaseURL,key,secret,origin,turnTcp=false,webhookUrl}){
 const id=randomUUID(),network=`fg-t30-screen-gateway-${id}`,dir=path.resolve(root,`.runtime/t30/gateway-${id}`);
 const containers=[];let networkCreated=false;
 function diagnostics(){return containers.map((container,i)=>{const log=spawnSync('docker',['logs',container],{cwd:root,encoding:'utf8',windowsHide:true,timeout:10000});let text=`Container ${i}\n${log.stdout??''}${log.stderr??''}`;for(const value of [key,secret,databaseURL,connection.href])text=text.replaceAll(value,'[REDACTED]');return text.replace(/access_token=[^\s"&]+/g,'access_token=[REDACTED]').replace(/\beyJ[A-Za-z0-9_.-]+\b/g,'[JWT REDACTED]');}).join('\n');}
 const result={recordedAt:new Date().toISOString(),privateSignaling:true,containersRemoved:false,networkRemoved:false,webRTCVerified:false};
 fs.mkdirSync(dir,{recursive:true});
 const connection=new URL(databaseURL);connection.hostname='host.docker.internal';
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
  const gateway=docker(['run','-d','--name',`fg-gateway-${id}`,'--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','node','-p','127.0.0.1::7883','--mount',`type=bind,source=${path.resolve(root,'apps/api/dist/modules/calls')},target=/gateway/app,readonly`,'--mount',`type=bind,source=${path.resolve(root,'quality/evidence/T30/antigravity-gateway-sql-wait-observation-1/signaling-gateway-observed.js')},target=/gateway/app/signaling-gateway.js,readonly`,'--mount',`type=bind,source=${path.resolve(root,'node_modules')},target=/gateway/node_modules,readonly`,'--mount',`type=bind,source=${path.resolve(dir,'gateway.json')},target=/gateway/input.json,readonly`,nodeImage,'node','/gateway/app/gateway-main.js','/gateway/input.json']).trim();containers.push(gateway);
  const info=JSON.parse(docker(['inspect',gateway]))[0];assert.equal(info.State.Running,true,'Gateway process exited');
  const port=Number(info.NetworkSettings.Ports['7883/tcp']?.[0]?.HostPort);assert(port>0);
  const server=`http://127.0.0.1:${port}`,ws=`ws://127.0.0.1:${port}`;let ready=false;
  for(let i=0;i<40;i++){try{if((await fetch(server+'/health',{signal:AbortSignal.timeout(1000)})).status===200){ready=true;break;}}catch{/* Readiness retries until the bounded deadline; final failure remains an assertion. */}await new Promise(r=>setTimeout(r,250));}
  // Do not print container logs: failed startup can contain private DB URLs.
  assert(ready,'Private gateway failed to become ready; inspect sanitized diagnostics only');
  fs.writeFileSync(`${dir}/state.json`,JSON.stringify({recordedAt:new Date().toISOString(),containers,network,port,privateSignaling:true,nodeImage,sfuImage},null,2)+'\n');
  return {server,ws,turnPort,shaperControl,close,result,diagnostics};
 }catch(error){
  for(let i=0;i<containers.length;i++){try{let log=docker(['logs',containers[i]]);for(const value of [key,secret,databaseURL,connection.href])log=log.replaceAll(value,'[REDACTED]');fs.writeFileSync(path.join(dir,`sanitized-${i}.txt`),log);}catch{/* Diagnostic collection must not hide the original setup failure or prevent cleanup. */}}
  await close();throw error;
 }
}
