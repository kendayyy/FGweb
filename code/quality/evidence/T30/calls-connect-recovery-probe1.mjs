import 'reflect-metadata';
import fs from 'node:fs';
import net from 'node:net';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {parseEnv} from 'node:util';
const {CallsService}=createRequire(import.meta.url)('../../../apps/api/dist/modules/calls/calls.service.js');
const mode=process.argv[2];assert(['red','green'].includes(mode));
const out='quality/evidence/T30/calls-connect-recovery-probe1-'+mode;fs.mkdirSync(out);
const originalEnv=process.env.DATABASE_URL;
const target=new URL(parseEnv(fs.readFileSync('.env.local','utf8')).DATABASE_URL);
const results=[];const cleanup=[];
const timeoutMessage='Connection terminated due to connection timeout';
async function scenario(kind){
 const sockets=new Set();let accepted=0,block=false,onNew;const acceptedNew=new Promise(r=>onNew=r);
 const server=net.createServer(front=>{
  accepted++;sockets.add(front);front.on('error',()=>{});front.on('close',()=>sockets.delete(front));
  if(accepted>4){onNew();if(block)return;}
  const back=net.connect({host:target.hostname,port:Number(target.port||5432)});sockets.add(back);
  back.on('error',()=>front.destroy());back.on('close',()=>{sockets.delete(back);front.destroy();});
  front.on('close',()=>back.destroy());front.pipe(back);back.pipe(front);
 });
 await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
 const ownUrl=new URL(target);ownUrl.hostname='127.0.0.1';ownUrl.port=String(server.address().port);process.env.DATABASE_URL=ownUrl.href;
 const service=new CallsService({setCallHooks(){}},{setCallRevoker(){}});let held=[],initialized=false,bodyCalls=0,bodyPid=null;
 const sentinel=new Error('owned-business-failure');const item={kind,actualPg:true};
 try{
  await service.onModuleInit();initialized=true;assert.equal(service.pool.totalCount,4);assert.equal(service.pool.options.max,16);assert.equal(service.pool.options.connectionTimeoutMillis,5000);assert.equal(service.pool.options.statement_timeout,15000);
  const warm=await Promise.all(Array.from({length:4},()=>service.pool.connect()));const pids=warm.map(c=>c.processID);assert.equal(new Set(pids).size,4);held=[...warm];
  block=kind!=='non-timeout-connect-error';
  if(kind==='non-timeout-connect-error')service.pool.options.database='fg_owned_nonexistent_connect_probe';
  const started=performance.now();let failure=null;
  const transaction=service.transaction(async db=>{
   bodyCalls++;bodyPid=(await db.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   assert(pids.includes(bodyPid),'Transaction must use an already authenticated backend');
   if(kind==='recovery-business-error'){
    await db.query('CREATE TEMP TABLE t30_owned_retry_probe(id integer)');await db.query('INSERT INTO t30_owned_retry_probe VALUES(1)');throw sentinel;
   }
   return bodyPid;
  }).catch(e=>{failure=e;return null;});
  await acceptedNew;
  if(kind!=='no-idle-timeout'){held.shift().release();assert.equal(service.pool.idleCount,1);}
  const value=await transaction;const elapsedMs=Math.round(performance.now()-started);
  Object.assign(item,{acceptedTcp:accepted,warmedPids:pids,bodyCalls,bodyPid,elapsedMs,idleAtEnd:service.pool.idleCount,totalAtEnd:service.pool.totalCount,error:failure?{name:failure.name,code:failure.code??null,connectTimeout:failure.message===timeoutMessage,businessSentinel:failure===sentinel}:null});
  assert.equal(accepted,5,'Recovery must not create another TCP/backend connection');
  if(kind==='recovery-success'){assert.equal(failure,null,'A ready backend must rescue the failed initial handshake');assert.equal(bodyCalls,1);assert(pids.includes(value));}
  if(kind==='recovery-business-error'){
   assert.equal(failure,sentinel,'Original transaction-body error must propagate without retry');assert.equal(bodyCalls,1);
   const same=await service.pool.connect();try{assert.equal(same.processID,bodyPid);assert.equal((await same.query("SELECT to_regclass('pg_temp.t30_owned_retry_probe') AS relation")).rows[0].relation,null);item.rollbackVerified=true;}finally{same.release();}
  }
  if(kind==='no-idle-timeout'){assert.equal(bodyCalls,0);assert.equal(failure?.message,timeoutMessage);assert.equal(service.pool.idleCount,0);}
  if(kind==='non-timeout-connect-error'){assert.equal(bodyCalls,0);assert.equal(failure?.code,'3D000');assert.equal(service.pool.idleCount,1);}
  item.passed=true;
 }catch(error){item.passed=false;item.assertion=error instanceof assert.AssertionError?error.message.split('\n')[0]:'Owned probe setup or database operation failed';}
 finally{
  for(const c of held)c.release();
  if(initialized)await service.onModuleDestroy();else await service.pool?.end();
  for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));
  cleanup.push({kind,poolEnded:service.pool.ended,remainingClients:service.pool.totalCount,proxyClosed:!server.listening});results.push(item);
 }
}
try{for(const kind of ['recovery-success','recovery-business-error','no-idle-timeout','non-timeout-connect-error'])await scenario(kind);}
finally{if(originalEnv===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=originalEnv;fs.writeFileSync(out+'/result.json',JSON.stringify({at:new Date().toISOString(),mode,results,cleanup,envRestored:process.env.DATABASE_URL===originalEnv},null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({mode,passed:results.filter(r=>r.passed).length,total:results.length,cleanup:cleanup.every(c=>c.poolEnded&&c.remainingClients===0&&c.proxyClosed)}));process.exitCode=results.every(r=>r.passed)?0:1;
