import fs from 'node:fs';import assert from 'node:assert/strict';const d='quality/evidence/T30';const c=fs.readFileSync(d+'/run-native40-gateway-controls3.mjs','utf8').replaceAll('native40-gateway-controls3','api47-gateway-controls1').replaceAll('native40-gateway-controlled-review3','api47-gateway-controlled-review1');fs.writeFileSync(d+'/run-api47-gateway-controls1.mjs',c,{flag:'wx'});
for(const mode of ['normal','health-io','gateway-health-io']){
 let s=fs.readFileSync(d+'/probe-api43-fixture1-'+(mode==='health-io'?'health-io':'normal')+'.mjs','utf8');s=s.replace("import WebSocket from 'ws';","import WebSocket from 'ws';import {SignalRequest,SignalResponse} from '@livekit/protocol';").replaceAll('fixture-server-api43-reviewed1.mjs','fixture-server-api47-reviewed1.mjs').replaceAll('api43-fixture-smoke1-'+(mode==='health-io'?'health-io':'normal'),'api47-fixture-smoke1-'+mode).replaceAll('api43-fixture-smoke-review1-'+(mode==='health-io'?'health-io':'normal'),'api47-fixture-smoke-review1-'+mode).replace('let ready,closed,ws;','let ready,closed,ws,mediaWs;').replace('finally{ws?.terminate();','finally{mediaWs?.terminate();ws?.terminate();');
 const anchor='privateValues.push(joined.token);';assert.equal(s.split(anchor).length,2);s=s.replace(anchor,anchor+`
const signalURL=new URL(joined.sfuUrl);signalURL.pathname='/rtc';signalURL.searchParams.set('access_token',joined.token);signalURL.searchParams.set('protocol','12');signalURL.searchParams.set('sdk','js');
await bounded(new Promise((resolve,reject)=>{mediaWs=new WebSocket(signalURL,{headers:{Origin:ready.origin}});mediaWs.once('error',()=>reject(new Error('Owned real media signaling failure')));mediaWs.once('message',(data,binary)=>{try{const response=binary?SignalResponse.fromBinary(Buffer.from(data)):SignalResponse.fromJsonString(String(data));assert.equal(response.message.case,'join');assert.equal(response.message.value.participant.permission.canSubscribe,true);mediaWs.send(new SignalRequest({message:{case:'subscription',value:{subscribe:false,trackSids:[]}}}).toBinary());checks.push({kind:'actual owned private media gateway native JoinResponse and unchanged binary subscription',joined:true});resolve();}catch{reject(new Error('Owned native join response control failed'));}});}),10000,'actual media signaling join');
await new Promise(r=>setTimeout(r,300));
`);
 if(mode==='gateway-health-io')s=s.replace("ready=await bounded(readyPromise,90000,'fixture ready');","ready=await bounded(readyPromise,90000,'fixture ready');fs.mkdirSync(folder+'/gateway-observer-stop-status.json');");
 const insert=s.indexOf('const result={recordedAt:');assert(insert>0);s=s.slice(0,insert)+`
try{
 const expectedPersistFault=${mode==='gateway-health-io'};
 const statusPath=folder+'/gateway-observer-stop-status.json';
 const lines=fs.readFileSync(folder+'/media-diagnostics.txt','utf8').split(/\\r?\\n/);
 const marker=lines.filter(x=>x.startsWith('[FG_GATEWAY_HEALTH] ')).map(x=>JSON.parse(x.slice('[FG_GATEWAY_HEALTH] '.length)));assert.equal(marker.length,1);const health=marker[0];assert(health.observationComplete&&health.timerStopped&&health.histogramDisabled&&health.sampleCount>0&&health.failureCount===0&&health.droppedCount===0);
 if(expectedPersistFault){assert(fs.statSync(statusPath).isDirectory());assert.equal(closed.code,1);}else assert.deepEqual(JSON.parse(fs.readFileSync(statusPath,'utf8')),health);
 const gatewayRows=lines.filter(x=>x.startsWith('[FG_GATEWAY_OBSERVER] ')).map(x=>JSON.parse(x.slice('[FG_GATEWAY_OBSERVER] '.length)));
 for(const value of privateValues)assert(!JSON.stringify(gatewayRows).includes(value));assert(!JSON.stringify(gatewayRows).includes('SELECT ')&&!JSON.stringify(gatewayRows).includes(ready.roomId));
 assert(gatewayRows.some(x=>x.type==='query'&&x.kind==='room-lock'&&x.backendPid>0&&x.ok===true));assert(gatewayRows.some(x=>x.type==='query'&&x.kind==='policy'&&x.backendPid>0&&x.ok===true));assert(gatewayRows.some(x=>x.type==='ws'&&x.case==='subscription'));assert(gatewayRows.some(x=>x.type==='metric'));
 checks.push({kind:'actual gateway preload real PG/private native signal normal stop and persistence control',health,spanCount:gatewayRows.length,persistFaultExpected:expectedPersistFault,privacyReviewed:true});
}catch{errors.push({phase:'gateway observation smoke',message:'Actual gateway PG/signal/stop/privacy/persistence proof missing'});}
`+s.slice(insert);
 if(mode==='gateway-health-io'){assert(s.includes('closed?.code!==0'));s=s.replace('closed?.code!==0','closed?.code!==1');}
 fs.writeFileSync(d+'/probe-api47-fixture1-'+mode+'.mjs',s,{flag:'wx'});
}console.log('Existing gateway identity/IO controls and three full real API+native-signal smoke clones prepared.');
