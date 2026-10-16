# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: feed.spec.ts >> T38-FEED-FE actual multi-account Feed, image lifecycle, responsive layout and moderation
- Location: tests\e2e\feed.spec.ts:2:1

# Error details

```
Error: Owned fixture operation deadline
```

# Test source

```ts
  1  | import {Redis} from 'ioredis';
  2  | import 'reflect-metadata';
  3  | import fs from 'node:fs';
  4  | import path from 'node:path';
  5  | import assert from 'node:assert/strict';
  6  | import {createRequire} from 'node:module';
  7  | import {randomUUID} from 'node:crypto';
  8  | import {parseEnv} from 'node:util';
  9  | import pg from 'pg';
  10 | import {drizzle} from 'drizzle-orm/node-postgres';
  11 | import {migrate} from 'drizzle-orm/node-postgres/migrator';
  12 | import {makeSignature} from 'better-auth/crypto';
  13 | import express from 'express';
  14 | import {fork} from 'node:child_process';
  15 | import {ALLOWED_GAMES} from '@fg/contracts';
  16 | 
  17 | // Synthetic owned credentials travel only in this process, never in public evidence.
  18 | // Actual compiled AppModule, migrations, SessionGuard, PostgreSQL and Redis are used.
  19 | async function startNativeFixture(runId,evidence){
  20 |   assert(/^feed-fe-[a-z0-9-]+$/.test(runId));
  21 |   const require=createRequire(import.meta.url),{NestFactory}=require('@nestjs/core');
  22 |   const {AppModule}=require('../../../apps/api/dist/app.module.js');
  23 |   const {hashFgPassword}=require('../../../apps/api/dist/modules/auth/auth-password.js');
  24 |   const saved={...process.env},env=parseEnv(fs.readFileSync('.env.local','utf8'));
  25 |   const unique=randomUUID().replaceAll('-',''),schema='t38_feed_fe_headed_'+unique;
  26 |   const runtime=path.resolve('.runtime/t38-feed-fe',unique),url=new URL(env.DATABASE_URL);
  27 |   const secret=randomUUID()+randomUUID(),actors={},prefix='fg:feed:ui:'+unique,quota=new Redis(env.REDIS_URL,{lazyConnect:true,enableOfflineQueue:false,maxRetriesPerRequest:0,connectTimeout:3000,retryStrategy:()=>null});quota.on('error',()=>undefined);
  28 |   url.searchParams.set('options','-c search_path='+schema);
  29 |   const pool=new pg.Pool({connectionString:url.href,max:8,connectionTimeoutMillis:5000,statement_timeout:15000});
  30 |   let app,created=false,closed=false;
  31 |   fs.mkdirSync(runtime,{recursive:true});
  32 |   async function close(){
  33 |     if(closed)return;closed=true;
  34 |     const cleanup={appClosed:false,schemaRemoved:!created,poolEnded:false,runtimeRemoved:false,redisKeysRemoved:false,redisClosed:false};
  35 |     try{await app?.close();cleanup.appClosed=true;await quota.connect();let cursor='0';const keys=[];do{const found=await quota.scan(cursor,'MATCH',prefix+':*','COUNT',100);cursor=found[0];keys.push(...found[1]);}while(cursor!=='0');assert(keys.every(key=>key.startsWith(prefix+':')));if(keys.length)await quota.del(...keys);cleanup.redisKeysRemoved=(await quota.keys(prefix+':*')).length===0;await quota.quit();cleanup.redisClosed=true;}
  36 |     finally{
  37 |       try{if(created){assert(/^t38_feed_fe_headed_[a-f0-9]{32}$/.test(schema));await pool.query('DROP SCHEMA "'+schema+'" CASCADE');cleanup.schemaRemoved=(await pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount===0;}}
  38 |       finally{await pool.end();cleanup.poolEnded=true;assert.equal(path.dirname(runtime),path.resolve('.runtime/t38-feed-fe'));if(fs.existsSync(runtime)){assert.equal(fs.realpathSync(runtime),runtime);fs.rmSync(runtime,{recursive:true,maxRetries:5,retryDelay:250});}cleanup.runtimeRemoved=!fs.existsSync(runtime);process.env=saved;fs.writeFileSync(evidence+'/fixture-cleanup.json',JSON.stringify({at:new Date().toISOString(),schema,cleanup,mainMigration:false},null,2)+'\n',{flag:'wx'});}
  39 |     }
  40 |     assert(Object.values(cleanup).every(Boolean),'Owned fixture cleanup incomplete');
  41 |   }
  42 |   try{
  43 |     await pool.query('CREATE SCHEMA "'+schema+'"');created=true;
  44 |     await migrate(drizzle(pool),{migrationsFolder:'packages/database/migrations',migrationsSchema:schema});
  45 |     const games=[];
  46 |     for(const title of ALLOWED_GAMES){const id=randomUUID(),lobby=randomUUID();await pool.query('INSERT INTO games(id,title) VALUES($1,$2)',[id,title]);await pool.query('INSERT INTO lobbies(id,game_id,name) VALUES($1,$2,$3)',[lobby,id,'Lobby '+title]);games.push({id,title,lobby});}
  47 |     for(const key of ['admin','owner','other']){
  48 |       const id=randomUUID(),token=randomUUID(),name=key==='admin'?'kingame':'FG '+(key==='owner'?'Test Owner':'Test Peer');
  49 |       await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[id,name,key+'@feed-fe.fixture.invalid']);
  50 |       await pool.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$2)',[id,name]);
  51 |       await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)',[randomUUID(),id,games[0].id]);
  52 |       await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 hour',now(),now())",[randomUUID(),id,token]);
  53 |       actors[key]={id,cookie:token+'.'+await makeSignature(token,secret)};
  54 |     }
  55 |     await pool.query("INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES($1,$2,'credential',$2,$3,now(),now())",[randomUUID(),actors.admin.id,await hashFgPassword('Fixture!'+randomUUID())]);
  56 |     Object.assign(process.env,env,{DATABASE_URL:url.href,BETTER_AUTH_SECRET:secret,ADMIN_USER_IDS:actors.admin.id,LIVEKIT_SERVER_URL:'',LIVEKIT_ADMISSION_URL:'',FG_UPLOADS_DIR:path.join(runtime,'uploads'),FG_CRYPTO_OBJECTS_DIR:path.join(runtime,'objects'),FG_FEED_REDIS_PREFIX:prefix});delete process.env.ADMIN_DISCORD_IDS;
  57 |     // Reserve an ephemeral loopback listener before configuring exact trusted origin.
  58 |     const net=await import('node:net'),reservation=net.createServer();await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  59 |     const origin='http://localhost:'+port;process.env.PUBLIC_ORIGIN=origin;process.env.BETTER_AUTH_URL=origin;
  60 |     app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});
  61 |     const http=app.getHttpAdapter().getInstance(),build=path.resolve('quality/evidence/T38-FEED-FE/web-build1');
  62 |     assert(fs.existsSync(build+'/index.html'),'Owned source-pinned frontend build required');
  63 |     http.use(express.static(build,{index:false}));
  64 |     http.use((req,res,next)=>{if(req.method==='GET'&&!req.path.startsWith('/api/')&&!req.path.startsWith('/socket.io/')){res.setHeader('Cache-Control','no-store');res.sendFile(build+'/index.html');}else next();});
  65 |     await app.listen(port,'127.0.0.1');
  66 |     fs.writeFileSync(evidence+'/fixture-setup.json',JSON.stringify({at:new Date().toISOString(),schema,origin,actualCompiledApp:true,actualPostgresRedis:true,syntheticVerifiedSoleAdmin:true,actualKingameProvisioned:false,mainMigration:false,productionActivation:false},null,2)+'\n',{flag:'wx'});
  67 |     return{origin,actors,pool,games,close};
  68 |   }catch(error){const redact=value=>{let text=String(value);for(const item of Object.values(env))if(item&&item.length>=8)text=text.split(item).join('[PRIVATE_CONFIG]');return text.replace(/postgres(?:ql)?:[^\s]+/g,'[DATABASE_URL]');};fs.writeFileSync(evidence+'/fixture-failure.json',JSON.stringify({at:new Date().toISOString(),name:error.name,code:error.code,diagnostic:redact(error.message),stack:redact(error.stack)},null,2)+'\n',{flag:'wx'});await close();throw error;}
  69 | }
  70 | 
  71 | if(process.env.FG_FEED_FE_FIXTURE_CHILD==='1'){
  72 |  let fixture;
  73 |  process.once('disconnect',()=>{void fixture?.close().finally(()=>process.exit());});
  74 |  process.on('message',async message=>{try{if(message.kind==='start'){fixture=await startNativeFixture(message.runId,message.evidence);process.send({id:message.id,ok:true,value:{origin:fixture.origin,actors:fixture.actors,games:fixture.games}});}else if(message.kind==='query'){const result=await fixture.pool.query(message.sql,message.params);process.send({id:message.id,ok:true,value:{rows:result.rows,rowCount:result.rowCount}});}else if(message.kind==='stop'){await fixture?.close();process.send({id:message.id,ok:true});process.disconnect();}}catch{process.send({id:message.id,ok:false});if(message.kind==='start'){process.disconnect();process.exitCode=1;}}});
  75 | }
  76 | export async function startFixture(runId,evidence){
  77 |  const child=fork(new URL('./headed-fixture1.mjs',import.meta.url),[],{env:{...process.env,FG_FEED_FE_FIXTURE_CHILD:'1'},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,execArgv:[]});
  78 |  const requests=new Map();let closed=false;
  79 |  child.on('error',()=>{});
  80 |  const exited=new Promise(resolve=>child.once('exit',code=>{closed=true;for(const row of requests.values()){clearTimeout(row.timer);row.reject(new Error('Owned fixture process ended'));}requests.clear();resolve(code);}));
  81 |  child.on('message',message=>{const row=requests.get(message.id);if(!row)return;requests.delete(message.id);clearTimeout(row.timer);if(message.ok)row.resolve(message.value);else row.reject(new Error('Owned fixture operation failed'));});
> 82 |  const rpc=(kind,body={})=>new Promise((resolve,reject)=>{if(closed){reject(new Error('Owned fixture closed'));return;}const id=randomUUID(),timer=setTimeout(()=>{requests.delete(id);reject(new Error('Owned fixture operation deadline'));},30000);requests.set(id,{resolve,reject,timer});child.send({kind,id,...body},error=>{if(!error)return;clearTimeout(timer);requests.delete(id);reject(new Error('Owned fixture IPC unavailable'));});});
     |                                                                                                                                                                                               ^ Error: Owned fixture operation deadline
  83 |  try{const setup=await rpc('start',{runId,evidence});return{...setup,pool:{query:(sql,params)=>rpc('query',{sql,params})},close:async()=>{if(!closed)await rpc('stop');assert.equal(await exited,0,'Owned fixture cleanup process failed');}};}catch(error){if(child.connected)await rpc('stop').catch(()=>{});await exited;throw error;}
  84 | }
  85 | 
```