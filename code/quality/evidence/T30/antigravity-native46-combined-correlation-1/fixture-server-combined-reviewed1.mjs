import {createRequire} from 'node:module';
import {instrumentOwnedApiPools,instrumentRoomServiceClient,instrumentOwnedApiServices,instrumentHttpTimingMiddleware,startApiLockSpansObserver} from '../api43-observer-reviewed1.mjs';
import {startOwnedPgWaitObservation} from '../pg-wait-observation-reviewed2.mjs';
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
import {startGatewayFixture} from './private-gateway-observer-combined-reviewed1.mjs';
const env=parseEnv(fs.readFileSync('.env.local','utf8')),schema=`t30_screen_${randomUUID().replaceAll('-','')}`,secret=randomUUID()+randomUUID();
const evidence=process.env.FG_T30_EVIDENCE_DIR;
assert(evidence?.startsWith('quality/evidence/T30/'));fs.mkdirSync(evidence,{recursive:true});
instrumentOwnedApiPools(pg,evidence);const CompiledRoomServiceClient=createRequire(new URL('../../../apps/api/dist/modules/calls/calls.service.js',import.meta.url))('livekit-server-sdk').RoomServiceClient;instrumentRoomServiceClient([RoomServiceClient,CompiledRoomServiceClient],evidence);
const stopApiSpans=startApiLockSpansObserver(evidence);let stopPgWait;
const report={schemaRemoved:false,mediaRemoved:false,presenceRemoved:false,appClosed:false,webClosed:false};
let pool,redis,app,web,fixture,created=false,namespace='',phase='port',sfu;
let inspectorClient,inspectorPid=null,inspectorReserved=false,inspectorReleased=false;
let inspectorExpectedEnd=false,actualSocketEnded=false,poolEnded=false;
let inspectorFailureCount=0,inspectorWriteFailureCount=0,inspectorHealthy=false;
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
 if(stopPgWait)await attempt('pgWaitStop',async()=>{const health=await stopPgWait();if(!health?.observationComplete)throw new Error('Owned PG observation incomplete');});
 if(app){
  await attempt('apiApp',async()=>{await app.close();report.appClosed=true;});
 }
 await attempt('apiSpansStop',async()=>{const health=await stopApiSpans();fs.writeFileSync(evidence+'/api-observer-stop-status.json',JSON.stringify(health,null,2)+'\n',{flag:'wx'});if(!health?.observationComplete)throw new Error('Owned API observation incomplete');});
 if(web){
  await attempt('webSockets',async()=>{for(const socket of sockets)socket.destroy();});
  await attempt('webServer',async()=>{await web.close();report.webClosed=true;});
 }
 if(fixture){
  await attempt('gatewayObserverStop',async()=>{
   if(typeof fixture.stopGatewayObservation==='function'){
    const health=await fixture.stopGatewayObservation(evidence);
    if(!health?.observationComplete)throw new Error('Gateway observation incomplete');
   }
  });
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
 if(inspectorClient){
  await attempt('inspectorRelease',async()=>{
   try{
    inspectorClient.release();
    inspectorReleased=true;
   }catch(err){
    recordSafeFailure(err);
    throw err;
   }
  });
  await attempt('inspectorSocketEnd',async()=>{
   inspectorExpectedEnd=true;
   const socket=inspectorClient?.connection?.stream;
   if(socket&&!socket.destroyed){
    const ended=new Promise(resolve=>{
     socket.once('close',()=>resolve(true));
     socket.once('end',()=>resolve(true));
    });
    try{
     socket.destroy();
     actualSocketEnded=await Promise.race([
      ended,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('SocketEndTimeout')),5000))
     ]);
    }catch(err){
     recordSafeFailure(err);
    }
   }else if(socket?.destroyed){
    actualSocketEnded=true;
   }
  });
 }
 if(pool){
  await attempt('databaseSchema',async()=>{
   if(created){
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    report.schemaRemoved=true;
   }
  });
  await attempt('poolEnd',async()=>{
   await pool.end();
   poolEnded=pool.ended===true;
  });
 }
 inspectorHealthy=Boolean(
  inspectorReserved&&
  inspectorReleased&&
  actualSocketEnded&&
  poolEnded&&
  inspectorFailureCount===0&&
  inspectorWriteFailureCount===0
 );
 fs.writeFileSync(`${evidence}/inspector-lifecycle.json`,JSON.stringify({
  recordedAt:new Date().toISOString(),
  backendPid:inspectorPid,
  reserved:inspectorReserved,
  released:inspectorReleased,
  actualSocketEnded,
  poolEnded,
  failureCount:inspectorFailureCount,
  writeFailureCount:inspectorWriteFailureCount,
  healthy:inspectorHealthy,
  poolTotalCount:pool?.totalCount??null,
  poolIdleCount:pool?.idleCount??null,
  poolWaitingCount:pool?.waitingCount??null
 },null,2)+'\n');
 fs.writeFileSync(`${evidence}/cleanup.json`,JSON.stringify(report,null,2)+'\n');
 if(errors.length)throw new AggregateError(errors,'Cleanup failed');
}
try{
 mark('database');
 const db=new URL(env.DATABASE_URL);db.searchParams.set('options',`-c search_path=${schema}`);
 pool=new pg.Pool({connectionString:db.href,max:16,connectionTimeoutMillis:5000,statement_timeout:15000});
 await pool.query(`CREATE SCHEMA "${schema}"`);created=true;
 await migrate(drizzle(pool),{migrationsFolder:'packages/database/migrations',migrationsSchema:schema});
 await tables.seedGames(drizzle(pool,{schema:tables}));
 const games=(await pool.query('SELECT id, title FROM games')).rows;
 const valorant=games.find(g=>g.title==='Valorant');assert(valorant,'Valorant game required');
 const userIds=['sender','contender','viewer','outsider'];const actors={};
 for(const id of userIds){
  await pool.query('INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES($1, $1, $2, true, now(), now())',[id,`${id}@fixture.invalid`]);
  await pool.query('INSERT INTO profiles(user_id, display_name) VALUES($1, $1)',[id]);
  await pool.query('INSERT INTO game_interests(id, user_id, game_id) VALUES($1, $1, $2)',[id,valorant.id]);
  const token=`tok-${id}`;actors[id]={id,cookie:token};
  await pool.query("INSERT INTO session(id, user_id, token, expires_at, created_at, updated_at) VALUES($1, $2, $3, now() + interval '1 day', now(), now())",[`sess-${id}`,id,token]);
 }
 const convId=`conv_${randomUUID()}`;
 await pool.query("INSERT INTO conversations(id, kind, created_at, updated_at) VALUES($1, 'ROOM', now(), now())",[convId]);
 const roomId=`room_${randomUUID()}`;
 await pool.query(`INSERT INTO rooms(id, name, game_id, owner_id, owner_role, visibility, invite_policy, player_capacity, conversation_id, conversation_kind, created_at, updated_at) VALUES($1, 'Built Screen Room', $2, 'sender', 'OWNER', 'PUBLIC', 'DIRECT_MEMBER', 10, $3, 'ROOM', now(), now())`,[roomId,valorant.id,convId]);
 for(const id of ['sender','contender','viewer'])await pool.query('INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, $3, $4, now())',[`rm_${id}`,roomId,id,id==='sender'?'OWNER':'MEMBER']);
 mark('redis');
 namespace=schema;
 redis=new Redis(env.REDIS_URL,{keyPrefix:`fg:presence:${namespace}:`});
 mark('media');
 const key='screen-key-'+randomUUID(),sfuSecret='screen-secret-'+randomUUID();
 const apiPort=await new Promise(r=>{const s=reservePort();s.listen(0,()=>{const p=s.address().port;s.close(()=>r(p));});});
 const webPort=await new Promise(r=>{const s=reservePort();s.listen(0,()=>{const p=s.address().port;s.close(()=>r(p));});});
 const origin=`http://localhost:${webPort}`;
 fixture=await startGatewayFixture({databaseURL:db.href,key,secret:sfuSecret,origin,turnTcp:true,webhookUrl:`http://host.docker.internal:${apiPort}/api/v1/calls/webhook`});
 sfu=new RoomServiceClient(fixture.server,key,sfuSecret);
 mark('api');
 process.env.DATABASE_URL=db.href;process.env.REDIS_URL=env.REDIS_URL;process.env.PORT=String(apiPort);
 process.env.PUBLIC_ORIGIN=origin;process.env.BETTER_AUTH_URL=origin;process.env.BETTER_AUTH_SECRET=secret;
 process.env.LIVEKIT_SERVER_URL=fixture.server;process.env.LIVEKIT_ADMISSION_URL=fixture.ws;
 process.env.LIVEKIT_API_KEY=key;process.env.LIVEKIT_API_SECRET=sfuSecret;
 const {AppModule}=await import('../../../apps/api/src/app.module.js');
 const {CallsService}=await import('../../../apps/api/src/modules/calls/calls.service.js');
 const {CallLifecycleService}=await import('../../../apps/api/src/modules/calls/call-lifecycle.service.js');
 app=await NestFactory.create(AppModule,{rawBody:true,logger:false,abortOnError:false});
 app.use(raw({type:'*/*',limit:'2mb'}));
 instrumentHttpTimingMiddleware(app);
 instrumentOwnedApiServices(app.get(CallsService),app.get(CallLifecycleService));
 stopPgWait=startOwnedPgWaitObservation(evidence,pool,schema,[
  'rooms',
  'call_groups',
  'call_members',
  'call_admissions',
  'user',
  'session',
  'profiles',
  'call_publish_slots',
  'call_restrictions',
  'room_members',
  'play_sessions',
  'game_interests'
 ]);
 await app.listen(apiPort,'127.0.0.1');
 mark('web');
 const {createServer:createHttpServer}=await import('node:http');
 const {createProxyServer}=await import('http-proxy');
 const proxy=createProxyServer({target:`http://127.0.0.1:${apiPort}`,ws:true,xfwd:true});
 proxy.on('error',()=>null);
 const assetsDir=path.resolve('apps/web/dist');
 web=createHttpServer(async(req,res)=>{
  const url=new URL(req.url??'/',origin);
  if(url.pathname.startsWith('/api/')||url.pathname==='/api'||url.pathname.startsWith('/socket.io/')){
   proxy.web(req,res);return;
  }
  let filePath=path.join(assetsDir,url.pathname==='/'?'index.html':url.pathname);
  if(!fs.existsSync(filePath)||fs.statSync(filePath).isDirectory())filePath=path.join(assetsDir,'index.html');
  const ext=path.extname(filePath);
  const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
  res.setHeader('Content-Type',types[ext]??'application/octet-stream');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(ext==='.html'){
   const sha=createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
   res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self' 'sha256-${sha}'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' ${origin.replace('http','ws')} ${fixture.server} ${fixture.ws}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
  }
  fs.createReadStream(filePath).pipe(res);
 });
 web.on('upgrade',(req,socket,head)=>{
  const url=new URL(req.url??'/',origin);
  if(url.pathname.startsWith('/socket.io/')){proxy.ws(req,socket,head);return;}
  socket.destroy();
 });
 web.on('connection',socket=>{
  sockets.add(socket);
  socket.on('close',()=>sockets.delete(socket));
 });
 await new Promise(r=>web.listen(webPort,'127.0.0.1',r));
 mark('ready');
 inspectorClient=await pool.connect();
 inspectorPid=inspectorClient.processID;
 inspectorReserved=true;
 inspectorClient.on('error',err=>{
  if(!inspectorExpectedEnd){
   recordSafeFailure(err);
  }
 });
 process.send?.({
  kind:'ready',
  origin,
  roomId,
  actors,
  turnPort:fixture.turnPort,
  livekitServer:fixture.server,
  livekitWs:fixture.ws,
  inspectorPid
 });
 process.on('message',async message=>{
  if(message?.kind==='inspect'){
   try{
    const callers=(await inspectorClient.query('SELECT count(*)::int AS count FROM call_members WHERE left_at IS NULL')).rows[0].count;
    const publisherSlots=(await inspectorClient.query('SELECT count(*)::int AS count FROM call_publish_slots WHERE released_at IS NULL')).rows[0].count;
    const roomsCount=(await inspectorClient.query('SELECT count(*)::int AS count FROM rooms')).rows[0].count;
    const people=(await inspectorClient.query('SELECT user_id FROM room_members WHERE room_id=$1',[roomId])).rows;
    const openCalls=(await inspectorClient.query("SELECT count(*)::int AS count FROM call_groups WHERE room_id=$1 AND state='OPEN'",[roomId])).rows[0].count;
    const playState=(await inspectorClient.query('SELECT play_state FROM rooms WHERE id=$1',[roomId])).rows[0]?.play_state??'';
    process.send?.({
     id:message.id,
     inspectorPid,
     callers,
     publisherSlots,
     rooms:roomsCount,
     people,
     open_calls:openCalls,
     play_state:playState
    });
   }catch(err){
    recordSafeFailure(err);
    process.send?.({id:message.id,failed:true,error:sanitizeName(err?.name)});
   }
  }
  if(message?.kind==='stop'){
   try{await cleanup();process.exit(0);}
   catch(err){console.error(err);process.exit(1);}
  }
 });
}catch(err){
 console.error(err);
 mark('failed');
 process.send?.({kind:'failed',phase,error:err?.message});
 await cleanup().catch(()=>null);
 process.exit(1);
}
