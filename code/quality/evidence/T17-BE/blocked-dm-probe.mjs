import 'reflect-metadata';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {parseEnv} from 'node:util';import {randomUUID,createHash} from 'node:crypto';import pg from 'pg';import {drizzle} from 'drizzle-orm/node-postgres';import {migrate} from 'drizzle-orm/node-postgres/migrator';import {NestFactory} from '@nestjs/core';import {makeSignature} from 'better-auth/crypto';import {Redis} from 'ioredis';import * as tables from '@fg/database';
const env=parseEnv(fs.readFileSync('.env.local','utf8')),owned=`t17_probe_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,url=new URL(env.DATABASE_URL);url.searchParams.set('options',`-c search_path=${owned}`);
const secret='t17-native-probe-synthetic-secret-at-least32',origin='http://localhost:5173',ns=createHash('sha256').update(JSON.stringify([url.host,url.pathname,url.searchParams.get('options')??''])).digest('hex').slice(0,16);
let app,pool,redis,created=false;
try{
pool=new pg.Pool({connectionString:url.href,connectionTimeoutMillis:5000,statement_timeout:10000});await pool.query(`CREATE SCHEMA "${owned}"`);created=true;
const client=await pool.connect();try{await migrate(drizzle(client),{migrationsFolder:path.resolve('packages/database/migrations'),migrationsSchema:owned});}finally{client.release();}
const games=await tables.seedGames(drizzle(pool,{schema:tables}));
await pool.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES('a','A','a@example.com',true,now(),now()),('b','B','b@example.com',true,now(),now()); INSERT INTO profiles(user_id,display_name) VALUES('a','A'),('b','B'); INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('s-a','a','t17-probe-token',now()+interval '1 day',now(),now()); INSERT INTO conversations(id,kind,user1_id,user2_id) VALUES('dm-ab','DM','a','b'); INSERT INTO blocks(id,blocker_id,blocked_id) VALUES('b-a','b','a');`);
await pool.query(`INSERT INTO game_interests(id,user_id,game_id) VALUES('i-a','a',$1)`,[games[0].id]);
Object.assign(process.env,env,{DATABASE_URL:url.href,BETTER_AUTH_SECRET:secret,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,FG_UPLOADS_DIR:path.resolve('.runtime',owned)});
const {AppModule}=await import('../../../apps/api/dist/app.module.js');app=await NestFactory.create(AppModule,{logger:false});await app.listen(0,'127.0.0.1');
const signature=await makeSignature('t17-probe-token',secret),cookie=`better-auth.session_token=t17-probe-token.${signature}`;
const response=await fetch(`${await app.getUrl()}/api/v1/conversations/dm-ab/messages`,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({content:'Must be rejected after peer block',clientMessageId:randomUUID()})});
const writes=(await pool.query('SELECT count(*)::int AS n FROM messages')).rows[0].n;
console.log(JSON.stringify({realCompiledApi:true,realPostgres:true,syntheticUsersOnly:true,peerBlockRows:(await pool.query('SELECT count(*)::int AS n FROM blocks')).rows[0].n,expectedHttpStatus:403,actualHttpStatus:response.status,expectedNewMessages:0,actualNewMessages:writes,ownedSchema:owned}));
assert.equal(response.status,403,'Blocked peer must reject new DM through the existing real HTTP endpoint');assert.equal(writes,0);
}finally{
if(app)await app.close();
redis=new Redis(env.REDIS_URL,{lazyConnect:true});try{await redis.connect();const keys=await redis.keys(`fg:presence:${ns}:*`);if(keys.length)await redis.del(...keys);}finally{redis.disconnect();}
if(pool){if(created)await pool.query(`DROP SCHEMA "${owned}" CASCADE`);await pool.end();}
console.log('Owned probe schema closed; no production data or credentials logged.');
}
