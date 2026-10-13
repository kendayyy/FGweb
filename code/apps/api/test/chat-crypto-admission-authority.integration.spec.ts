import 'reflect-metadata';
import {Module,INestApplication} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {jest} from '@jest/globals';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import request from 'supertest';
import {TeamsModule} from '../src/modules/teams/teams.module.js';
import {TeamsService} from '../src/modules/teams/teams.service.js';
import {InvitationsModule} from '../src/modules/invitations/invitations.module.js';
import {createSignedSessionCookie} from './test-cookie-helper.js';

@Module({imports:[TeamsModule,InvitationsModule]})class FixtureApp{}
jest.setTimeout(60000);
describe('Actual HTTP crypto admission authority after PostgreSQL epoch wait',()=>{
 const owned=`crypto_be_${randomUUID().replaceAll('-','')}`,savedEnv={...process.env};
 const origin='http://localhost:5173',secret='crypto-admission-fixture-secret-32-characters-minimum';
 let pool:pg.Pool,app:INestApplication,base:string;
 beforeAll(async()=>{
  const env=parseEnv(fs.readFileSync('.env.local','utf8')),url=new URL(env.DATABASE_URL);url.searchParams.set('options',`-c search_path=${owned}`);
  pool=new pg.Pool({connectionString:url.href,connectionTimeoutMillis:5000});await pool.query(`CREATE SCHEMA "${owned}"`);
  const db=await pool.connect();try{await migrate(drizzle(db),{migrationsFolder:'packages/database/migrations',migrationsSchema:owned});}finally{db.release();}
  Object.assign(process.env,{DATABASE_URL:url.href,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:secret,DISCORD_CLIENT_ID:'fixture',DISCORD_CLIENT_SECRET:'fixture',SMTP_HOST:'127.0.0.1',SMTP_PORT:'465',SMTP_USER:'fixture',SMTP_PASSWORD:'fixture',SMTP_FROM:'fixture@example.invalid'});
  app=await NestFactory.create(FixtureApp,{logger:false});await app.listen(0,'127.0.0.1');base=await app.getUrl();
  await pool.query(`INSERT INTO games(id,title) VALUES('fixture-game','Valorant')`);
 });
 afterAll(async()=>{try{await app?.close();}finally{try{if(pool){expect(owned).toMatch(/^crypto_be_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);}}finally{await pool?.end();process.env=savedEnv;}}});
 for(const kind of ['team-recipient','room-recipient','room-sender','room-direct-sender'] as const)for(const isolation of ['read committed','repeatable read'])for(const boundary of ['epoch','outbox']){
  it(`denies ${kind} BAN committed after actual ${boundary} wait under caller ${isolation}`,async()=>{
   const id=randomUUID(),owner=`owner-${id}`,sender=`sender-${id}`,recipient=`recipient-${id}`,session=`session-${id}`,target=kind.includes('sender')?sender:recipient;
   const seed=await pool.connect();try{await seed.query('BEGIN');
    for(const user of [owner,sender,recipient]){await seed.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,'Fixture',$2,true,now(),now())`,[user,`${user}@example.invalid`]);await seed.query(`INSERT INTO profiles(user_id,display_name) VALUES($1,'Fixture')`,[user]);await seed.query(`INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,'fixture-game')`,[`${id}-${user}`,user]);}
    await seed.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$1,now()+interval '1 day',now(),now())`,[session,kind==='room-direct-sender'?recipient:owner]);
    await seed.query(`INSERT INTO conversations(id,kind) VALUES($1,'ROOM')`,[id]);
    await seed.query(`INSERT INTO rooms(id,name,game_id,owner_id,conversation_id,visibility,invite_policy) VALUES($1,'Admission','fixture-game',$2,$1,'PUBLIC',$3)`,[id,owner,kind==='room-direct-sender'?'DIRECT_MEMBER':'OWNER_APPROVAL']);
    for(const user of [owner,sender]){await seed.query(`INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,$4)`,[`${id}-${user}`,id,user,user===owner?'OWNER':'MEMBER']);await seed.query(`INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3)`,[`${id}-${user}`,id,user]);await seed.query(`INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES($1,$2,$3,1,clock_timestamp())`,[`${id}-${user}`,id,user]);}
    await seed.query(`INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES($1,'E2EE','RECONCILED','KNOWN')`,[id]);
    if(kind==='team-recipient'){
     await seed.query(`INSERT INTO play_sessions(id,room_id,host_user_id,timing_type,scheduled_at) VALUES($1,$1,$2,'scheduledAt',now()+interval '1 day')`,[id,owner]);
     await seed.query(`INSERT INTO team_members(id,play_session_id,user_id,slot_index,is_host) VALUES($1,$1,$2,1,true)`,[id,owner]);
     await seed.query(`INSERT INTO recruitments(id,room_id,game_id,game_title,play_session_id,title,mode,player_capacity,timing_type,scheduled_at) VALUES($1,$1,'fixture-game','Valorant',$1,'Admission','flex',3,'scheduledAt',now()+interval '1 day')`,[id]);
     await seed.query(`INSERT INTO join_requests(id,recruitment_id,applicant_id) VALUES($1,$1,$2)`,[id,recipient]);
    }else await seed.query(`INSERT INTO invitations(id,target_type,sender_id,receiver_id,room_id,recipient_accepted_at) VALUES($1,'ROOM',$2,$3,$1,clock_timestamp())`,[id,sender,recipient]);
    await seed.query('COMMIT');
   }catch(error){await seed.query('ROLLBACK');throw error;}finally{seed.release();}
   const snapshot=async()=>{const rows=[];for(const table of ['rooms','room_members','conversation_members','chat_crypto_state','chat_crypto_membership_intervals','play_sessions','team_members','recruitments','join_requests','invitations','notifications','notification_outbox'])rows.push((await pool.query(`SELECT row_to_json(t)::text AS row FROM ${table} t ORDER BY row_to_json(t)::text`)).rows);return rows;};
   const before=await snapshot(),cookie=await createSignedSessionCookie(secret,session),nativePool=(app.get(TeamsService) as unknown as {pool:pg.Pool}).pool,actualConnect=nativePool.connect.bind(nativePool),previous=new Map<pg.PoolClient,string>();
   const observed=nativePool as unknown as {connect:()=>Promise<pg.PoolClient>};
   const observer=jest.spyOn(observed,'connect').mockImplementation(async()=>{const client=await actualConnect();if(!previous.has(client)){previous.set(client,(await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation);await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[isolation]);expect((await client.query('SHOW default_transaction_isolation')).rows[0].default_transaction_isolation).toBe(isolation);}return client;});
   const holder=await pool.connect(),ban=randomUUID();let pending:Promise<request.Response>|undefined;
   try{
    await holder.query('BEGIN');const identity=(await holder.query('SELECT current_schema() AS schema,pg_backend_pid() AS pid')).rows[0];expect(identity.schema).toBe(owned);
    if(boundary==='epoch')await holder.query('SELECT conversation_id FROM chat_crypto_state WHERE conversation_id=$1 FOR UPDATE',[id]);else await holder.query('LOCK TABLE notification_outbox IN SHARE MODE');
    const route=kind==='room-direct-sender'?request(base).patch(`/api/v1/invitations/${id}/respond`):request(base).post(kind==='team-recipient'?`/api/v1/join-requests/${id}/approve`:`/api/v1/invitations/${id}/approve`);
    pending=route.set('Cookie',cookie).set('Origin',origin).send(kind==='team-recipient'?{}:kind==='room-direct-sender'?{action:'ACCEPT'}:{invitationId:id,action:'ACCEPT'}).then(result=>result);
    const deadline=Date.now()+5000;while(!(await pool.query(`SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE $2`,[identity.pid,boundary==='epoch'?'%chat_crypto_state%':'%INSERT INTO notification_outbox%'])).rowCount){if(Date.now()>deadline)throw new Error(`Expected actual HTTP admission ${boundary} lock wait`);await new Promise(resolve=>setTimeout(resolve,20));}
    await pool.query(`INSERT INTO admin_actions(id,actor_id,target_user_id,action,created_at) VALUES($1,$2,$3,'BAN',clock_timestamp())`,[ban,owner,target]);expect((await pool.query(`SELECT action FROM admin_actions WHERE target_user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`,[target])).rows[0].action).toBe('BAN');
    await holder.query('ROLLBACK');const response=await pending;expect(response.status).toBe(403);expect(await snapshot()).toEqual(before);
   }finally{await holder.query('ROLLBACK');holder.release();await pending?.catch(()=>{});observer.mockRestore();for(const [client,setting]of previous)await client.query("SELECT set_config('default_transaction_isolation',$1,false)",[setting]);await pool.query('DELETE FROM admin_actions WHERE id=$1',[ban]);}
  });
 }
});
