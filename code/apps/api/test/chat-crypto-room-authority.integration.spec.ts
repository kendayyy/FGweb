import 'reflect-metadata';
import {Module,INestApplication,HttpException} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {jest} from '@jest/globals';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {RoomsModule} from '../src/modules/rooms/rooms.module.js';
import {RoomsService} from '../src/modules/rooms/rooms.service.js';
import {ChatModule} from '../src/modules/chat/chat.module.js';
import {ChatService} from '../src/modules/chat/chat.service.js';
import {createSignedSessionCookie} from './test-cookie-helper.js';

@Module({imports:[RoomsModule,ChatModule]})class FixtureApp{}
jest.setTimeout(60000);
describe('Room crypto membership final authority with real authenticated actor and PostgreSQL',()=>{
 const owned=`crypto_be_${randomUUID().replaceAll('-','')}`,savedEnv={...process.env};
 const secret='crypto-room-fixture-secret-32-characters-minimum';
 let pool:pg.Pool,app:INestApplication;
 beforeAll(async()=>{
  const env=parseEnv(fs.readFileSync('.env.local','utf8')),url=new URL(env.DATABASE_URL);
  url.searchParams.set('options',`-c search_path=${owned}`);pool=new pg.Pool({connectionString:url.href,connectionTimeoutMillis:5000});
  await pool.query(`CREATE SCHEMA "${owned}"`);
  const db=await pool.connect();try{await migrate(drizzle(db),{migrationsFolder:'packages/database/migrations',migrationsSchema:owned});}finally{db.release();}
  Object.assign(process.env,{DATABASE_URL:url.href,PUBLIC_ORIGIN:'http://localhost:5173',BETTER_AUTH_URL:'http://localhost:5173',BETTER_AUTH_SECRET:secret,DISCORD_CLIENT_ID:'fixture',DISCORD_CLIENT_SECRET:'fixture',SMTP_HOST:'127.0.0.1',SMTP_PORT:'465',SMTP_USER:'fixture',SMTP_PASSWORD:'fixture',SMTP_FROM:'fixture@example.invalid'});
  app=await NestFactory.create(FixtureApp,{logger:false});await app.init();
  await pool.query(`INSERT INTO games(id,title) VALUES('fixture-game','Valorant')`);
 });
 afterAll(async()=>{try{await app?.close();}finally{try{if(pool){expect(owned).toMatch(/^crypto_be_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);}}finally{await pool?.end();process.env=savedEnv;}}});
 for(const action of ['kick','leave','sole-owner-leave','dissolve'] as const){
  for(const fault of ['expiry','ban-rc','ban-rr'] as const){
   it(`rolls back ${action} when ${fault} occurs during an actual epoch lock wait`,async()=>{
    const id=randomUUID(),owner=`owner-${id}`,member=`member-${id}`,actorId=action==='leave'?member:owner,sessionId=`session-${id}`;
    const seed=await pool.connect();try{await seed.query('BEGIN');
     for(const user of [owner,member])await seed.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())`,[user,`${user}@example.invalid`]);
     await seed.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$1,now()+interval '1 day',now(),now())`,[sessionId,actorId]);
     await seed.query(`INSERT INTO conversations(id,kind) VALUES($1,'ROOM')`,[id]);
     await seed.query(`INSERT INTO rooms(id,name,game_id,owner_id,conversation_id) VALUES($1,'Native authority','fixture-game',$2,$1)`,[id,owner]);
     const members=action==='sole-owner-leave'?[owner]:[owner,member];
     for(const user of members){await seed.query(`INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,$4)`,[`${id}-${user}`,id,user,user===owner?'OWNER':'MEMBER']);await seed.query(`INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3)`,[`${id}-${user}`,id,user]);await seed.query(`INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES($1,$2,$3,1,clock_timestamp())`,[`${id}-${user}`,id,user]);}
     await seed.query(`INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES($1,'E2EE','RECONCILED','KNOWN')`,[id]);
     await seed.query('COMMIT');
    }catch(error){await seed.query('ROLLBACK');throw error;}finally{seed.release();}
    const snapshot=async()=>{const rows=[];for(const [table,column]of [['rooms','id'],['room_members','room_id'],['conversation_members','conversation_id'],['chat_crypto_membership_intervals','conversation_id'],['chat_crypto_state','conversation_id'],['permission_grants','room_id'],['conversations','id']])rows.push((await pool.query(`SELECT row_to_json(t)::text AS row FROM ${table} t WHERE ${column}=$1 ORDER BY row_to_json(t)::text`,[id])).rows);return rows;};
    const before=await snapshot(),cookie=await createSignedSessionCookie(secret,sessionId),actor=await app.get(ChatService).actor({cookie});
    expect(actor).toEqual({userId:actorId,sessionId});
    const session=(await pool.query('SELECT expires_at::text AS expires_at FROM "session" WHERE id=$1',[sessionId])).rows[0];
    const rooms=app.get(RoomsService),nativePool=(rooms as unknown as {pool:pg.Pool}).pool,holder=await pool.connect(),ban=randomUUID();
    const actualConnect=nativePool.connect.bind(nativePool),previous=new Map<pg.PoolClient,string>();
    const observed=nativePool as unknown as {connect:()=>Promise<pg.PoolClient>};
    const observer=jest.spyOn(observed,'connect').mockImplementation(async()=>{const client=await actualConnect();if(!previous.has(client)){previous.set(client,(await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation);await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[fault==='ban-rr'?'repeatable read':'read committed']);}return client;});
    let pending:Promise<{value?:unknown;error?:unknown}>|undefined;
    try{
     await holder.query('BEGIN');const identity=(await holder.query('SELECT current_schema() AS schema,pg_backend_pid() AS pid')).rows[0];expect(identity.schema).toBe(owned);
     await holder.query('SELECT conversation_id FROM chat_crypto_state WHERE conversation_id=$1 FOR UPDATE',[id]);
     if(fault==='expiry')await pool.query(`UPDATE "session" SET expires_at=clock_timestamp()+interval '700 milliseconds' WHERE id=$1`,[sessionId]);
     const operation=action==='dissolve'?rooms.dissolveRoom(actor!.userId,actor!.sessionId,id):rooms.leaveOrRemoveMember(actor!.userId,actor!.sessionId,id,action==='sole-owner-leave'?owner:member);
     pending=operation.then(value=>({value}),error=>({error}));
     const deadline=Date.now()+3000;while(!(await pool.query(`SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%chat_crypto_state%'`,[identity.pid])).rowCount){if(Date.now()>deadline)throw new Error('Expected actual room membership epoch lock wait');await new Promise(resolve=>setTimeout(resolve,20));}
     if(fault==='expiry'){await new Promise(resolve=>setTimeout(resolve,800));expect((await pool.query('SELECT id FROM "session" WHERE id=$1 AND expires_at<=clock_timestamp()',[sessionId])).rowCount).toBe(1);}
     else{await pool.query(`INSERT INTO admin_actions(id,actor_id,target_user_id,action) VALUES($1,$2,$3,'BAN')`,[ban,owner,actorId]);expect((await pool.query(`SELECT action FROM admin_actions WHERE target_user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`,[actorId])).rows[0].action).toBe('BAN');}
     await holder.query('ROLLBACK');const result=await pending;expect(result.error).toBeInstanceOf(HttpException);expect((result.error as HttpException).getStatus()).toBe(fault==='expiry'?401:403);expect(result.value).toBeUndefined();expect(await snapshot()).toEqual(before);
    }finally{await holder.query('ROLLBACK');holder.release();await pending?.catch(()=>{});observer.mockRestore();for(const [client,setting]of previous)await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[setting]);await pool.query('DELETE FROM admin_actions WHERE id=$1',[ban]);await pool.query('UPDATE "session" SET expires_at=$2 WHERE id=$1',[sessionId,session.expires_at]);}
   });
  }
 }
});
