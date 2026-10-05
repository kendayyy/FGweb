import 'reflect-metadata';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import pg from 'pg';import {Redis} from 'ioredis';import {drizzle} from 'drizzle-orm/node-postgres';import {migrate} from 'drizzle-orm/node-postgres/migrator';import {NestFactory} from '@nestjs/core';import {makeSignature} from 'better-auth/crypto';import {io} from 'socket.io-client';import * as database from '@fg/database';import {PublicProfileSchema,SocketPresenceAckSchema,SocketScopedPresenceChangedPayloadSchema} from '@fg/contracts';
const root=process.cwd(),owned='t16_native_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),origin='http://localhost:5173',secret='t16-compiled-native-secret-at-least-32-characters';
const sockets=[],apps=[],checks=[];let pool,redis,namespace,created=false;
const connect=async(base,cookie)=>{const s=io(base+'/presence',{transports:['websocket'],reconnection:false,extraHeaders:{Origin:origin,...cookie?{Cookie:cookie}:{}}});sockets.push(s);await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;};
const ack=async(s,event,id)=>SocketPresenceAckSchema.parse(await s.timeout(8000).emitWithAck(event,{conversationId:id}));
const expectOnline=async(base,game,want)=>{const res=await fetch(base+'/api/v1/games/'+game+'/online');assert.equal(res.status,200);const page=await res.json();page.items.forEach(item=>PublicProfileSchema.parse(item));assert.equal(page.items.some(item=>item.id==='member'),want);assert(!JSON.stringify(page).includes('email'));return page;};
try{
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('options','-c search_path='+owned);pool=new pg.Pool({connectionString:url.href,max:6});await pool.query('CREATE SCHEMA "'+owned+'"');created=true;
 const client=await pool.connect();try{await migrate(drizzle(client),{migrationsFolder:path.join(root,'packages/database/migrations'),migrationsSchema:owned});}finally{client.release();}
 const games=await database.seedGames(drizzle(pool,{schema:database})),game=games[0].id,conv='native:lobby';
 await pool.query("INSERT INTO conversations(id,kind,lobby_id) VALUES($1,'LOBBY',$2)",[conv,games[0].lobbyId]);
 await pool.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES('member','Member','member@example.com',true,now(),now()),('owner','Owner','owner@example.com',true,now(),now())`);
 await pool.query("INSERT INTO profiles(user_id,display_name,custom_status) VALUES('member','Native Gamer','PLAYING'),('owner','Native Owner','JUST_CHATTING')");
 await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('session-a','member','token-a',now()+interval '1 day',now(),now()),('session-b','member','token-b',now()+interval '1 day',now(),now()),('session-owner','owner','token-owner',now()+interval '1 day',now(),now())`);
 await pool.query("INSERT INTO conversations(id,kind) VALUES('native-private','ROOM')");
 const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query("INSERT INTO rooms(id,name,game_id,owner_id,conversation_id,visibility) VALUES('native-room','Native room',$1,'owner','native-private','PRIVATE')",[game]);await tx.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES('native-owner','native-room','owner','OWNER'),('native-member','native-room','member','MEMBER')");await tx.query('COMMIT');}finally{tx.release();}
 Object.assign(process.env,{DATABASE_URL:url.href,BETTER_AUTH_SECRET:secret,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin});
 const {AppModule}=await import('../../../apps/api/dist/app.module.js'),{PresenceService}=await import('../../../apps/api/dist/modules/presence/presence.service.js'),{ChatService}=await import('../../../apps/api/dist/modules/chat/chat.service.js');
 for(let i=0;i<2;i++){const app=await NestFactory.create(AppModule,{logger:false});apps.push(app);await app.listen(0,'127.0.0.1');}
 const [base1,base2]=await Promise.all(apps.map(app=>app.getUrl())),services=apps.map(app=>app.get(PresenceService));namespace=services[0].ns;assert.equal(namespace,services[1].ns);redis=new Redis(process.env.REDIS_URL);
 const cookie=async token=>'better-auth.session_token='+token+'.'+await makeSignature(token,secret);
 const guest=await connect(base1),a=await connect(base1,await cookie('token-a')),b=await connect(base2,await cookie('token-b'));
 assert.equal((await ack(guest,'presence.subscribe','native-private')).ok,false);assert.equal((await ack(guest,'presence.subscribe',conv)).ok,true);
 await ack(a,'presence.subscribe',conv);await ack(b,'presence.subscribe',conv);assert.equal((await expectOnline(base1,game,true)).items.length,1);
 await ack(a,'presence.unsubscribe',conv);await expectOnline(base2,game,true);checks.push('Two compiled CommonJS API instances share real Redis leases; one tab leave preserves deduped online user; canonical conversation differs from Lobby ID');
 const statusEvent=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Missing status event')),8000);guest.once('presence.changed',payload=>{clearTimeout(timer);resolve(payload);});});
 const changed=await fetch(base2+'/api/v1/me/status',{method:'PATCH',headers:{Origin:origin,Cookie:await cookie('token-b'),'Content-Type':'application/json'},body:JSON.stringify({customStatus:'LOOKING_FOR_TEAM'})});assert.equal(changed.status,200);assert.equal((await statusEvent).customStatus,'LOOKING_FOR_TEAM');
 assert.equal((await pool.query("SELECT custom_status FROM profiles WHERE user_id='member'")).rows[0].custom_status,'LOOKING_FOR_TEAM');checks.push('Actual authenticated status persists in PostgreSQL and arrives across API instances');
 await ack(a,'presence.subscribe',conv);await pool.query("DELETE FROM \"session\" WHERE id='session-a'");assert.equal((await ack(a,'presence.heartbeat',conv)).ok,false);await expectOnline(base1,game,true);
 await ack(b,'presence.unsubscribe',conv);await expectOnline(base1,game,false);checks.push('Revoked-session rejection removes its lease while preserving valid second session');
 let time=Date.now();services[1].setClock(()=>time);await ack(b,'presence.subscribe',conv);time+=44999;await expectOnline(base2,game,true);time+=1;await expectOnline(base2,game,false);await services[1].sweepExpiredLeases();services[1].setClock();checks.push('Real Redis uses exact server-side TTL boundary; selected SQL status survives expiry');
 await ack(b,'presence.unsubscribe',conv);assert.equal((await ack(b,'presence.subscribe','native-private')).ok,true);
 await pool.query("DELETE FROM room_members WHERE id='native-member'");assert.equal((await ack(b,'presence.heartbeat','native-private')).ok,false);assert.equal(await services[1].isUserOnlineInConv('native-private','member'),false);checks.push('Current room_members authorization removes private lease after membership revocation; guest never subscribes');
 // Verify concurrent event lifecycle using real authorization, delayed only by a test barrier.
 const c=await connect(base1,await cookie('token-b'));const initial=new Promise(resolve=>c.once('presence.changed',resolve));await ack(c,'presence.subscribe',conv);await initial;
 const chat=apps[0].get(ChatService),original=chat.authorize.bind(chat);let release,entered;const gate=new Promise(resolve=>{release=resolve;}),paused=new Promise(resolve=>{entered=resolve;});let first=true;
 chat.authorize=async(...args)=>{const result=await original(...args);if(first&&args[0]===conv){first=false;entered();await gate;}return result;};
 try{const heartbeat=ack(c,'presence.heartbeat',conv);await paused;const unsubscribe=ack(c,'presence.unsubscribe',conv);await new Promise(resolve=>setTimeout(resolve,75));release();assert.equal((await heartbeat).ok,true);assert.equal((await unsubscribe).ok,true);await expectOnline(base1,game,false);checks.push('Concurrent heartbeat and unsubscribe cannot resurrect a released socket');}finally{release?.();chat.authorize=original;}
 console.log(JSON.stringify({compiledCommonJS:true,realPostgres:true,realRedis:true,apiInstances:2,checks}));
}finally{
 for(const s of sockets)s.disconnect();
 for(const app of apps)await app.close();
 if(redis){if(namespace){assert(/^[a-f0-9]{16}$/.test(namespace));const prefix='fg:presence:'+namespace+':';let cursor='0';do{const [next,keys]=await redis.scan(cursor,'MATCH',prefix+'*','COUNT',100);cursor=next;assert(keys.every(key=>key.startsWith(prefix)));if(keys.length)await redis.del(...keys);}while(cursor!=='0');}await redis.quit();}
 if(pool){try{if(created){assert(/^t16_native_[0-9]+_[a-z0-9]+$/.test(owned));await pool.query('DROP SCHEMA "'+owned+'" CASCADE');}}finally{await pool.end();}}
 console.log('Owned native sockets, API instances, Redis namespace and disposable schema closed.');
}
