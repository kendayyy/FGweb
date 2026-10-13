import fs from 'node:fs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import pg from 'pg';

// Fixed allowlist of client error classifications (no raw messages, URLs, credentials, or queries)
const ALLOWED_ERROR_ENUMS = new Set([
 'CONNECTION_TIMEOUT',
 'POOL_ACQUIRE_TIMEOUT',
 'SQLSTATE',
 'REFUSED',
 'RESET',
 'UNKNOWN'
]);

function classifyError(err){
 if(!err)return null;
 const msg=typeof err.message==='string'?err.message:'';
 const code=typeof err.code==='string'?err.code:'';
 if(code==='ECONNREFUSED')return 'REFUSED';
 if(code==='ECONNRESET'||code==='EPIPE')return 'RESET';
 if(code==='ETIMEDOUT'||/connection timeout/i.test(msg))return 'CONNECTION_TIMEOUT';
 if(/timeout exceeded when trying to connect/i.test(msg))return 'POOL_ACQUIRE_TIMEOUT';
 if(/^[0-9A-Z]{5}$/.test(code))return 'SQLSTATE';
 return 'UNKNOWN';
}

async function measureRoute(url,routeLabel,targetHost,port,cycleIndex){
 const startedAt=new Date().toISOString();
 let pool=null;
 let client=null;
 try{
  pool=new pg.Pool({
   connectionString:url,
   max:1,
   connectionTimeoutMillis:5000,
   statement_timeout:3000
  });

  const connectStart=performance.now();
  client=await pool.connect();
  const connectDurationMs=Math.round((performance.now()-connectStart)*100)/100;
  const backendPid=client.processID;
  assert(Number.isInteger(backendPid)&&backendPid>0,'Backend PID must be a positive integer');

  // 3 explicit warmup SELECT 1 queries (diagnostic control only, never acceptance wait)
  for(let i=0;i<3;i++){
   const warmupRes=await client.query('SELECT 1');
   const val=warmupRes.rows?.[0]?Object.values(warmupRes.rows[0])[0]:null;
   assert.equal(val,1,'Warmup query must return 1');
  }

  // 20 measured sequential SELECT 1 queries on reused connection
  const queryDurationsMs=[];
  for(let i=0;i<20;i++){
   const qStart=performance.now();
   const res=await client.query('SELECT 1');
   const qDur=Math.round((performance.now()-qStart)*100)/100;
   const val=res.rows?.[0]?Object.values(res.rows[0])[0]:null;
   assert.equal(val,1,'Measured query must return 1');
   queryDurationsMs.push(qDur);
  }

  client.release();
  client=null;

  await pool.end();
  assert.equal(pool.ended,true,'Pool must be settled and ended');

  const sorted=[...queryDurationsMs].sort((a,b)=>a-b);
  const min=sorted[0];
  const max=sorted[sorted.length-1];
  const p50=sorted[Math.floor(sorted.length*0.5)];
  const p95=sorted[Math.floor(sorted.length*0.95)];
  const mean=Math.round((sorted.reduce((a,b)=>a+b,0)/sorted.length)*100)/100;

  return {
   cycle:cycleIndex,
   route:routeLabel,
   targetHost,
   port,
   ok:true,
   connectDurationMs,
   backendPid,
   warmupCount:3,
   measuredCount:20,
   queryDurationsMs,
   stats:{min,p50,p95,max,mean},
   poolEnded:true,
   startedAt,
   completedAt:new Date().toISOString()
  };
 }catch(err){
  if(client){
   try{client.release();}catch{}
  }
  if(pool&&!pool.ended){
   try{await pool.end();}catch{}
  }
  const errorCode=classifyError(err);
  const sqlState=typeof err?.code==='string'&&/^[0-9A-Z]{5}$/.test(err.code)?err.code:null;
  return {
   cycle:cycleIndex,
   route:routeLabel,
   targetHost,
   port,
   ok:false,
   errorCode,
   sqlState,
   connectDurationMs:null,
   backendPid:null,
   warmupCount:0,
   measuredCount:0,
   queryDurationsMs:[],
   stats:null,
   poolEnded:pool?.ended===true,
   startedAt,
   completedAt:new Date().toISOString()
  };
 }
}

async function main(){
 const inputPath=process.argv[2]||'/app/input.json';
 const outputPath=process.argv[3]||'/app/output/result.json';

 assert(fs.existsSync(inputPath),'Input configuration file must exist');
 const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
 assert(typeof input.routeA==='string'&&input.routeA.length>0,'routeA URL required');
 assert(typeof input.routeB==='string'&&input.routeB.length>0,'routeB URL required');
 const portA=Number.isInteger(input.portA)?input.portA:55432;
 const portB=Number.isInteger(input.portB)?input.portB:5432;

 // Sequential A-B-A-B protocol
 const schedule=[
  {route:'A',url:input.routeA,host:'host.docker.internal',port:portA,cycle:1},
  {route:'B',url:input.routeB,host:'fg-local-postgres-1',port:portB,cycle:1},
  {route:'A',url:input.routeA,host:'host.docker.internal',port:portA,cycle:2},
  {route:'B',url:input.routeB,host:'fg-local-postgres-1',port:portB,cycle:2}
 ];

 const measurements=[];
 for(const item of schedule){
  const m=await measureRoute(item.url,item.route,item.host,item.port,item.cycle);
  measurements.push(m);
 }

 const aMeasurements=measurements.filter(m=>m.route==='A');
 const bMeasurements=measurements.filter(m=>m.route==='B');

 function aggregateRoute(list){
  const successful=list.filter(m=>m.ok);
  if(successful.length===0){
   return {
    totalMeasurements:list.length,
    successfulCycles:0,
    allOk:false,
    totalQueries:0,
    meanConnectDurationMs:null,
    p50Ms:null,
    p95Ms:null,
    maxMs:null
   };
  }
  const allDurations=successful.flatMap(m=>m.queryDurationsMs).sort((a,b)=>a-b);
  const connectDurations=successful.map(m=>m.connectDurationMs);
  const meanConnect=Math.round((connectDurations.reduce((a,b)=>a+b,0)/connectDurations.length)*100)/100;
  const p50=allDurations[Math.floor(allDurations.length*0.5)];
  const p95=allDurations[Math.floor(allDurations.length*0.95)];
  const max=allDurations[allDurations.length-1];
  return {
   totalMeasurements:list.length,
   successfulCycles:successful.length,
   allOk:successful.length===list.length,
   totalQueries:allDurations.length,
   meanConnectDurationMs:meanConnect,
   p50Ms:p50,
   p95Ms:p95,
   maxMs:max
  };
 }

 const summaryA=aggregateRoute(aMeasurements);
 const summaryB=aggregateRoute(bMeasurements);

 const output={
  recordedAt:new Date().toISOString(),
  benchmark:'db-route-latency',
  protocol:'A-B-A-B sequential',
  warmupQueriesPerCycle:3,
  measuredQueriesPerCycle:20,
  cyclesPerRoute:2,
  totalQueriesPerRoute:40,
  measurements,
  summary:{
   routeA_hostDockerInternal:summaryA,
   routeB_directContainerBridge:summaryB,
   comparison:{
    p50DeltaMs:summaryA.p50Ms!==null&&summaryB.p50Ms!==null?Math.round((summaryA.p50Ms-summaryB.p50Ms)*100)/100:null,
    p95DeltaMs:summaryA.p95Ms!==null&&summaryB.p95Ms!==null?Math.round((summaryA.p95Ms-summaryB.p95Ms)*100)/100:null,
    connectDeltaMs:summaryA.meanConnectDurationMs!==null&&summaryB.meanConnectDurationMs!==null?Math.round((summaryA.meanConnectDurationMs-summaryB.meanConnectDurationMs)*100)/100:null
   }
  },
  allOk:measurements.every(m=>m.ok),
  nativeAcceptance:false
 };

 fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({
  status:output.allOk?'success':'failed',
  measurementsCount:measurements.length,
  routeA_p50:summaryA.p50Ms,
  routeB_p50:summaryB.p50Ms,
  p50DeltaMs:output.summary.comparison.p50DeltaMs,
  nativeAcceptance:false
 }));
}

main().catch(err=>{
 const errorCode=classifyError(err);
 console.error(JSON.stringify({fatal:true,errorCode}));
 process.exit(1);
});
