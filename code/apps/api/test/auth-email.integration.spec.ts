import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import nodemailer from 'nodemailer';
import supertest from 'supertest';
import {toNodeHandler} from 'better-auth/node';
import {verifyPassword} from 'better-auth/crypto';
import * as schema from '@fg/database';
import {MeDTOSchema,PrivateProfileSchema,PublicProfileSchema} from '@fg/contracts';
import {AuthService,createFgAuth} from '../src/modules/auth/auth.service.js';
import {ProfilesService} from '../src/modules/profiles/profiles.service.js';
import {createSignedSessionCookie} from './test-cookie-helper.js';

// Real TCP SMTP protocol sink. The production Nodemailer client sends to this
// isolated local server; captured messages/tokens stay in memory, never evidence.
type CapturedMail={to:string;text:string};
async function smtpSink(){
 const messages:CapturedMail[]=[],sockets=new Set<net.Socket>();
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.setEncoding('utf8');socket.write('220 fg-local-test ESMTP\r\n');
  let buffer='',data=false,to='';
  socket.on('data',chunk=>{buffer+=chunk;while(true){
   if(data){const end=buffer.indexOf('\r\n.\r\n');if(end<0)return;const raw=buffer.slice(0,end);buffer=buffer.slice(end+5);data=false;
    const split=raw.indexOf('\r\n\r\n'),headers=raw.slice(0,split),body=raw.slice(split+4);
    const text=/Content-Transfer-Encoding: base64/i.test(headers)?Buffer.from(body.replace(/\s/g,''),'base64').toString('utf8'):body.replace(/=\r\n/g,'').replace(/=([a-f0-9]{2})/gi,(_,hex:string)=>String.fromCharCode(parseInt(hex,16)));
    messages.push({to,text});socket.write('250 queued-local\r\n');continue;
   }
   const end=buffer.indexOf('\r\n');if(end<0)return;const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
   if(/^EHLO|^HELO/i.test(line))socket.write('250-fg-local-test\r\n250 PIPELINING\r\n');
   else if(/^MAIL FROM/i.test(line)){to='';socket.write('250 sender accepted\r\n');}
   else if(/^RCPT TO/i.test(line)){to=line.match(/<([^>]+)>/)?.[1]??'';socket.write('250 recipient accepted\r\n');}
   else if(/^DATA/i.test(line)){data=true;socket.write('354 send mail\r\n');}
   else if(/^QUIT/i.test(line)){socket.end('221 bye\r\n');return;}
   else socket.write('250 ok\r\n');
  }});
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as net.AddressInfo).port;
 return {messages,transport:nodemailer.createTransport({host:'127.0.0.1',port,secure:false,connectionTimeout:3000,socketTimeout:5000}),close:async()=>{for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
const origin='http://localhost:5173',secret='auth02_test_secret_32_chars_random_fixture',password='  kiểm thử Ω dài  ';
describe('AUTH02 real HTTP, PostgreSQL and SMTP security',()=>{
 let admin:pg.Client,pool:pg.Pool,db:ReturnType<typeof drizzle<typeof schema>>,schemaName:string;
 let sink:Awaited<ReturnType<typeof smtpSink>>,server:http.Server,auth:ReturnType<typeof createFgAuth>;
 let sequence=1;const email=()=>`auth02-${randomUUID()}@fixture.invalid`;
 const request=()=>supertest(server);
 const post=(path:string,body:object,cookie?:string,ip?:string)=>{
  const req=request().post(`/api/auth${path}`).set('Origin',origin).set('X-Forwarded-For',ip??`198.51.100.${sequence++}`);
  if(cookie)req.set('Cookie',cookie);return req.send(body);
 };
 const lastLink=(address:string)=>{
  const text=sink.messages.filter(m=>m.to===address).at(-1)?.text??'';
  const match=text.match(/https?:\/\/[^\s<>]+/);expect(Boolean(match)).toBe(true);return new URL(match![0]);
 };
 const verify=async(address:string)=>{const link=lastLink(address);return request().get(`${link.pathname}${link.search}`).set('X-Forwarded-For',`198.51.100.${sequence++}`);};
 const signUp=async(address:string)=>{const result=await post('/sign-up/email',{name:'FG Gamer',email:address,password});expect(result.status).toBe(200);return result;};
 const login=async(address:string)=>{const response=await post('/sign-in/email',{email:address,password});expect(response.status).toBe(200);return (response.headers['set-cookie'] as unknown as string[]).map(c=>c.split(';')[0]).join('; ');};
 const credential=async(address:string)=>{
  const result=await pool.query('SELECT u.id,u.email_verified,a.password FROM "user" u JOIN account a ON a.user_id=u.id WHERE u.email=$1 AND a.provider_id=$2',[address,'credential']);return result.rows[0] as {id:string;email_verified:boolean;password:string};
 };
 const discord=async()=>{
  const id=randomUUID(),address=email(),token=randomUUID();
  await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[id,'Discord original',address]);
  await pool.query('INSERT INTO account(id,account_id,provider_id,user_id,created_at,updated_at) VALUES($1,$2,$3,$4,now(),now())',[randomUUID(),`discord-${id}`,'discord',id]);
  await pool.query('INSERT INTO profiles(user_id,display_name,bio) VALUES($1,$2,$3)',[id,'Original profile','Keep community']);
  const sessionId=randomUUID();await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[sessionId,id,token]);
  return {id,address,sessionId,cookie:await createSignedSessionCookie(secret,token)};
 };
 beforeAll(async()=>{
  const env=parseEnv(fs.readFileSync('.env.local','utf8'));if(!env.DATABASE_URL||!env.DISCORD_CLIENT_ID||!env.DISCORD_CLIENT_SECRET)throw new Error('Auth integration configuration is required');Object.assign(process.env,{BETTER_AUTH_SECRET:secret,BETTER_AUTH_URL:origin,PUBLIC_ORIGIN:origin,DISCORD_CLIENT_ID:env.DISCORD_CLIENT_ID,DISCORD_CLIENT_SECRET:env.DISCORD_CLIENT_SECRET});
  schemaName=`test_auth02_be_${randomUUID().replaceAll('-','')}`;admin=new pg.Client({connectionString:env.DATABASE_URL});await admin.connect();await admin.query(`CREATE SCHEMA "${schemaName}"`);
  pool=new pg.Pool({connectionString:env.DATABASE_URL,options:`-c search_path=${schemaName}`,max:10});db=drizzle(pool,{schema});await migrate(db,{migrationsFolder:'packages/database/migrations',migrationsSchema:schemaName});await schema.seedGames(db);
  sink=await smtpSink();const options={baseURL:origin,secret,discordClientId:env.DISCORD_CLIENT_ID,discordClientSecret:env.DISCORD_CLIENT_SECRET,mailTransport:sink.transport,mailFrom:'FG <auth@fixture.invalid>'};
  auth=createFgAuth(db,options);server=http.createServer(toNodeHandler(auth));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 },60000);
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(sink){sink.transport.close();await sink.close();}if(pool)await pool.end();if(admin){await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`);await admin.end();}});
 it('enables verified email auth with explicit password/token policy and disabled unsafe routes',()=>{
  expect(auth.options.emailAndPassword?.enabled).toBe(true);expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(true);expect(auth.options.emailAndPassword?.minPasswordLength).toBe(12);expect(auth.options.emailAndPassword?.maxPasswordLength).toBe(128);expect(auth.options.emailVerification?.expiresIn).toBe(86400);expect(auth.options.emailAndPassword?.resetPasswordTokenExpiresIn).toBe(3600);expect(auth.options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);expect(auth.options.account?.accountLinking?.enabled).toBe(false);
  expect(auth.options.disabledPaths).toContain('/set-password');expect(auth.options.disabledPaths).toContain('/get-access-token');expect(auth.options.disabledPaths).toContain('/refresh-token');
 });
 it('creates no pre-verification session, preserves password spaces and salts separately; duplicate is generic',async()=>{
  const address=email(),second=email(),signup=await signUp(address);expect(signup.body.token).toBeNull();expect(signup.headers['set-cookie']).toBeUndefined();expect(sink.messages.some(m=>m.to===address)).toBe(true);
  await signUp(second);const first=await credential(address),other=await credential(second);expect(first.email_verified).toBe(false);expect(first.password===other.password).toBe(false);expect(await verifyPassword({hash:first.password,password})).toBe(true);expect(await verifyPassword({hash:first.password,password:password.trim()})).toBe(false);
  expect((await post('/sign-in/email',{email:address,password})).status).toBe(403);
  const duplicate=await signUp(address);expect(Object.keys(duplicate.body).sort()).toEqual(Object.keys(signup.body).sort());expect(duplicate.body.user.emailVerified).toBe(false);expect(duplicate.body.user.id===first.id).toBe(false);expect(duplicate.body.token).toBeNull();expect((await pool.query('SELECT id FROM "user" WHERE email=$1',[address])).rowCount).toBe(1);
 });
 it('verifies once, rejects replay/expired token and returns nullable email-only owner DTOs',async()=>{
  const address=email();await signUp(address);const link=lastLink(address);expect((await request().get(`${link.pathname}${link.search}`)).status).toBe(302);expect((await request().get(`${link.pathname}${link.search}`)).status).toBe(400);await login(address);
  const owner=await credential(address),service=new AuthService();service.setDb(db);expect(MeDTOSchema.parse(await service.getUserMe(owner.id)).discordId).toBeNull();
  const profiles=new ProfilesService();profiles.setDb(db);expect(PrivateProfileSchema.parse(await profiles.getPrivateProfile(owner.id)).discordId).toBeNull();const publicProfile=PublicProfileSchema.parse(await profiles.getPublicProfile(owner.id));expect(publicProfile).not.toHaveProperty('email');expect(publicProfile).not.toHaveProperty('discordId');
  const expired=email();await signUp(expired);const expiredLink=lastLink(expired);expiredLink.searchParams.delete('callbackURL');await pool.query("UPDATE verification SET expires_at=now()-interval '1 second' WHERE identifier LIKE 'fg-email:%'");expect((await request().get(`${expiredLink.pathname}${expiredLink.search}`)).status).toBe(400);expect((await credential(expired)).email_verified).toBe(false);
 });
 it('requires valid email/password and rejects unknown identities, short/oversized or actor override requests',async()=>{
  const address=email();await signUp(address);await verify(address);
  expect((await post('/sign-in/email',{email:address,password:'wrong-password'})).status).toBe(401);expect((await post('/sign-in/email',{email:email(),password})).status).toBe(401);
  for(const invalid of ['short','x'.repeat(129)])expect((await post('/sign-up/email',{name:'FG',email:email(),password:invalid})).status).toBe(400);
  expect((await post('/sign-in/email',{email:address,password,userId:'forged'})).status).toBe(400);
  // Native origin middleware rejects external callbacks before body validation.
  // AUTH02 requires rejection, not a 400 override of the existing 403 CSRF policy.
  const rejected=email(),mailCount=sink.messages.length;expect((await post('/sign-up/email',{name:'FG',email:rejected,password,callbackURL:'https://evil.example/'})).status).toBe(403);expect((await pool.query('SELECT id FROM "user" WHERE email=$1',[rejected])).rowCount).toBe(0);expect(sink.messages.length).toBe(mailCount);
 });
 it('resets once, revokes old sessions, expires links and handles concurrent consumption atomically',async()=>{
  const address=email();await signUp(address);await verify(address);const cookie=await login(address);
  const req=await post('/request-password-reset',{email:address,redirectTo:'/auth/reset'});expect(req.status).toBe(200);const link=lastLink(address),token=link.pathname.split('/').at(-1)!;
  const next='new password with spaces';const results=await Promise.all([post('/reset-password',{token,newPassword:next}),post('/reset-password',{token,newPassword:next})]);expect(results.map(r=>r.status).sort()).toEqual([200,400]);
  expect((await post('/reset-password',{token,newPassword:next})).status).toBe(400);expect((await request().get('/api/auth/get-session').set('Cookie',cookie)).body).toBeNull();expect((await post('/sign-in/email',{email:address,password})).status).toBe(401);expect((await post('/sign-in/email',{email:address,password:next})).status).toBe(200);
  await post('/request-password-reset',{email:address,redirectTo:'/auth/reset'});const expired=lastLink(address).pathname.split('/').at(-1)!;await pool.query("UPDATE verification SET expires_at=now()-interval '1 second' WHERE identifier LIKE 'reset-password:%'");expect((await post('/reset-password',{token:expired,newPassword:password})).status).toBe(400);
 });
 it('requires current password for change and revokes other sessions',async()=>{
  const address=email();await signUp(address);await verify(address);const cookie=await login(address),other=await login(address);
  expect((await post('/change-password',{currentPassword:'wrong-password',newPassword:'next-password-12'},cookie)).status).toBe(400);
  expect((await post('/change-password',{currentPassword:password,newPassword:'next-password-12'},cookie)).status).toBe(200);expect((await request().get('/api/auth/get-session').set('Cookie',other)).body).toBeNull();expect((await post('/sign-in/email',{email:address,password:'next-password-12'})).status).toBe(200);
 });
 it('old Discord verification does not attach password; fresh link bound to current user/session retains identity',async()=>{
  const owner=await discord(),other=await discord();expect((await post('/fg/password-attach',{token:'guess',newPassword:password},owner.cookie)).status).toBe(400);expect((await post('/fg/password-challenge',{},owner.cookie)).status).toBe(200);
  const link=lastLink(owner.address),token=link.searchParams.get('token')!;expect((await post('/fg/password-attach',{token,newPassword:password},other.cookie)).status).toBe(403);
  expect((await post('/fg/password-attach',{token,newPassword:password},owner.cookie)).status).toBe(200);expect((await post('/fg/password-attach',{token,newPassword:password},owner.cookie)).status).toBe(400);
  const current=await credential(owner.address);expect(current.id).toBe(owner.id);expect((await pool.query('SELECT bio FROM profiles WHERE user_id=$1',[owner.id])).rows[0].bio).toBe('Keep community');expect((await pool.query('SELECT provider_id FROM account WHERE user_id=$1 ORDER BY provider_id',[owner.id])).rows.map(r=>r.provider_id)).toEqual(['credential','discord']);expect((await request().get('/api/auth/fg/password-status').set('Cookie',owner.cookie)).body).toEqual({hasPassword:true});
 });
 it('cannot merge or add missing credential through public reset; session revoke/ban/expiry blocks attachment',async()=>{
  const owner=await discord(),mailCount=sink.messages.length;const result=await post('/request-password-reset',{email:owner.address,redirectTo:'/auth/reset'});expect(result.status).toBe(200);expect(sink.messages.length).toBe(mailCount);expect((await pool.query('SELECT id FROM account WHERE user_id=$1 AND provider_id=$2',[owner.id,'credential'])).rowCount).toBe(0);
  expect((await post('/fg/password-challenge',{})).status).toBe(401);await post('/fg/password-challenge',{},owner.cookie);const token=lastLink(owner.address).searchParams.get('token')!;
  await pool.query('DELETE FROM session WHERE id=$1',[owner.sessionId]);expect((await post('/fg/password-attach',{token,newPassword:password},owner.cookie)).status).toBe(401);
  const banned=await discord();await pool.query('INSERT INTO admin_actions(id,actor_id,target_user_id,action,created_at) VALUES($1,$2,$2,$3,now())',[randomUUID(),banned.id,'BAN']);expect((await post('/fg/password-challenge',{},banned.cookie)).status).toBe(403);
 });
 it('rate-limits login attempts and mail resend without sending to unknown accounts',async()=>{
  const unknown=email(),before=sink.messages.length;const response=await post('/send-verification-email',{email:unknown});expect(response.status).toBe(200);expect(sink.messages.length).toBe(before);
  const statuses=[];for(let i=0;i<7;i++)statuses.push((await post('/sign-in/email',{email:unknown,password},undefined,'203.0.113.90')).status);expect(statuses).toContain(429);expect(statuses.filter(s=>s===401).length).toBeGreaterThan(0);
  const address=email();await signUp(address);const mailBefore=sink.messages.length,resends=[];
  for(let i=0;i<4;i++)resends.push((await post('/send-verification-email',{email:address},undefined,'203.0.113.91')).status);
  expect(resends).toEqual([200,200,200,429]);expect(sink.messages.length-mailBefore).toBe(3);
 });
 it('resend links are distinct and each can be consumed only once, including simultaneous verification',async()=>{
  const address=email();await signUp(address);const first=lastLink(address);expect((await post('/send-verification-email',{email:address})).status).toBe(200);const second=lastLink(address);expect(first.searchParams.get('token')===second.searchParams.get('token')).toBe(false);
  first.searchParams.delete('callbackURL');const results=await Promise.all([request().get(`${first.pathname}${first.search}`),request().get(`${first.pathname}${first.search}`)]);expect(results.map(r=>r.status).sort()).toEqual([200,400]);
  second.searchParams.delete('callbackURL');expect((await request().get(`${second.pathname}${second.search}`)).status).toBe(200);expect((await request().get(`${second.pathname}${second.search}`)).status).toBe(400);
 });
 it('binds attachment to the same session even for the same user and resolves duplicate consume once',async()=>{
  const owner=await discord();await post('/fg/password-challenge',{},owner.cookie);const token=lastLink(owner.address).searchParams.get('token')!,otherToken=randomUUID();
  await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[randomUUID(),owner.id,otherToken]);
  const otherCookie=await createSignedSessionCookie(secret,otherToken);expect((await post('/fg/password-attach',{token,newPassword:password},otherCookie)).status).toBe(403);
  const results=await Promise.all([post('/fg/password-attach',{token,newPassword:password},owner.cookie),post('/fg/password-attach',{token,newPassword:password},owner.cookie)]);expect(results.map(r=>r.status).sort()).toEqual([200,400]);expect((await pool.query('SELECT id FROM account WHERE user_id=$1 AND provider_id=$2',[owner.id,'credential'])).rowCount).toBe(1);
 });
 it('denies expired challenge and a ban added after the message was sent',async()=>{
  const expired=await discord();await post('/fg/password-challenge',{},expired.cookie);const expiredToken=lastLink(expired.address).searchParams.get('token')!;await pool.query("UPDATE verification SET expires_at=now()-interval '1 second' WHERE identifier LIKE 'fg-password:%'");expect((await post('/fg/password-attach',{token:expiredToken,newPassword:password},expired.cookie)).status).toBe(400);
  const banned=await discord();await post('/fg/password-challenge',{},banned.cookie);const bannedToken=lastLink(banned.address).searchParams.get('token')!;await pool.query('INSERT INTO admin_actions(id,actor_id,target_user_id,action,created_at) VALUES($1,$2,$2,$3,now())',[randomUUID(),banned.id,'BAN']);expect((await post('/fg/password-attach',{token:bannedToken,newPassword:password},banned.cookie)).status).toBe(403);expect((await pool.query('SELECT id FROM account WHERE user_id=$1 AND provider_id=$2',[banned.id,'credential'])).rowCount).toBe(0);
 });
 it('checks session expiry at real consumption time after waiting on the owner lock',async()=>{
  const owner=await discord();await post('/fg/password-challenge',{},owner.cookie);const token=lastLink(owner.address).searchParams.get('token')!,blocker=await pool.connect();let responsePromise:Promise<supertest.Response>|undefined;
  try{
   await blocker.query('BEGIN');await blocker.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[owner.id]);
   responsePromise=post('/fg/password-attach',{token,newPassword:password},owner.cookie).then(response=>response);
   const deadline=Date.now()+10000;let waiting=false;
   while(Date.now()<deadline){const rows=await pool.query("SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%user%for update%' AND pid<>pg_backend_pid()");if(rows.rowCount){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,40));}
   expect(waiting).toBe(true);await pool.query("UPDATE session SET expires_at=now()-interval '1 second' WHERE id=$1",[owner.sessionId]);await blocker.query('COMMIT');expect((await responsePromise).status).toBe(401);
   expect((await pool.query('SELECT id FROM account WHERE user_id=$1 AND provider_id=$2',[owner.id,'credential'])).rowCount).toBe(0);
  }finally{await blocker.query('ROLLBACK');blocker.release();if(responsePromise)await responsePromise;}
 });
 it('returns a real delivery error when the SMTP server refuses the recipient and does not forge success',async()=>{
  // A fresh actual transport to a closed loopback TCP port fails deterministically.
  const address=email(),closed=net.createServer();await new Promise<void>(resolve=>closed.listen(0,'127.0.0.1',resolve));const port=(closed.address() as net.AddressInfo).port;await new Promise<void>(resolve=>closed.close(()=>resolve()));
  const transport=nodemailer.createTransport({host:'127.0.0.1',port,secure:false,connectionTimeout:1000}),options={baseURL:origin,secret,discordClientId:process.env.DISCORD_CLIENT_ID!,discordClientSecret:process.env.DISCORD_CLIENT_SECRET!,mailTransport:transport,mailFrom:'auth@fixture.invalid'};
  const unavailable=http.createServer(toNodeHandler(createFgAuth(db,options)));await new Promise<void>(resolve=>unavailable.listen(0,'127.0.0.1',resolve));
  try{const result=await supertest(unavailable).post('/api/auth/sign-up/email').set('Origin',origin).send({name:'FG',email:address,password});expect(result.status).toBe(503);expect(result.body.code).toBe('AUTH_EMAIL_UNAVAILABLE');}
  finally{transport.close();await new Promise<void>(resolve=>unavailable.close(()=>resolve()));}
 });
});
