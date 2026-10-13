import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import Redis from 'ioredis';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import * as tables from '@fg/database';
import {NestFactory} from '@nestjs/core';
import {makeSignature} from 'better-auth/crypto';
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const origin=`http://localhost:${process.env.FG_T25_PORT}`,secret='t25-isolated-native-session-secret-32-characters',schema=`t25_${randomUUID().replaceAll('-','')}`;
let pool,redis,app,web,created=false,namespace='',phase='initialization';const sockets=new Set();
const mark=name=>{phase=name;process.send?.({kind:'phase',name});};
async function cleanup(){
 if(app)await app.close();
 if(web){for(const socket of sockets)socket.destroy();await new Promise(resolve=>web.httpServer.close(resolve));}
 if(redis){const keys=await redis.keys(`fg:presence:${namespace}:*`);if(keys.length)await redis.del(...keys);await redis.quit();}
 if(pool){if(created){assert(/^t25_[a-f0-9]{32}$/.test(schema));await pool.query(`DROP SCHEMA "${schema}" CASCADE`);}await pool.end();}
}
try{
 const scoped=new URL(env.DATABASE_URL);scoped.searchParams.set('options',`-c search_path=${schema}`);namespace=createHash('sha256').update(JSON.stringify([scoped.host,scoped.pathname,scoped.searchParams.get('options')])).digest('hex').slice(0,16);
 mark('database');pool=new pg.Pool({connectionString:scoped.href,max:8,connectionTimeoutMillis:5000});await pool.query(`CREATE SCHEMA "${schema}"`);created=true;
 await migrate(drizzle(pool),{migrationsFolder:path.resolve('packages/database/migrations'),migrationsSchema:schema});const games=await tables.seedGames(drizzle(pool,{schema:tables}));
 const actors={},tokens=new Map();
 for(const [key,name] of Object.entries({owner:'Hoàng Nam',member:'Linh',helper:'Quang Duy',friend:'Minh Anh',extra:'Tuấn'})){
  const id=randomUUID(),token=randomUUID(),email=`t25-${id}@fixture.invalid`;
  await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[id,name,email]);
  await pool.query('INSERT INTO account(id,user_id,provider_id,account_id,created_at,updated_at) VALUES($1,$2,$3,$4,now(),now())',[randomUUID(),id,'discord',`t25-${id}`]);
  await pool.query('INSERT INTO profiles(user_id,display_name,bio) VALUES($1,$2,$3)',[id,name,'Isolated T25 behavioral fixture']);
  await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)',[randomUUID(),id,games[0].id]);
  await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[randomUUID(),id,token]);
  actors[key]={id,name,cookie:`${token}.${await makeSignature(token,secret)}`};tokens.set(token,id);
 }
 // Social preconditions only. Invitations, membership and roster are exercised via real HTTP/UI.
 const actorList=Object.values(actors);for(let a=0;a<actorList.length;a++)for(let b=a+1;b<actorList.length;b++){const pair=[actorList[a].id,actorList[b].id].sort();await pool.query('INSERT INTO friendships(id,user1_id,user2_id) VALUES($1,$2,$3)',[randomUUID(),...pair]);}
 mark('redis');redis=new Redis(env.REDIS_URL,{connectTimeout:5000,retryStrategy:()=>null});await redis.ping();
 Object.assign(process.env,env,{DATABASE_URL:scoped.href,BETTER_AUTH_SECRET:secret,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,FG_UPLOADS_DIR:path.resolve('.runtime/t25/uploads')});delete process.env.ADMIN_USER_IDS;delete process.env.ADMIN_DISCORD_IDS;
 mark('api');const {AppModule}=await import('../../../apps/api/dist/app.module.js');app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});await app.listen(0,'127.0.0.1');const api=await app.getUrl();
 const {RealtimeGateway}=await import('../../../apps/api/dist/modules/realtime/realtime.gateway.js');const gateway=app.get(RealtimeGateway),socketEvents=[];
 gateway.server.on('connection',socket=>{const owner=actors.owner;if(!socket.handshake.headers.cookie?.includes([...tokens.entries()].find(([,id])=>id===owner.id)[0]))return;socketEvents.push({kind:'connected',socketId:socket.id,at:new Date().toISOString()});socket.on('disconnect',reason=>socketEvents.push({kind:'disconnected',socketId:socket.id,reason,at:new Date().toISOString()}));});
 mark('preview');const {preview}=await import(pathToFileURL(path.resolve('apps/web/node_modules/vite/dist/node/index.js')).href);
 web=await preview({configFile:path.resolve('apps/web/vite.config.ts'),root:path.resolve('apps/web'),preview:{host:'127.0.0.1',port:Number(process.env.FG_T25_PORT),strictPort:true,proxy:{'/api':api,'/socket.io':{target:api,ws:true}}}});
 web.httpServer.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 process.send({kind:'ready',actors,games});
 process.on('message',async message=>{
  if(message.kind==='inspect'){
   const row=(await pool.query('SELECT (SELECT count(*)::int FROM rooms WHERE id=$1) AS rooms,(SELECT count(*)::int FROM room_members WHERE room_id=$1) AS members,(SELECT count(*)::int FROM active_play_slots WHERE play_session_id=$2) AS active_slots',[message.roomId,message.playId])).rows[0];
   const ownerToken=[...tokens.entries()].find(([,id])=>id===actors.owner.id)[0];
   process.send({id:message.id,...row,socketIds:[...gateway.server.sockets.sockets.values()].filter(socket=>socket.handshake.headers.cookie?.includes(ownerToken)).map(socket=>socket.id).sort(),socketEvents});
  }
  if(message.kind==='stop'){try{await cleanup();process.exit(0);}catch{process.exit(1);}}
 });
}catch(error){await cleanup().catch(()=>{});process.send?.({kind:'failed',phase,name:error?.name,code:error?.code,table:error?.table,column:error?.column,constraint:error?.constraint});process.exit(1);}
