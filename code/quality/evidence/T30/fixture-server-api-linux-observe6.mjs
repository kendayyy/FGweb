import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {createServer as reservePort} from 'node:net';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import Redis from 'ioredis';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import * as tables from '@fg/database';
import {NestFactory} from '@nestjs/core';
import {makeSignature} from 'better-auth/crypto';
import {raw} from 'express';
import {RoomServiceClient} from 'livekit-server-sdk';
import {startGatewayFixture} from './private-gateway-api-direct-full-reviewed4.mjs';
import {createOwnedErrorObserver} from './codex-owned-error-observer4.mjs';
const env=parseEnv(fs.readFileSync('.env.local','utf8')),schema=`t30_screen_${randomUUID().replaceAll('-','')}`,secret=randomUUID()+randomUUID();
const evidence=process.env.FG_T30_EVIDENCE_DIR;
assert(evidence?.startsWith('quality/evidence/T30/'));fs.mkdirSync(evidence,{recursive:true});
const report={schemaRemoved:false,mediaRemoved:false,presenceRemoved:false,appClosed:false,webClosed:false};
let pool,redis,app,web,fixture,created=false,namespace='',phase='port',sfu;
let inspectorClient,inspectorPid=null,inspectorReserved=false,inspectorReleased=false;
let inspectorExpectedEnd=false,actualSocketEnded=false,poolEnded=false;
let inspectorFailureCount=0,inspectorWriteFailureCount=0,inspectorHealthy=false;
let codexErrorObserver;
const sockets=new Set();
const mark=name=>{phase=name;process.send?.({kind:'phase',name});};
const ALLOWED_NAMES=new Set(['Error','TypeError','TimeoutError','SocketEndError']);
const ALLOWED_CODES=new Set([
 'EIO',
 'ECONNRESET',
 'EPIPE',
 'ETIMEDOUT',
 'UNKNOWN',
 'UNEXPECTED_CLIENT_END',
 'SOCKET_END_TIMEOUT',
 'RELEASE_FAILED',
 'CLEANUP_FAILED',
 'INIT_FAILED'
]);
function sanitizeName(name){
 return ALLOWED_NAMES.has(name)?name:'Error';
}
function sanitizeCode(code){
 if(typeof code==='string'){
  if(ALLOWED_CODES.has(code))return code;
  if(/^[0-9A-Z]{5}$/.test(code))return code;
 }
 return 'UNKNOWN';
}
function recordSafeFailure(err){
 try{
  const rec={
   recordedAt:new Date().toISOString(),
   backendPid:inspectorPid,
   name:sanitizeName(err?.name),
   code:sanitizeCode(err?.code)
  };
  fs.appendFileSync(`${evidence}/inspector-failures.jsonl`,JSON.stringify(rec)+'\n');
 }catch{
  inspectorWriteFailureCount++;
  inspectorHealthy=false;
 }
}
async function cleanup(){
 const errors=[];
 async function attempt(name,fn){
  try{await fn();}
  catch{errors.push(new Error(`Cleanup failed: ${name}`));}
 }
 if(fixture?.stopGatewayObservation)await attempt('gatewayObserverStop',async()=>{const health=await fixture.stopGatewayObservation();fs.writeFileSync(evidence+'/gateway-observer-stop-health.json',JSON.stringify(health,null,2)+'\n',{flag:'wx'});});
 if(app){
  await attempt('apiApp',async()=>{await app.close();report.appClosed=true;});
  if(codexErrorObserver)await attempt('codexErrorObserver',async()=>{codexErrorObserver.stop();});
 }
 if(web){
  await attempt('webSockets',async()=>{for(const socket of sockets)socket.destroy();});
  await attempt('webServer',async()=>{await web.close();report.webClosed=true;});
 }
 if(fixture){
  await attempt('mediaDiagnostics',async()=>{
   fs.writeFileSync(`${evidence}/media-diagnostics.txt`,fixture.diagnostics());
   const response=await fetch(fixture.shaperControl+'/stats').catch(()=>null);
   if(response?.ok)fs.writeFileSync(`${evidence}/final-shaper-stats.json`,JSON.stringify(await response.json(),null,2)+'\n');
  });
  await attempt('mediaContainers',async()=>{
   const state=await fixture.close();
   report.mediaRemoved=Boolean(state.containersRemoved&&state.networkRemoved);
  });
 }
 if(redis){
  let presenceCleaned=false;
  await attempt('redisKeys',async()=>{
   const keys=await redis.keys(`fg:presence:${namespace}:*`);
   if(keys.length)await redis.del(...keys);
   presenceCleaned=true;
  });
  await attempt('redisQuit',async()=>{
   await redis.quit();
   report.presenceRemoved=presenceCleaned;
  });
 }
 if(inspectorClient&&!inspectorReleased){
  await attempt('inspectorRelease',async()=>{
   inspectorExpectedEnd=true;
   try{
    inspectorClient.release(true);
    inspectorReleased=true;
   }catch(relErr){
    inspectorReleased=false;
    inspectorHealthy=false;
    inspectorFailureCount++;
    recordSafeFailure(relErr);
    if(pool&&Array.isArray(pool._clients)&&pool._clients.includes(inspectorClient)){
     try{
      if(typeof pool._remove==='function'){
       pool._remove(inspectorClient,()=>{
        try{
         if(typeof pool._pulseQueue==='function')pool._pulseQueue();
        }catch(pulseErr){
         inspectorFailureCount++;
         inspectorHealthy=false;
         recordSafeFailure(pulseErr);
        }
       });
      }else{
       inspectorFailureCount++;
       inspectorHealthy=false;
       recordSafeFailure({code:'RELEASE_FAILED',name:'Error'});
      }
     }catch(removeErr){
      inspectorFailureCount++;
      inspectorHealthy=false;
      recordSafeFailure(removeErr);
     }
    }
    try{
     if(inspectorClient.connection?.stream&&typeof inspectorClient.connection.stream.destroy==='function'){
      inspectorClient.connection.stream.destroy();
     }else if(typeof inspectorClient.end==='function'){
      inspectorClient.end();
     }
    }catch(streamErr){
     inspectorFailureCount++;
     inspectorHealthy=false;
     recordSafeFailure(streamErr);
    }
    throw relErr;
   }
  });
 }
 if(inspectorClient){
  await attempt('inspectorSocketEndWait',async()=>{
   if(actualSocketEnded){
    return;
   }
   await new Promise(resolve=>{
    let timer=null;
    const onEnd=()=>{
     if(timer)clearTimeout(timer);
     resolve();
    };
    timer=setTimeout(()=>{
     inspectorClient.removeListener('end',onEnd);
     inspectorFailureCount++;
     inspectorHealthy=false;
     recordSafeFailure({code:'SOCKET_END_TIMEOUT',name:'TimeoutError'});
     resolve();
    },5000);
    if(timer.unref)timer.unref();
    inspectorClient.once('end',onEnd);
   });
  });
 }
 if(pool){
  if(created){
   await attempt('dropSchema',async()=>{
    assert(/^t30_screen_[a-f0-9]{32}$/.test(schema));
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    report.schemaRemoved=(await pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount===0;
   });
  }
  await attempt('poolEnd',async()=>{
   let endTimer;
   try{
    await Promise.race([
     pool.end().then(()=>{
      poolEnded=Boolean(pool.ended);
     }),
     new Promise((_,reject)=>{
      endTimer=setTimeout(()=>{
       inspectorFailureCount++;
       inspectorHealthy=false;
       recordSafeFailure({code:'ETIMEDOUT',name:'TimeoutError'});
       reject(new Error('Pool end timed out'));
      },5000);
      if(endTimer.unref)endTimer.unref();
     })
    ]);
   }finally{
    clearTimeout(endTimer);
   }
  });
 }
 await attempt('cleanupReport',async()=>{
  fs.writeFileSync(`${evidence}/cleanup.json`,JSON.stringify(report,null,2)+'\n');
 });
 await attempt('inspectorLifecycleReport',async()=>{
  const isHealthy=Boolean(
   inspectorHealthy&&
   inspectorFailureCount===0&&
   inspectorWriteFailureCount===0&&
   inspectorReserved&&
   inspectorReleased&&
   actualSocketEnded&&
   poolEnded
  );
  const lifecycleEvidence={
   recordedAt:new Date().toISOString(),
   backendPid:inspectorPid,
   reserved:inspectorReserved,
   released:inspectorReleased,
   actualSocketEnded,
   poolEnded,
   failureCount:inspectorFailureCount,
   writeFailureCount:inspectorWriteFailureCount,
   healthy:isHealthy,
   poolTotalCount:pool?.totalCount??0,
   poolIdleCount:pool?.idleCount??0,
   poolWaitingCount:pool?.waitingCount??0
  };
  try{
   fs.writeFileSync(`${evidence}/inspector-lifecycle.json`,JSON.stringify(lifecycleEvidence,null,2)+'\n');
  }catch(writeErr){
   inspectorWriteFailureCount++;
   inspectorHealthy=false;
   throw writeErr;
  }
 });
 const settlementComplete=Boolean(
  inspectorHealthy&&
  inspectorFailureCount===0&&
  inspectorWriteFailureCount===0&&
  inspectorReleased&&
  actualSocketEnded&&
  poolEnded
 );
 if(inspectorReserved&&!settlementComplete){
  errors.push(new Error(`Inspector settlement incomplete: healthy=${inspectorHealthy}, failures=${inspectorFailureCount}, writeFailures=${inspectorWriteFailureCount}, released=${inspectorReleased}, socketEnded=${actualSocketEnded}, poolEnded=${poolEnded}`));
 }
 if(errors.length===1){
  throw errors[0];
 }
 if(errors.length>1){
  throw new AggregateError(errors,`Multiple cleanup operations failed (${errors.length})`);
 }
}
try{
 async function availablePort(){const reservation=reservePort();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));return port;}
 const port=await availablePort(),apiPort=await availablePort(),origin=`http://127.0.0.1:${port}`;
 const scoped=new URL(env.DATABASE_URL);scoped.searchParams.set('options',`-c search_path=${schema}`);namespace=createHash('sha256').update(JSON.stringify([scoped.host,scoped.pathname,scoped.searchParams.get('options')])).digest('hex').slice(0,16);
 mark('database');pool=new pg.Pool({connectionString:scoped.href,max:20,connectionTimeoutMillis:5000});await pool.query(`CREATE SCHEMA "${schema}"`);created=true;
 await migrate(drizzle(pool),{migrationsFolder:path.resolve('packages/database/migrations'),migrationsSchema:schema});const games=await tables.seedGames(drizzle(pool,{schema:tables})),game=games.find(g=>g.title==='Valorant');assert(game);
 const actors={};
 for(const [key,name]of Object.entries({sender:'Hoàng Nam',receiver:'Linh',denied:'Quang Duy',third:'Minh Anh',fourth:'Bảo',viewer:'Hà'})){
  const id=randomUUID(),token=randomUUID();
  await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[id,name,`t30-${id}@fixture.invalid`]);
  await pool.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$2)',[id,name]);
  await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)',[randomUUID(),id,game.id]);
  await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[randomUUID(),id,token]);
  actors[key]={id,name,cookie:`${token}.${await makeSignature(token,secret)}`};
 }
 inspectorClient=await pool.connect();
 inspectorReserved=true;
 inspectorHealthy=true;
 inspectorPid=Number(inspectorClient.processID);
 inspectorClient.on('error',err=>{
  inspectorHealthy=false;
  inspectorFailureCount++;
  recordSafeFailure(err);
 });
 inspectorClient.on('end',()=>{
  actualSocketEnded=true;
  if(!inspectorExpectedEnd){
   inspectorHealthy=false;
   inspectorFailureCount++;
   recordSafeFailure({code:'UNEXPECTED_CLIENT_END',name:'SocketEndError'});
  }
 });
 mark('redis');redis=new Redis(env.REDIS_URL,{connectTimeout:5000,retryStrategy:()=>null});await redis.ping();
 mark('media');fixture=await startGatewayFixture({databaseURL:scoped.href,key:env.LIVEKIT_API_KEY,secret:env.LIVEKIT_API_SECRET,origin,turnTcp:true,webhookUrl:`http://host.docker.internal:${apiPort}/api/media/webhook`});
 Object.assign(process.env,env,{DATABASE_URL:scoped.href,BETTER_AUTH_SECRET:secret,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,LIVEKIT_SERVER_URL:fixture.server,LIVEKIT_ADMISSION_URL:fixture.ws,FG_UPLOADS_DIR:path.resolve('.runtime/t30/uploads')});delete process.env.ADMIN_USER_IDS;delete process.env.ADMIN_DISCORD_IDS;
 mark('api');const {startLinuxApi}=await import('./linux-api-container-helper6.mjs');app=await startLinuxApi({environment:{...process.env},apiPort,evidence,media:fixture});namespace=app.namespace;const api=app.api;
 sfu=new RoomServiceClient(fixture.server,env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET);
 async function post(route,actor,body){const response=await fetch(`${api}/api/v1/${route}`,{method:'POST',headers:{Cookie:`better-auth.session_token=${actor.cookie}`,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body??{})});assert([200,201].includes(response.status),`Fixture ${route.split('/')[0]} status ${response.status}`);return response.json();}
 const card=await post('recruitments',actors.sender,{gameId:game.id,gameTitle:game.title,title:'Chơi cùng bạn',mode:'ranked',playerCapacity:2,timingType:'now'}),roomId=card.roomId;
 const play=(await pool.query('SELECT id FROM play_sessions WHERE room_id=$1',[roomId])).rows[0];assert(play);
 await post(`play-sessions/${play.id}/start`,actors.sender);
 for(const actor of Object.entries(actors).filter(([key])=>key!=='sender').map(([,actor])=>actor)){
  await pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,'MEMBER')",[randomUUID(),roomId,actor.id]);
  const room=(await pool.query('SELECT conversation_id FROM rooms WHERE id=$1',[roomId])).rows[0];await pool.query('INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3)',[randomUUID(),room.conversation_id,actor.id]);
 }
 const other=await post('rooms',actors.receiver,{name:'Phòng thứ hai',gameId:game.id,gameTitle:game.title,visibility:'PRIVATE',playerCapacity:2});
 mark('web');
 const build=JSON.parse(fs.readFileSync('quality/evidence/T30/codex-t30-build-4.json','utf8'));
 assert.equal(build.exitCode,0);
 const review=JSON.parse(fs.readFileSync('quality/evidence/T30/t30-build-4-index-review.json','utf8'));
 assert.equal(review.afterSha256,"d3b795cf78814b7835d36a9f5f744bea11366c02c32e5bdc44c8ab2f4f13f8ec");
 assert.equal(createHash('sha256').update(fs.readFileSync('apps/web/dist/index.html')).digest('hex'),review.afterSha256);
 const pinnedAssets=[{"path":"apps/web/dist/assets/index-Db-qa7Fx.js","sha256":"449fae01509c5df05f120f81b7033cebba23942146153b61aac12006fb54ad63"},{"path":"apps/web/dist/assets/index-Dr0NL-IN.css","sha256":"4b56270bfbb4ae498b170d8d2141ecaa82503a13f1653e897b8cf614053ba51b"},{"path":"apps/web/dist/assets/media-B05Mq9Gp.js","sha256":"2051e70b3aff5bdfa8c489350e0e2bb69f24542746c2189e734f9c810ac6b276"}];
 const chunks=JSON.parse(fs.readFileSync('quality/evidence/T30/web-screen-codec-chunk-review1.json','utf8'));
 assert.deepEqual(chunks.assets.map(({path,sha256})=>({path,sha256})),pinnedAssets);
 assert.equal(review.activeAssets.length,2);
 for(const asset of review.activeAssets)assert(pinnedAssets.some(p=>p.path===asset.path&&p.sha256===asset.sha256));
 for(const asset of pinnedAssets){assert(asset.path.startsWith('apps/web/dist/assets/'));assert.equal(createHash('sha256').update(fs.readFileSync(asset.path)).digest('hex'),asset.sha256);}
 const {preview,loadConfigFromFile}=await import(pathToFileURL(path.resolve('apps/web/node_modules/vite/dist/node/index.js')).href);
 const loaded=await loadConfigFromFile({command:'serve',mode:'production'},path.resolve('apps/web/vite.config.ts'));assert(loaded);
 const {fgSecurityHeadersPlugin}=await import(pathToFileURL(path.resolve('apps/web/security-headers.mjs')).href);
 const plugins=loaded.config.plugins.map(p=>p?.name==='fg-security-headers'?fgSecurityHeadersPlugin([origin,fixture.server,fixture.ws]):p);
 assert(loaded.config.plugins.some(p=>p?.name==='fg-security-headers'));
 const previewServer=await preview({
  ...loaded.config,
  plugins,
  configFile:false,
  root:path.resolve('apps/web'),
  server:{host:'127.0.0.1',port,strictPort:true,proxy:{'/api':api,'/socket.io':{target:api,ws:true}}},
  preview:{host:'127.0.0.1',port,strictPort:true,proxy:{'/api':api,'/socket.io':{target:api,ws:true}}}
 });
 web={
  httpServer:previewServer.httpServer,
  close:()=>new Promise((resolve,reject)=>{
   previewServer.httpServer.close(err=>{
    if(!err||err.code==='ERR_SERVER_NOT_RUNNING')resolve();
    else reject(err);
   });
  })
 };
 web.httpServer.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 process.send?.({kind:'ready',origin,actors,roomId,otherRoomId:other.id,turnPort:fixture.turnPort,inspectorPid});
 process.on('message',async message=>{
  if(message.kind==='shape')try{assert(fixture.shaperControl);const response=await fetch(fixture.shaperControl+'/shape',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message.policy)});assert.equal(response.status,200);process.send?.({id:message.id,...await response.json()});}catch{process.send?.({id:message.id,failed:true});}
  if(message.kind==='shaping-stats')try{assert(fixture.shaperControl);const response=await fetch(fixture.shaperControl+'/stats');assert.equal(response.status,200);process.send?.({id:message.id,...await response.json()});}catch{process.send?.({id:message.id,failed:true});}
  if(message.kind==='inspect')try{
   if(!inspectorHealthy||!inspectorClient||inspectorReleased||inspectorFailureCount>0)throw new Error('Inspector client unavailable');
   const state=(await inspectorClient.query(`SELECT (SELECT count(*)::int FROM rooms WHERE id=$1) rooms,(SELECT count(*)::int FROM room_members WHERE room_id=$1) members,(SELECT state FROM play_sessions WHERE id=$2) play_state,(SELECT count(*)::int FROM active_play_slots WHERE play_session_id=$2) play_slots,(SELECT count(*)::int FROM call_members WHERE room_id=$1 AND left_at IS NULL) callers,(SELECT count(*)::int FROM call_groups WHERE room_id=$1 AND state='OPEN') open_calls`,[roomId,play.id])).rows[0];
   const people=(await inspectorClient.query('SELECT user_id,is_muted FROM call_members WHERE room_id=$1 AND left_at IS NULL',[roomId])).rows;
   const native=await sfu.listRooms();let audio=0;const nativeTracks=[];for(const room of native)for(const person of await sfu.listParticipants(room.name)){audio+=person.tracks.filter(t=>t.type===0&&!t.muted).length;for(const track of person.tracks)nativeTracks.push({identity:person.identity,sid:track.sid,type:track.type,source:track.source,muted:track.muted});}const slots=(await inspectorClient.query('SELECT count(*)::int AS count FROM call_publish_slots')).rows[0].count;
   process.send?.({id:message.id,...state,people,nativeUnmutedAudioTracks:audio,nativeTracks,publisherSlots:slots,inspectorPid});
  }catch(error){
   inspectorFailureCount++;
   inspectorHealthy=false;
   const safeName=sanitizeName(error?.name);
   const safeCode=sanitizeCode(error?.code);
   try{
    const failure={
     recordedAt:new Date().toISOString(),
     backendPid:inspectorPid,
     name:safeName,
     code:safeCode
    };
    fs.appendFileSync(`${evidence}/inspection-failures.jsonl`,JSON.stringify(failure)+'\n');
   }catch{
    inspectorWriteFailureCount++;
   }
   process.send?.({
    id:message.id,
    failed:true,
    name:safeName,
    code:safeCode
   });
  }
  if(message.kind==='stop')try{await cleanup();process.exit(0);}catch(error){
   const safeName=sanitizeName(error?.name);
   const safeCode=sanitizeCode(error?.code);
   try{
    fs.writeFileSync(`${evidence}/cleanup-failure.json`,JSON.stringify({
     recordedAt:new Date().toISOString(),
     name:safeName,
     code:safeCode==='UNKNOWN'?'CLEANUP_FAILED':safeCode,
     failureCount:inspectorFailureCount,
     writeFailureCount:inspectorWriteFailureCount
    })+'\n');
   }catch{}
   process.exit(1);
  }
 });
}catch(error){
 await cleanup().catch(()=>{});
 process.send?.({
  kind:'failed',
  phase,
  name:error.name,
  code:error.code,
  table:error.table,
  column:error.column,
  constraint:error.constraint,
  message:String(error.message).replaceAll(env.LIVEKIT_API_SECRET,'[REDACTED]').replaceAll(env.DATABASE_URL,'[REDACTED]')
 });
 process.exit(1);
}
