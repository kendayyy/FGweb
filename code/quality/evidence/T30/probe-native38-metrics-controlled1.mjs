import fs from 'node:fs';import assert from 'node:assert/strict';import pg from 'pg';import {parseEnv} from 'node:util';import {createHash} from 'node:crypto';
import {instrumentOwnedApiPools,startOwnedApiMetrics,getOwnedObservationFailures} from './api-room-owner-observation-metrics-reviewed1.mjs';
const mode=process.argv[2];assert(['healthy','query-io','metrics-io','health-io','zero','sample-error'].includes(mode));
const d='quality/evidence/T30',folder=d+'/native38-metrics-controlled1-'+mode;assert(!fs.existsSync(folder));fs.mkdirSync(folder);
const env=parseEnv(fs.readFileSync('.env.local','utf8')),OriginalPool=pg.Pool,originalQuery=pg.Client.prototype.query,checks=[],failures=[];
const secret='T30_DIAG_PRIVATE_SENTINEL',delay=ms=>new Promise(r=>setTimeout(r,ms));let pool,client,stop,ended=false,lastResult,lastError,lastArgs;
pg.Client.prototype.query=function(...args){lastArgs=args;const result=originalQuery.apply(this,args);if(result?.then)result.then(v=>{lastResult=v;},e=>{lastError=e;});return result;};
try{
 instrumentOwnedApiPools(pg,folder);pool=new pg.Pool({connectionString:env.DATABASE_URL,max:1,connectionTimeoutMillis:5000});client=await pool.connect();
 if(mode==='query-io')fs.mkdirSync(folder+'/api-other-query-spans.jsonl');
 if(mode==='metrics-io')fs.mkdirSync(folder+'/api-runtime-metrics.jsonl');
 if(mode==='health-io')fs.mkdirSync(folder+'/api-metrics-health.json');
 stop=startOwnedApiMetrics(folder);
 assert.throws(()=>startOwnedApiMetrics(folder),/already started/);checks.push('duplicate start rejected');
 const config={text:'SELECT $1::text AS private_value, pg_sleep(0.15)',values:[secret]};const value=await client.query(config);assert.equal(lastArgs[0],config);assert.equal(value,lastResult);assert.equal(value.rows[0].private_value,secret);checks.push('real query config identity, result identity and unchanged data');
 let observedError;try{await client.query('SELECT 1/0');}catch(e){observedError=e;}assert.equal(observedError,lastError);assert.equal(observedError.code,'22012');checks.push('real PG error identity and SQLSTATE preserved');
 await new Promise((resolve,reject)=>{const sql='SELECT $1::int AS number',values=[7];const callback=(e,v)=>{if(e)return reject(e);try{assert.equal(v.rows[0].number,7);resolve();}catch(err){reject(err);}};const returned=client.query(sql,values,callback);assert.equal(returned,undefined);assert.equal(lastArgs[0],sql);assert.equal(lastArgs[1],values);assert.equal(lastArgs[2],callback);});checks.push('real callback query arguments and return unchanged');
 if(mode==='sample-error')Object.defineProperty(pool,'totalCount',{get(){throw new Error('Controlled metric getter failure');},configurable:true});
 if(mode==='healthy'){
  const pending=pool.query('SELECT 9::int AS number');await delay(1200);assert.equal(pool.waitingCount,1);client.release();client=null;assert.equal((await pending).rows[0].number,9);await pool.end();ended=true;await delay(1100);
  const rows=fs.readFileSync(folder+'/api-runtime-metrics.jsonl','utf8').trim().split(/\r?\n/).map(JSON.parse);assert(rows.some(v=>v.pools.some(p=>p.waitingCount===1&&p.totalCount===1&&p.max===1)));assert(rows.some(v=>v.pools.some(p=>p.ended===true)));for(const v of rows){for(const x of [v.elapsedMs,v.processCpu.userMs,v.processCpu.systemMs,v.eventLoopDelay.meanMs,v.eventLoopDelay.maxMs,v.eventLoopDelay.p99Ms])assert(Number.isFinite(x)&&x>=0);}checks.push('actual pool queue/max/ended counts and finite CPU/eventloop samples');
 }else if(mode!=='zero')await delay(1200);
 if(mode==='sample-error')delete pool.totalCount;
 if(mode==='healthy'){const health=await stop();assert(health.observationComplete&&health.stopped&&health.sampleCount>0);assert.equal(getOwnedObservationFailures(),0);const bytes=fs.readFileSync(folder+'/api-runtime-metrics.jsonl');await delay(1100);assert.deepEqual(fs.readFileSync(folder+'/api-runtime-metrics.jsonl'),bytes);const spans=fs.readFileSync(folder+'/api-other-query-spans.jsonl','utf8').trim().split(/\r?\n/).map(JSON.parse);assert(spans.some(v=>v.ok&&v.durationMs>=100));checks.push('slow successful spans, actual timer stop, complete healthy evidence');}
 else{await assert.rejects(stop());if(mode!=='zero')assert(getOwnedObservationFailures()>0);checks.push('actual fault/zero-sample rejects complete health');if(mode==='health-io')assert(fs.statSync(folder+'/api-metrics-health.json').isDirectory());else assert.equal(JSON.parse(fs.readFileSync(folder+'/api-metrics-health.json')).observationComplete,false);}
 for(const name of fs.readdirSync(folder)){const p=folder+'/'+name;if(!fs.statSync(p).isFile())continue;const text=fs.readFileSync(p,'utf8');assert(!text.includes(secret)&&!text.includes(env.DATABASE_URL)&&!text.includes('pg_sleep')&&!text.includes('SELECT'));}checks.push('actual evidence excludes query text, parameters, result data and connection credentials');
}catch(e){failures.push({name:e.name,code:/^[0-9A-Z]{5}$/.test(e.code??'')?e.code:null,message:'Controlled metrics verification failed'});process.exitCode=1;}
finally{if(stop)await stop().catch(()=>{});if(mode==='sample-error'&&pool)delete pool.totalCount;if(client)client.release(true);if(pool&&!ended){await pool.end();ended=pool.ended===true;}pg.Pool=OriginalPool;pg.Client.prototype.query=originalQuery;}
const result={recordedAt:new Date().toISOString(),mode,checks,failures,poolEnded:ended,poolConstructorRestored:pg.Pool===OriginalPool,queryPrototypeRestored:pg.Client.prototype.query===originalQuery,helperSha256:createHash('sha256').update(fs.readFileSync(d+'/api-room-owner-observation-metrics-reviewed1.mjs')).digest('hex'),nativeAcceptance:false};fs.writeFileSync(folder+'/review.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));if(failures.length||!ended)process.exitCode=1;
