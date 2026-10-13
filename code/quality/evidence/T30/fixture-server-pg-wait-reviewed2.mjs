import {instrumentOwnedApiPools,getOwnedObservationFailures} from './api-room-owner-observation-reviewed.mjs';
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
import {startGatewayFixture} from './private-gateway-shaped-fixture.mjs';
import {startOwnedPgWaitObservation} from './pg-wait-observation-reviewed2.mjs';
const env=parseEnv(fs.readFileSync('.env.local','utf8')),schema=`t30_screen_${randomUUID().replaceAll('-','')}`,secret=randomUUID()+randomUUID();
const evidence=process.env.FG_T30_EVIDENCE_DIR;
assert(evidence?.startsWith('quality/evidence/T30/'));fs.mkdirSync(evidence,{recursive:true});
instrumentOwnedApiPools(pg,evidence);
const report={schemaRemoved:false,mediaRemoved:false,presenceRemoved:false,appClosed:false,webClosed:false};
let pool,redis,app,web,fixture,created=false,namespace='',phase='port',sfu,stopPgWait;
const sockets=new Set();
const mark=name=>{phase=name;process.send?.({kind:'phase',name});};
async function cleanup(){
 const errors=[];
 async function attempt(name,fn){
  try{await fn();}
  catch{errors.push(new Error(`Cleanup failed: ${name}`));}
 }
 if(stopPgWait){
  await attempt('pgWaitSampler',async()=>{await stopPgWait();});
 }
 if(app){
  await attempt('apiApp',async()=>{await app.close();report.appClosed=true;});
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
 if(pool){
  if(created){
   await attempt('dropSchema',async()=>{
    assert(/^t30_screen_[a-f0-9]{32}$/.test(schema));
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    report.schemaRemoved=(await pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount===0;
   });
  }
  await attempt('poolEnd',async()=>{
   await pool.end();
  });
 }
 await attempt('cleanupReport',async()=>{
  fs.writeFileSync(`${evidence}/cleanup.json`,JSON.stringify(report,null,2)+'\n');
 });
 let observationFailures=0;
 await attempt('apiOwnerHealth',async()=>{
  observationFailures=getOwnedObservationFailures();
  fs.writeFileSync(`${evidence}/api-owner-observation-health.json`,JSON.stringify({recordedAt:new Date().toISOString(),failureCount:observationFailures,observationComplete:observationFailures===0},null,2)+'\n',{flag:'wx'});
 });
 if(observationFailures>0){
  errors.push(new Error('Owned API observations unavailable'));
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
 stopPgWait=startOwnedPgWaitObservation({connectionString:scoped.href,schema,evidence});
 const actors={};
 for(const [key,name]of Object.entries({sender:'Hoàng Nam',receiver:'Linh',denied:'Quang Duy',third:'Minh Anh',fourth:'Bảo',viewer:'Hà'})){
  const id=randomUUID(),token=randomUUID();
  await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[id,name,`t30-${id}@fixture.invalid`]);
  await pool.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$2)',[id,name]);
  await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)',[randomUUID(),id,game.id]);
  await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[randomUUID(),id,token]);
  actors[key]={id,name,cookie:`${token}.${await makeSignature(token,secret)}`};
 }
 mark('redis');redis=new Redis(env.REDIS_URL,{connectTimeout:5000,retryStrategy:()=>null});await redis.ping();
 mark('media');fixture=await startGatewayFixture({databaseURL:scoped.href,key:env.LIVEKIT_API_KEY,secret:env.LIVEKIT_API_SECRET,origin,turnTcp:true,webhookUrl:`http://host.docker.internal:${apiPort}/api/media/webhook`});
 Object.assign(process.env,env,{DATABASE_URL:scoped.href,BETTER_AUTH_SECRET:secret,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,LIVEKIT_SERVER_URL:fixture.server,LIVEKIT_ADMISSION_URL:fixture.ws,FG_UPLOADS_DIR:path.resolve('.runtime/t30/uploads')});delete process.env.ADMIN_USER_IDS;delete process.env.ADMIN_DISCORD_IDS;
 mark('api');const {AppModule}=await import('../../../apps/api/dist/app.module.js');app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});app.use('/api/media/webhook',raw({type:()=>true,limit:'64kb'}));await app.listen(apiPort,'0.0.0.0');const api=`http://127.0.0.1:${apiPort}`;
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
 const build=JSON.parse(fs.readFileSync('quality/evidence/T30/codex-t30-build-1.json','utf8'));
 assert.equal(build.exitCode,0);
 const review=JSON.parse(fs.readFileSync('quality/evidence/T30/t30-build-1-index-review.json','utf8'));
 assert.equal(review.afterSha256,'cb9d6e4d41a834467b8bc01d920ac5f77128c144290be95c02bbab12a233bd90');
 assert.equal(createHash('sha256').update(fs.readFileSync('apps/web/dist/index.html')).digest('hex'),review.afterSha256);
 assert.equal(review.activeAssets?.length,2);
 const allowedAssets=['apps/web/dist/assets/index-D6aTQDz5.js','apps/web/dist/assets/index-Dr0NL-IN.css'];
 assert.deepEqual(review.activeAssets.map(a=>a.path).sort(),allowedAssets.toSorted());
 const fixedAssetHashes={'apps/web/dist/assets/index-D6aTQDz5.js':'4c2027b054ad531524c481b4a2166bb9cac4a5ab2ea6686739c2cd70967aee7f','apps/web/dist/assets/index-Dr0NL-IN.css':'4b56270bfbb4ae498b170d8d2141ecaa82503a13f1653e897b8cf614053ba51b'};
 for(const asset of review.activeAssets){
  assert.equal(asset.sha256,fixedAssetHashes[asset.path]);
  assert(allowedAssets.includes(asset.path));
  assert.equal(createHash('sha256').update(fs.readFileSync(asset.path)).digest('hex'),asset.sha256);
 }
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
 process.send?.({kind:'ready',origin,actors,roomId,otherRoomId:other.id,turnPort:fixture.turnPort});
 process.on('message',async message=>{
  if(message.kind==='shape')try{assert(fixture.shaperControl);const response=await fetch(fixture.shaperControl+'/shape',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message.policy)});assert.equal(response.status,200);process.send?.({id:message.id,...await response.json()});}catch{process.send?.({id:message.id,failed:true});}
  if(message.kind==='shaping-stats')try{assert(fixture.shaperControl);const response=await fetch(fixture.shaperControl+'/stats');assert.equal(response.status,200);process.send?.({id:message.id,...await response.json()});}catch{process.send?.({id:message.id,failed:true});}
  if(message.kind==='inspect')try{
   const state=(await pool.query(`SELECT (SELECT count(*)::int FROM rooms WHERE id=$1) rooms,(SELECT count(*)::int FROM room_members WHERE room_id=$1) members,(SELECT state FROM play_sessions WHERE id=$2) play_state,(SELECT count(*)::int FROM active_play_slots WHERE play_session_id=$2) play_slots,(SELECT count(*)::int FROM call_members WHERE room_id=$1 AND left_at IS NULL) callers,(SELECT count(*)::int FROM call_groups WHERE room_id=$1 AND state='OPEN') open_calls`,[roomId,play.id])).rows[0];
   const people=(await pool.query('SELECT user_id,is_muted FROM call_members WHERE room_id=$1 AND left_at IS NULL',[roomId])).rows;
   const native=await sfu.listRooms();let audio=0;const nativeTracks=[];for(const room of native)for(const person of await sfu.listParticipants(room.name)){audio+=person.tracks.filter(t=>t.type===0&&!t.muted).length;for(const track of person.tracks)nativeTracks.push({identity:person.identity,sid:track.sid,type:track.type,source:track.source,muted:track.muted});}const slots=(await pool.query('SELECT count(*)::int AS count FROM call_publish_slots')).rows[0].count;
   process.send?.({id:message.id,...state,people,nativeUnmutedAudioTracks:audio,nativeTracks,publisherSlots:slots});
  }catch(error){const failure={recordedAt:new Date().toISOString(),name:error.name,code:error.code,column:error.column,table:error.table,message:String(error.message).replaceAll(env.LIVEKIT_API_SECRET,'[REDACTED]').replaceAll(env.DATABASE_URL,'[REDACTED]')};fs.appendFileSync(`${evidence}/inspection-failures.jsonl`,JSON.stringify(failure)+'\n');process.send?.({id:message.id,failed:true,name:error.name,code:error.code});}
  if(message.kind==='stop')try{await cleanup();process.exit(0);}catch(error){fs.writeFileSync(`${evidence}/cleanup-failure.json`,JSON.stringify({name:error.name,code:error.code}));process.exit(1);}
 });
}catch(error){await cleanup().catch(()=>{});process.send?.({kind:'failed',phase,name:error.name,code:error.code,table:error.table,column:error.column,constraint:error.constraint,message:String(error.message).replaceAll(env.LIVEKIT_API_SECRET,'[REDACTED]').replaceAll(env.DATABASE_URL,'[REDACTED]')});process.exit(1);}
