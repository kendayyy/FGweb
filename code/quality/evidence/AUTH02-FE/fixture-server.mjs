import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
import Redis from 'ioredis';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import * as tables from '@fg/database';
import {NestFactory} from '@nestjs/core';
import {pathToFileURL} from 'node:url';
import {makeSignature} from 'better-auth/crypto';
const env=parseEnv(fs.readFileSync('.env.local','utf8')),origin=`http://localhost:${process.env.FG_AUTH02_WEB_PORT}`,secret='auth02-fe-isolated-fixture-secret-32-characters',schema=`auth02_fe_${randomUUID().replaceAll('-','')}`,sockets=new Set(),messages=[];
let app,web,smtp,pool,redis,created=false,namespace='';const webSockets=new Set();
const cleanup=async()=>{
 const errors=[],attempt=async fn=>{try{await fn();}catch(e){errors.push(e);}};
 if(app)await attempt(()=>app.close());if(web)await attempt(()=>{for(const socket of webSockets)socket.destroy();return new Promise(resolve=>web.httpServer.close(resolve));});
 if(smtp){for(const socket of sockets)socket.destroy();await attempt(()=>new Promise(resolve=>smtp.close(resolve)));}
 if(redis){await attempt(async()=>{const keys=await redis.keys(`fg:presence:${namespace}:*`);if(keys.length)await redis.del(...keys);await redis.quit();});}
 if(pool){await attempt(async()=>{if(created){assert(/^auth02_fe_[a-f0-9]{32}$/.test(schema));await pool.query(`DROP SCHEMA "${schema}" CASCADE`);}});await attempt(()=>pool.end());}
 if(errors.length)throw new Error('Owned fixture cleanup failed');
};
try{
 smtp=tls.createServer({key:fs.readFileSync('.runtime/auth02-fe/key.pem'),cert:fs.readFileSync('.runtime/auth02-fe/cert.pem')},socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.setEncoding('utf8');socket.write('220 FG real local SMTP ESMTP\r\n');let buffer='',data=false,to='';
  socket.on('data',chunk=>{buffer+=chunk;while(true){
   if(data){const end=buffer.indexOf('\r\n.\r\n');if(end<0)return;const stuffed=buffer.slice(0,end),raw=stuffed.replace(/^\.\./gm,'.');buffer=buffer.slice(end+5);data=false;const split=raw.indexOf('\r\n\r\n'),headers=raw.slice(0,split),body=raw.slice(split+4);const text=/Content-Transfer-Encoding: base64/i.test(headers)?Buffer.from(body.replace(/\s/g,''),'base64').toString('utf8'):body.replace(/=\r\n/g,'').replace(/=([a-f0-9]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));messages.push({to,text});console.log(JSON.stringify({smtpDotTransparency:stuffed!==raw}));socket.write('250 locally received\r\n');continue;}
   const end=buffer.indexOf('\r\n');if(end<0)return;const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
   if(/^EHLO|^HELO/i.test(line))socket.write('250-FG fixture\r\n250 AUTH PLAIN\r\n');
   else if(/^AUTH PLAIN /i.test(line))socket.write(Buffer.from(line.slice(11),'base64').toString()==='\0fixture\0fixture SMTP password'?'235 authenticated\r\n':'535 denied\r\n');
   else if(/^MAIL FROM/i.test(line)){to='';socket.write('250 sender\r\n');}
   else if(/^RCPT TO/i.test(line)){to=line.match(/<([^>]+)>/)?.[1]??'';socket.write(to.endsWith('@fixture.invalid')?'250 recipient\r\n':'550 fixture recipients only\r\n');}
   else if(/^DATA/i.test(line)){data=true;socket.write('354 send\r\n');}
   else if(/^QUIT/i.test(line)){socket.end('221 bye\r\n');return;}
   else socket.write('250 ok\r\n');
  }});
 });await new Promise((resolve,reject)=>{smtp.once('error',reject);smtp.listen(465,'127.0.0.1',resolve);});
 const scoped=new URL(env.DATABASE_URL);scoped.searchParams.set('options',`-c search_path=${schema}`);namespace=createHash('sha256').update(JSON.stringify([scoped.host,scoped.pathname,scoped.searchParams.get('options')])).digest('hex').slice(0,16);
 pool=new pg.Pool({connectionString:scoped.href,max:8,connectionTimeoutMillis:5000});await pool.query(`CREATE SCHEMA "${schema}"`);created=true;await migrate(drizzle(pool),{migrationsFolder:path.resolve('packages/database/migrations'),migrationsSchema:schema});const games=await tables.seedGames(drizzle(pool,{schema:tables}));
 const id=randomUUID(),token=randomUUID(),email=`discord-${id}@fixture.invalid`;
 await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[id,'Existing Discord',email]);
 await pool.query('INSERT INTO account(id,user_id,provider_id,account_id,created_at,updated_at) VALUES($1,$2,$3,$4,now(),now())',[randomUUID(),id,'discord',`discord-${id}`]);
 await pool.query('INSERT INTO profiles(user_id,display_name,bio) VALUES($1,$2,$3)',[id,'Existing Discord','Retain community']);await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)',[randomUUID(),id,games[0].id]);
 await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[randomUUID(),id,token]);
 redis=new Redis(env.REDIS_URL);await redis.ping();
 Object.assign(process.env,env,{DATABASE_URL:scoped.href,BETTER_AUTH_SECRET:secret,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,SMTP_HOST:'127.0.0.1',SMTP_PORT:'465',SMTP_USER:'fixture',SMTP_PASSWORD:'fixture SMTP password',SMTP_FROM:'auth@fixture.invalid',FG_UPLOADS_DIR:path.resolve('.runtime/auth02-fe/uploads')});
 const {AppModule}=await import('../../../apps/api/dist/app.module.js');app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});app.use((req,res,next)=>{const url=new URL(req.originalUrl,'http://fixture.invalid');if(url.pathname.endsWith('/verify-email'))res.once('finish',()=>console.log(JSON.stringify({verifyRequest:true,method:req.method,status:res.statusCode,tokenLength:url.searchParams.get('token')?.length??0})));next();});await app.listen(0,'127.0.0.1');const api=await app.getUrl();
 // Resolve the app's pinned Vite8, not the root's transitive Vite6.
 const {preview}=await import(pathToFileURL(path.resolve('apps/web/node_modules/vite/dist/node/index.js')).href);
 web=await preview({configFile:path.resolve('apps/web/vite.config.ts'),root:path.resolve('apps/web'),preview:{host:'127.0.0.1',port:Number(process.env.FG_AUTH02_WEB_PORT),strictPort:true,proxy:{'/api':api,'/socket.io':{target:api,ws:true}}}});
 web.httpServer.on('connection',socket=>{webSockets.add(socket);socket.on('close',()=>webSockets.delete(socket));});
 process.send({kind:'ready',discord:{id,email,cookie:`${token}.${await makeSignature(token,secret)}`}});
 process.on('message',async message=>{
  if(message.kind==='mail'){const mail=messages.filter(m=>m.to===message.to).at(-1),link=mail?.text.match(/https?:\/\/[^\s<>]+/)?.[0];if(link&&new URL(link).pathname==='/auth/verify'){const token=new URL(link).searchParams.get('token')??'',identifier=`fg-email:${createHash('sha256').update(token).digest('hex')}`;const row=await pool.query('SELECT id,expires_at>clock_timestamp() AT TIME ZONE \'UTC\' AS fresh FROM verification WHERE identifier=$1',[identifier]);const owned=await pool.query('SELECT v.id FROM verification v JOIN "user" u ON u.id=v.value WHERE u.email=$1 AND v.identifier LIKE \'fg-email:%\'',[message.to]);let keys;try{keys=Object.keys(JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()));}catch{keys=[];}console.log(JSON.stringify({mailedVerifyRecord:row.rowCount===1,ownedVerifyRecords:owned.rowCount,payloadKeys:keys,fresh:row.rows[0]?.fresh??false,tokenLength:token.length}));}process.send({id:message.id,link:link??null});}
  else if(message.kind==='expire-verification'){const result=await pool.query("UPDATE verification SET expires_at=clock_timestamp() AT TIME ZONE 'UTC'-interval '1 second' WHERE identifier LIKE 'fg-email:%' AND value=(SELECT id FROM \"user\" WHERE email=$1)",[message.to]);process.send({id:message.id,expired:result.rowCount>0});}
  else if(message.kind==='stop'){try{await cleanup();process.send({kind:'stopped'});process.exit(0);}catch{process.exit(1);}}
 });
}catch{await cleanup().catch(()=>{});process.send?.({kind:'failed'});process.exit(1);}
