import 'reflect-metadata';
import {Module,INestApplication} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {jest} from '@jest/globals';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import request from 'supertest';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import {ChatCryptoModule} from '../src/modules/chat-crypto/chat-crypto.module.js';
import {CryptoRelayService} from '../src/modules/chat-crypto/crypto-relay.service.js';
import {matrixUserId} from '../src/modules/chat-crypto/matrix-signatures.js';
import {createSignedSessionCookie} from './test-cookie-helper.js';

@Module({imports:[ChatCryptoModule]})class FixtureApp{}
jest.setTimeout(120000);
describe('Actual bounded cleanup of synthetic protocol-storage backlog',()=>{
 const owned=`crypto_be_${randomUUID().replaceAll('-','')}`,savedEnv={...process.env},objectRoot=path.resolve('.runtime/chatcrypto-be',owned);
 const tables=['chat_crypto_to_device_events','chat_crypto_protocol_events'] as const,secret='backlog-native-fixture-secret-32-characters-minimum',origin='http://localhost:5173';
 let pool:pg.Pool,app:INestApplication,machine:sdk.OlmMachine;
 const result:Record<string,unknown>={ownedSchema:owned,storageWorkloadSynthetic:true,clientExchangeClaim:false,productionCapacityClaim:false,mainMutation:false,backendPass:false,queueCount:2,expiredPerQueue:20000,livePerQueue:20000,lockedPerQueue:10,singleSweepCap:100,timerIntervalMs:60000,manualSweeps:true,registeredNativeDevice:false,timerStopped:false,perSweepBoundVerified:false,lockedRowsPreserved:false,liveDigestPreserved:false,drained:false,cleanup:false};
 beforeAll(async()=>{
  await sdk.initAsync();const env=parseEnv(fs.readFileSync('.env.local','utf8')),url=new URL(env.DATABASE_URL);url.searchParams.set('options',`-c search_path=${owned}`);
  pool=new pg.Pool({connectionString:url.href,connectionTimeoutMillis:5000});await pool.query(`CREATE SCHEMA "${owned}"`);
  const db=await pool.connect();try{await migrate(drizzle(db),{migrationsFolder:'packages/database/migrations',migrationsSchema:owned});}finally{db.release();}
  for(const user of ['alice','bob'])await pool.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())`,[user,`${user}@example.invalid`]);
  await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('bob-session','bob','bob-session',now()+interval '1 day',now(),now())`);
  await pool.query(`INSERT INTO conversations(id,kind,user1_id,user2_id) VALUES('dm','DM','alice','bob')`);
  await pool.query(`INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES('dm','E2EE','RECONCILED','KNOWN')`);
  Object.assign(process.env,{DATABASE_URL:url.href,FG_CRYPTO_OBJECTS_DIR:objectRoot,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:secret,DISCORD_CLIENT_ID:'fixture',DISCORD_CLIENT_SECRET:'fixture',SMTP_HOST:'127.0.0.1',SMTP_PORT:'465',SMTP_USER:'fixture',SMTP_PASSWORD:'fixture',SMTP_FROM:'fixture@example.invalid'});
  app=await NestFactory.create(FixtureApp,{logger:false});await app.listen(0,'127.0.0.1');
  const relay=app.get(CryptoRelayService) as unknown as {sweeps:{stop:()=>Promise<void>}};await relay.sweeps.stop();result.timerStopped=true;
  machine=await sdk.OlmMachine.initialize(new sdk.UserId(matrixUserId('bob')),new sdk.DeviceId('BACKLOG'));
  const upload=(await machine.outgoingRequests()).find(r=>r.type===sdk.RequestType.KeysUpload) as sdk.KeysUploadRequest,payload=JSON.parse(upload.body);
  const response=await request(await app.getUrl()).post('/api/v1/crypto/devices').set('Cookie',await createSignedSessionCookie(secret,'bob-session')).set('Origin',origin).send({deviceId:'BACKLOG',deviceKeys:payload.device_keys,oneTimeKeys:payload.one_time_keys});expect(response.status).toBe(201);result.registeredNativeDevice=true;
 });
 afterAll(async()=>{
  try{machine?.close();await app?.close();}finally{
   try{if(pool){expect(owned).toMatch(/^crypto_be_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);}if(fs.existsSync(objectRoot)){expect(fs.realpathSync(objectRoot)).toBe(path.join(fs.realpathSync('.runtime/chatcrypto-be'),owned));fs.rmSync(objectRoot,{recursive:true});}result.cleanup=true;}
   finally{await pool?.end();process.env=savedEnv;const target=path.resolve('quality/evidence/CHATCRYPTO-BE',process.env.FG_BACKLOG_RESULT_LABEL??`expiry-backlog-native-${owned}.json`);expect(path.dirname(target)).toBe(path.resolve('quality/evidence/CHATCRYPTO-BE'));expect(fs.existsSync(target)).toBe(false);const output={...result,recordedAt:new Date().toISOString()};fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(output));}
  }
 });
 it('advances by at most100 per queue, skips actual locked rows and preserves every live ACK/unACK row',async()=>{
  const curve=(await pool.query(`SELECT curve25519_key FROM chat_crypto_devices WHERE user_id='bob' AND device_id='BACKLOG'`)).rows[0].curve25519_key;
  for(const table of tables)for(const expired of [false,true]){
   const tag=expired?'expired':'live',column=table===tables[0]?'content':'event';
   // These constraint-valid synthetic storage rows are not real Olm exchanges.
   await pool.query(`INSERT INTO ${table}(id,conversation_id,membership_revision,sender_user_id,sender_device_id,recipient_user_id,recipient_device_id,transaction_id,${column},created_at,expires_at,acknowledged_at)
    SELECT $1||'-'||n,'dm',s.membership_revision,'bob','BACKLOG','bob','BACKLOG',$1||'-'||n,
    CASE WHEN $2 THEN jsonb_build_object('algorithm','m.olm.v1.curve25519-aes-sha2','sender_key',$3::text,'ciphertext',jsonb_build_object($3::text,jsonb_build_object('type',0,'body','AQID')))
    ELSE jsonb_build_object('eventType','m.key.verification.request','content',jsonb_build_object('transaction_id',$1||'-'||n,'from_device','BACKLOG','methods',jsonb_build_array('m.sas.v1'),'timestamp',1)) END,
    now()-interval '2 days',CASE WHEN $4 THEN now()-interval '1 day' ELSE now()+interval '1 day' END,CASE WHEN n%2=0 THEN now() ELSE NULL END
    FROM generate_series(1,20000) n CROSS JOIN chat_crypto_state s WHERE s.conversation_id='dm'`,[tag,table===tables[0],curve,expired]);
   await pool.query(`ANALYZE ${table}`);
  }
  const liveDigest=async(table:string)=>{const rows=(await pool.query(`SELECT row_to_json(t)::text AS row FROM ${table} t WHERE id LIKE 'live-%' ORDER BY id`)).rows;expect(rows.length).toBe(20000);expect((await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE id LIKE 'live-%' AND acknowledged_at IS NOT NULL`)).rows[0].n).toBe(10000);return createHash('sha256').update(rows.map(row=>row.row).join('\n')).digest('hex');};
  const counts=async()=>{const remaining=[];for(const table of tables)remaining.push(Number((await pool.query(`SELECT count(*) FROM ${table} WHERE id LIKE 'expired-%'`)).rows[0].count));return remaining;};
  const before:Record<string,string>={};for(const table of tables)before[table]=await liveDigest(table);expect(await counts()).toEqual([20000,20000]);
  const holder=await pool.connect(),relay=app.get(CryptoRelayService),locked:Record<string,string[]>={},passes:Array<{deleted:number[];durationMs:number}>=[];let unlocked=false;
  try{
   await holder.query('BEGIN');expect((await holder.query('SELECT current_schema() AS schema')).rows[0].schema).toBe(owned);
   for(const table of tables){locked[table]=(await holder.query(`SELECT id FROM ${table} WHERE id LIKE 'expired-%' ORDER BY expires_at,id LIMIT10 FOR UPDATE`.replace('LIMIT10','LIMIT 10'))).rows.map(row=>row.id);expect(locked[table].length).toBe(10);}
   let previous=await counts();const started=performance.now();
   for(let pass=0;pass<200;pass++){
    const begin=performance.now();await relay.cleanup();const after=await counts(),deleted=previous.map((n,index)=>n-after[index]);
    for(const n of deleted){expect(n).toBeGreaterThan(0);expect(n).toBeLessThanOrEqual(100);}passes.push({deleted,durationMs:performance.now()-begin});previous=after;
   }
   expect(previous).toEqual([10,10]);result.lockedDrainDurationMs=performance.now()-started;result.perSweepBoundVerified=true;
   for(const table of tables)expect((await pool.query(`SELECT id FROM ${table} WHERE id=ANY($1::text[]) ORDER BY id`,[locked[table]])).rows.map(row=>row.id)).toEqual([...locked[table]].sort());result.lockedRowsPreserved=true;
   await holder.query('ROLLBACK');unlocked=true;const last=performance.now();await relay.cleanup();result.finalSweepDurationMs=performance.now()-last;expect(await counts()).toEqual([0,0]);result.drained=true;
   const after:Record<string,string>={};for(const table of tables)after[table]=await liveDigest(table);expect(after).toEqual(before);result.liveDigestPreserved=true;
   Object.assign(result,{passes,manualSweepsCompleted:201,firstSweepDurationMs:passes[0].durationMs,liveRowDigests:after,expiredRemovedPerQueue:20000,liveAcknowledgedPerQueue:10000,liveUnacknowledgedPerQueue:10000});
  }finally{if(!unlocked)await holder.query('ROLLBACK');holder.release();}
 });
});
