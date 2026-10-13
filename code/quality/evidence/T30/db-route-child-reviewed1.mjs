import fs from 'node:fs';import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';import pg from 'pg';
const classify=e=>e?.code==='ECONNREFUSED'?'REFUSED':['ECONNRESET','EPIPE'].includes(e?.code)?'RESET':e?.message==='Connection terminated due to connection timeout'||e?.code==='ETIMEDOUT'?'CONNECTION_TIMEOUT':e?.message==='timeout exceeded when trying to connect'?'POOL_ACQUIRE_TIMEOUT':typeof e?.code==='string'&&/^[0-9A-Z]{5}$/.test(e.code)?'SQLSTATE':'UNKNOWN';
async function measure(url,route,index){
 const record={route,index,startedAt:new Date().toISOString(),completedAt:null,connectDurationMs:null,backendPid:null,warmupAttempted:0,warmupCompleted:0,measuredAttempted:0,queryDurationsMs:[],idleErrorCount:0,errorCode:null,poolEnded:false,ok:false};
 let pool,client;const connectStart=performance.now();
 try{
  pool=new pg.Pool({connectionString:url,max:1,connectionTimeoutMillis:5000,statement_timeout:3000});
  pool.on('error',e=>{record.idleErrorCount++;record.errorCode??=classify(e);});
  client=await pool.connect();record.connectDurationMs=performance.now()-connectStart;assert(Number.isSafeInteger(client.processID)&&client.processID>0);record.backendPid=client.processID;
  client.on('error',e=>{record.idleErrorCount++;record.errorCode??=classify(e);});
  for(let i=0;i<3;i++){record.warmupAttempted++;const result=await client.query('SELECT 1 AS value');assert.equal(result.rows[0]?.value,1);record.warmupCompleted++;}
  for(let i=0;i<20;i++){record.measuredAttempted++;const start=performance.now(),result=await client.query('SELECT 1 AS value');assert.equal(result.rows[0]?.value,1);record.queryDurationsMs.push(performance.now()-start);}
 }catch(e){record.connectDurationMs??=performance.now()-connectStart;record.errorCode??=classify(e);}
 finally{
  if(client)try{client.release();}catch(e){record.errorCode??=classify(e);}
  if(pool)try{await pool.end();record.poolEnded=pool.ended===true;}catch(e){record.errorCode??=classify(e);}
  record.completedAt=new Date().toISOString();record.ok=record.errorCode===null&&record.idleErrorCount===0&&record.warmupCompleted===3&&record.queryDurationsMs.length===20&&record.poolEnded;
 }
 return record;
}
async function main(){
 const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),a=new URL(input.routeA),b=new URL(input.routeB);assert.equal(a.hostname,'host.docker.internal');assert.equal(b.hostname,'fg-local-postgres-1');assert.equal(b.port,'5432');
 const normalizedA=new URL(a.href),normalizedB=new URL(b.href);for(const url of [normalizedA,normalizedB]){url.hostname='localhost';url.port='5432';}assert.equal(normalizedA.href,normalizedB.href);
 const record={startedAt:new Date().toISOString(),completedAt:null,schedule:['A','B','A','B'],measurements:[],allOk:false,nativeAcceptance:false};
 for(let i=0;i<record.schedule.length;i++){const route=record.schedule[i];record.measurements.push(await measure(route==='A'?a.href:b.href,route,i));}
 record.completedAt=new Date().toISOString();record.allOk=record.measurements.every(r=>r.ok);fs.writeFileSync(process.argv[3],JSON.stringify(record,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({control:'db-route',cycles:4,allOk:record.allOk,nativeAcceptance:false}));process.exitCode=record.allOk?0:1;
}
main().catch(()=>{console.error(JSON.stringify({control:'db-route',fatal:true,errorCode:'CONTROL_FATAL'}));process.exitCode=1;});
