import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='quality/evidence/T30',changes=[];
const hash=s=>createHash('sha256').update(s).digest('hex');
function copy(source,target,transform){const original=fs.readFileSync(source,'utf8'),proposed=transform(original);fs.writeFileSync(target,proposed,{flag:'wx'});changes.push({source,sourceSha256:hash(original),target,targetSha256:hash(proposed)});}
copy(dir+'/private-gateway-fixture.mjs',dir+'/private-gateway-shaped-fixture.mjs',s=>{
 const marker="const gateway=docker(['run'";assert(s.includes(marker));
 s=s.replace('const turnPort=turnTcp?', 'let turnPort=turnTcp?');
 const at=s.indexOf(marker);
 s=s.slice(0,at)+`let shaperControl;
  if(turnTcp){
   const shaper=docker(['run','-d','--name',\`fg-turn-shaper-\${id}\`,'--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','node','-p','127.0.0.1::7884/tcp','-p','127.0.0.1::7885/tcp','--mount',\`type=bind,source=\${path.resolve(root,'quality/evidence/T30/turn-tcp-shaper.mjs')},target=/shaper.mjs,readonly\`,nodeImage,'node','/shaper.mjs']).trim();containers.push(shaper);
   const shaperInfo=JSON.parse(docker(['inspect',shaper]))[0];assert.equal(shaperInfo.State.Running,true);
   turnPort=Number(shaperInfo.NetworkSettings.Ports['7884/tcp'][0].HostPort);
   shaperControl=\`http://127.0.0.1:\${shaperInfo.NetworkSettings.Ports['7885/tcp'][0].HostPort}\`;
  }
  `+s.slice(at);
 s=s.replace('return {server,ws,turnPort,close,result,diagnostics};','return {server,ws,turnPort,shaperControl,close,result,diagnostics};');
 return s;
});
copy(dir+'/fixture-server.mjs',dir+'/fixture-server-shaped.mjs',s=>{
 s=s.replace("'./private-gateway-fixture.mjs'","'./private-gateway-shaped-fixture.mjs'");
 const marker="if(message.kind==='inspect')try{";assert(s.includes(marker));
 s=s.replace(marker,`if(message.kind==='shape')try{assert(fixture.shaperControl);const response=await fetch(fixture.shaperControl+'/shape',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message.policy)});assert.equal(response.status,200);process.send?.({id:message.id,...await response.json()});}catch{process.send?.({id:message.id,failed:true});}
  if(message.kind==='shaping-stats')try{assert(fixture.shaperControl);const response=await fetch(fixture.shaperControl+'/stats');assert.equal(response.status,200);process.send?.({id:message.id,...await response.json()});}catch{process.send?.({id:message.id,failed:true});}
  `+marker);
 return s;
});
fs.writeFileSync(dir+'/shaped-fixture-provenance.json',JSON.stringify({recordedAt:new Date().toISOString(),reviewer:'Codex',changes,shaper:{path:dir+'/turn-tcp-shaper.mjs',sha256:hash(fs.readFileSync(dir+'/turn-tcp-shaper.mjs'))},reason:'Owned test-only opaque TURN TCP rate/delay pacing in same isolated Docker network. No host network changes or media substitution. Loopback control/transport ports, read-only unprivileged container, existing cleanup covers all resources.',executionPending:true},null,2)+'\n',{flag:'wx'});
for(const change of changes)assert(path.resolve(change.target).startsWith(path.resolve(dir)+path.sep));
console.log('Prepared real TURN TCP shaped fixture; no benchmark executed.');
