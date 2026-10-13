import fs from 'node:fs';import assert from 'node:assert/strict';
const d='quality/evidence/T30',original=fs.readFileSync(d+'/probe-native36-room-loading-startup2.mjs','utf8');
for(const mode of ['normal','health-io']){
 let text=original;
 const replace=(old,next)=>{assert.equal(text.split(old).length,2,old);text=text.replace(old,next);};
 replace("fixture-server-native36-room-loading-reviewed.mjs","fixture-server-native38-metrics-reviewed1.mjs");
 replace("native36-room-loading-startup-smoke-2","native38-metrics-fixture-smoke1-"+mode);
 replace("native36-room-loading-startup-smoke-review-2.json","native38-metrics-fixture-smoke-review1-"+mode+".json");
 if(mode==='health-io')replace("ready=await bounded(readyPromise,90000,'fixture ready');","ready=await bounded(readyPromise,90000,'fixture ready');fs.mkdirSync(folder+'/api-metrics-health.json');");
 const extra=mode==='normal'?"try{const metrics=JSON.parse(fs.readFileSync(folder+'/api-metrics-health.json'));assert(metrics.stopped&&metrics.observationComplete&&metrics.sampleCount>0&&metrics.writeFailures===0);const samples=fs.readFileSync(folder+'/api-runtime-metrics.jsonl','utf8').trim().split(/\\r?\\n/).map(JSON.parse);assert(samples.length===metrics.sampleCount);checks.push({kind:'actual API child metrics complete/stopped',metrics,samples:samples.length});}catch{errors.push({phase:'metrics',message:'Actual metrics lifecycle not proven'});}\n":"try{assert.equal(closed?.code,1);assert(fs.statSync(folder+'/api-metrics-health.json').isDirectory());assert(fs.existsSync(folder+'/cleanup-failure.json'));const failedOwner=JSON.parse(fs.readFileSync(folder+'/api-owner-observation-health.json'));assert(failedOwner.failureCount>0&&!failedOwner.observationComplete);checks.push({kind:'actual metrics final health IO failure propagates while every owned cleanup succeeds',failedOwner});}catch{errors.push({phase:'metrics fault',message:'Actual failed observation and independent cleanup not proven'});}\n";
 replace('const result={recordedAt:',extra+'const result={recordedAt:');
 if(mode==='health-io'){
  replace('assert.equal(ownerHealth.failureCount,0);assert.equal(ownerHealth.observationComplete,true);','assert(ownerHealth.failureCount>0);assert.equal(ownerHealth.observationComplete,false);');
  replace("closed?.code!==0)process.exitCode=1;","closed?.code!==1)process.exitCode=1;");
 }
 fs.writeFileSync(d+'/probe-native38-metrics-fixture1-'+mode+'.mjs',text,{flag:'wx'});
}
console.log('Normal and actual final-health I/O failure fixture smoke runners prepared; all original smoke assertions retained.');
