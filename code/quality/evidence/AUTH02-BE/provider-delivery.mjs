import 'reflect-metadata';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {toNodeHandler} from 'better-auth/node';
import * as schema from '@fg/database';
import {createFgAuth} from '../../../apps/api/dist/modules/auth/auth.service.js';
import {authMailTransport} from '../../../apps/api/dist/modules/auth/auth-mail.js';

const recipient='namvupham2004@gmail.com',env=parseEnv(fs.readFileSync('.env.local','utf8'));Object.assign(process.env,env);
const schemaName=`test_auth02_smtp_${randomUUID().replaceAll('-','')}`;assert(/^test_auth02_smtp_[a-f0-9]{32}$/.test(schemaName));
const admin=new pg.Client({connectionString:env.DATABASE_URL}),links=new Map();
let pool,server,transport,created=false;const steps=[];
try{
 await admin.connect();await admin.query(`CREATE SCHEMA "${schemaName}"`);created=true;
 pool=new pg.Pool({connectionString:env.DATABASE_URL,options:`-c search_path=${schemaName}`,max:5});const db=drizzle(pool,{schema});await migrate(db,{migrationsFolder:'packages/database/migrations',migrationsSchema:schemaName});
 transport=authMailTransport();await transport.verify();
 // Observe the actual adapter in memory. The plugin does not replace SMTP send.
 transport.use('compile',(mail,next)=>{
  try{assert.equal(mail.data.to,recipient);const text=String(mail.data.text??''),kind=text.match(/^FG (VERIFY|RESET)\n/)?.[1],match=text.match(/https?:\/\/[^\s<>]+/);assert(kind&&match,'Expected real auth mail');links.set(kind,new URL(match[0]));next();}catch{next(new Error('Authorized auth test message validation failed'));}
 });
 const auth=createFgAuth(db,{baseURL:env.BETTER_AUTH_URL,secret:env.BETTER_AUTH_SECRET,discordClientId:env.DISCORD_CLIENT_ID,discordClientSecret:env.DISCORD_CLIENT_SECRET,mailTransport:transport,mailFrom:env.SMTP_FROM});
 server=http.createServer(toNodeHandler(auth));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`,password=`FG test ${randomUUID()} Ω`;
 const post=async(path,body)=>{const response=await fetch(`${base}/api/auth${path}`,{method:'POST',headers:{Origin:env.PUBLIC_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200,`Authorized ${path} expected success without leaking body`);return response;};
 await post('/sign-up/email',{name:'FG SMTP kiểm thử',email:recipient,password});assert(links.has('VERIFY'));steps.push({kind:'VERIFY',smtpAccepted:true,recipient});
 const verification=links.get('VERIFY');verification.searchParams.delete('callbackURL');const result=await fetch(`${base}${verification.pathname}${verification.search}`);assert.equal(result.status,200);steps.push({nativeVerificationAccepted:true});
 await post('/sign-in/email',{email:recipient,password});
 await post('/request-password-reset',{email:recipient,redirectTo:'/auth/reset'});assert(links.has('RESET'));steps.push({kind:'RESET',smtpAccepted:true,recipient});
 const token=links.get('RESET').pathname.split('/').at(-1);await post('/reset-password',{token,newPassword:`FG reset ${randomUUID()} Ω`});steps.push({nativeResetAccepted:true});
 console.log(JSON.stringify({runtime:'real compiled production auth factory/SMTP adapter',database:'isolated migrated PostgreSQL',recipient,realProviderEmailsAccepted:2,steps,inboxReceipt:'PENDING_USER_CONFIRMATION',testLinks:'Consumed within isolated fixture, invalid after cleanup',secretsAndTokensLogged:false}));
}catch(error){console.error(JSON.stringify({providerDeliveryVerified:false,errorCode:/^[A-Z_]+$/.test(String(error.code??''))?error.code:'AUTH_DELIVERY_PROBE_FAILED',responseCode:Number(error.responseCode)||null,secretsRedacted:true}));process.exitCode=1;}
finally{if(server)await new Promise(resolve=>server.close(()=>resolve()));if(transport)transport.close();if(pool)await pool.end();if(created)await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`);await admin.end();}
