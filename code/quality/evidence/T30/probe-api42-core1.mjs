import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {parseEnv} from 'node:util';import {randomUUID} from 'node:crypto';import pg from 'pg';import {RoomServiceClient} from 'livekit-server-sdk';import {createServer} from 'node:http';
const d='quality/evidence/T30',helper=process.argv[2],label=process.argv[3];assert(['antigravity-native42-api-spans-correction-1/api-lock-spans-observer.mjs','api42-observer-reviewed1.mjs'].includes(helper));assert(/^[a-z0-9-]+$/.test(label));
const observer=await import(pathToFileURL(path.resolve(d,helper)).href),folder=d+'/api42-core-'+label;fs.mkdirSync(folder);
const checks={},schema='t30_api42_core_'+randomUUID().replaceAll('-',''),env=parseEnv(fs.readFileSync('.env.local','utf8')),db=new URL(env.DATABASE_URL);db.searchParams.set('options','-c search_path='+schema);
let pool,client,http,stop,created=false;const cleanup={schemaRemoved:false,poolEnded:false,httpClosed:false};let failed=false;
const test=(name,fn)=>{try{fn();checks[name]=true;}catch{checks[name]=false;}};
try{
 observer.instrumentOwnedApiPools(pg,folder);observer.instrumentRoomServiceClient(RoomServiceClient,folder);stop=observer.startApiLockSpansObserver(folder);
 let middleware;observer.instrumentHttpTimingMiddleware({use:fn=>middleware=fn});const response={statusCode:200,once(){}};const originalError=new Error('Controlled next failure');let nextCalls=0,error;
 try{middleware({method:'GET',path:'/api/v1/me'},response,()=>{nextCalls++;throw originalError;});}catch(e){error=e;}
 test('httpOriginalErrorIdentity',()=>assert.equal(error,originalError));test('httpNextCalledExactlyOnce',()=>assert.equal(nextCalls,1));
 const originals=new Map();class Calls {list(...args){const result=Reflect.apply(args[0],this,args.slice(1));originals.set('list',{result,self:this,args});return result;}participants(...args){const result=Reflect.apply(args[0],this,args.slice(1));originals.set('participants',{result,self:this,args});return result;}withControlGroup(...args){const result=Reflect.apply(args[0],this,args.slice(1));originals.set('withControlGroup',{result,self:this,args});return result;}}
 class Lifecycle {reconcileGroup(...args){const result=Reflect.apply(args[0],this,args.slice(1));originals.set('reconcileGroup',{result,self:this,args});return result;}}
 observer.instrumentOwnedApiServices({CallsService:Calls,CallLifecycleService:Lifecycle});const calls=new Calls(),life=new Lifecycle();
 const argument={fixed:'synthetic'},run=function(value){assert.equal(this,calls);assert.equal(value,argument);return Promise.resolve(value);};const promise=calls.list(run,argument);
 test('serviceOriginalPromiseArgsThis',()=>{assert.equal(promise,originals.get('list').result);assert.equal(originals.get('list').args[0],run);assert.equal(originals.get('list').args[1],argument);assert.equal(originals.get('list').self,calls);});assert.equal(await promise,argument);
 let thrown;try{calls.participants(()=>{throw originalError;});}catch(e){thrown=e;}test('serviceSyncErrorIdentity',()=>assert.equal(thrown,originalError));
 const rejected=Promise.reject(originalError);rejected.catch(()=>{});const observed=calls.withControlGroup(()=>rejected);test('serviceRejectedPromiseIdentity',()=>assert.equal(observed,rejected));try{await observed;}catch(e){test('serviceRejectedErrorIdentity',()=>assert.equal(e,originalError));}
 const unusual=Object.defineProperty({},'then',{get(){throw originalError;}});let returned,attachmentError;
 try{returned=calls.list(()=>unusual);}catch(e){attachmentError=e;}test('observerThenGetterCannotReplaceReturn',()=>{assert.equal(returned,unusual);assert.equal(attachmentError,undefined);});
 pool=new pg.Pool({connectionString:db.href,max:2,connectionTimeoutMillis:5000,statement_timeout:5000});await pool.query('CREATE SCHEMA "'+schema+'"');created=true;await pool.query('CREATE TABLE rooms(id text PRIMARY KEY)');await pool.query("INSERT INTO rooms VALUES('synthetic-room')");client=await pool.connect();
 http=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end('{"rooms":[]}');});await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));const sdk=new RoomServiceClient('http://127.0.0.1:'+http.address().port,'controlled-key','controlled-secret');
 let insideContext,outerContext;
 await life.reconcileGroup(async()=>{
  outerContext=observer.als.getStore();await client.query('BEGIN');await client.query("SELECT id FROM rooms WHERE id='synthetic-room' FOR UPDATE");
  await sdk.listRooms();await client.query('COMMIT');await sdk.listRooms();
  await calls.participants(async()=>{insideContext=observer.als.getStore();await client.query('SELECT 1');});
 });
 test('nestedInnerContextParent',()=>{assert.notEqual(insideContext.spanIndex,outerContext.spanIndex);assert.equal(insideContext.parentSpanIndex,outerContext.spanIndex);});
 await new Promise(resolve=>setTimeout(resolve,1100));const health=await stop();
 const records=fs.readFileSync(folder+'/api-lock-spans.jsonl','utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse),rpcs=records.filter(r=>r.type==='rpc'&&r.method==='listRooms');assert.equal(rpcs.length,2);
 test('rpcWithinTransactionActualPid',()=>assert.equal(rpcs[0].backendPid,client.processID));test('rpcAfterCommitDoesNotUseStalePid',()=>assert.equal(rpcs[1].backendPid,null));
 const beforePool=pg.Pool;let duplicateError;try{observer.instrumentOwnedApiPools(pg,folder);}catch(e){duplicateError=e;}
 test('duplicatePoolInstallRejectedBeforeMutation',()=>{assert(duplicateError);assert.equal(pg.Pool,beforePool);});
 // Metadata setup/attachment failures must be visible as incomplete diagnostics, while original app outcomes stay exact.
 test('observerAttachmentFailureReported',()=>{assert(health.failureCount>0);assert.equal(health.observationComplete,false);});
}catch{failed=true;}finally{
 try{if(client){await client.query('ROLLBACK');client.release();client=undefined;}if(created){await pool.query('DROP SCHEMA "'+schema+'" CASCADE');cleanup.schemaRemoved=(await pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount===0;}if(pool){await pool.end();cleanup.poolEnded=pool.ended===true;}}catch{failed=true;}
 try{if(http){await new Promise(resolve=>http.close(resolve));cleanup.httpClosed=!http.listening;}}catch{failed=true;}
 try{if(stop)await stop();}catch{failed=true;}
}
const result={recordedAt:new Date().toISOString(),checks,failedChecks:Object.entries(checks).filter(([,passed])=>!passed).map(([name])=>name),cleanup,fatalControlFailure:failed,nativeAcceptance:false};fs.writeFileSync(folder+'/result.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));process.exitCode=failed||result.failedChecks.length||!Object.values(cleanup).every(Boolean)?1:0;
