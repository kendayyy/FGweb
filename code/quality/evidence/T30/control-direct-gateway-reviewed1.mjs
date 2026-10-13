import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {prepareDirectDatabase,createDirectGateway,inspectDirectCleanup} from './gateway-direct-support-reviewed1.mjs';
const d='quality/evidence/T30',pgId='a'.repeat(64),redisId='b'.repeat(64),gatewayId='c'.repeat(64),netId='d'.repeat(64),id=randomUUID(),name='fg-gateway-'+id,tag='t30-gateway-'+id,ownNetwork='fg-t30-screen-gateway-'+id,results=[];
const main=name=>({Id:name==='fg-local-postgres-1'?pgId:redisId,Name:'/'+name,Config:{Env:['PRIVATE_TEST_CONFIG']},State:{Running:true,Health:{Status:'healthy'}},NetworkSettings:{Networks:{'fg-local_default':{NetworkID:netId,Aliases:[name]}},Ports:{'5432/tcp':[{HostPort:'55432'}]}}});
const base={main:[main('fg-local-postgres-1'),main('fg-local-redis-1')],network:{Name:'fg-local_default',Id:netId,Containers:{[pgId]:{Name:'fg-local-postgres-1'},[redisId]:{Name:'fg-local-redis-1'}}}};
function mock(mode='normal'){
 const state=structuredClone(base),calls=[];let own;
 const docker=args=>{
  calls.push(args[0]+' '+(args[1]??''));
  if(args[0]==='inspect'){
   const m=state.main.find(m=>m.Id===args[1]||m.Name==='/'+args[1]);if(m){if(mode==='verify-main-fail'&&args[1]===pgId)throw Error('PRIVATE_DOCKER_ERROR');return JSON.stringify([m]);}
   if(own&&(args[1]===own.Id||args[1]===name))return JSON.stringify([own]);throw Error('not found');
  }
  if(args[0]==='network'&&args[1]==='inspect')return JSON.stringify([state.network]);
  if(args[0]==='create'){
   own={Id:gatewayId,Name:mode==='foreign-id'?'/fg-local-postgres-1':'/'+name,Config:{User:'node',Labels:{'fg-owner':mode==='foreign-id'?'foreign':tag}},HostConfig:{ReadonlyRootfs:true},State:{Running:false},NetworkSettings:{Networks:{[ownNetwork]:{}}}};
   if(mode==='create-output-interrupted')throw Error('PRIVATE_CREATE_ERROR');return gatewayId;
  }
  if(args[0]==='network'&&args[1]==='connect'){assert.equal(args[2],'fg-local_default');assert.equal(args[3],gatewayId);if(mode==='connect-fail')throw Error('PRIVATE_CONNECT_ERROR');own.NetworkSettings.Networks['fg-local_default']={};return '';}
  if(args[0]==='start'){assert.equal(args[1],gatewayId);if(mode==='start-fail')throw Error('PRIVATE_START_ERROR');own.State.Running=true;return gatewayId;}
  if(args[0]==='rm'){assert.equal(args[2],gatewayId);if(mode==='remove-fail')throw Error('PRIVATE_REMOVE_ERROR');own=undefined;return '';}
  if(args[0]==='network'&&args[1]==='rm')return '';
  if(args[0]==='ps')return own?own.Id:'';
  if(args[0]==='network'&&args[1]==='ls')return '';
  throw Error('unexpected control call');
 };
 return {docker,state,calls};
}
const args=['create','--pull=never','--label','fg-owner='+tag,'--name',name,'--network',ownNetwork],url='postgres://tester:PRIVATE_URL_SECRET@127.0.0.1:55432/fg?options=-c%20search_path%3Dtest';
for(const mode of ['normal','create-output-interrupted','foreign-id','connect-fail','start-fail']){
 const m=mock(mode),containers=[];let result,caught;try{result=createDirectGateway({docker:m.docker,containers,id,network:ownNetwork,args});}catch(e){caught=e;}
 if(mode==='normal'){assert.equal(result,gatewayId);assert.equal(containers.length,1);assert(m.calls.indexOf('network connect')<m.calls.indexOf('start '+gatewayId));}
 else {assert.equal(caught.message,'OWNED_DIRECT_GATEWAY_STARTUP_FAILED');assert.deepEqual(containers,mode==='foreign-id'?[]:[gatewayId]);if(mode==='foreign-id')assert(!m.calls.includes('network connect'));}
 results.push({mode,simulatedDockerOwnership:true,passed:true});
}
{
 const m=mock(),prepared=prepareDirectDatabase(m.docker,url);assert.equal(prepared.connection.hostname,'fg-local-postgres-1');assert.equal(prepared.connection.port,'5432');assert.equal(prepared.connection.search,new URL(url).search);
 let calls=0;assert.throws(()=>prepareDirectDatabase(()=>{calls++;throw Error('must not run');},url.replace('127.0.0.1','outside.invalid')),/DIRECT_DATABASE_PREFLIGHT_FAILED/);assert.equal(calls,0);results.push({mode:'original-route-validation-and-options-preservation',passed:true});
}
{
 const m=mock(),prepared=prepareDirectDatabase(m.docker,url);assert.deepEqual(inspectDirectCleanup(m.docker,prepared),{mainServicesUnchanged:true,existingNetworkUnchanged:true});m.state.network.Containers[gatewayId]={Name:name};assert.equal(inspectDirectCleanup(m.docker,prepared).existingNetworkUnchanged,false);assert(!JSON.stringify(inspectDirectCleanup(m.docker,prepared)).includes('PRIVATE_'));results.push({mode:'remaining-endpoint-fails-verification',passed:true});
}
// Execute the actual minimally changed close body, including its real persistence before reject.
const source=fs.readFileSync(d+'/private-gateway-db-bridge-observer-reviewed1.mjs','utf8'),anchor=' async function close(){',start=source.indexOf(anchor),end=source.indexOf('\n }\n\n try{',start);assert(start>0&&end>start);const body=source.slice(start+anchor.length,end),AsyncFunction=Object.getPrototypeOf(async function(){}).constructor,close=new AsyncFunction('docker','containers','network','networkCreated','result','dir','directDatabase','inspectDirectCleanup','fs','assert',body);
for(const mode of ['normal','verify-main-fail','verify-network-fail','remove-fail']){
 const m=mock(mode),pre=prepareDirectDatabase(m.docker,url),containers=[];createDirectGateway({docker:m.docker,containers,id,network:ownNetwork,args});if(mode==='verify-network-fail')m.state.network.Containers['e'.repeat(64)]={Name:'unrelated-added'};
 const root=path.resolve(d),target=path.join(root,'direct-close-control-'+randomUUID());assert.equal(path.dirname(target),root);fs.mkdirSync(target);let caught;const result={recordedAt:new Date().toISOString(),privateSignaling:true,containersRemoved:false,networkRemoved:false,webRTCVerified:false};
 try{
  try{await close(m.docker,containers,ownNetwork,true,result,target,pre,inspectDirectCleanup,fs,assert);}catch(e){caught=e;}
  const file=path.join(target,'cleanup.json');
  if(mode==='remove-fail'){assert(caught);assert(!fs.existsSync(file));}
  else{const proof=JSON.parse(fs.readFileSync(file));assert(proof.containersRemoved&&proof.networkRemoved);if(mode==='normal'){assert(!caught);assert(proof.mainServicesUnchanged&&proof.existingNetworkUnchanged);}else{assert(caught);assert(!proof.mainServicesUnchanged||!proof.existingNetworkUnchanged);}assert(!JSON.stringify(proof).includes('PRIVATE_'));}
  results.push({mode:'actual-close-body-'+mode,realCleanupProofIo:true,simulatedDocker:true,passed:true});
 }finally{assert.equal(path.dirname(path.resolve(target)),root);fs.rmSync(target,{recursive:true,force:true});assert(!fs.existsSync(target));}
}
fs.writeFileSync(d+'/direct-gateway-controls-review1.json',JSON.stringify({reviewedAt:new Date().toISOString(),controls:results.length,results,actualImportedSupportAndExtractedCloseBody:true,realDockerNotClaimed:true,nativeAcceptance:false},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({controls:results.length,green:true,realDockerNotClaimed:true}));
