import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import pg from 'pg';
import Redis from 'ioredis';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {NestFactory} from '@nestjs/core';
import {makeSignature} from 'better-auth/crypto';
import {io} from 'socket.io-client';
import * as tables from '@fg/database';

// Reviewer fixture: real compiled AppModule, migrated isolated PostgreSQL and real sessions.
export async function createInvitationsHarness(){
 const env=parseEnv(fs.readFileSync('.env.local','utf8'));
 const schema=`t23_review_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
 const secret='t23-owned-review-secret-at-least-32-characters';
 const saved={...process.env};
 let app,pool,redis,created=false,ns='';const sockets=[];
 const cleanup=async()=>{
  const errors=[];const attempt=async fn=>{try{await fn();}catch(e){errors.push(e);}};
  for(const socket of sockets)socket.disconnect();
  if(app)await attempt(()=>app.close());
  if(redis)await attempt(async()=>{if(ns){const keys=await redis.keys(`fg:presence:${ns}:*`);if(keys.length)await redis.del(...keys);assert.equal((await redis.keys(`fg:presence:${ns}:*`)).length,0);}await redis.quit();});
  if(pool){await attempt(async()=>{if(created){assert(/^t23_review_[0-9]+_[a-z0-9]+$/.test(schema));await pool.query(`DROP SCHEMA "${schema}" CASCADE`);}assert.equal((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[schema])).rowCount,0);});await attempt(()=>pool.end());}
  process.env=saved;
  if(errors.length)throw new AggregateError(errors,'Owned rooms fixture cleanup failed');
 };
 try{
  const scoped=new URL(env.DATABASE_URL);scoped.searchParams.set('options',`-c search_path=${schema}`);
  ns=createHash('sha256').update(JSON.stringify([scoped.host,scoped.pathname,scoped.searchParams.get('options')??''])).digest('hex').slice(0,16);
  pool=new pg.Pool({connectionString:scoped.href,max:8,connectionTimeoutMillis:5000,statement_timeout:10000});
  await pool.query(`CREATE SCHEMA "${schema}"`);created=true;
  const client=await pool.connect();try{await migrate(drizzle(client),{migrationsFolder:path.resolve('packages/database/migrations'),migrationsSchema:schema});}finally{client.release();}
  const games=await tables.seedGames(drizzle(pool,{schema:tables}));
  for(const [id,name]of [['review-a','Nam'],['review-b','Linh'],['review-c','Hải'],['review-d','Minh']]){
   await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[id,name,`${id}@example.test`]);
   await pool.query("INSERT INTO profiles(user_id,display_name,custom_status) VALUES($1,$2,'JUST_CHATTING')",[id,name]);
   await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)',[`gi-${id}`,id,games[0].id]);
   await pool.query('INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval \'1 day\',now(),now())',[`sess-${id}`,id,`token-${id}`]);
  }
  redis=new Redis(env.REDIS_URL,{lazyConnect:true});await redis.connect();
  Object.assign(process.env,env,{DATABASE_URL:scoped.href,BETTER_AUTH_SECRET:secret,PUBLIC_ORIGIN:'http://localhost:5173',BETTER_AUTH_URL:'http://localhost:5173',FG_UPLOADS_DIR:path.resolve('.runtime',schema)});
  const {AppModule}=await import('../../../apps/api/dist/app.module.js');
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  const cookies=new Map();for(const id of ['review-a','review-b','review-c','review-d'])cookies.set(id,`better-auth.session_token=token-${id}.${await makeSignature(`token-${id}`,secret)}`);
  const call=async(method,route,id,body,origin='http://localhost:5173')=>{
   const headers={Origin:origin,...id?{Cookie:cookies.get(id)}:{},...body!==undefined?{'Content-Type':'application/json'}:{}};
   const r=await fetch(`${base}/api/v1${route}`,{method,headers,...body!==undefined?{body:JSON.stringify(body)}:{}});
   const raw=await r.text();return {status:r.status,body:raw?JSON.parse(raw):null};
  };
  const socket=async(id)=>{
   const s=io(base,{transports:['websocket'],extraHeaders:{Origin:'http://localhost:5173',...id?{Cookie:cookies.get(id)}:{}}});sockets.push(s);
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Owned socket connection timed out')),5000);s.once('connect',()=>{clearTimeout(timer);resolve();});s.once('connect_error',e=>{clearTimeout(timer);reject(e);});});return s;
  };
  return {base,pool,games,schema,call,socket,cleanup};
 }catch(e){try{await cleanup();}catch(c){throw new AggregateError([e,c],'Rooms fixture setup and cleanup failed',{cause:c});}throw e;}
}
