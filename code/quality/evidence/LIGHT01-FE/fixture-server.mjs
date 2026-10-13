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
const origin=`http://localhost:${process.env.FG_THEME_WEB_PORT}`,secret='theme-isolated-native-session-secret-32-characters',schema=`theme_${randomUUID().replaceAll('-','')}`;
let pool,redis,app,web,created=false,namespace='';const sockets=new Set();
async function cleanup(){
 if(app)await app.close();
 if(web){for(const socket of sockets)socket.destroy();await new Promise(resolve=>web.httpServer.close(resolve));}
 if(redis){const keys=await redis.keys(`fg:presence:${namespace}:*`);if(keys.length)await redis.del(...keys);await redis.quit();}
 if(pool){if(created){assert(/^theme_[a-f0-9]{32}$/.test(schema));await pool.query(`DROP SCHEMA "${schema}" CASCADE`);}await pool.end();}
}
try{
 const scoped=new URL(env.DATABASE_URL);scoped.searchParams.set('options',`-c search_path=${schema}`);namespace=createHash('sha256').update(JSON.stringify([scoped.host,scoped.pathname,scoped.searchParams.get('options')])).digest('hex').slice(0,16);
 pool=new pg.Pool({connectionString:scoped.href,max:8,connectionTimeoutMillis:5000});await pool.query(`CREATE SCHEMA "${schema}"`);created=true;
 await migrate(drizzle(pool),{migrationsFolder:path.resolve('packages/database/migrations'),migrationsSchema:schema});const games=await tables.seedGames(drizzle(pool,{schema:tables}));
 const id=randomUUID(),token=randomUUID(),email=`theme-${id}@fixture.invalid`;
 await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[id,'Theme Gamer',email]);
 await pool.query('INSERT INTO account(id,user_id,provider_id,account_id,created_at,updated_at) VALUES($1,$2,$3,$4,now(),now())',[randomUUID(),id,'discord',`theme-${id}`]);
 await pool.query('INSERT INTO profiles(user_id,display_name,bio) VALUES($1,$2,$3)',[id,'Theme Gamer','Theme isolated test']);
 await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)',[randomUUID(),id,games[0].id]);
 await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[randomUUID(),id,token]);
 redis=new Redis(env.REDIS_URL);await redis.ping();
 Object.assign(process.env,env,{DATABASE_URL:scoped.href,BETTER_AUTH_SECRET:secret,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,FG_UPLOADS_DIR:path.resolve('.runtime/theme/uploads')});delete process.env.ADMIN_USER_IDS;delete process.env.ADMIN_DISCORD_IDS;
 const {AppModule}=await import('../../../apps/api/dist/app.module.js');app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});await app.listen(0,'127.0.0.1');const api=await app.getUrl();
 const {RealtimeGateway}=await import('../../../apps/api/dist/modules/realtime/realtime.gateway.js');const gateway=app.get(RealtimeGateway);
 const {preview}=await import(pathToFileURL(path.resolve('apps/web/node_modules/vite/dist/node/index.js')).href);
 web=await preview({configFile:path.resolve('apps/web/vite.config.ts'),root:path.resolve('apps/web'),preview:{host:'127.0.0.1',port:Number(process.env.FG_THEME_WEB_PORT),strictPort:true,proxy:{'/api':api,'/socket.io':{target:api,ws:true}}}});
 web.httpServer.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 process.send({kind:'ready',identity:{id,cookie:`${token}.${await makeSignature(token,secret)}`}});
 process.on('message',async message=>{
  if(message.kind==='sockets')process.send({id:message.id,socketIds:[...gateway.server.sockets.sockets.keys()]});
  if(message.kind==='stop'){try{await cleanup();process.exit(0);}catch{process.exit(1);}}
 });
}catch{await cleanup().catch(()=>{});process.send?.({kind:'failed'});process.exit(1);}
