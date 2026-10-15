import 'reflect-metadata';
import {jest} from '@jest/globals';
import {NestFactory} from '@nestjs/core';
import type {INestApplication} from '@nestjs/common';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {parseEnv} from 'node:util';
import pg from 'pg';import {drizzle} from 'drizzle-orm/node-postgres';import {migrate} from 'drizzle-orm/node-postgres/migrator';import request from 'supertest';
import {AppModule} from '../../../apps/api/src/app.module.js';
import {configureFgHttpBodyParsers} from '../../../apps/api/src/modules/chat-crypto/http-body-parsers.js';
import {createSignedSessionCookie} from '../../../apps/api/test/test-cookie-helper.js';
import {hashFgPassword} from '../../../apps/api/src/modules/auth/auth-password.js';
jest.setTimeout(45000);
describe('T37 actual credential session creation versus actual BAN',()=>{
 const saved={...process.env},run=randomUUID().replaceAll('-',''),schema='t37_auth_'+run,evidence=path.resolve('quality/evidence/T37','auth-race-'+run),runtime=path.resolve('.runtime/t37',run),origin='http://localhost:5173',secret=randomUUID()+randomUUID(),password='Fixture!'+randomUUID();
 let pool:pg.Pool,app:INestApplication,base:string,adminCookie:string,created=false;
 const ban=(action='BAN')=>request(base).patch('/api/v1/admin/users/bob/ban').set('Cookie',adminCookie).set('Origin',origin).send({action,reason:'Owned credential race acceptance'});
 const login=()=>request(base).post('/api/auth/sign-in/email').set('Origin',origin).send({email:'bob@t37.fixture.invalid',password});
 const wait=async(fn:()=>Promise<boolean>)=>{const end=Date.now()+10000;while(!await fn()){if(Date.now()>end)throw new Error('Actual SQL boundary deadline');await new Promise(r=>setTimeout(r,20));}};
 beforeAll(async()=>{
  fs.mkdirSync(evidence,{recursive:true});fs.mkdirSync(runtime,{recursive:true});const env=parseEnv(fs.readFileSync('.env.local','utf8')),url=new URL(env.DATABASE_URL);url.searchParams.set('options','-c search_path='+schema);pool=new pg.Pool({connectionString:url.href,max:8,statement_timeout:20000});await pool.query('CREATE SCHEMA "'+schema+'"');created=true;await migrate(drizzle(pool),{migrationsFolder:'packages/database/migrations',migrationsSchema:schema});
  for(const id of ['admin','bob']){await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[id,id==='admin'?'kingame':id,id+'@t37.fixture.invalid']);await pool.query('INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES($1,$2,\'credential\',$2,$3,now(),now())',[id+'-credential',id,await hashFgPassword(password)]);}
  const token=randomUUID();await pool.query('INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES(\'admin-session\',\'admin\',$1,now()+interval \'1 hour\',now(),now())',[token]);adminCookie=await createSignedSessionCookie(secret,token);
  Object.assign(process.env,env,{DATABASE_URL:url.href,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:secret,ADMIN_USER_IDS:'admin',LIVEKIT_SERVER_URL:'',LIVEKIT_ADMISSION_URL:'',FG_UPLOADS_DIR:path.join(runtime,'uploads'),FG_CRYPTO_OBJECTS_DIR:path.join(runtime,'objects')});delete process.env.ADMIN_DISCORD_IDS;
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false,bodyParser:false});configureFgHttpBodyParsers(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();
  fs.writeFileSync(evidence+'/setup.json',JSON.stringify({at:new Date().toISOString(),schema,realProductionApp:true,actualBetterAuthCredentialHttp:true,realSaltedScrypt:true,testOnlyInsertBarrier:true,mainMigration:false})+'\n',{flag:'wx'});
 });
 afterAll(async()=>{const cleanup={appClosed:false,schemaRemoved:false,poolEnded:false,runtimeRemoved:false};try{await app?.close();cleanup.appClosed=true;}finally{if(created){expect(schema).toMatch(/^t37_auth_[a-f0-9]{32}$/);await pool.query('DROP SCHEMA "'+schema+'" CASCADE');cleanup.schemaRemoved=(await pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rowCount===0;}await pool?.end();cleanup.poolEnded=true;if(fs.existsSync(runtime)){expect(path.dirname(runtime)).toBe(path.resolve('.runtime/t37'));expect(fs.realpathSync(runtime)).toBe(runtime);fs.rmSync(runtime,{recursive:true});}cleanup.runtimeRemoved=!fs.existsSync(runtime);process.env=saved;fs.writeFileSync(evidence+'/cleanup.json',JSON.stringify({at:new Date().toISOString(),schema,cleanup})+'\n',{flag:'wx'});expect(Object.values(cleanup).every(Boolean)).toBe(true);}});
 it('drains a real in-flight INSERT before BAN completes, and UNBAN cannot revive its cookie',async()=>{
  const holder=await pool.connect();let pendingLogin:Promise<request.Response>|undefined,pendingBan:Promise<request.Response>|undefined;let blockedAtInsert:boolean,banCommittedBeforeRelease=false,gateObserved=false;
  await pool.query("CREATE FUNCTION t37_pause_session_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='bob' THEN PERFORM pg_advisory_xact_lock(hashtextextended('t37_auth_insert_'||TG_TABLE_SCHEMA,0)); END IF; RETURN NEW; END $$; CREATE TRIGGER t37_pause_session_insert BEFORE INSERT ON session FOR EACH ROW EXECUTE FUNCTION t37_pause_session_insert()");
  try{
   await holder.query("SELECT pg_advisory_lock(hashtextextended('t37_auth_insert_'||current_schema(),0))");const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   pendingLogin=login().then(r=>r);await wait(async()=>Boolean((await pool.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rowCount));blockedAtInsert=true;
   pendingBan=ban().then(r=>r);await wait(async()=>{banCommittedBeforeRelease=Boolean((await pool.query("SELECT 1 FROM admin_actions WHERE target_user_id='bob' AND action='BAN'")).rowCount);gateObserved=Boolean((await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE '%fg_auth_session%' AND query LIKE '%pg_advisory_xact_lock%'")).rowCount);return banCommittedBeforeRelease||gateObserved;});
  }finally{await holder.query("SELECT pg_advisory_unlock(hashtextextended('t37_auth_insert_'||current_schema(),0))");holder.release();}
  const logged=await pendingLogin!,banned=await pendingBan!;await pool.query('DROP TRIGGER t37_pause_session_insert ON session;DROP FUNCTION t37_pause_session_insert()');
  const count=(await pool.query("SELECT count(*)::int AS count FROM session WHERE user_id='bob'")).rows[0].count;const cookie=(logged.headers['set-cookie'] as unknown as string[]??[]).map(c=>c.split(';')[0]).join('; ');const unbanned=await ban('UNBAN'),old=await request(base).get('/api/v1/me').set('Cookie',cookie);
  fs.writeFileSync(evidence+'/race-result.json',JSON.stringify({at:new Date().toISOString(),blockedAtActualSessionInsert:blockedAtInsert,banCommittedBeforeRelease,sessionGateWaitObserved:gateObserved,loginStatus:logged.status,banStatus:banned.status,remainingTargetSessions:count,unbanStatus:unbanned.status,oldCookieAfterUnbanStatus:old.status,cookiePersisted:false})+'\n',{flag:'wx'});
  expect(logged.status).toBe(200);expect(banned.status).toBe(200);expect(count).toBe(0);expect(unbanned.status).toBe(200);expect(old.status).toBe(401);
 });
 it('denies an actual credential login while BAN is current without creating a session',async()=>{expect((await ban()).status).toBe(200);expect((await login()).status).toBe(403);expect((await pool.query("SELECT 1 FROM session WHERE user_id='bob'")).rowCount).toBe(0);});
 it('rechecks BAN after login waits for the actual in-flight ban transaction',async()=>{
  expect((await ban('UNBAN')).status).toBe(200);const holder=await pool.connect();let pendingBan:Promise<request.Response>|undefined,pendingLogin:Promise<request.Response>|undefined;
  await pool.query("CREATE FUNCTION t37_pause_ban_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('t37_ban_commit_'||TG_TABLE_SCHEMA,0)); RETURN NEW; END $$; CREATE TRIGGER t37_pause_ban_commit BEFORE INSERT ON moderation_outbox FOR EACH ROW EXECUTE FUNCTION t37_pause_ban_commit()");
  try{await holder.query("SELECT pg_advisory_lock(hashtextextended('t37_ban_commit_'||current_schema(),0))");const pid=(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;pendingBan=ban().then(r=>r);await wait(async()=>Boolean((await pool.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rowCount));pendingLogin=login().then(r=>r);await wait(async()=>Boolean((await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE '%fg_auth_session%' AND query LIKE '%pg_advisory_xact_lock%'")).rowCount));}finally{await holder.query("SELECT pg_advisory_unlock(hashtextextended('t37_ban_commit_'||current_schema(),0))");holder.release();}
  const b=await pendingBan!,l=await pendingLogin!;await pool.query('DROP TRIGGER t37_pause_ban_commit ON moderation_outbox;DROP FUNCTION t37_pause_ban_commit()');expect(b.status).toBe(200);expect(l.status).toBe(403);expect((await pool.query("SELECT 1 FROM session WHERE user_id='bob'")).rowCount).toBe(0);
  fs.writeFileSync(evidence+'/ban-first-result.json',JSON.stringify({at:new Date().toISOString(),actualBanTransactionBarrier:true,actualCredentialLoginGateWait:true,banStatus:b.status,loginStatus:l.status,targetSessions:0})+'\n',{flag:'wx'});
 });
});
