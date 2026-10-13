import 'reflect-metadata';
import {jest} from '@jest/globals';
import {NestFactory} from '@nestjs/core';
import type {INestApplication} from '@nestjs/common';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import request from 'supertest';
import {AppModule} from '../src/app.module.js';
import {configureFgHttpBodyParsers} from '../src/modules/chat-crypto/http-body-parsers.js';
import {createSignedSessionCookie} from './test-cookie-helper.js';

jest.setTimeout(60000);
describe('actual AppModule private crypto cache policy',()=>{
 const owned='crypto_be_'+randomUUID().replaceAll('-',''),previous={...process.env},origin='http://localhost:5173',secret='cache-fixture-only-session-secret-32-characters';
 const parent=path.resolve('.runtime/chatcrypto-be'),storage=path.join(parent,owned);
 let pool:pg.Pool,app:INestApplication,base:string,cookie:string;
 beforeAll(async()=>{
  const env=parseEnv(fs.readFileSync('.env.local','utf8')),url=new URL(env.DATABASE_URL);url.searchParams.set('options','-c search_path='+owned);
  pool=new pg.Pool({connectionString:url.href,connectionTimeoutMillis:5000});await pool.query(`CREATE SCHEMA "${owned}"`);
  const db=await pool.connect();try{await migrate(drizzle(db),{migrationsFolder:'packages/database/migrations',migrationsSchema:owned});}finally{db.release();}
  for(const user of ['cache-user','cache-peer'])await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())',[user,user+'@example.invalid']);
  await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('cache-session','cache-user','cache-session',clock_timestamp()+interval '1 day',now(),now())`);cookie=await createSignedSessionCookie(secret,'cache-session');
  await pool.query(`INSERT INTO conversations(id,kind,user1_id,user2_id) VALUES('cache-dm','DM','cache-peer','cache-user')`);
  await pool.query(`INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES('cache-dm','E2EE','RECONCILED','KNOWN')`);
  for(const user of ['cache-user','cache-peer'])await pool.query(`INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES($1,'cache-dm',$2,1,clock_timestamp())`,[randomUUID(),user]);
  Object.assign(process.env,env,{DATABASE_URL:url.href,FG_UPLOADS_DIR:path.join(storage,'legacy-images'),FG_CRYPTO_OBJECTS_DIR:path.join(storage,'encrypted'),PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:secret});
  for(const key of ['FG_BAO_ADDRESS','FG_BAO_CA_FILE','FG_BAO_LOBBY_TOKEN_FILE','FG_BAO_REPORT_WRITER_TOKEN_FILE','FG_BAO_REPORT_READER_TOKEN_FILE'])delete process.env[key];
  app=await NestFactory.create(AppModule,{logger:false,bodyParser:false,abortOnError:false});configureFgHttpBodyParsers(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();
 });
 afterAll(async()=>{try{await app?.close();}finally{try{if(pool){expect(owned).toMatch(/^crypto_be_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);}if(fs.existsSync(storage)){expect(fs.realpathSync(storage)).toBe(path.join(fs.realpathSync(parent),owned));fs.rmSync(storage,{recursive:true});}}finally{await pool?.end();process.env=previous;}}});
 it.each(['/api/v1/crypto/devices','/api/v1/crypto/conversations/cache-dm/state'])('prevents caching an authenticated JSON response at %s',async route=>{
  const response=await request(base).get(route).set('Cookie',cookie);expect(response.status).toBe(200);expect(response.headers['cache-control']).toBe('no-store');
 });
 it.each(['/api/v1/crypto/devices','/api/v1/crypto/recovery'])('prevents caching session denial at %s',async route=>{
  const response=await request(base).get(route);expect(response.status).toBe(401);expect(response.headers['cache-control']).toBe('no-store');
 });
 it('prevents caching a CSRF denial before any private write',async()=>{
  const before=(await pool.query('SELECT count(*) FROM chat_crypto_devices')).rows[0].count;
  const response=await request(base).post('/api/v1/crypto/devices').set('Cookie',cookie).set('Origin','https://foreign.example.invalid').send({});expect(response.status).toBe(403);expect(response.headers['cache-control']).toBe('no-store');expect((await pool.query('SELECT count(*) FROM chat_crypto_devices')).rows[0].count).toBe(before);
 });
 it('prevents caching a parser rejection that occurs before Nest guards',async()=>{
  const response=await request(base).post('/api/v1/crypto/keys/query').set('Cookie',cookie).set('Origin',origin).send({padding:'a'.repeat(257*1024)});expect(response.status).toBe(413);expect(response.headers['cache-control']).toBe('no-store');
 });
});
