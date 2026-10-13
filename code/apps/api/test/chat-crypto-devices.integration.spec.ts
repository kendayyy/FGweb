import 'reflect-metadata';
import {jest} from '@jest/globals';
import {Module,INestApplication} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {randomUUID,randomBytes,createCipheriv,createHash} from 'node:crypto';
import path from 'node:path';
import request from 'supertest';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import {ChatCryptoModule} from '../src/modules/chat-crypto/chat-crypto.module.js';
import {UploadsModule} from '../src/modules/uploads/uploads.module.js';
import {ChatService} from '../src/modules/chat/chat.service.js';
import {CryptoDevicesService} from '../src/modules/chat-crypto/crypto-devices.service.js';
import {CryptoRelayService} from '../src/modules/chat-crypto/crypto-relay.service.js';
import {lockCryptoObjectWrite} from '../src/modules/chat-crypto/crypto-object-store.js';
import {RoomsModule} from '../src/modules/rooms/rooms.module.js';
import {TeamsModule} from '../src/modules/teams/teams.module.js';
import {TeamsService} from '../src/modules/teams/teams.service.js';
import {InvitationsModule} from '../src/modules/invitations/invitations.module.js';
import {matrixUserId,matrixRoomId} from '../src/modules/chat-crypto/matrix-signatures.js';
import {configureFgHttpBodyParsers} from '../src/modules/chat-crypto/http-body-parsers.js';
import {createSignedSessionCookie} from './test-cookie-helper.js';

@Module({imports:[ChatCryptoModule,UploadsModule,RoomsModule,TeamsModule,InvitationsModule]})class FixtureApp{}
jest.setTimeout(60000);
describe('Crypto device/recovery API with actual auth, WASM and isolated PostgreSQL',()=>{
 const owned=`crypto_be_${randomUUID().replaceAll('-','')}`,savedEnv={...process.env},objectRoot=path.resolve('.runtime/chatcrypto-be',owned);
 const origin='http://localhost:5173',secret='crypto-be-fixture-secret-32-characters-minimum';
 let pool:pg.Pool,app:INestApplication,base:string,cookie:string,otherCookie:string;
 let device:Record<string,unknown>,backup:string;
 const machines:sdk.OlmMachine[]=[];
 async function nativeDevice(user:string,id:string){
  const machine=await sdk.OlmMachine.initialize(new sdk.UserId(matrixUserId(user)),new sdk.DeviceId(id));machines.push(machine);
  const upload=(await machine.outgoingRequests()).find(r=>r.type===sdk.RequestType.KeysUpload) as sdk.KeysUploadRequest;
  const payload=JSON.parse(upload.body);return {deviceId:id,deviceKeys:payload.device_keys,oneTimeKeys:payload.one_time_keys};
 }
 beforeAll(async()=>{
  await sdk.initAsync();
  const env=parseEnv(fs.readFileSync('.env.local','utf8')),url=new URL(env.DATABASE_URL);
  url.searchParams.set('options',`-c search_path=${owned}`);pool=new pg.Pool({connectionString:url.href,connectionTimeoutMillis:5000});
  await pool.query(`CREATE SCHEMA "${owned}"`);
  const client=await pool.connect();try{await migrate(drizzle(client),{migrationsFolder:'packages/database/migrations',migrationsSchema:owned});}finally{client.release();}
  for(const user of ['alice','bob','outsider']){
   await pool.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())`,[user,`${user}@example.invalid`]);
   await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$1,now()+interval '1 day',now(),now())`,[`${user}-session`,user]);
  }
  await pool.query(`INSERT INTO conversations(id,kind,user1_id,user2_id) VALUES('dm','DM','alice','bob')`);
  await pool.query(`INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES('dm','E2EE','RECONCILED','KNOWN')`);
  await pool.query(`INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES('alice-interval','dm','alice',1,now()),('bob-interval','dm','bob',1,now())`);
  Object.assign(process.env,{FG_UPLOADS_DIR:path.join(objectRoot,'legacy'),FG_CRYPTO_OBJECTS_DIR:objectRoot,DATABASE_URL:url.href,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:secret,DISCORD_CLIENT_ID:'fixture',DISCORD_CLIENT_SECRET:'fixture',SMTP_HOST:'127.0.0.1',SMTP_PORT:'465',SMTP_USER:'fixture',SMTP_PASSWORD:'fixture',SMTP_FROM:'fixture@example.invalid'});
  app=await NestFactory.create(FixtureApp,{logger:false,bodyParser:false});configureFgHttpBodyParsers(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();
  cookie=await createSignedSessionCookie(secret,'alice-session');otherCookie=await createSignedSessionCookie(secret,'bob-session');
  device=await nativeDevice('alice','A');backup=await sdk.OlmMachine.encryptExportedRoomKeys('[]','fixture-only-independent-recovery-code',1000);
 });
 afterAll(async()=>{
  for(const m of machines)m.close();
  try{await app?.close();}finally{try{if(pool){expect(owned).toMatch(/^crypto_be_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);}if(fs.existsSync(objectRoot)){expect(fs.realpathSync(objectRoot)).toBe(path.join(fs.realpathSync('.runtime/chatcrypto-be'),owned));fs.rmSync(objectRoot,{recursive:true});}}finally{await pool?.end();process.env=savedEnv;}}
 });
 const post=(route:string,body:unknown,auth=cookie)=>request(base).post(`/api/v1/crypto/${route}`).set('Cookie',auth).set('Origin',origin).send(body);
 it('requires session and same-origin writes',async()=>{
  expect((await request(base).get('/api/v1/crypto/devices')).status).toBe(401);
  expect((await request(base).post('/api/v1/crypto/devices').set('Cookie',cookie).set('Origin','https://evil.invalid').send(device)).status).toBe(403);
 });
 it('registers native keys once, advances epoch once and never exposes private data',async()=>{
  const first=await post('devices',device);expect(first.status).toBe(201);expect(first.body.deviceId).toBe('A');expect(first.body.deviceKeys).toEqual(device.deviceKeys);
  const revision=(await pool.query(`SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='dm'`)).rows[0].membership_revision;
  const retry=await post('devices',device);expect(retry.status).toBe(201);expect(retry.body).toEqual(first.body);
  expect((await pool.query(`SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='dm'`)).rows[0].membership_revision).toBe(revision);
  expect(Number(revision)).toBe(2);
  const list=await request(base).get('/api/v1/crypto/devices').set('Cookie',otherCookie);expect(list.status).toBe(200);expect(list.body).toEqual([]);
  expect(Object.keys(first.body).sort()).toEqual(['createdAt','deviceId','deviceKeys','revokedAt']);
 });
 it('rejects foreign owner, modified signature and immutable-device replacement',async()=>{
  expect((await post('devices',device,otherCookie)).status).toBe(422);
  const modified=structuredClone(device) as {deviceKeys:{signatures:Record<string,Record<string,string>>}};
  modified.deviceKeys.signatures[matrixUserId('alice')]['ed25519:A']=Buffer.alloc(64,7).toString('base64').replace(/=+$/,'');
  expect((await post('devices',modified)).status).toBe(422);
  expect((await post('devices',await nativeDevice('alice','A'))).status).toBe(409);
 });
 it('refuses prekey replacement and stores genuinely signed prekeys',async()=>{
  const keys=device.oneTimeKeys as Record<string,unknown>;
  expect((await post('devices/A/one-time-keys',{oneTimeKeys:keys})).status).toBe(201);
  const changed=structuredClone(keys) as Record<string,{key:string}>;changed[Object.keys(changed)[0]].key=Buffer.alloc(32,8).toString('base64').replace(/=+$/,'');
  expect((await post('devices/A/one-time-keys',{oneTimeKeys:changed})).status).toBe(422);
  expect(Number((await pool.query(`SELECT count(*) FROM chat_crypto_one_time_keys WHERE user_id='alice' AND device_id='A'`)).rows[0].count)).toBe(Object.keys(keys).length);
 });
 it('returns current state only to members and includes the fixed public Matrix mapping',async()=>{
  const state=await request(base).get('/api/v1/crypto/conversations/dm/state').set('Cookie',cookie);
  expect(state.status).toBe(200);expect(state.body.membershipRevision).toBe(2);expect(state.body.mode).toBe('E2EE');
  expect(state.body.matrixUserId).toBe(machines[0].userId.toString());expect(state.body.eligibleDeviceIds).toEqual(['A']);
  const outsider=await createSignedSessionCookie(secret,'outsider-session');
  expect((await request(base).get('/api/v1/crypto/conversations/dm/state').set('Cookie',outsider)).status).toBe(403);
 });
 it('queries member keys and claims distinct signed prekeys exactly once under contention',async()=>{
  const bob=await nativeDevice('bob','B');expect((await post('devices',bob,otherCookie)).status).toBe(201);
  const payload={conversationId:'dm',membershipRevision:3,userIds:['bob']};
  const query=await post('keys/query',payload);expect(query.status).toBe(201);expect(query.body.users[0].devices[0].deviceKeys).toEqual(bob.deviceKeys);
  expect((await post('keys/query',{...payload,userIds:['outsider']})).status).toBe(403);
  expect((await post('keys/query',{...payload,membershipRevision:2})).status).toBe(409);
  const claims=await Promise.all([1,2].map(()=>post('keys/claim',{conversationId:'dm',membershipRevision:3,deviceId:'A',targets:[{userId:'bob',deviceId:'B'}]})));
  expect(claims.map(r=>r.status)).toEqual([201,201]);expect(claims[0].body.keys[0].keyId).not.toBe(claims[1].body.keys[0].keyId);
  expect(claims[0].body.keys[0].signedKey).toEqual((bob.oneTimeKeys as Record<string,unknown>)[claims[0].body.keys[0].keyId]);
  expect(Number((await pool.query(`SELECT count(*) FROM chat_crypto_one_time_keys WHERE user_id='bob' AND claimed_at IS NOT NULL`)).rows[0].count)).toBe(2);
 });
 it('queues native SAS metadata to the addressed member device, rejects dedup conflicts and foreign ACKs',async()=>{
  const event={conversationId:'dm',membershipRevision:3,deviceId:'A',transactionId:'verify-1',recipientUserId:'bob',recipientDeviceId:'B',eventType:'m.key.verification.request',content:{transaction_id:'verify-1',from_device:'A',methods:['m.sas.v1'],timestamp:Date.now()}};
  expect((await post('verification',event)).status).toBe(201);expect((await post('verification',event)).status).toBe(201);
  expect((await post('verification',{...event,content:{...event.content,timestamp:event.content.timestamp+1}})).status).toBe(409);
  const sync=await request(base).get('/api/v1/crypto/sync?deviceId=B').set('Cookie',otherCookie);expect(sync.status).toBe(200);expect(sync.body.verification).toHaveLength(1);
  expect(sync.body.verification[0].event).toEqual({eventType:event.eventType,content:event.content});
  const id=sync.body.verification[0].id;
  expect((await post('sync/ack',{deviceId:'A',eventIds:[id]})).status).toBe(403);
  expect((await post('sync/ack',{deviceId:'B',eventIds:[id]},otherCookie)).status).toBe(201);
  expect((await request(base).get('/api/v1/crypto/sync?deviceId=B').set('Cookie',otherCookie)).body.verification).toEqual([]);
  const jobs=(await pool.query('SELECT w.* FROM chat_crypto_protocol_outbox w JOIN chat_crypto_protocol_events e ON e.id=w.verification_event_id WHERE e.transaction_id=$1',[event.transactionId])).rows;expect(jobs).toHaveLength(1);expect(Object.keys(jobs[0]).sort()).toEqual(['created_at','delivered_at','id','to_device_event_id','verification_event_id']);expect(jobs[0].to_device_event_id).toBeNull();
 });
 it('paginates verification metadata without duplicates at sub-millisecond database timestamps',async()=>{
  for(const id of ['page-a','page-b']){
   const event={conversationId:'dm',membershipRevision:3,deviceId:'A',transactionId:id,recipientUserId:'bob',recipientDeviceId:'B',eventType:'m.key.verification.request',content:{transaction_id:id,from_device:'A',methods:['m.sas.v1'],timestamp:Date.now()}};
   expect((await post('verification',event)).status).toBe(201);
  }
  await pool.query(`UPDATE chat_crypto_protocol_events SET created_at='2026-10-08T00:00:00.123456Z',expires_at=now()+interval '1 day' WHERE transaction_id IN ('page-a','page-b')`);
  const first=await request(base).get('/api/v1/crypto/sync?deviceId=B&limit=1').set('Cookie',otherCookie);expect(first.status).toBe(200);expect(first.body.verification).toHaveLength(1);
  const second=await request(base).get('/api/v1/crypto/sync').query({deviceId:'B',limit:1,verificationAfter:first.body.verificationCursor}).set('Cookie',otherCookie);expect(second.status).toBe(200);expect(second.body.verification).toHaveLength(1);
  expect(second.body.verification[0].id).not.toBe(first.body.verification[0].id);
  expect((await request(base).get('/api/v1/crypto/sync').query({deviceId:'A',limit:1,verificationAfter:first.body.verificationCursor}).set('Cookie',cookie)).status).toBe(422);
  expect((await post('sync/ack',{deviceId:'B',eventIds:[first.body.verification[0].id,second.body.verification[0].id]},otherCookie)).status).toBe(201);
 });
 it('rolls back verification and its wakeup together when PostgreSQL outbox insertion fails, then retries once',async()=>{
  const event={conversationId:'dm',membershipRevision:3,deviceId:'A',transactionId:'wake-atomic',recipientUserId:'bob',recipientDeviceId:'B',eventType:'m.key.verification.request',content:{transaction_id:'wake-atomic',from_device:'A',methods:['m.sas.v1'],timestamp:Date.now()}};
  await pool.query("CREATE FUNCTION wake_insert_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture wake insert fault'; END $$");await pool.query('CREATE TRIGGER wake_insert_fault BEFORE INSERT ON chat_crypto_protocol_outbox FOR EACH ROW EXECUTE FUNCTION wake_insert_fault()');
  try{expect((await post('verification',event)).status).toBe(500);expect((await pool.query("SELECT id FROM chat_crypto_protocol_events WHERE transaction_id='wake-atomic'")).rowCount).toBe(0);}finally{await pool.query('DROP TRIGGER wake_insert_fault ON chat_crypto_protocol_outbox');await pool.query('DROP FUNCTION wake_insert_fault()');}
  expect((await post('verification',event)).status).toBe(201);expect((await post('verification',event)).status).toBe(201);expect((await pool.query("SELECT w.id FROM chat_crypto_protocol_outbox w JOIN chat_crypto_protocol_events e ON e.id=w.verification_event_id WHERE e.transaction_id='wake-atomic'")).rowCount).toBe(1);
  const sync=await request(base).get('/api/v1/crypto/sync?deviceId=B').set('Cookie',otherCookie),item=sync.body.verification.find((r:{event:{content:{transaction_id:string}}})=>r.event.content.transaction_id==='wake-atomic');expect(item).toBeDefined();expect((await post('sync/ack',{deviceId:'B',eventIds:[item.id]},otherCookie)).status).toBe(201);
 });
 it('retains wakeups after publish or database delivery faults and exposes only current recipient metadata',async()=>{
  const relay=app.get(CryptoRelayService) as unknown as {dispatchProtocol:(publish:(signal:{kind:string;queue:string;eventId:string})=>Promise<void>)=>Promise<void>;protocolWakeup:(actor:{userId:string;sessionId:string},deviceId:string,signal:unknown)=>Promise<unknown>};
  const transactionId='wake-dispatch',event={conversationId:'dm',membershipRevision:3,deviceId:'A',transactionId,recipientUserId:'bob',recipientDeviceId:'B',eventType:'m.key.verification.request',content:{transaction_id:transactionId,from_device:'A',methods:['m.sas.v1'],timestamp:Date.now()}};
  expect((await post('verification',event)).status).toBe(201);const source=(await pool.query('SELECT id FROM chat_crypto_protocol_events WHERE transaction_id=$1',[transactionId])).rows[0].id;
  expect(relay.dispatchProtocol).toBeDefined();const signal={kind:'PROTOCOL_WAKE',queue:'VERIFICATION',eventId:source};
  await expect(relay.dispatchProtocol(async()=>{throw new Error('fixture publish unavailable');})).rejects.toThrow();expect((await pool.query('SELECT delivered_at FROM chat_crypto_protocol_outbox WHERE verification_event_id=$1',[source])).rows[0].delivered_at).toBeNull();
  await pool.query("CREATE FUNCTION wake_delivery_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture delivery fault'; END $$");await pool.query('CREATE TRIGGER wake_delivery_fault BEFORE UPDATE ON chat_crypto_protocol_outbox FOR EACH ROW EXECUTE FUNCTION wake_delivery_fault()');
  try{await expect(relay.dispatchProtocol(async()=>{})).rejects.toThrow();expect((await pool.query('SELECT delivered_at FROM chat_crypto_protocol_outbox WHERE verification_event_id=$1',[source])).rows[0].delivered_at).toBeNull();}finally{await pool.query('DROP TRIGGER wake_delivery_fault ON chat_crypto_protocol_outbox');await pool.query('DROP FUNCTION wake_delivery_fault()');}
  const signals:unknown[]=[];await relay.dispatchProtocol(async value=>{signals.push(value);});expect(signals).toEqual([signal]);expect((await pool.query('SELECT delivered_at FROM chat_crypto_protocol_outbox WHERE verification_event_id=$1',[source])).rows[0].delivered_at).not.toBeNull();
  expect(await relay.protocolWakeup({userId:'bob',sessionId:'bob-session'},'B',signal)).toEqual({conversationId:'dm',deviceId:'B',membershipRevision:3});expect(await relay.protocolWakeup({userId:'alice',sessionId:'alice-session'},'A',signal)).toBeNull();
  await expect(relay.protocolWakeup({userId:'bob',sessionId:'bob-session'},'missing',signal)).rejects.toThrow();await expect(relay.protocolWakeup({userId:'bob',sessionId:'missing'},'B',signal)).rejects.toThrow();
  expect((await post('sync/ack',{deviceId:'B',eventIds:[source]},otherCookie)).status).toBe(201);expect(await relay.protocolWakeup({userId:'bob',sessionId:'bob-session'},'B',signal)).toBeNull();
 });
 it('bounds protocol dispatch to 25 unlocked jobs, skips locked rows and recovers the remainder',async()=>{
  const relay=app.get(CryptoRelayService) as unknown as {dispatchProtocol:(publish:(signal:{eventId:string})=>Promise<void>)=>Promise<void>};const ids:string[]=[];
  for(let i=0;i<28;i++){const transactionId=`wake-batch-${i}`;expect((await post('verification',{conversationId:'dm',membershipRevision:3,deviceId:'A',transactionId,recipientUserId:'bob',recipientDeviceId:'B',eventType:'m.key.verification.request',content:{transaction_id:transactionId,from_device:'A',methods:['m.sas.v1'],timestamp:Date.now()}})).status).toBe(201);ids.push((await pool.query('SELECT id FROM chat_crypto_protocol_events WHERE transaction_id=$1',[transactionId])).rows[0].id);}
  const lock=await pool.connect(),signals:string[]=[];try{await lock.query('BEGIN');await lock.query('SELECT id FROM chat_crypto_protocol_outbox WHERE verification_event_id=$1 FOR UPDATE',[ids[0]]);await relay.dispatchProtocol(async signal=>{signals.push(signal.eventId);});expect(signals).toHaveLength(25);expect(signals).not.toContain(ids[0]);await lock.query('ROLLBACK');}finally{await lock.query('ROLLBACK');lock.release();}
  await relay.dispatchProtocol(async signal=>{signals.push(signal.eventId);});expect(new Set(signals).size).toBe(28);expect(signals).toHaveLength(28);expect((await post('sync/ack',{deviceId:'B',eventIds:ids},otherCookie)).status).toBe(201);
 });
 it('filters expired and stale wakeups and rechecks session expiry after a real epoch-lock wait',async()=>{
  const relay=app.get(CryptoRelayService) as unknown as {protocolWakeup:(actor:{userId:string;sessionId:string},deviceId:string,signal:unknown)=>Promise<unknown>};const transactionId='wake-authority';
  expect((await post('verification',{conversationId:'dm',membershipRevision:3,deviceId:'A',transactionId,recipientUserId:'bob',recipientDeviceId:'B',eventType:'m.key.verification.request',content:{transaction_id:transactionId,from_device:'A',methods:['m.sas.v1'],timestamp:Date.now()}})).status).toBe(201);
  const source=(await pool.query('SELECT id FROM chat_crypto_protocol_events WHERE transaction_id=$1',[transactionId])).rows[0].id,signal={kind:'PROTOCOL_WAKE',queue:'VERIFICATION',eventId:source},actor={userId:'bob',sessionId:'bob-session'};
  await pool.query("UPDATE chat_crypto_protocol_events SET created_at=clock_timestamp()-interval '2 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[source]);expect(await relay.protocolWakeup(actor,'B',signal)).toBeNull();await pool.query("UPDATE chat_crypto_protocol_events SET expires_at=clock_timestamp()+interval '1 day' WHERE id=$1",[source]);
  await pool.query("UPDATE chat_crypto_state SET membership_revision=4 WHERE conversation_id='dm'");try{expect(await relay.protocolWakeup(actor,'B',signal)).toBeNull();}finally{await pool.query("UPDATE chat_crypto_state SET membership_revision=3 WHERE conversation_id='dm'");}
  const lock=await pool.connect();let pending:Promise<{error?:unknown;value?:unknown}>|undefined;try{
   await lock.query('BEGIN');const pid=(await lock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;await lock.query("SELECT conversation_id FROM chat_crypto_state WHERE conversation_id='dm' FOR UPDATE");await pool.query("UPDATE \"session\" SET expires_at=clock_timestamp()+interval '700 milliseconds' WHERE id='bob-session'");
   pending=relay.protocolWakeup(actor,'B',signal).then(value=>({value}),error=>({error}));const end=Date.now()+3000;while(!(await pool.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rowCount){if(Date.now()>end)throw new Error('Expected epoch lock wait');await new Promise(resolve=>setTimeout(resolve,20));}
   await new Promise(resolve=>setTimeout(resolve,800));await lock.query('ROLLBACK');expect((await pending).error).toBeDefined();
  }finally{await lock.query('ROLLBACK');lock.release();await pending;await pool.query("UPDATE \"session\" SET expires_at=clock_timestamp()+interval '1 day' WHERE id='bob-session'");}
  expect((await post('sync/ack',{deviceId:'B',eventIds:[source]},otherCookie)).status).toBe(201);
 });
 it('relays real Olm room keys and Megolm messages without plaintext persistence, with tamper/replay rejection',async()=>{
  const alice=machines[0],bob=machines.find(m=>m.deviceId.toString()==='B')!;
  const authFor=(m:sdk.OlmMachine)=>m===alice?cookie:otherCookie;
  const fg=(matrixId:string)=>matrixId===alice.userId.toString()?'alice':matrixId===bob.userId.toString()?'bob':(()=>{throw new Error('Unknown fixture recipient');})();
  async function sendNative(m:sdk.OlmMachine,r:sdk.OutgoingRequest){
   const body=JSON.parse((r as sdk.KeysUploadRequest).body);let response:Record<string,unknown>={};
   if(r.type===sdk.RequestType.KeysUpload){
    const count=Number((await pool.query(`SELECT count(*) FROM chat_crypto_one_time_keys WHERE user_id=$1 AND device_id=$2 AND claimed_at IS NULL`,[fg(m.userId.toString()),m.deviceId.toString()])).rows[0].count);
    response={one_time_key_counts:{signed_curve25519:count}};
   }else if(r.type===sdk.RequestType.KeysQuery){
    const result=await post('keys/query',{conversationId:'dm',membershipRevision:3,userIds:Object.keys(body.device_keys).map(fg)},authFor(m));expect(result.status).toBe(201);
    const deviceKeys:Record<string,Record<string,unknown>>={};for(const user of result.body.users){deviceKeys[user.matrixUserId]={};for(const device of user.devices)deviceKeys[user.matrixUserId][device.deviceId]=device.deviceKeys;}
    response={device_keys:deviceKeys,failures:{}};
   }else if(r.type===sdk.RequestType.KeysClaim){
    const targets=Object.entries(body.one_time_keys as Record<string,Record<string,string>>).flatMap(([user,devices])=>Object.keys(devices).map(deviceId=>({userId:fg(user),deviceId})));
    const result=await post('keys/claim',{conversationId:'dm',membershipRevision:3,deviceId:m.deviceId.toString(),targets},authFor(m));expect(result.status).toBe(201);
    const prekeys:Record<string,Record<string,unknown>>={};for(const key of result.body.keys){const user=matrixUserId(key.userId);prekeys[user]??={};prekeys[user][key.deviceId]={[key.keyId]:key.signedKey};}response={one_time_keys:prekeys,failures:{}};
   }else if(r.type===sdk.RequestType.ToDevice){
    const event=r as sdk.ToDeviceRequest;expect(event.event_type).toBe('m.room.encrypted');
    const recipients=Object.entries(body.messages as Record<string,Record<string,unknown>>).flatMap(([user,devices])=>Object.entries(devices).map(([deviceId,content])=>({userId:fg(user),deviceId,content})));
    const payload={conversationId:'dm',membershipRevision:3,deviceId:m.deviceId.toString(),transactionId:event.txn_id,eventType:event.event_type,recipients};
    expect((await post('to-device',payload,authFor(m))).status).toBe(201);expect((await post('to-device',payload,authFor(m))).status).toBe(201);
    const jobs=(await pool.query('SELECT w.* FROM chat_crypto_protocol_outbox w JOIN chat_crypto_to_device_events e ON e.id=w.to_device_event_id WHERE e.transaction_id=$1',[event.txn_id])).rows;expect(jobs).toHaveLength(recipients.length);for(const job of jobs){expect(Object.keys(job).sort()).toEqual(['created_at','delivered_at','id','to_device_event_id','verification_event_id']);expect(job.verification_event_id).toBeNull();expect(JSON.stringify(job)).not.toContain(JSON.stringify(body.messages));}
    const changed=structuredClone(payload) as typeof payload & {recipients:{content:{ciphertext:Record<string,{body:string}>}}[]};
    const first=changed.recipients[0].content.ciphertext;first[Object.keys(first)[0]].body=Buffer.alloc(96,3).toString('base64');
    expect((await post('to-device',changed,authFor(m))).status).toBe(409);
   }else throw new Error(`Unexpected native request ${r.type}`);
   await m.markRequestAsSent(r.id,r.type,JSON.stringify(response));
  }
  for(const machine of [alice,bob])for(const r of await machine.outgoingRequests())await sendNative(machine,r);
  for(const machine of [alice,bob]){await machine.updateTrackedUsers([alice.userId,bob.userId]);for(const r of await machine.outgoingRequests())await sendNative(machine,r);}
  const known=await alice.getDevice(bob.userId,bob.deviceId);expect(known!.ed25519Key!.toBase64()).toBe(bob.identityKeys.ed25519.toBase64());await known!.setLocalTrust(sdk.LocalTrust.Verified);
  const missing=await alice.getMissingSessions([bob.userId]);if(missing)await sendNative(alice,missing);
  const settings=new sdk.EncryptionSettings();settings.historyVisibility=sdk.HistoryVisibility.Joined;settings.sharingStrategy=sdk.CollectStrategy.onlyTrustedDevices();
  const state=await request(base).get('/api/v1/crypto/conversations/dm/state').set('Cookie',cookie),room=new sdk.RoomId(state.body.matrixRoomId);
  for(const r of await alice.shareRoomKey(room,[bob.userId],settings))await sendNative(alice,r);
  const sync=await request(base).get('/api/v1/crypto/sync?deviceId=B').set('Cookie',otherCookie);expect(sync.status).toBe(200);expect(sync.body.encrypted.items.length).toBeGreaterThan(0);
  await bob.receiveSyncChanges(JSON.stringify(sync.body.encrypted.items.map((e:{senderUserId:string;content:unknown})=>({sender:matrixUserId(e.senderUserId),type:'m.room.encrypted',content:e.content}))),new sdk.DeviceLists(),new Map());
  const content=JSON.parse(await alice.encryptRoomEvent(room,'m.room.message',JSON.stringify({msgtype:'m.text',body:'native-private-message-fixture'})));
  const payload={clientMessageId:'native-message',deviceId:'A',membershipRevision:3,envelope:{version:1,protocol:'MATRIX_MEGOLM',event:content}};
  const sent=await post('conversations/dm/messages',payload);expect(sent.status).toBe(201);expect(sent.body.envelope).toEqual(payload.envelope);
  const retry=await post('conversations/dm/messages',payload);expect(retry.status).toBe(201);expect(retry.body.id).toBe(sent.body.id);
  const notices=(await pool.query(`SELECT * FROM notifications WHERE type='DM' ORDER BY id`)).rows;expect(notices).toHaveLength(1);
  expect(notices[0].user_id).toBe('bob');expect(notices[0].title).toBe('Tin nhắn mới');expect(notices[0].body).toBe('Bạn có tin nhắn mới.');
  expect(JSON.parse(notices[0].data)).toEqual({conversationId:'dm',messageId:sent.body.id,senderId:'alice'});
  const jobs=(await pool.query(`SELECT user_id,channel FROM notification_outbox WHERE notification_id=$1`,[notices[0].id])).rows;expect(jobs).toEqual([{user_id:'bob',channel:'IN_APP'}]);
  expect(JSON.stringify(notices)).not.toContain('native-private-message-fixture');expect(JSON.stringify(notices)).not.toContain(content.ciphertext);
  const history=await request(base).get('/api/v1/crypto/conversations/dm/messages').set('Cookie',otherCookie);expect(history.status).toBe(200);expect(history.body.items).toHaveLength(1);
  const decrypted=await bob.decryptRoomEvent(JSON.stringify({type:'m.room.encrypted',sender:alice.userId.toString(),event_id:'$'+sent.body.id,origin_server_ts:Date.now(),content:history.body.items[0].envelope.event}),room,new sdk.DecryptionSettings(sdk.TrustRequirement.Untrusted));
  expect(JSON.parse(decrypted.event).content.body).toBe('native-private-message-fixture');
  const damaged=structuredClone(history.body.items[0].envelope.event);const rawCipher=Buffer.from(damaged.ciphertext,'base64');rawCipher[Math.floor(rawCipher.length/2)]^=1;damaged.ciphertext=rawCipher.toString('base64');
  await expect(bob.decryptRoomEvent(JSON.stringify({type:'m.room.encrypted',sender:alice.userId.toString(),event_id:'$tampered',origin_server_ts:Date.now(),content:damaged}),room,new sdk.DecryptionSettings(sdk.TrustRequirement.Untrusted))).rejects.toBeDefined();
  const row=(await pool.query(`SELECT content,crypto_envelope,reply_to_id FROM messages WHERE id=$1`,[sent.body.id])).rows[0];expect(row.content).toBe('');expect(row.reply_to_id).toBeNull();expect(JSON.stringify(row)).not.toContain('native-private-message-fixture');
  const corrupted=structuredClone(payload);corrupted.envelope.event.ciphertext=Buffer.alloc(160,5).toString('base64');
  expect((await post('conversations/dm/messages',corrupted)).status).toBe(409);
  const outsider=await createSignedSessionCookie(secret,'outsider-session');expect((await request(base).get('/api/v1/crypto/conversations/dm/messages').set('Cookie',outsider)).status).toBe(403);
  await pool.query(`UPDATE chat_crypto_membership_intervals SET start_revision=4 WHERE user_id='bob' AND conversation_id='dm'`);
  expect((await request(base).get('/api/v1/crypto/conversations/dm/messages').set('Cookie',otherCookie)).body.items).toEqual([]);
  await pool.query(`UPDATE chat_crypto_membership_intervals SET start_revision=1 WHERE user_id='bob' AND conversation_id='dm'`);
  await pool.query(`UPDATE chat_crypto_state SET membership_revision=4 WHERE conversation_id='dm'`);
  expect((await post('conversations/dm/messages',{...payload,clientMessageId:'stale'})).status).toBe(409);
  expect((await post('conversations/dm/messages',{...payload,clientMessageId:'reuse',membershipRevision:4})).status).toBe(409);
  expect((await request(base).get('/api/v1/crypto/sync?deviceId=B').set('Cookie',otherCookie)).body.encrypted.items).toEqual([]);
  // Restore this owned fixture epoch for subsequent independent recovery checks.
  await pool.query(`UPDATE chat_crypto_state SET membership_revision=3 WHERE conversation_id='dm'`);
  expect((await post('sync/ack',{deviceId:'B',eventIds:sync.body.encrypted.items.map((e:{id:string})=>e.id)},otherCookie)).status).toBe(201);
 });
 it('rolls back a new ciphertext and its realtime outbox when the generic notification job cannot commit',async()=>{
  const alice=machines[0],room=new sdk.RoomId(matrixRoomId('dm'));
  const epoch=Number((await pool.query(`SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='dm'`)).rows[0].membership_revision);
  const event=JSON.parse(await alice.encryptRoomEvent(room,'m.room.message',JSON.stringify({msgtype:'m.text',body:'notification-rollback-private'})));
  await pool.query(`CREATE FUNCTION crypto_fixture_fail_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture notification outage'; END $$`);
  await pool.query(`CREATE TRIGGER crypto_fixture_fail_notification BEFORE INSERT ON notification_outbox FOR EACH ROW EXECUTE FUNCTION crypto_fixture_fail_notification()`);
  try{
   const result=await post('conversations/dm/messages',{clientMessageId:'notification-rollback',deviceId:'A',membershipRevision:epoch,envelope:{version:1,protocol:'MATRIX_MEGOLM',event}});expect(result.status).toBe(500);
   expect((await pool.query(`SELECT id FROM messages WHERE client_message_id='notification-rollback'`)).rowCount).toBe(0);
   expect((await pool.query(`SELECT id FROM notifications WHERE type='DM' AND data::jsonb->>'messageId' NOT IN(SELECT id FROM messages)`)).rowCount).toBe(0);
  }finally{await pool.query(`DROP TRIGGER crypto_fixture_fail_notification ON notification_outbox`);await pool.query(`DROP FUNCTION crypto_fixture_fail_notification()`);}
 });
 it('stores only encrypted independent recovery and enforces compare-and-swap',async()=>{
  const payload={version:1,format:'MATRIX_ENCRYPTED_EXPORT',ciphertext:backup,expectedVersion:0};
  const first=await request(base).put('/api/v1/crypto/recovery').set('Cookie',cookie).set('Origin',origin).send(payload);expect(first.status).toBe(200);expect(first.body.backupVersion).toBe(1);
  expect((await request(base).put('/api/v1/crypto/recovery').set('Cookie',cookie).set('Origin',origin).send(payload)).status).toBe(409);
  expect((await request(base).get('/api/v1/crypto/recovery').set('Cookie',otherCookie)).status).toBe(404);
  const stored=(await pool.query(`SELECT ciphertext FROM chat_crypto_recovery_backups WHERE user_id='alice'`)).rows[0].ciphertext;
  expect(stored).toBe(backup);expect(stored).not.toContain('fixture-only-independent-recovery-code');
  expect((await request(base).put('/api/v1/crypto/recovery').set('Cookie',cookie).set('Origin',origin).send({...payload,ciphertext:'plaintext export'})).status).toBe(422);
 });
 it('keeps a revoked-device tombstone and cannot re-register it',async()=>{
  expect((await request(base).delete('/api/v1/crypto/devices/A').set('Cookie',otherCookie).set('Origin',origin)).status).toBe(404);
  const result=await request(base).delete('/api/v1/crypto/devices/A').set('Cookie',cookie).set('Origin',origin);expect(result.status).toBe(200);
  expect((await post('devices',device)).status).toBe(403);
  expect((await post('devices/A/one-time-keys',{oneTimeKeys:device.oneTimeKeys})).status).toBe(403);
  expect((await pool.query(`SELECT revoked_at FROM chat_crypto_devices WHERE user_id='alice' AND device_id='A'`)).rows[0].revoked_at).not.toBeNull();
  expect(Number((await pool.query(`SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='dm'`)).rows[0].membership_revision)).toBe(4);
  expect((await post('keys/claim',{conversationId:'dm',membershipRevision:4,deviceId:'A',targets:[{userId:'bob',deviceId:'B'}]})).status).toBe(403);
  expect((await request(base).get('/api/v1/crypto/sync?deviceId=A').set('Cookie',cookie)).status).toBe(403);
  const keys=await post('keys/query',{conversationId:'dm',membershipRevision:4,userIds:['alice']},otherCookie);expect(keys.status).toBe(201);expect(keys.body.users[0].devices).toEqual([]);
  expect((await request(base).delete('/api/v1/crypto/devices/A').set('Cookie',cookie).set('Origin',origin)).status).toBe(200);
  expect(Number((await pool.query(`SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='dm'`)).rows[0].membership_revision)).toBe(4);
 });
 it('allows exactly one recovery update when two tabs race at the same version',async()=>{
  const payload={version:1,format:'MATRIX_ENCRYPTED_EXPORT',ciphertext:backup,expectedVersion:1};
  const results=await Promise.all([1,2].map(()=>request(base).put('/api/v1/crypto/recovery').set('Cookie',cookie).set('Origin',origin).send(payload)));
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  expect(Number((await pool.query(`SELECT backup_version FROM chat_crypto_recovery_backups WHERE user_id='alice'`)).rows[0].backup_version)).toBe(2);
 });
 it('stores native public cross-signing identity and only merges authenticated unchanged-key signatures',async()=>{
  const bob=machines.find(m=>m.deviceId.toString()==='B')!,bootstrap=await bob.bootstrapCrossSigning(false);
  const keys=JSON.parse(bootstrap.uploadSigningKeysRequest!.body),identity={masterKey:keys.master_key,selfSigningKey:keys.self_signing_key,userSigningKey:keys.user_signing_key};
  const putIdentity=(body:unknown,auth=otherCookie)=>request(base).put('/api/v1/crypto/identity').set('Cookie',auth).set('Origin',origin).send(body);
  expect((await putIdentity(identity,cookie)).status).toBe(422);
  expect((await putIdentity(identity)).status).toBe(200);
  const additions={signedKeys:JSON.parse(bootstrap.uploadSignaturesRequest!.body)};
  expect((await post('signatures',additions,otherCookie)).status).toBe(201);
  const before=(await pool.query(`SELECT device_keys FROM chat_crypto_devices WHERE user_id='bob' AND device_id='B'`)).rows[0].device_keys;
  expect(before.keys['ed25519:B']).toBe(bob.identityKeys.ed25519.toBase64());
  const changed=structuredClone(additions);const signedDevice=changed.signedKeys[bob.userId.toString()].B;expect(signedDevice).toBeDefined();
  signedDevice.keys['curve25519:B']=Buffer.alloc(32,42).toString('base64').replace(/=+$/,'');
  expect((await post('signatures',changed,otherCookie)).status).toBe(409);
  expect((await pool.query(`SELECT device_keys FROM chat_crypto_devices WHERE user_id='bob' AND device_id='B'`)).rows[0].device_keys).toEqual(before);
  expect(JSON.stringify((await pool.query(`SELECT public_keys FROM chat_crypto_identity_keys WHERE user_id='bob'`)).rows[0])).not.toContain('private');
 });
 it('accepts genuine encrypted room-key backups larger than the old 100 KiB JSON default',async()=>{
  const settings=new sdk.EncryptionSettings();settings.historyVisibility=sdk.HistoryVisibility.Joined;settings.sharingStrategy=sdk.CollectStrategy.onlyTrustedDevices();
  await machines[0].shareRoomKey(new sdk.RoomId('!bodylimit:fg.invalid'),[],settings);
  const keys=JSON.parse(await machines[0].exportRoomKeys(()=>true));expect(keys.length).toBeGreaterThan(0);
  const exportJson=JSON.stringify(Array.from({length:800},()=>keys[0]));
  const ciphertext=sdk.OlmMachine.encryptExportedRoomKeys(exportJson,'fixture-only-independent-recovery-code',1000);
  expect(Buffer.byteLength(ciphertext)).toBeGreaterThan(100*1024);
  const result=await request(base).put('/api/v1/crypto/recovery').set('Cookie',cookie).set('Origin',origin).send({version:1,format:'MATRIX_ENCRYPTED_EXPORT',ciphertext,expectedVersion:2});
  expect(result.status).toBe(200);expect(result.body.ciphertext).toBe(ciphertext);
  expect(sdk.OlmMachine.decryptExportedRoomKeys(result.body.ciphertext,'fixture-only-independent-recovery-code')).toBe(exportJson);
 });
 it('does not deadlock a prekey claim against a concurrent device revocation',async()=>{
  const racingDevice=await nativeDevice('bob','R');expect((await post('devices',racingDevice,otherCookie)).status).toBe(201);
  const revision=Number((await pool.query(`SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='dm'`)).rows[0].membership_revision);
  const blocker=await pool.connect();let revoke:Promise<request.Response>|undefined,claim:Promise<request.Response>|undefined;
  const until=async(condition:()=>Promise<boolean>)=>{const deadline=Date.now()+5000;while(!await condition()){if(Date.now()>deadline)throw new Error('Expected PostgreSQL race boundary was not reached');await new Promise(resolve=>setTimeout(resolve,20));}};
  try{
   await blocker.query('BEGIN');const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   await blocker.query(`SELECT device_id FROM chat_crypto_devices WHERE user_id='bob' AND device_id='R' FOR UPDATE`);
   revoke=request(base).delete('/api/v1/crypto/devices/R').set('Cookie',otherCookie).set('Origin',origin).then(result=>result);
   await until(async()=>Boolean((await pool.query(`SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%chat_crypto_devices%'`,[pid])).rowCount));
   let completed=false;
   claim=post('keys/claim',{conversationId:'dm',membershipRevision:revision,deviceId:'R',targets:[{userId:'bob',deviceId:'B'}]},otherCookie).then(result=>{completed=true;return result;});
   // A successful claim may linearize before revocation. Otherwise wait until
   // its database query reaches the contested device, rather than timing a race.
   await until(async()=>completed||Boolean((await pool.query(`SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%chat_crypto_devices%' AND query LIKE '%FOR SHARE%'`)).rowCount));
  }finally{await blocker.query('ROLLBACK');blocker.release();}
  const [revoked,claimed]=await Promise.all([revoke!,claim!]);
  expect(revoked.status).toBe(200);expect([201,403,409]).toContain(claimed.status);
  expect((await pool.query(`SELECT revoked_at FROM chat_crypto_devices WHERE user_id='bob' AND device_id='R'`)).rows[0].revoked_at).not.toBeNull();
  expect(Number((await pool.query(`SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='dm'`)).rows[0].membership_revision)).toBe(revision+1);
  expect((await post('keys/claim',{conversationId:'dm',membershipRevision:revision+1,deviceId:'R',targets:[{userId:'bob',deviceId:'B'}]},otherCookie)).status).toBe(403);
 });
 it('stores opaque encrypted images, enforces draft ownership and atomically claims them in native Megolm messages',async()=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMZsAAAAASUVORK5CYII=','base64');
  const key=randomBytes(32),iv=randomBytes(16),cipher=createCipheriv('aes-256-ctr',key,iv),bytes=Buffer.concat([cipher.update(png),cipher.final()]);
  const revision=Number((await pool.query(`SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='dm'`)).rows[0].membership_revision);
  const metadata={clientUploadId:'encrypted-image-fixture',deviceId:'B',membershipRevision:revision,ciphertextSize:bytes.length,ciphertextSha256:createHash('sha256').update(bytes).digest('base64').replace(/=+$/,'')};
  const upload=(data:unknown,auth=otherCookie,body=bytes)=>request(base).post('/api/v1/crypto/conversations/dm/attachments').set('Cookie',auth).set('Origin',origin).field('metadata',JSON.stringify(data)).attach('file',body,{filename:'private-name.png',contentType:'application/octet-stream'});
  const created=await upload(metadata);expect(created.status).toBe(201);
  expect(Object.keys(created.body).sort()).toEqual(['ciphertextSha256','ciphertextSize','conversationId','expiresAt','id']);
  expect((await upload(metadata)).body).toEqual(created.body);
  expect((await upload({...metadata,ciphertextSha256:Buffer.alloc(32).toString('base64')})).status).toBe(422);
  expect((await upload({...metadata,secret:{key:key.toString('base64')}})).status).toBe(422);
  const outsider=await createSignedSessionCookie(secret,'outsider-session');expect((await upload(metadata,outsider)).status).toBe(403);
  const get=(auth=otherCookie)=>request(base).get(`/api/v1/crypto/conversations/dm/attachments/${created.body.id}`).set('Cookie',auth);
  expect((await get(cookie)).status).toBe(403);const own=await get();expect(own.status).toBe(200);expect(own.body).toEqual(bytes);expect(own.headers['content-type']).toBe('application/octet-stream');expect(own.headers['cache-control']).toBe('no-store');
  const draft=(await pool.query(`SELECT * FROM chat_crypto_upload_drafts WHERE id=$1`,[created.body.id])).rows[0];
  expect(draft.envelope).toBeNull();expect(draft.encryption_mode).toBe('E2EE');expect(fs.readFileSync(path.join(objectRoot,draft.object_key))).toEqual(bytes);
  const bob=machines.find(m=>m.deviceId.toString()==='B')!,room=new sdk.RoomId('!fg_'+createHash('sha256').update('dm').digest('hex')+':fg.invalid');
  const settings=new sdk.EncryptionSettings();settings.historyVisibility=sdk.HistoryVisibility.Joined;settings.sharingStrategy=sdk.CollectStrategy.onlyTrustedDevices();await bob.shareRoomKey(room,[],settings);
  const plaintext={msgtype:'m.image',body:'private-name.png',file:{url:created.body.id,v:'v2',key:{kty:'oct',key_ops:['encrypt','decrypt'],alg:'A256CTR',k:key.toString('base64url'),ext:true},iv:iv.toString('base64'),hashes:{sha256:metadata.ciphertextSha256}}};
  const event=JSON.parse(await bob.encryptRoomEvent(room,'m.room.message',JSON.stringify(plaintext)));
  const message={clientMessageId:'native-image-fixture',deviceId:'B',membershipRevision:revision,envelope:{version:1,protocol:'MATRIX_MEGOLM',event},attachmentIds:[created.body.id]};
  const sent=await post('conversations/dm/messages',message,otherCookie);expect(sent.status).toBe(201);expect(sent.body.attachmentIds).toEqual([created.body.id]);
  expect((await get(cookie)).status).toBe(200);
  expect((await post('conversations/dm/messages',{...message,clientMessageId:'reuse-image-fixture'},otherCookie)).status).toBe(403);
  expect(JSON.stringify((await pool.query(`SELECT content,crypto_envelope FROM messages WHERE id=$1`,[sent.body.id])).rows[0])).not.toContain(key.toString('base64url'));
  const decrypted=await bob.decryptRoomEvent(JSON.stringify({type:'m.room.encrypted',sender:bob.userId.toString(),event_id:'$'+sent.body.id,origin_server_ts:Date.now(),content:event}),room,new sdk.DecryptionSettings(sdk.TrustRequirement.Untrusted));expect(JSON.parse(decrypted.event).content).toEqual(plaintext);
  await pool.query(`UPDATE chat_crypto_membership_intervals SET start_revision=$1 WHERE user_id='alice'`,[revision+1]);expect((await get(cookie)).status).toBe(403);await pool.query(`UPDATE chat_crypto_membership_intervals SET start_revision=1 WHERE user_id='alice'`);
  fs.writeFileSync(path.join(objectRoot,draft.object_key),Buffer.alloc(bytes.length));expect((await get()).status).toBe(403);
 });
 it('closes legacy plaintext message, image and outbox hydration routes for an E2EE conversation',async()=>{
  await pool.query(`INSERT INTO games(id,title) VALUES('fixture-game','Valorant') ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO profiles(user_id,display_name) VALUES('bob','Bob') ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO game_interests(id,user_id,game_id) VALUES('bob-interest','bob','fixture-game') ON CONFLICT DO NOTHING`);
  const plain=await request(base).post('/api/v1/conversations/dm/messages').set('Cookie',otherCookie).set('Origin',origin).send({content:'legacy-plaintext-must-not-be-stored',clientMessageId:'legacy-write-fixture'});
  expect(plain.status).toBe(403);
  expect((await pool.query(`SELECT id FROM messages WHERE client_message_id='legacy-write-fixture'`)).rowCount).toBe(0);
  expect((await request(base).get('/api/v1/conversations/dm/messages').set('Cookie',otherCookie)).status).toBe(403);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMZsAAAAASUVORK5CYII=','base64');
  expect((await request(base).post('/api/v1/uploads/images').set('Cookie',otherCookie).set('Origin',origin).field('conversationId','dm').attach('file',png,{filename:'legacy.png',contentType:'image/png'})).status).toBe(403);
  const attachment=(await pool.query(`SELECT id FROM attachments WHERE conversation_id='dm' LIMIT 1`)).rows[0];expect(attachment).toBeDefined();
  expect((await request(base).get(`/api/v1/attachments/${attachment.id}`).set('Cookie',otherCookie)).status).toBe(403);
  expect((await request(base).get(`/api/v1/attachments/${attachment.id}/content`).set('Cookie',otherCookie)).status).toBe(403);
  const encrypted=(await pool.query(`SELECT id FROM messages WHERE conversation_id='dm' AND encryption_mode='E2EE' LIMIT 1`)).rows[0];
  await expect(app.get(ChatService).committedMessage(encrypted.id)).rejects.toMatchObject({status:403});
 });
 it('bootstraps only empty private conversations and leaves existing plaintext history pending reconciliation',async()=>{
  await pool.query(`INSERT INTO conversations(id,kind) VALUES('empty-group','ROOM'),('old-group','ROOM')`);
  await pool.query(`INSERT INTO conversation_members(id,conversation_id,user_id) VALUES('empty-bob','empty-group','bob'),('old-bob','old-group','bob')`);
  await pool.query(`INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id) VALUES('legacy-old','old-group','bob','legacy-private-fixture','legacy-old')`);
  const get=(id:string)=>request(base).get(`/api/v1/crypto/conversations/${id}/state`).set('Cookie',otherCookie);
  const fresh=await get('empty-group');expect(fresh.status).toBe(200);expect(fresh.body).toMatchObject({migrationState:'RECONCILED',historyStatus:'KNOWN',membershipRevision:1});
  expect((await get('empty-group')).body).toEqual(fresh.body);
  expect((await pool.query(`SELECT start_revision,end_revision FROM chat_crypto_membership_intervals WHERE conversation_id='empty-group'`)).rows).toEqual([{start_revision:'1',end_revision:null}]);
  const old=await get('old-group');expect(old.status).toBe(200);expect(old.body).toMatchObject({migrationState:'LEGACY_PENDING',historyStatus:'UNKNOWN'});
  expect((await request(base).get('/api/v1/crypto/conversations/old-group/messages').set('Cookie',otherCookie)).status).toBe(403);
  expect((await request(base).get('/api/v1/conversations/old-group/messages').set('Cookie',otherCookie)).status).toBe(403);
  expect((await pool.query(`SELECT content,encryption_mode FROM messages WHERE id='legacy-old'`)).rows[0]).toEqual({content:'legacy-private-fixture',encryption_mode:'LEGACY_PENDING'});
 });
 it('atomically rotates membership epochs through actual team admission, HTTP kick and rejoin, hiding each history gap',async()=>{
  await pool.query(`INSERT INTO conversations(id,kind) VALUES('membership-group','ROOM')`);
  const seed=await pool.connect();try{await seed.query('BEGIN');
   await seed.query(`INSERT INTO rooms(id,name,game_id,owner_id,conversation_id) VALUES('membership-room','Group','fixture-game','bob','membership-group')`);
   await seed.query(`INSERT INTO room_members(id,room_id,user_id,role) VALUES('membership-owner','membership-room','bob','OWNER')`);
   await seed.query(`INSERT INTO conversation_members(id,conversation_id,user_id) VALUES('membership-owner','membership-group','bob')`);
   for(const id of ['membership-play-1','membership-play-2']){await seed.query(`INSERT INTO play_sessions(id,room_id,host_user_id,timing_type,scheduled_at) VALUES($1,'membership-room','bob','scheduledAt',now()+interval '1 day')`,[id]);await seed.query(`INSERT INTO team_members(id,play_session_id,user_id,slot_index,is_host) VALUES($1,$2,'bob',1,true)`,[id+'-host',id]);}
   await seed.query('COMMIT');
  }catch(error){await seed.query('ROLLBACK');throw error;}finally{seed.release();}
  await pool.query(`INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES('membership-group','E2EE','RECONCILED','KNOWN')`);
  await pool.query(`INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES('membership-owner','membership-group','bob',1,now())`);
  for(const user of ['alice','outsider']){await pool.query(`INSERT INTO profiles(user_id,display_name) VALUES($1,$1) ON CONFLICT DO NOTHING`,[user]);await pool.query(`INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,'fixture-game') ON CONFLICT DO NOTHING`,['member-interest-'+user,user]);}
  const revision=async()=>Number((await pool.query(`SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='membership-group'`)).rows[0].membership_revision);
  const bob=machines.find(m=>m.deviceId.toString()==='B')!,room=new sdk.RoomId(matrixRoomId('membership-group'));
  const message=async(id:string,epoch:number)=>{await bob.invalidateGroupSession(room);const settings=new sdk.EncryptionSettings();settings.historyVisibility=sdk.HistoryVisibility.Joined;settings.sharingStrategy=sdk.CollectStrategy.onlyTrustedDevices();await bob.shareRoomKey(room,[],settings);const event=JSON.parse(await bob.encryptRoomEvent(room,'m.room.message',JSON.stringify({msgtype:'m.text',body:id})));const result=await post('conversations/membership-group/messages',{clientMessageId:id,deviceId:'B',membershipRevision:epoch,envelope:{version:1,protocol:'MATRIX_MEGOLM',event}},otherCookie);expect(result.status).toBe(201);return result.body.id;};
  const before=await message('before-join',1);
  const teams=app.get(TeamsService),admit=async(play:string,user='alice',rollback=false)=>teams.transaction(async db=>{await db.query(`SELECT id FROM rooms WHERE id='membership-room' FOR UPDATE`);await db.query(`SELECT id FROM "user" WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE`,[['bob',user]]);await teams.admit(db,{id:'membership-room',owner_id:'bob',visibility:'PUBLIC',conversation_id:'membership-group'},play,user);if(rollback)throw new Error('Fixture forced transaction rollback');});
  await admit('membership-play-1');expect(await revision()).toBe(2);const joined=await message('after-join',2);
  const history=async()=>request(base).get('/api/v1/crypto/conversations/membership-group/messages').set('Cookie',cookie);
  expect((await history()).body.items.map((item:{id:string})=>item.id)).toEqual([joined]);
  const outsider=await createSignedSessionCookie(secret,'outsider-session');expect((await request(base).delete('/api/v1/rooms/membership-room/members/alice').set('Cookie',outsider).set('Origin',origin)).status).toBe(403);expect(await revision()).toBe(2);
  expect((await request(base).delete('/api/v1/rooms/membership-room/members/alice').set('Cookie',otherCookie).set('Origin',origin)).status).toBe(200);expect(await revision()).toBe(3);expect((await history()).status).toBe(403);
  const gap=await message('while-absent',3);await admit('membership-play-2');expect(await revision()).toBe(4);await admit('membership-play-2');expect(await revision()).toBe(4);
  const rejoined=await message('after-rejoin',4),visible=(await history()).body.items.map((item:{id:string})=>item.id);expect(visible).toEqual([joined,rejoined]);expect(visible).not.toContain(before);expect(visible).not.toContain(gap);
  expect((await pool.query(`SELECT start_revision,end_revision FROM chat_crypto_membership_intervals WHERE conversation_id='membership-group' AND user_id='alice' ORDER BY start_revision`)).rows).toEqual([{start_revision:'2',end_revision:'3'},{start_revision:'4',end_revision:null}]);
  await expect(admit('membership-play-1','outsider',true)).rejects.toThrow('Fixture forced transaction rollback');expect(await revision()).toBe(4);expect((await pool.query(`SELECT id FROM room_members WHERE room_id='membership-room' AND user_id='outsider'`)).rowCount).toBe(0);expect((await pool.query(`SELECT id FROM chat_crypto_membership_intervals WHERE conversation_id='membership-group' AND user_id='outsider'`)).rowCount).toBe(0);
 });
 it('dissolves an encrypted group without erasing session tombstones or leaving old chat access',async()=>{
  const before=(await pool.query(`SELECT id,crypto_envelope FROM messages WHERE conversation_id='membership-group' ORDER BY id`)).rows;expect(before.length).toBe(4);
  expect((await request(base).delete('/api/v1/rooms/membership-room').set('Cookie',otherCookie).set('Origin',origin)).status).toBe(200);
  expect((await pool.query(`SELECT id FROM rooms WHERE id='membership-room'`)).rowCount).toBe(0);
  expect((await pool.query(`SELECT id FROM conversation_members WHERE conversation_id='membership-group'`)).rowCount).toBe(0);
  expect((await pool.query(`SELECT id,crypto_envelope FROM messages WHERE conversation_id='membership-group' ORDER BY id`)).rows).toEqual(before);
  expect(Number((await pool.query(`SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='membership-group'`)).rows[0].membership_revision)).toBe(5);
  expect((await pool.query(`SELECT id FROM chat_crypto_membership_intervals WHERE conversation_id='membership-group' AND end_revision IS NULL`)).rowCount).toBe(0);
  expect((await request(base).get('/api/v1/crypto/conversations/membership-group/state').set('Cookie',otherCookie)).status).toBe(403);
  expect((await request(base).get('/api/v1/conversations/membership-group/messages').set('Cookie',cookie)).status).toBe(403);
 });
 it('closes the last-owner leave route while retaining the crypto epoch tombstone',async()=>{
  const seed=await pool.connect();try{await seed.query('BEGIN');await seed.query(`INSERT INTO conversations(id,kind) VALUES('sole-group','ROOM')`);await seed.query(`INSERT INTO rooms(id,name,game_id,owner_id,conversation_id) VALUES('sole-room','Sole','fixture-game','bob','sole-group')`);await seed.query(`INSERT INTO room_members(id,room_id,user_id,role) VALUES('sole-owner','sole-room','bob','OWNER')`);await seed.query(`INSERT INTO conversation_members(id,conversation_id,user_id) VALUES('sole-owner','sole-group','bob')`);await seed.query('COMMIT');}catch(error){await seed.query('ROLLBACK');throw error;}finally{seed.release();}
  expect((await request(base).get('/api/v1/crypto/conversations/sole-group/state').set('Cookie',otherCookie)).status).toBe(200);
  expect((await request(base).delete('/api/v1/rooms/sole-room/members/bob').set('Cookie',otherCookie).set('Origin',origin)).status).toBe(200);
  expect((await pool.query(`SELECT id FROM rooms WHERE id='sole-room'`)).rowCount).toBe(0);expect((await pool.query(`SELECT id FROM conversation_members WHERE conversation_id='sole-group'`)).rowCount).toBe(0);
  expect(Number((await pool.query(`SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='sole-group'`)).rows[0].membership_revision)).toBe(2);
  expect((await request(base).get('/api/v1/crypto/conversations/sole-group/state').set('Cookie',otherCookie)).status).toBe(403);
 });
 it('changes the private epoch only after actual room-invitation approval, then revokes self-leave access',async()=>{
  const created=await request(base).post('/api/v1/rooms').set('Cookie',otherCookie).set('Origin',origin).send({name:'Private invitation epoch',gameId:'fixture-game',gameTitle:'Valorant',visibility:'PRIVATE',invitePolicy:'OWNER_APPROVAL',playerCapacity:3});expect(created.status).toBe(200);
  const roomId=created.body.id as string,id=created.body.conversationId as string;
  // Seed the existing sender before crypto activation. An owner's invitation
  // already carries owner approval; a member's invitation requires the later gate.
  await pool.query(`INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,'outsider','MEMBER')`,[roomId+'-sender',roomId]);
  await pool.query(`INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,'outsider')`,[roomId+'-sender',id]);
  expect((await request(base).get(`/api/v1/crypto/conversations/${id}/state`).set('Cookie',otherCookie)).status).toBe(200);
  const revision=async()=>Number((await pool.query(`SELECT membership_revision FROM chat_crypto_state WHERE conversation_id=$1`,[id])).rows[0].membership_revision);
  const senderCookie=await createSignedSessionCookie(secret,'outsider-session');
  const invited=await request(base).post('/api/v1/invitations').set('Cookie',senderCookie).set('Origin',origin).send({targetType:'ROOM',roomId,receiverId:'alice'});expect(invited.status).toBe(201);expect(await revision()).toBe(1);
  const invitationId=invited.body.id as string;
  expect((await request(base).patch(`/api/v1/invitations/${invitationId}/respond`).set('Cookie',cookie).set('Origin',origin).send({action:'ACCEPT'})).status).toBe(200);expect(await revision()).toBe(1);
  expect((await request(base).get(`/api/v1/crypto/conversations/${id}/state`).set('Cookie',cookie)).status).toBe(403);
  const approve=()=>request(base).post(`/api/v1/invitations/${invitationId}/approve`).set('Cookie',otherCookie).set('Origin',origin).send({invitationId,action:'ACCEPT'});
  expect((await approve()).status).toBe(201);expect(await revision()).toBe(2);
  expect((await request(base).get(`/api/v1/crypto/conversations/${id}/state`).set('Cookie',cookie)).status).toBe(200);
  expect((await approve()).status).toBe(201);expect(await revision()).toBe(2);
  expect((await pool.query(`SELECT start_revision,end_revision FROM chat_crypto_membership_intervals WHERE conversation_id=$1 AND user_id='alice'`,[id])).rows).toEqual([{start_revision:'2',end_revision:null}]);
  expect((await request(base).delete(`/api/v1/rooms/${roomId}/members/alice`).set('Cookie',cookie).set('Origin',origin)).status).toBe(200);expect(await revision()).toBe(3);
  expect((await request(base).get(`/api/v1/crypto/conversations/${id}/messages`).set('Cookie',cookie)).status).toBe(403);
  expect((await pool.query(`SELECT start_revision,end_revision FROM chat_crypto_membership_intervals WHERE conversation_id=$1 AND user_id='alice'`,[id])).rows).toEqual([{start_revision:'2',end_revision:'3'}]);
 });
 it('serializes a new admission against first crypto activation without losing its history interval',async()=>{
  const created=await request(base).post('/api/v1/rooms').set('Cookie',otherCookie).set('Origin',origin).send({name:'Activation race',gameId:'fixture-game',gameTitle:'Valorant',visibility:'PUBLIC',playerCapacity:3});expect(created.status).toBe(200);
  const roomId=created.body.id as string,id=created.body.conversationId as string;
  const seed=await pool.connect();try{await seed.query('BEGIN');await seed.query(`INSERT INTO play_sessions(id,room_id,host_user_id,timing_type,scheduled_at) VALUES('activation-play',$1,'bob','scheduledAt',now()+interval '1 day')`,[roomId]);await seed.query(`INSERT INTO team_members(id,play_session_id,user_id,slot_index,is_host) VALUES('activation-host','activation-play','bob',1,true)`);await seed.query('COMMIT');}catch(error){await seed.query('ROLLBACK');throw error;}finally{seed.release();}
  await pool.query(`INSERT INTO recruitments(id,room_id,game_id,game_title,play_session_id,title,mode,player_capacity,timing_type,scheduled_at) VALUES('activation-card',$1,'fixture-game','Valorant','activation-play','Activation','flex',3,'scheduledAt',now()+interval '1 day')`,[roomId]);
  await pool.query(`INSERT INTO join_requests(id,recruitment_id,applicant_id) VALUES('activation-join','activation-card','alice')`);
  const blocker=await pool.connect();let activation:Promise<request.Response>|undefined,admission:Promise<request.Response>|undefined,settled=false;
  const until=async(condition:()=>Promise<boolean>)=>{const deadline=Date.now()+5000;while(!await condition()){if(Date.now()>deadline)throw new Error('Activation race boundary was not reached');await new Promise(resolve=>setTimeout(resolve,20));}};
  try{
   await blocker.query('BEGIN');const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   // Pause after activation snapshots members but before it commits intervals.
   await blocker.query(`LOCK TABLE chat_crypto_membership_intervals IN SHARE MODE`);
   activation=request(base).get(`/api/v1/crypto/conversations/${id}/state`).set('Cookie',otherCookie).then(result=>result);
   let activatingPid:number|undefined;await until(async()=>{activatingPid=(await pool.query(`SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%INSERT INTO chat_crypto_membership_intervals%'`,[pid])).rows[0]?.pid;return Boolean(activatingPid);});
   admission=request(base).post('/api/v1/join-requests/activation-join/approve').set('Cookie',otherCookie).set('Origin',origin).send({}).then(result=>{settled=true;return result;});
   // The conversation FK can serialize admission before the helper runs.
   await until(async()=>settled||Boolean((await pool.query(`SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%conversation%'`,[activatingPid])).rowCount));
  }finally{await blocker.query('ROLLBACK');blocker.release();}
  const [result,accepted]=await Promise.all([activation!,admission!]);expect(result.status).toBe(200);expect(accepted.status).toBe(201);
  expect((await pool.query(`SELECT id FROM room_members WHERE room_id=$1 AND user_id='alice'`,[roomId])).rowCount).toBe(1);
  expect((await pool.query(`SELECT start_revision,end_revision FROM chat_crypto_membership_intervals WHERE conversation_id=$1 AND user_id='alice'`,[id])).rows).toEqual([{start_revision:'2',end_revision:null}]);
  expect(Number((await pool.query(`SELECT membership_revision FROM chat_crypto_state WHERE conversation_id=$1`,[id])).rows[0].membership_revision)).toBe(2);
 });
 it('synchronizes opposite event orders across conversations without a lock-order deadlock',async()=>{
  expect((await post('devices',await nativeDevice('alice','C'))).status).toBe(201);
  for(const id of ['sync-order-a','sync-order-b']){
   await pool.query(`INSERT INTO conversations(id,kind) VALUES($1,'ROOM')`,[id]);for(const user of ['alice','bob'])await pool.query(`INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3)`,[id+'-'+user,id,user]);
   expect((await request(base).get(`/api/v1/crypto/conversations/${id}/state`).set('Cookie',otherCookie)).status).toBe(200);
  }
  for(const [sender,deviceId,receiver,recipientDeviceId,ids]of [['alice','C','bob','B',['sync-order-a','sync-order-b']],['bob','B','alice','C',['sync-order-b','sync-order-a']]] as const)for(const id of ids){
   const transactionId=sender+'-'+id;expect((await post('verification',{conversationId:id,membershipRevision:1,deviceId,transactionId,recipientUserId:receiver,recipientDeviceId,eventType:'m.key.verification.request',content:{transaction_id:transactionId,from_device:deviceId,methods:['m.sas.v1'],timestamp:Date.now()}},sender==='alice'?cookie:otherCookie)).status).toBe(201);
  }
  const blocker=await pool.connect();let bobSync:Promise<request.Response>|undefined,aliceSync:Promise<request.Response>|undefined;
  const until=async(condition:()=>Promise<boolean>)=>{const deadline=Date.now()+5000;while(!await condition()){if(Date.now()>deadline)throw new Error('Expected sync database race boundary was not reached');await new Promise(resolve=>setTimeout(resolve,20));}};
  try{
   await blocker.query('BEGIN');const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);await blocker.query(`SELECT conversation_id FROM chat_crypto_state WHERE conversation_id='sync-order-a' FOR UPDATE`);
   bobSync=request(base).get('/api/v1/crypto/sync?deviceId=B').set('Cookie',otherCookie).then(result=>result);
   let firstPid:number|undefined;await until(async()=>{firstPid=(await pool.query(`SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%chat_crypto_state%'`,[pid])).rows[0]?.pid;return Boolean(firstPid);});
   aliceSync=request(base).get('/api/v1/crypto/sync?deviceId=C').set('Cookie',cookie).then(result=>result);
   await until(async()=>Boolean((await pool.query(`SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%conversations%'`,[firstPid])).rowCount));
  }finally{await blocker.query('ROLLBACK');blocker.release();}
  const [bobResult,aliceResult]=await Promise.all([bobSync!,aliceSync!]);expect(bobResult.status).toBe(200);expect(aliceResult.status).toBe(200);
  expect(bobResult.body.verification.map((item:{event:{content:{transaction_id:string}}})=>item.event.content.transaction_id).sort()).toEqual(['alice-sync-order-a','alice-sync-order-b']);
  expect(aliceResult.body.verification.map((item:{event:{content:{transaction_id:string}}})=>item.event.content.transaction_id).sort()).toEqual(['bob-sync-order-a','bob-sync-order-b']);
 });
 it('commits an in-flight ciphertext before device revocation without a sender-FK deadlock',async()=>{
  const epoch=Number((await request(base).get('/api/v1/crypto/conversations/dm/state').set('Cookie',otherCookie)).body.membershipRevision);
  const bob=machines.find(m=>m.deviceId.toString()==='B')!,room=new sdk.RoomId(matrixRoomId('dm'));
  await bob.invalidateGroupSession(room);const settings=new sdk.EncryptionSettings();settings.historyVisibility=sdk.HistoryVisibility.Joined;settings.sharingStrategy=sdk.CollectStrategy.onlyTrustedDevices();await bob.shareRoomKey(room,[],settings);
  const body=async(clientMessageId:string)=>({clientMessageId,deviceId:'B',membershipRevision:epoch,envelope:{version:1,protocol:'MATRIX_MEGOLM',event:JSON.parse(await bob.encryptRoomEvent(room,'m.room.message',JSON.stringify({msgtype:'m.text',body:clientMessageId})))}});
  expect((await post('conversations/dm/messages',await body('sender-fk-first'),otherCookie)).status).toBe(201);
  const payload=await body('sender-fk-in-flight'),blocker=await pool.connect();let sending:Promise<request.Response>|undefined,revoking:Promise<request.Response>|undefined;
  const until=async(condition:()=>Promise<boolean>)=>{const deadline=Date.now()+5000;while(!await condition()){if(Date.now()>deadline)throw new Error('Sender-FK race boundary was not reached');await new Promise(resolve=>setTimeout(resolve,20));}};
  try{
   await blocker.query('BEGIN');const pid=Number((await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);await blocker.query('LOCK TABLE messages IN SHARE MODE');
   sending=post('conversations/dm/messages',payload,otherCookie).then(result=>result);
   let sendingPid:number|undefined;await until(async()=>{sendingPid=(await pool.query(`SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%INSERT INTO messages%'`,[pid])).rows[0]?.pid;return Boolean(sendingPid);});
   revoking=request(base).delete('/api/v1/crypto/devices/B').set('Cookie',otherCookie).set('Origin',origin).then(result=>result);
   await until(async()=>Boolean((await pool.query(`SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%chat_crypto_state%'`,[sendingPid])).rowCount));
  }finally{await blocker.query('ROLLBACK');blocker.release();}
  const [sent,revoked]=await Promise.all([sending!,revoking!]);expect(sent.status).toBe(201);expect(revoked.status).toBe(200);
  expect((await pool.query(`SELECT id FROM messages WHERE conversation_id='dm' AND client_message_id='sender-fk-in-flight' AND crypto_revision=$1`,[epoch])).rowCount).toBe(1);
  expect((await pool.query(`SELECT revoked_at FROM chat_crypto_devices WHERE user_id='bob' AND device_id='B'`)).rows[0].revoked_at).not.toBeNull();
  const after=await request(base).get('/api/v1/crypto/conversations/dm/state').set('Cookie',otherCookie);expect(after.body.membershipRevision).toBe(epoch+1);
  expect((await post('conversations/dm/messages',payload,otherCookie)).status).toBe(409);
 });
 it('denies bans and does not resurrect a deleted session after unban',async()=>{
  await pool.query(`INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason,created_at) VALUES('ban','bob','alice','BAN','fixture',now())`);
  expect((await request(base).get('/api/v1/crypto/recovery').set('Cookie',cookie)).status).toBe(403);
  await pool.query(`DELETE FROM "session" WHERE user_id='alice'`);
  await pool.query(`INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason,created_at) VALUES('unban','bob','alice','UNBAN','fixture',now()+interval '1 second')`);
  expect((await request(base).get('/api/v1/crypto/recovery').set('Cookie',cookie)).status).toBe(401);
  await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('alice-new-session','alice','alice-new-session',now()+interval '1 day',now(),now())`);
  cookie=await createSignedSessionCookie(secret,'alice-new-session');
  expect((await request(base).get('/api/v1/crypto/recovery').set('Cookie',cookie)).status).toBe(200);
 });
 it('cleans expired ciphertext drafts without deleting live or consumed objects, and tolerates a missing file',async()=>{
  expect((await post('devices',await nativeDevice('bob','CLEAN'),otherCookie)).status).toBe(201);
  const revision=Number((await pool.query(`SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='dm'`)).rows[0].membership_revision);
  const create=async(tag:string)=>{
   const bytes=randomBytes(32),metadata={clientUploadId:tag,deviceId:'CLEAN',membershipRevision:revision,ciphertextSize:bytes.length,ciphertextSha256:createHash('sha256').update(bytes).digest('base64')};
   const result=await request(base).post('/api/v1/crypto/conversations/dm/attachments').set('Cookie',otherCookie).set('Origin',origin).field('metadata',JSON.stringify(metadata)).attach('file',bytes,{filename:'opaque.bin',contentType:'application/octet-stream'});
   expect(result.status).toBe(201);return (await pool.query(`SELECT * FROM chat_crypto_upload_drafts WHERE id=$1`,[result.body.id])).rows[0];
  };
  const expired=await create('cleanup-expired'),missing=await create('cleanup-missing'),live=await create('cleanup-live');
  const consumed=(await pool.query(`SELECT * FROM chat_crypto_upload_drafts WHERE message_id IS NOT NULL LIMIT 1`)).rows[0];expect(consumed).toBeDefined();
  await pool.query(`UPDATE chat_crypto_upload_drafts SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day',consumed_at=CASE WHEN consumed_at IS NULL THEN NULL ELSE now()-interval '36 hours' END WHERE id=ANY($1::text[])`,[[expired.id,missing.id,consumed.id]]);
  fs.unlinkSync(path.join(objectRoot,missing.object_key));
  const cleanup=()=> (app.get(CryptoRelayService) as unknown as {cleanup:()=>Promise<void>}).cleanup();
  await cleanup();await cleanup();
  expect((await pool.query(`SELECT id FROM chat_crypto_upload_drafts WHERE id=ANY($1::text[])`,[[expired.id,missing.id]])).rowCount).toBe(0);
  expect(fs.existsSync(path.join(objectRoot,expired.object_key))).toBe(false);
  expect((await pool.query(`SELECT id FROM chat_crypto_upload_drafts WHERE id=ANY($1::text[])`,[[live.id,consumed.id]])).rowCount).toBe(2);
  expect(fs.existsSync(path.join(objectRoot,live.object_key))).toBe(true);expect(fs.existsSync(path.join(objectRoot,consumed.object_key))).toBe(true);
 });
 it('retains an expired draft after filesystem failure and skips a locked draft for retry',async()=>{
  const row=(await pool.query(`SELECT * FROM chat_crypto_upload_drafts WHERE client_upload_id='cleanup-live'`)).rows[0];
  await pool.query(`UPDATE chat_crypto_upload_drafts SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1`,[row.id]);
  const cleanup=()=> (app.get(CryptoRelayService) as unknown as {cleanup:()=>Promise<void>}).cleanup();
  const lock=await pool.connect();try{
   await lock.query('BEGIN');await lock.query(`SELECT id FROM chat_crypto_upload_drafts WHERE id=$1 FOR UPDATE`,[row.id]);
   await cleanup();expect(fs.existsSync(path.join(objectRoot,row.object_key))).toBe(true);
  }finally{await lock.query('ROLLBACK');lock.release();}
  const target=path.join(objectRoot,row.object_key);fs.unlinkSync(target);fs.mkdirSync(target);
  try{await expect(cleanup()).rejects.toBeDefined();expect((await pool.query(`SELECT id FROM chat_crypto_upload_drafts WHERE id=$1`,[row.id])).rowCount).toBe(1);}
  finally{fs.rmdirSync(target);}
  await cleanup();expect((await pool.query(`SELECT id FROM chat_crypto_upload_drafts WHERE id=$1`,[row.id])).rowCount).toBe(0);
 });
 it('bounds each sweep to 100 expired drafts and finishes the remainder on retry',async()=>{
  const rows=Array.from({length:101},()=>({id:randomUUID(),key:randomUUID()+'.bin'}));
  for(const row of rows)fs.writeFileSync(path.join(objectRoot,row.key),randomBytes(32));
  await pool.query(`INSERT INTO chat_crypto_upload_drafts(id,uploader_id,conversation_id,device_id,client_upload_id,membership_revision,encryption_mode,object_key,ciphertext_size,ciphertext_sha256,created_at,expires_at)
   SELECT x.id,'bob','dm','CLEAN',x.id,s.membership_revision,'E2EE',x.key,32,$2,now()-interval '2 days',now()-interval '1 day'
   FROM jsonb_to_recordset($1::jsonb) AS x(id text,key text) CROSS JOIN chat_crypto_state s WHERE s.conversation_id='dm'`,[JSON.stringify(rows),Buffer.alloc(32).toString('base64')]);
  const cleanup=()=> (app.get(CryptoRelayService) as unknown as {cleanup:()=>Promise<void>}).cleanup();
  await cleanup();expect((await pool.query(`SELECT id FROM chat_crypto_upload_drafts WHERE id=ANY($1::text[])`,[rows.map(r=>r.id)])).rowCount).toBe(1);
  expect(rows.filter(row=>fs.existsSync(path.join(objectRoot,row.key)))).toHaveLength(1);
  await cleanup();expect((await pool.query(`SELECT id FROM chat_crypto_upload_drafts WHERE id=ANY($1::text[])`,[rows.map(r=>r.id)])).rowCount).toBe(0);
 });
 const queueTables=['chat_crypto_to_device_events','chat_crypto_protocol_events'] as const;
 async function seedQueue(tag:string,count:number,expired:boolean,acknowledged=false){
  const curve=(await pool.query(`SELECT curve25519_key FROM chat_crypto_devices WHERE user_id='bob' AND device_id='CLEAN'`)).rows[0].curve25519_key as string;
  for(const table of queueTables){
   const column=table==='chat_crypto_to_device_events'?'content':'event';
   await pool.query(`INSERT INTO ${table}(id,conversation_id,membership_revision,sender_user_id,sender_device_id,recipient_user_id,recipient_device_id,transaction_id,${column},created_at,expires_at,acknowledged_at)
    SELECT $1||'-'||n,'dm',s.membership_revision,'bob','CLEAN','bob','CLEAN',$1||'-'||n,
    CASE WHEN $2 THEN jsonb_build_object('algorithm','m.olm.v1.curve25519-aes-sha2','sender_key',$3::text,'ciphertext',jsonb_build_object($3::text,jsonb_build_object('type',0,'body','AQID')))
    ELSE jsonb_build_object('eventType','m.key.verification.request','content',jsonb_build_object('transaction_id',$1||'-'||n,'from_device','CLEAN','methods',jsonb_build_array('m.sas.v1'),'timestamp',1)) END,
    now()-interval '2 days',CASE WHEN $4 THEN now()-interval '1 day' ELSE now()+interval '1 day' END,CASE WHEN $5 THEN now() ELSE NULL END
    FROM generate_series(1,$6::int) n CROSS JOIN chat_crypto_state s WHERE s.conversation_id='dm'`,[tag,table===queueTables[0],curve,expired,acknowledged,count]);
  }
 }
 async function queueCount(table:string,tag:string){return Number((await pool.query(`SELECT count(*) FROM ${table} WHERE id LIKE $1`,[tag+'-%'])).rows[0].count);}
 it('prunes expired protocol queues and retains live acknowledged events for transaction dedup',async()=>{
  await seedQueue('queue-expired',1,true);await seedQueue('queue-expired-ack',1,true,true);
  await seedQueue('queue-live',1,false);await seedQueue('queue-live-ack',1,false,true);
  const sweep=()=>app.get(CryptoRelayService).cleanup();await sweep();await sweep();
  for(const table of queueTables){expect(await queueCount(table,'queue-expired')).toBe(0);expect(await queueCount(table,'queue-live')).toBe(2);}
 });
 it('bounds expired queue batches and skips actual locked event rows until a later sweep',async()=>{
  await seedQueue('queue-batch',102,true);
  const lock=await pool.connect();
  try{
   await lock.query('BEGIN');for(const table of queueTables)await lock.query(`SELECT id FROM ${table} WHERE id='queue-batch-1' FOR UPDATE`);
   await app.get(CryptoRelayService).cleanup();
   for(const table of queueTables){expect(await queueCount(table,'queue-batch')).toBe(2);expect((await pool.query(`SELECT id FROM ${table} WHERE id='queue-batch-1'`)).rowCount).toBe(1);}
  }finally{await lock.query('ROLLBACK');lock.release();}
  await app.get(CryptoRelayService).cleanup();for(const table of queueTables)expect(await queueCount(table,'queue-batch')).toBe(0);
 });
 it('keeps acknowledged retry dedup and rejects conflicting payloads through actual HTTP after a sweep',async()=>{
  for(const table of queueTables){
   const before=(await pool.query(`SELECT * FROM ${table} WHERE id='queue-live-ack-1'`)).rows[0];
   const binding={conversationId:'dm',membershipRevision:Number(before.membership_revision),deviceId:'CLEAN',transactionId:before.transaction_id};
   const payload=table===queueTables[0]?{...binding,eventType:'m.room.encrypted',recipients:[{userId:'bob',deviceId:'CLEAN',content:before.content}]}:{...binding,recipientUserId:'bob',recipientDeviceId:'CLEAN',...before.event};
   const route=table===queueTables[0]?'to-device':'verification';
   expect((await post(route,payload,otherCookie)).status).toBe(201);
   const changed=structuredClone(payload);
   if('recipients' in changed)changed.recipients[0].content.ciphertext[before.content.sender_key].body='AQIE';else changed.content.timestamp=2;
   expect((await post(route,changed,otherCookie)).status).toBe(409);
   expect((await pool.query(`SELECT * FROM ${table} WHERE id='queue-live-ack-1'`)).rows[0]).toEqual(before);
   expect(await queueCount(table,'queue-live-ack')).toBe(1);
  }
 });
 it('rolls back both queue deletions on a real PostgreSQL fault and succeeds on retry',async()=>{
  await seedQueue('queue-fault',1,true);
  await pool.query(`CREATE FUNCTION queue_cleanup_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id='queue-fault-1' THEN RAISE EXCEPTION 'fixture cleanup fault'; END IF; RETURN OLD; END $$`);
  await pool.query(`CREATE TRIGGER queue_cleanup_fault BEFORE DELETE ON chat_crypto_protocol_events FOR EACH ROW EXECUTE FUNCTION queue_cleanup_fault()`);
  try{
   await expect(app.get(CryptoRelayService).cleanup()).rejects.toBeDefined();
   for(const table of queueTables)expect(await queueCount(table,'queue-fault')).toBe(1);
  }finally{await pool.query('DROP TRIGGER queue_cleanup_fault ON chat_crypto_protocol_events');await pool.query('DROP FUNCTION queue_cleanup_fault()');}
  await app.get(CryptoRelayService).cleanup();for(const table of queueTables)expect(await queueCount(table,'queue-fault')).toBe(0);
 });
 it('reclaims an owned opaque crash orphan that has no authoritative draft reference',async()=>{
  const key=randomUUID()+'.bin',target=path.join(objectRoot,key),bytes=randomBytes(32);fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});expect((await pool.query('SELECT 1 FROM chat_crypto_upload_drafts WHERE object_key=$1',[key])).rowCount).toBe(0);
  try{await app.get(CryptoRelayService).cleanup();expect(fs.existsSync(target)).toBe(false);}finally{bytes.fill(0);if(fs.existsSync(target))fs.unlinkSync(target);}
 });
 it.each(['commit','connection-loss'])('protects a real uncommitted object writer and reconciles its actual transaction outcome: %s',async(outcome)=>{
  const id=randomUUID(),key=id+'.bin',target=path.join(objectRoot,key),bytes=randomBytes(32),writer=await pool.connect(),application='fg-crypto-orphan-'+id,revision=Number((await pool.query("SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='dm'")).rows[0].membership_revision);writer.on('error',()=>{});
  try{await writer.query('BEGIN');await writer.query("SELECT set_config('application_name',$1,false)",[application]);const identity=(await writer.query('SELECT current_schema() AS schema,pg_backend_pid() AS pid')).rows[0];expect(identity.schema).toBe(owned);await lockCryptoObjectWrite(writer,key);fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});await writer.query("INSERT INTO chat_crypto_upload_drafts(id,uploader_id,conversation_id,device_id,client_upload_id,membership_revision,encryption_mode,object_key,ciphertext_size,ciphertext_sha256,expires_at) VALUES($1,'bob','dm','CLEAN',$1,$2,'E2EE',$3,$4,$5,now()+interval '1 hour')",[id,revision,key,bytes.length,createHash('sha256').update(bytes).digest('base64')]);expect((await pool.query('SELECT 1 FROM chat_crypto_upload_drafts WHERE id=$1',[id])).rowCount).toBe(0);await app.get(CryptoRelayService).cleanup();expect(fs.existsSync(target)).toBe(true);
   if(outcome==='commit'){await writer.query('COMMIT');await app.get(CryptoRelayService).cleanup();expect((await pool.query('SELECT 1 FROM chat_crypto_upload_drafts WHERE id=$1',[id])).rowCount).toBe(1);expect(fs.readFileSync(target)).toEqual(bytes);}else{const killed=await pool.query('SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE pid=$1 AND application_name=$2',[identity.pid,application]);expect(killed.rows).toEqual([{terminated:true}]);expect((await pool.query('SELECT 1 FROM chat_crypto_upload_drafts WHERE id=$1',[id])).rowCount).toBe(0);await app.get(CryptoRelayService).cleanup();expect(fs.existsSync(target)).toBe(false);}
  }finally{if(outcome==='commit')await writer.query('ROLLBACK');writer.release(outcome==='connection-loss');await pool.query('DELETE FROM chat_crypto_upload_drafts WHERE id=$1',[id]);bytes.fill(0);if(fs.existsSync(target))fs.unlinkSync(target);}
 });
 it('advances bounded native directory scans past referenced files without deleting noncanonical objects',async()=>{
  const relay=app.get(CryptoRelayService) as unknown as {cleanup:()=>Promise<void>;sweeps:{stop:()=>Promise<void>};objects:{closeScan:()=>Promise<void>}};await relay.sweeps.stop();await relay.objects.closeScan();const bytes=randomBytes(32),revision=Number((await pool.query("SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='dm'")).rows[0].membership_revision),protectedRows=Array.from({length:205},()=>{const id=randomUUID();return {id,key:id+'.bin'};}),orphans=Array.from({length:205},()=>randomUUID()+'.bin'),raw=path.join(objectRoot,'noncanonical-orphan.tmp'),originalOpen=fs.promises.opendir.bind(fs.promises),restores:Array<()=>void>=[];let reads=0;
  await pool.query("INSERT INTO chat_crypto_upload_drafts(id,uploader_id,conversation_id,device_id,client_upload_id,membership_revision,encryption_mode,object_key,ciphertext_size,ciphertext_sha256,expires_at) SELECT q.id,'bob','dm','CLEAN',q.id,$2,'E2EE',q.key,$3,$4,now()+interval '1 hour' FROM jsonb_to_recordset($1::jsonb) AS q(id text,key text)",[JSON.stringify(protectedRows),revision,bytes.length,createHash('sha256').update(bytes).digest('base64')]);for(const key of [...protectedRows.map(row=>row.key),...orphans])fs.writeFileSync(path.join(objectRoot,key),bytes,{flag:'wx',mode:0o600});fs.writeFileSync(raw,bytes,{flag:'wx',mode:0o600});const observer=jest.spyOn(fs.promises,'opendir').mockImplementation(async(...args:Parameters<typeof fs.promises.opendir>)=>{const dir=await originalOpen(...args),observed=dir as unknown as {read:()=>Promise<import('node:fs').Dirent|null>},actual=observed.read.bind(observed),spy=jest.spyOn(observed,'read').mockImplementation(async()=>{reads++;return actual();});restores.push(()=>spy.mockRestore());return dir;});
  try{let remaining=orphans.length;for(let round=0;round<8&&remaining;round++){reads=0;await relay.cleanup();expect(reads).toBeLessThanOrEqual(100);const after=orphans.filter(key=>fs.existsSync(path.join(objectRoot,key))).length;expect(remaining-after).toBeLessThanOrEqual(100);remaining=after;}expect(remaining).toBe(0);expect(protectedRows.every(row=>fs.existsSync(path.join(objectRoot,row.key)))).toBe(true);expect((await pool.query('SELECT id FROM chat_crypto_upload_drafts WHERE id=ANY($1::text[])',[protectedRows.map(row=>row.id)])).rowCount).toBe(205);expect(fs.readFileSync(raw)).toEqual(bytes);}finally{await relay.objects.closeScan();observer.mockRestore();for(const restore of restores)restore();await pool.query('DELETE FROM chat_crypto_upload_drafts WHERE id=ANY($1::text[])',[protectedRows.map(row=>row.id)]);for(const key of [...protectedRows.map(row=>row.key),...orphans]){const target=path.join(objectRoot,key);if(fs.existsSync(target))fs.unlinkSync(target);}fs.unlinkSync(raw);bytes.fill(0);}
 });
 it('joins overlapping cleanup calls instead of opening competing directory cursors',async()=>{
  const relay=app.get(CryptoRelayService) as unknown as {cleanup:()=>Promise<void>;objects:{closeScan:()=>Promise<void>}};await relay.objects.closeScan();const original=fs.promises.opendir.bind(fs.promises),opened:import('node:fs').Dir[]=[];const observer=jest.spyOn(fs.promises,'opendir').mockImplementation(async(...args:Parameters<typeof fs.promises.opendir>)=>{const dir=await original(...args);opened.push(dir);await new Promise(resolve=>setTimeout(resolve,30));return dir;});
  try{const results=await Promise.allSettled([relay.cleanup(),relay.cleanup()]);expect(results.every(result=>result.status==='fulfilled')).toBe(true);expect(opened).toHaveLength(1);}finally{observer.mockRestore();await relay.objects.closeScan();for(const dir of opened)try{await dir.close();}catch(error){expect((error as NodeJS.ErrnoException).code).toBe('ERR_DIR_CLOSED');}}
 });
 it('sees a writer commit after scanning even when the connection default is repeatable read',async()=>{
  const relay=app.get(CryptoRelayService) as unknown as {cleanup:()=>Promise<void>;pool:pg.Pool;objects:{closeScan:()=>Promise<void>;scanCandidates:()=>Promise<string[]>}};await relay.objects.closeScan();const id=randomUUID(),key=id+'.bin',target=path.join(objectRoot,key),bytes=randomBytes(32),revision=Number((await pool.query("SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='dm'")).rows[0].membership_revision),writer=await pool.connect(),reader=await relay.pool.connect();await reader.query("SET default_transaction_isolation TO 'repeatable read'");expect((await reader.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation).toBe('repeatable read');reader.release();let committed=false;const actual=relay.objects.scanCandidates.bind(relay.objects),observer=jest.spyOn(relay.objects,'scanCandidates').mockImplementation(async()=>{const candidates=await actual();expect(candidates).toContain(key);await writer.query('COMMIT');committed=true;return candidates;});
  try{await writer.query('BEGIN');await lockCryptoObjectWrite(writer,key);fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});await writer.query("INSERT INTO chat_crypto_upload_drafts(id,uploader_id,conversation_id,device_id,client_upload_id,membership_revision,encryption_mode,object_key,ciphertext_size,ciphertext_sha256,expires_at) VALUES($1,'bob','dm','CLEAN',$1,$2,'E2EE',$3,$4,$5,now()+interval '1 hour')",[id,revision,key,bytes.length,createHash('sha256').update(bytes).digest('base64')]);await relay.cleanup();expect(committed).toBe(true);expect((await pool.query('SELECT 1 FROM chat_crypto_upload_drafts WHERE id=$1',[id])).rowCount).toBe(1);expect(fs.existsSync(target)).toBe(true);expect(fs.readFileSync(target)).toEqual(bytes);}finally{observer.mockRestore();await writer.query('ROLLBACK');writer.release();const restore=await relay.pool.connect();try{await restore.query("SET default_transaction_isolation TO 'read committed'");}finally{restore.release();}await relay.objects.closeScan();await pool.query('DELETE FROM chat_crypto_upload_drafts WHERE id=$1',[id]);bytes.fill(0);if(fs.existsSync(target))fs.unlinkSync(target);}
 });
 it('rechecks durable session and ban state on every operation',async()=>{
  await pool.query(`DELETE FROM "session" WHERE user_id='alice'`);
  expect((await request(base).get('/api/v1/crypto/devices').set('Cookie',cookie)).status).toBe(401);
 });
 it('uses an expiry access path without scanning twenty thousand retained live queue rows',async()=>{
  const relay=app.get(CryptoRelayService) as unknown as {sweeps:{stop:()=>Promise<void>}};await relay.sweeps.stop();
  const tag='expiry-plan-'+randomUUID(),client=await pool.connect(),plans:Record<string,unknown>={};
  const flatten=(node:Record<string,unknown>):Record<string,unknown>[]=>[node,...((node.Plans??[]) as Record<string,unknown>[]).flatMap(flatten)];
  try{
   await seedQueue(tag+'-live',20000,false);await seedQueue(tag+'-expired',7,true);
   for(const table of queueTables){
    await pool.query(`ANALYZE ${table}`);await client.query('BEGIN');
    try{const result=await client.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM ${table} WHERE expires_at<=now() ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED`);plans[table]=result.rows[0]['QUERY PLAN'][0];}finally{await client.query('ROLLBACK');}
   }
   const destination=path.resolve('quality/evidence/CHATCRYPTO-BE',process.env.FG_EXPIRY_PLAN_LABEL??`expiry-query-native-${owned}.json`);expect(path.dirname(destination)).toBe(path.resolve('quality/evidence/CHATCRYPTO-BE'));expect(fs.existsSync(destination)).toBe(false);
   fs.writeFileSync(destination,JSON.stringify({recordedAt:new Date().toISOString(),ownedSchema:owned,livePerQueue:20000,expiredPerQueue:7,plannerForced:false,plans},null,2)+'\n',{flag:'wx'});
   for(const table of queueTables){const plan=plans[table] as {Plan:Record<string,unknown>},nodes=flatten(plan.Plan);expect(Number(plan.Plan['Actual Rows'])).toBe(7);expect(nodes.some(node=>node['Node Type']==='Seq Scan')).toBe(false);expect(nodes.some(node=>typeof node['Index Name']==='string'&&String(node['Index Name']).includes('expiry'))).toBe(true);}
  }finally{client.release();for(const table of queueTables)await pool.query(`DELETE FROM ${table} WHERE id LIKE $1`,[tag+'-%']);}
 });

 it('rolls back a private message when the authenticated session expires during an actual epoch lock wait',async()=>{
  const relay=app.get(CryptoRelayService) as unknown as {sweeps:{stop:()=>Promise<void>}};await relay.sweeps.stop();const conversation='dm',tag='authority-'+randomUUID(),machine=machines.find(m=>m.deviceId.toString()==='CLEAN')!;expect(machine).toBeDefined();
  const state=await request(base).get('/api/v1/crypto/conversations/'+conversation+'/state').set('Cookie',otherCookie);expect(state.status).toBe(200);const room=new sdk.RoomId(matrixRoomId(conversation)),settings=new sdk.EncryptionSettings();settings.historyVisibility=sdk.HistoryVisibility.Joined;settings.sharingStrategy=sdk.CollectStrategy.onlyTrustedDevices();await machine.invalidateGroupSession(room);await machine.shareRoomKey(room,[],settings);
  const event=JSON.parse(await machine.encryptRoomEvent(room,'m.room.message',JSON.stringify({msgtype:'m.text',body:'native-expired-actor-fixture'}))),payload={clientMessageId:tag,deviceId:'CLEAN',membershipRevision:state.body.membershipRevision,envelope:{version:1,protocol:'MATRIX_MEGOLM',event}},session=(await pool.query('SELECT id,user_id,token,expires_at::text AS expires_at,created_at::text AS created_at,updated_at::text AS updated_at FROM "session" WHERE id=$1',['bob-session'])).rows[0],holder=await pool.connect(),noticesBefore=(await pool.query(`SELECT count(*) AS count FROM notifications WHERE data::jsonb->>'conversationId'=$1`,[conversation])).rows[0].count;const actor=await app.get(ChatService).actor({cookie:otherCookie});expect(actor).toEqual({userId:session.user_id,sessionId:session.id});let pending:Promise<{value?:unknown;error?:unknown}>|undefined;
  try{
   await holder.query('BEGIN');const identity=(await holder.query('SELECT current_schema() AS schema,pg_backend_pid() AS pid')).rows[0];expect(identity.schema).toBe(owned);await holder.query('SELECT conversation_id FROM chat_crypto_state WHERE conversation_id=$1 FOR UPDATE',[conversation]);await pool.query(`UPDATE "session" SET expires_at=clock_timestamp()+interval '700 milliseconds' WHERE id=$1`,[session.id]);
   pending=app.get(CryptoRelayService).sendMessage(actor,conversation,payload).then(value=>({value}),error=>({error}));const deadline=Date.now()+3000;while(!(await pool.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[identity.pid])).rowCount){if(Date.now()>deadline)throw new Error('Expected native message epoch lock wait');await new Promise(resolve=>setTimeout(resolve,20));}
   await new Promise(resolve=>setTimeout(resolve,800));expect((await pool.query('SELECT id FROM "session" WHERE id=$1 AND expires_at<=clock_timestamp()',[session.id])).rowCount).toBe(1);await holder.query('ROLLBACK');const response=await pending;expect(response.error).toBeDefined();const error=response.error as {getStatus:()=>number;getResponse:()=>unknown};expect(error.getStatus()).toBe(401);expect(JSON.stringify(error.getResponse())).not.toContain(event.ciphertext);expect((await pool.query('SELECT id FROM messages WHERE conversation_id=$1 AND client_message_id=$2',[conversation,tag])).rowCount).toBe(0);expect((await pool.query('SELECT session_id FROM chat_crypto_outbound_sessions WHERE session_id=$1',[String(event.session_id).replace(/=+$/,'')])).rowCount).toBe(0);expect((await pool.query(`SELECT count(*) AS count FROM notifications WHERE data::jsonb->>'conversationId'=$1`,[conversation])).rows[0].count).toBe(noticesBefore);
  }finally{await holder.query('ROLLBACK');holder.release();await pending?.catch(()=>{});await pool.query('INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,token=EXCLUDED.token,expires_at=EXCLUDED.expires_at,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at',[session.id,session.user_id,session.token,session.expires_at,session.created_at,session.updated_at]);}
 });

 it.each(['read committed','repeatable read'])('rejects a ban committed during an actual epoch wait with connection default %s',async(isolation)=>{
  const relay=app.get(CryptoRelayService) as unknown as {pool:pg.Pool;sweeps:{stop:()=>Promise<void>};sendMessage:(actor:Awaited<ReturnType<ChatService['actor']>>,id:string,input:unknown)=>Promise<unknown>};await relay.sweeps.stop();const conversation='dm',tag='late-ban-'+randomUUID(),machine=machines.find(m=>m.deviceId.toString()==='CLEAN')!,state=await request(base).get('/api/v1/crypto/conversations/dm/state').set('Cookie',otherCookie);expect(state.status).toBe(200);const actor=await app.get(ChatService).actor({cookie:otherCookie});expect(actor).toEqual({userId:'bob',sessionId:'bob-session'});
  const room=new sdk.RoomId(matrixRoomId(conversation)),settings=new sdk.EncryptionSettings();settings.historyVisibility=sdk.HistoryVisibility.Joined;settings.sharingStrategy=sdk.CollectStrategy.onlyTrustedDevices();await machine.invalidateGroupSession(room);await machine.shareRoomKey(room,[],settings);const event=JSON.parse(await machine.encryptRoomEvent(room,'m.room.message',JSON.stringify({msgtype:'m.text',body:'native-late-actor-ban-fixture'}))),payload={clientMessageId:tag,deviceId:'CLEAN',membershipRevision:state.body.membershipRevision,envelope:{version:1,protocol:'MATRIX_MEGOLM',event}},holder=await pool.connect(),ban=randomUUID(),noticesBefore=(await pool.query(`SELECT count(*) AS count FROM notifications WHERE data::jsonb->>'conversationId'=$1`,[conversation])).rows[0].count;
  const previous=new Map<pg.PoolClient,string>(),original=relay.pool.connect.bind(relay.pool),observed=relay.pool as unknown as {connect:()=>Promise<pg.PoolClient>},observer=jest.spyOn(observed,'connect').mockImplementation(async()=>{const client=await original();if(!previous.has(client)){previous.set(client,(await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation);await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[isolation]);expect((await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation).toBe(isolation);}return client;});let pending:Promise<{value?:unknown;error?:unknown}>|undefined;
  try{
   await holder.query('BEGIN');const identity=(await holder.query('SELECT current_schema() AS schema,pg_backend_pid() AS pid')).rows[0];expect(identity.schema).toBe(owned);await holder.query('SELECT conversation_id FROM chat_crypto_state WHERE conversation_id=$1 FOR UPDATE',[conversation]);pending=relay.sendMessage(actor,conversation,payload).then(value=>({value}),error=>({error}));const deadline=Date.now()+3000;while(!(await pool.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[identity.pid])).rowCount){if(Date.now()>deadline)throw new Error('Expected native late-ban epoch wait');await new Promise(resolve=>setTimeout(resolve,20));}
   await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason,created_at) VALUES($1,'alice','bob','BAN','owned final actor authority',clock_timestamp())",[ban]);expect((await pool.query("SELECT action FROM admin_actions WHERE target_user_id='bob' AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1")).rows[0].action).toBe('BAN');await holder.query('ROLLBACK');const response=await pending;expect(response.error).toBeDefined();const error=response.error as {getStatus:()=>number};expect(error.getStatus()).toBe(403);expect((await pool.query('SELECT id FROM messages WHERE conversation_id=$1 AND client_message_id=$2',[conversation,tag])).rowCount).toBe(0);expect((await pool.query('SELECT session_id FROM chat_crypto_outbound_sessions WHERE session_id=$1',[String(event.session_id).replace(/=+$/,'')])).rowCount).toBe(0);expect((await pool.query(`SELECT count(*) AS count FROM notifications WHERE data::jsonb->>'conversationId'=$1`,[conversation])).rows[0].count).toBe(noticesBefore);
  }finally{await holder.query('ROLLBACK');holder.release();await pending?.catch(()=>{});observer.mockRestore();for(const [client,setting]of previous)await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[setting]);await pool.query('DELETE FROM admin_actions WHERE id=$1',[ban]);}
 });

 it('zeroes actual completed ciphertext buffers when the final actor decision rejects expiry',async()=>{
  const relay=app.get(CryptoRelayService) as unknown as {pool:pg.Pool;objects:{read:(key:string)=>Promise<Buffer>};readAttachment:(actor:Awaited<ReturnType<ChatService['actor']>>,id:string,attachment:string)=>Promise<Buffer>},state=await request(base).get('/api/v1/crypto/conversations/dm/state').set('Cookie',otherCookie);expect(state.status).toBe(200);const encrypted=sdk.Attachment.encrypt(new Uint8Array([0,255,17,200,31,0])),bytes=Buffer.from(encrypted.encryptedData);encrypted.free();const tag='actor-buffer-'+randomUUID(),upload=await request(base).post('/api/v1/crypto/conversations/dm/attachments').set('Cookie',otherCookie).set('Origin',origin).field('metadata',JSON.stringify({clientUploadId:tag,deviceId:'CLEAN',membershipRevision:state.body.membershipRevision,ciphertextSize:bytes.length,ciphertextSha256:createHash('sha256').update(bytes).digest('base64')})).attach('file',bytes,{filename:'opaque.bin',contentType:'application/octet-stream'});expect(upload.status).toBe(201);
  const actor=await app.get(ChatService).actor({cookie:otherCookie});expect(actor).toEqual({userId:'bob',sessionId:'bob-session'});const session=(await pool.query('SELECT id,user_id,token,expires_at::text AS expires_at,created_at::text AS created_at,updated_at::text AS updated_at FROM "session" WHERE id=$1',['bob-session'])).rows[0],actualRead=relay.objects.read.bind(relay.objects),readObserver=jest.spyOn(relay.objects,'read').mockImplementation(async key=>{const result=await actualRead(key);captured=result;expect(result.equals(bytes)).toBe(true);return result;}),seen=new Set<pg.PoolClient>(),restores:Array<()=>void>=[];let captured:Buffer|undefined,delayed=false;
  const observe=(client:pg.PoolClient)=>{if(seen.has(client))return;seen.add(client);const observed=client as unknown as {query:(...args:unknown[])=>unknown},actual=observed.query.bind(observed),spy=jest.spyOn(observed,'query').mockImplementation(async(...args)=>{if(typeof args[0]==='string'&&args[0].startsWith('SELECT s.id,COALESCE')&&!delayed){delayed=true;expect(captured).toBeDefined();await new Promise(resolve=>setTimeout(resolve,800));expect((await pool.query('SELECT id FROM "session" WHERE id=$1 AND expires_at<=clock_timestamp()',[session.id])).rowCount).toBe(1);}return Reflect.apply(actual,client,args);});restores.push(()=>spy.mockRestore());};relay.pool.on('acquire',observe);
  try{await pool.query(`UPDATE "session" SET expires_at=clock_timestamp()+interval '700 milliseconds' WHERE id=$1`,[session.id]);const response=await relay.readAttachment(actor,'dm',upload.body.id).then(value=>({value,error:undefined}),error=>({value:undefined,error}));expect(response.error).toBeDefined();expect((response.error as {getStatus:()=>number}).getStatus()).toBe(401);expect(delayed).toBe(true);expect(captured?.length).toBe(bytes.length);expect(captured?.every(value=>value===0)).toBe(true);}
  finally{readObserver.mockRestore();relay.pool.off('acquire',observe);for(const restore of restores)restore();bytes.fill(0);await pool.query('INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,token=EXCLUDED.token,expires_at=EXCLUDED.expires_at,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at',[session.id,session.user_id,session.token,session.expires_at,session.created_at,session.updated_at]);}
 });


 it.each([{kind:'expired session',isolation:'read committed',status:401},{kind:'late ban',isolation:'read committed',status:403},{kind:'late ban',isolation:'repeatable read',status:403}])('rejects $kind during genuine recovery backup wait with caller default $isolation',async({kind,isolation,status})=>{
  const devices=app.get(CryptoDevicesService) as unknown as {pool:pg.Pool;putRecovery:(actor:Awaited<ReturnType<ChatService['actor']>>,input:unknown)=>Promise<unknown>},originalBackup=(await pool.query(`SELECT user_id,backup_version,ciphertext,updated_at::text AS updated_at FROM chat_crypto_recovery_backups WHERE user_id='bob'`)).rows[0];
  if(!originalBackup){const created=await request(base).put('/api/v1/crypto/recovery').set('Cookie',otherCookie).set('Origin',origin).send({version:1,format:'MATRIX_ENCRYPTED_EXPORT',ciphertext:backup,expectedVersion:0});expect(created.status).toBe(200);}
  const baseline=(await pool.query(`SELECT row_to_json(b)::text AS snapshot,backup_version FROM chat_crypto_recovery_backups b WHERE user_id='bob'`)).rows[0],actor=await app.get(ChatService).actor({cookie:otherCookie});expect(actor).toEqual({userId:'bob',sessionId:'bob-session'});const session=(await pool.query('SELECT id,user_id,token,expires_at::text AS expires_at,created_at::text AS created_at,updated_at::text AS updated_at FROM "session" WHERE id=$1',['bob-session'])).rows[0],holder=await pool.connect(),ban=randomUUID(),previous=new Map<pg.PoolClient,string>(),actualConnect=devices.pool.connect.bind(devices.pool),observed=devices.pool as unknown as {connect:()=>Promise<pg.PoolClient>},connectObserver=jest.spyOn(observed,'connect').mockImplementation(async()=>{const client=await actualConnect();if(!previous.has(client)){previous.set(client,(await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation);await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[isolation]);expect((await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation).toBe(isolation);}return client;});let pending:Promise<{value?:unknown;error?:unknown}>|undefined;
  try{
   await holder.query('BEGIN');const identity=(await holder.query('SELECT current_schema() AS schema,pg_backend_pid() AS pid')).rows[0];expect(identity.schema).toBe(owned);await holder.query(`SELECT user_id FROM chat_crypto_recovery_backups WHERE user_id='bob' FOR UPDATE`);
   if(kind==='expired session')await pool.query(`UPDATE "session" SET expires_at=clock_timestamp()+interval '700 milliseconds' WHERE id=$1`,[session.id]);
   pending=devices.putRecovery(actor,{version:1,format:'MATRIX_ENCRYPTED_EXPORT',ciphertext:backup,expectedVersion:Number(baseline.backup_version)}).then(value=>({value}),error=>({error}));const deadline=Date.now()+3000;while(!(await pool.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[identity.pid])).rowCount){if(Date.now()>deadline)throw new Error('Expected actual recovery row wait');await new Promise(resolve=>setTimeout(resolve,20));}
   if(kind==='expired session'){await new Promise(resolve=>setTimeout(resolve,800));expect((await pool.query('SELECT id FROM "session" WHERE id=$1 AND expires_at<=clock_timestamp()',[session.id])).rowCount).toBe(1);}else{await pool.query("INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason,created_at) VALUES($1,'alice','bob','BAN','owned recovery final authority',clock_timestamp())",[ban]);expect((await pool.query("SELECT action FROM admin_actions WHERE target_user_id='bob' AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1")).rows[0].action).toBe('BAN');}
   await holder.query('ROLLBACK');const response=await pending;expect(response.error).toBeDefined();expect((response.error as {getStatus:()=>number}).getStatus()).toBe(status);expect((await pool.query(`SELECT row_to_json(b)::text AS snapshot FROM chat_crypto_recovery_backups b WHERE user_id='bob'`)).rows[0].snapshot).toBe(baseline.snapshot);
  }finally{await holder.query('ROLLBACK');holder.release();await pending?.catch(()=>{});connectObserver.mockRestore();for(const [client,setting]of previous)await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[setting]);await pool.query('DELETE FROM admin_actions WHERE id=$1',[ban]);await pool.query('INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,token=EXCLUDED.token,expires_at=EXCLUDED.expires_at,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at',[session.id,session.user_id,session.token,session.expires_at,session.created_at,session.updated_at]);if(originalBackup)await pool.query('UPDATE chat_crypto_recovery_backups SET backup_version=$2,ciphertext=$3,updated_at=$4 WHERE user_id=$1',[originalBackup.user_id,originalBackup.backup_version,originalBackup.ciphertext,originalBackup.updated_at]);else await pool.query(`DELETE FROM chat_crypto_recovery_backups WHERE user_id='bob'`);}
 });
});

