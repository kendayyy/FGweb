import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import pg from 'pg';
import Redis from 'ioredis';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {NestFactory} from '@nestjs/core';
import {preview} from 'vite';
import {chromium} from '@playwright/test';
import {makeSignature} from 'better-auth/crypto';
import * as tables from '@fg/database';

export async function createNativeHarness(){
 const savedEnv={...process.env};
 const env=parseEnv(fs.readFileSync('.env.local','utf8'));
 const schema=`t19_fe_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
 const secret='t19-fe-owned-native-test-secret-at-least-32-chars';
 let app,web,browser,pool,redis,created=false,ns='';
 const cleanup=async()=>{
  const errors=[]; const attempt=async fn=>{try{await fn();}catch(e){errors.push(e);}};
  if(browser)await attempt(()=>browser.close());
  if(web)await attempt(()=>new Promise((resolve,reject)=>web.httpServer.close(e=>e?reject(e):resolve())));
  if(app)await attempt(()=>app.close());
  if(redis){await attempt(async()=>{if(ns){const keys=await redis.keys(`fg:presence:${ns}:*`);if(keys.length)await redis.del(...keys);assert.equal((await redis.keys(`fg:presence:${ns}:*`)).length,0);}await redis.quit();});}
  if(pool){await attempt(async()=>{if(created){assert(/^t19_fe_[0-9]+_[a-z0-9]+$/.test(schema));await pool.query(`DROP SCHEMA "${schema}" CASCADE`);}assert.equal((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[schema])).rowCount,0);});await attempt(()=>pool.end());}
  process.env=savedEnv;
  if(errors.length)throw new AggregateError(errors,'Owned native cleanup failed');
 };
 try{
  const scoped=new URL(env.DATABASE_URL); scoped.searchParams.set('options',`-c search_path=${schema}`);
  ns=createHash('sha256').update(JSON.stringify([scoped.host,scoped.pathname,scoped.searchParams.get('options')??''])).digest('hex').slice(0,16);
  pool=new pg.Pool({connectionString:scoped.href,max:5,connectionTimeoutMillis:5000,statement_timeout:10000});
  await pool.query(`CREATE SCHEMA "${schema}"`);created=true;
  const client=await pool.connect();try{await migrate(drizzle(client),{migrationsFolder:path.resolve('packages/database/migrations'),migrationsSchema:schema});}finally{client.release();}
  const games=await tables.seedGames(drizzle(pool,{schema:tables}));
  for(const [i,g]of games.entries())await pool.query("INSERT INTO conversations(id,kind,lobby_id) VALUES($1,'LOBBY',$2)",[`native-t19-lobby-${i}`,g.lobbyId]);
  for(const [id,name]of [['native-a','Nam'],['native-b','Linh'],['native-c','Hải']]){
   await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[id,name,`${id}@example.test`]);
   await pool.query("INSERT INTO account(id,account_id,provider_id,user_id,created_at,updated_at) VALUES($1,$1,'discord',$2,now(),now())",[`acc-${id}`,id]);
   await pool.query("INSERT INTO profiles(user_id,display_name,custom_status) VALUES($1,$2,'JUST_CHATTING')",[id,name]);
   await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)',[`gi-${id}`,id,games[0].id]);
   await pool.query('INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval \'1 day\',now(),now())',[`sess-${id}`,id,`token-${id}`]);
  }
  redis=new Redis(env.REDIS_URL,{lazyConnect:true});await redis.connect();
  const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(e=>e?reject(e):resolve(p));});});
  const base=`http://127.0.0.1:${port}`;
  Object.assign(process.env,env,{DATABASE_URL:scoped.href,BETTER_AUTH_SECRET:secret,PUBLIC_ORIGIN:base,BETTER_AUTH_URL:base,FG_UPLOADS_DIR:path.resolve('.runtime',schema)});
  const {AppModule}=await import('../../../apps/api/dist/app.module.js');
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});await app.listen(0,'127.0.0.1');const api=await app.getUrl();
  web=await preview({root:path.resolve('apps/web'),configFile:path.resolve('apps/web/vite.config.ts'),preview:{host:'127.0.0.1',port,strictPort:true,proxy:{'/api':api,'/socket.io':{target:api,ws:true}}}});
  browser=await chromium.launch({headless:true});
  const context=async(id,viewport={width:1440,height:900})=>{const c=await browser.newContext({viewport});if(id)await c.addCookies([{name:'better-auth.session_token',value:`token-${id}.${await makeSignature(`token-${id}`,secret)}`,url:base,httpOnly:true,sameSite:'Lax'}]);return c;};
  return {base,pool,games,schema,browser,context,cleanup};
 }catch(e){try{await cleanup();}catch(cleanupError){throw new AggregateError([e,cleanupError],'Native setup and cleanup failed',{cause:e});}throw e;}
}
