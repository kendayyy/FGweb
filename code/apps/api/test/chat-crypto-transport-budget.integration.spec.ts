import 'reflect-metadata';
import {jest} from '@jest/globals';
import {NestFactory} from '@nestjs/core';
import type {INestApplication} from '@nestjs/common';
import {HttpException} from '@nestjs/common';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import request from 'supertest';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import {AppModule} from '../src/app.module.js';
import {CryptoRelayService} from '../src/modules/chat-crypto/crypto-relay.service.js';
import {matrixUserId} from '../src/modules/chat-crypto/matrix-signatures.js';
import {configureFgHttpBodyParsers} from '../src/modules/chat-crypto/http-body-parsers.js';
import {createSignedSessionCookie} from './test-cookie-helper.js';

jest.setTimeout(60000);
describe('actual two-instance HTTP transport aggregate budget',()=>{
 const owned='crypto_be_'+randomUUID().replaceAll('-',''),saved={...process.env},origin='http://localhost:5173',secret='budget-fixture-only-signed-cookie-secret-32';
 const parent=path.resolve('.runtime/chatcrypto-be'),storage=path.join(parent,owned);
 const apps:INestApplication[]=[],bases:string[]=[],machines:sdk.OlmMachine[]=[];
 const cookies:Record<string,string>={},devices:Record<string,Record<string,unknown>>={};
 let pool:pg.Pool;
 beforeAll(async()=>{
  await sdk.initAsync();const env=parseEnv(fs.readFileSync('.env.local','utf8')),url=new URL(env.DATABASE_URL);url.searchParams.set('options','-c search_path='+owned);url.searchParams.set('application_name',owned);
  pool=new pg.Pool({connectionString:url.href,max:8,connectionTimeoutMillis:5000});await pool.query(`CREATE SCHEMA "${owned}"`);
  const db=await pool.connect();try{await migrate(drizzle(db),{migrationsFolder:'packages/database/migrations',migrationsSchema:owned});}finally{db.release();}
  for(const user of ['budget-a','budget-b','budget-c']){await pool.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())`,[user,user+'@example.invalid']);await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$1,now()+interval '1 day',now(),now())`,[user+'-session',user]);cookies[user]=await createSignedSessionCookie(secret,user+'-session');}
  for(const [id,a,b]of [['budget-ab','budget-a','budget-b'],['budget-ac','budget-a','budget-c'],['budget-bc','budget-b','budget-c']]){await pool.query(`INSERT INTO conversations(id,kind,user1_id,user2_id) VALUES($1,'DM',$2,$3)`,[id,a,b]);await pool.query(`INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES($1,'E2EE','RECONCILED','KNOWN')`,[id]);for(const user of [a,b])await pool.query(`INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES($1,$2,$3,1,now())`,[id+'-'+user,id,user]);}
  Object.assign(process.env,{DATABASE_URL:url.href,REDIS_URL:env.REDIS_URL,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:secret,FG_UPLOADS_DIR:path.join(storage,'legacy'),FG_CRYPTO_OBJECTS_DIR:path.join(storage,'opaque'),FG_CRYPTO_TRANSPORT_MAX_ROWS_PER_USER:'1',FG_CRYPTO_TRANSPORT_MAX_PAYLOAD_BYTES_PER_USER:'1000000'});
  for(let i=0;i<2;i++){if(i===1){url.searchParams.set('options','-c search_path='+owned+' -c default_transaction_isolation=repeatable\\ read');process.env.DATABASE_URL=url.href;}const app=await NestFactory.create(AppModule,{logger:false,bodyParser:false});apps.push(app);configureFgHttpBodyParsers(app);await app.listen(0,'127.0.0.1');bases.push(await app.getUrl());const relay=app.get(CryptoRelayService) as unknown as {pool:pg.Pool};expect((await relay.pool.query("SELECT current_setting('default_transaction_isolation') AS isolation")).rows[0].isolation).toBe(i===1?'repeatable read':'read committed');}
  for(const [user,id]of [['budget-a','A'],['budget-b','B'],['budget-c','C']]){const machine=await sdk.OlmMachine.initialize(new sdk.UserId(matrixUserId(user)),new sdk.DeviceId(id));machines.push(machine);const upload=(await machine.outgoingRequests()).find(r=>r.type===sdk.RequestType.KeysUpload) as sdk.KeysUploadRequest,payload=JSON.parse(upload.body);devices[user]={deviceId:id,deviceKeys:payload.device_keys,oneTimeKeys:payload.one_time_keys};expect((await request(bases[0]).post('/api/v1/crypto/devices').set('Cookie',cookies[user]).set('Origin',origin).send(devices[user])).status).toBe(201);}
  const machine=await sdk.OlmMachine.initialize(new sdk.UserId(matrixUserId('budget-b')),new sdk.DeviceId('B2'));machines.push(machine);const upload=(await machine.outgoingRequests()).find(r=>r.type===sdk.RequestType.KeysUpload) as sdk.KeysUploadRequest,payload=JSON.parse(upload.body);devices['budget-b2']={deviceId:'B2',deviceKeys:payload.device_keys,oneTimeKeys:payload.one_time_keys};expect((await request(bases[0]).post('/api/v1/crypto/devices').set('Cookie',cookies['budget-b']).set('Origin',origin).send(devices['budget-b2'])).status).toBe(201);
 });
 beforeEach(async()=>{process.env.FG_CRYPTO_TRANSPORT_MAX_ROWS_PER_USER='1';process.env.FG_CRYPTO_TRANSPORT_MAX_PAYLOAD_BYTES_PER_USER='1000000';await pool.query('DELETE FROM chat_crypto_protocol_events');await pool.query('DELETE FROM chat_crypto_to_device_events');await pool.query('DELETE FROM admin_actions');await pool.query('UPDATE "session" SET expires_at=now()+interval \'1 day\'');});
 afterAll(async()=>{for(const machine of machines)machine.close();try{for(const app of apps)await app.close();}finally{try{if(pool){expect(owned).toMatch(/^crypto_be_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);}if(fs.existsSync(storage)){expect(fs.realpathSync(storage)).toBe(path.join(fs.realpathSync(parent),owned));fs.rmSync(storage,{recursive:true});}}finally{await pool?.end();process.env=saved;}}});
 async function event(conversationId:string,sender='budget-a',recipient='budget-b',id=randomUUID()):Promise<Record<string,unknown>>{const revision=(await pool.query('SELECT membership_revision FROM chat_crypto_state WHERE conversation_id=$1',[conversationId])).rows[0].membership_revision,deviceId=devices[sender].deviceId;return {conversationId,membershipRevision:Number(revision),deviceId,transactionId:id,recipientUserId:recipient,recipientDeviceId:devices[recipient].deviceId,eventType:'m.key.verification.request',content:{transaction_id:id,from_device:deviceId,methods:['m.sas.v1'],timestamp:Date.now()}};}
 const send=(body:Record<string,unknown>,instance=0,sender='budget-a')=>request(bases[instance]).post('/api/v1/crypto/verification').set('Cookie',cookies[sender]).set('Origin',origin).send(body);
 async function counts(){return (await pool.query('SELECT (SELECT count(*) FROM chat_crypto_protocol_events)::int AS events,(SELECT count(*) FROM chat_crypto_protocol_outbox)::int AS outbox')).rows[0];}
 it('serializes a sender budget across two API instances and different conversation locks',async()=>{
  const bodies=await Promise.all(Array.from({length:8},(_,i)=>event(i%2?'budget-ab':'budget-ac','budget-a',i%2?'budget-b':'budget-c')));
  const responses=await Promise.all(bodies.map((body,i)=>send(body,i%2)));expect(responses.map(r=>r.status).sort()).toEqual([201,429,429,429,429,429,429,429]);expect(await counts()).toEqual({events:1,outbox:1});
 });
 it('enforces recipient budget across different senders',async()=>{expect((await send(await event('budget-ab'))).status).toBe(201);expect((await send(await event('budget-bc','budget-c','budget-b'),1,'budget-c')).status).toBe(429);expect(await counts()).toEqual({events:1,outbox:1});});
 it('does not charge an identical retry or create another outbox row',async()=>{const body=await event('budget-ab');expect((await send(body)).status).toBe(201);expect((await send(body,1)).status).toBe(201);expect(await counts()).toEqual({events:1,outbox:1});});
 it('ACK does not free retained dedup storage',async()=>{expect((await send(await event('budget-ab'))).status).toBe(201);await pool.query('UPDATE chat_crypto_protocol_events SET acknowledged_at=now()');expect((await send(await event('budget-ab'),1)).status).toBe(429);expect(await counts()).toEqual({events:1,outbox:1});});
 it('expiry alone does not free retained storage, actual deletion does',async()=>{expect((await send(await event('budget-ab'))).status).toBe(201);await pool.query("UPDATE chat_crypto_protocol_events SET created_at=now()-interval '11 minutes',expires_at=now()-interval '1 second'");expect((await send(await event('budget-ab'),1)).status).toBe(429);await pool.query('DELETE FROM chat_crypto_protocol_events');expect((await send(await event('budget-ab'),1)).status).toBe(201);expect(await counts()).toEqual({events:1,outbox:1});});
 it('enforces PostgreSQL jsonb payload byte boundary without row/outbox residue',async()=>{const body=await event('budget-ab'),payload={eventType:body.eventType,content:body.content},bytes=Number((await pool.query('SELECT octet_length($1::jsonb::text) AS bytes',[JSON.stringify(payload)])).rows[0].bytes);process.env.FG_CRYPTO_TRANSPORT_MAX_ROWS_PER_USER='100';process.env.FG_CRYPTO_TRANSPORT_MAX_PAYLOAD_BYTES_PER_USER=String(bytes-1);expect((await send(body)).status).toBe(429);expect(await counts()).toEqual({events:0,outbox:0});process.env.FG_CRYPTO_TRANSPORT_MAX_PAYLOAD_BYTES_PER_USER=String(bytes);expect((await send(body,1)).status).toBe(201);expect(await counts()).toEqual({events:1,outbox:1});});
 it('fails closed for new ingestion without explicit operator configuration',async()=>{delete process.env.FG_CRYPTO_TRANSPORT_MAX_ROWS_PER_USER;expect((await send(await event('budget-ab'))).status).toBe(503);expect(await counts()).toEqual({events:0,outbox:0});});
 const curve=(key:string)=>{const device=devices[key],keys=(device.deviceKeys as {keys:Record<string,string>}).keys;return keys['curve25519:'+String(device.deviceId)];};
 async function opaqueBatch(two=false){const base=await event('budget-ab');return {conversationId:base.conversationId,membershipRevision:base.membershipRevision,deviceId:'A',transactionId:randomUUID(),eventType:'m.room.encrypted',recipients:(two?['budget-b','budget-b2']:['budget-b']).map(key=>({userId:'budget-b',deviceId:devices[key].deviceId,content:{algorithm:'m.olm.v1.curve25519-aes-sha2',sender_key:curve('budget-a'),ciphertext:{[curve(key)]:{type:1,body:'YQ=='}}}}))};}
 const sendOpaque=(body:unknown)=>request(bases[1]).post('/api/v1/crypto/to-device').set('Cookie',cookies['budget-a']).set('Origin',origin).send(body);
 it('shares the retained budget across encrypted and public verification queues',async()=>{expect((await sendOpaque(await opaqueBatch())).status).toBe(201);expect((await send(await event('budget-ab'))).status).toBe(429);expect(Number((await pool.query('SELECT count(*) FROM chat_crypto_to_device_events')).rows[0].count)).toBe(1);expect(await counts()).toEqual({events:0,outbox:1});});
 it('rolls back an entire opaque batch, then admits it at the exact row boundary',async()=>{const body=await opaqueBatch(true);expect((await sendOpaque(body)).status).toBe(429);expect(Number((await pool.query('SELECT count(*) FROM chat_crypto_to_device_events')).rows[0].count)).toBe(0);expect(await counts()).toEqual({events:0,outbox:0});process.env.FG_CRYPTO_TRANSPORT_MAX_ROWS_PER_USER='2';expect((await sendOpaque(body)).status).toBe(201);expect(Number((await pool.query('SELECT count(*) FROM chat_crypto_to_device_events')).rows[0].count)).toBe(2);expect(await counts()).toEqual({events:0,outbox:2});});
 async function awaitBudgetWait(){for(let attempt=0;attempt<100;attempt++){const waiting=(await pool.query("SELECT count(*) FROM pg_stat_activity WHERE application_name=$1 AND wait_event='advisory' AND query LIKE '%fg_crypto_transport%'",[owned])).rows[0].count;if(Number(waiting)>0)return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Actual API did not reach owned transport budget lock');}
 for(const instance of [0,1])for(const who of ['sender','recipient','expired session'] as const)it(`rechecks ${who} after budget lock under instance ${instance===1?'RR default':'RC default'}`,async()=>{
  const body=await event('budget-ab'),blocker=await pool.connect();let pending:Promise<{status:number}>|undefined;
  try{
   await blocker.query('BEGIN');await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_crypto_transport',current_schema(),'RECIPIENT','budget-b')::text,0::bigint))");
   if(who==='expired session'){
    await pool.query("UPDATE \"session\" SET expires_at=clock_timestamp()+interval '2 seconds' WHERE user_id='budget-a'");
    // Native producer expiry boundary; the HTTP auth layer may renew a session.
    pending=apps[instance].get(CryptoRelayService).verification({userId:'budget-a',sessionId:'budget-a-session'},body).then(()=>({status:201}),(error:unknown)=>{if(!(error instanceof HttpException))throw error;return {status:error.getStatus()};});
   }else pending=send(body,instance).then(response=>response);
   await awaitBudgetWait();
   if(who==='expired session'){
    await blocker.query("SELECT pg_sleep(LEAST(3,GREATEST(0,EXTRACT(EPOCH FROM (expires_at-clock_timestamp()))+0.1))) FROM \"session\" WHERE user_id='budget-a'");
    expect((await pool.query("SELECT expires_at<=clock_timestamp() AS expired FROM \"session\" WHERE user_id='budget-a'")).rows[0].expired).toBe(true);
   }else await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason,created_at) VALUES(gen_random_uuid()::text,'budget-c',$1,'BAN','owned quota authority fixture',clock_timestamp())",[who==='sender'?'budget-a':'budget-b']);
   await blocker.query('COMMIT');expect((await pending).status).toBe(who==='expired session'?401:403);expect(await counts()).toEqual({events:0,outbox:0});
  }finally{await blocker.query('ROLLBACK');blocker.release();await pending;}
 });
});
