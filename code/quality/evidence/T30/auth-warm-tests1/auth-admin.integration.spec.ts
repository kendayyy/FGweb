import pg,{Pool} from 'pg';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import supertest from 'supertest';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import nodemailer from 'nodemailer';
import {hashPassword,verifyPassword} from 'better-auth/crypto';
import {toNodeHandler} from 'better-auth/node';
import * as schema from '@fg/database';
import {AuthService,createFgAuth} from '../../../../apps/api/src/modules/auth/auth.service.js';
import {ProfilesService} from '../../../../apps/api/src/modules/profiles/profiles.service.js';

describe('AUTH-PASSWORD-03 configured scrypt behavior',()=>{
 const pool=new Pool(),mail=nodemailer.createTransport({host:'127.0.0.1',port:1});
 const auth=createFgAuth(drizzle(pool,{schema}),{baseURL:'http://localhost:5173',secret:'fixture-secret-long-enough-32-characters',discordClientId:'fixture',discordClientSecret:'fixture',mailTransport:mail,mailFrom:'auth@fixture.invalid'});
 const codec=auth.options.emailAndPassword?.password??{hash:hashPassword,verify:verifyPassword};
 afterAll(async()=>{mail.close();await pool.end();});
 it('keeps compatibility-distinct Unicode passwords different in both directions',async()=>{
  for(const [password,other] of [['Ａbcdefg!','Abcdefg!'],['A\u0301bcdef!','Ábcdef!x']]){
   const hash=await codec.hash(password);expect(await codec.verify({hash,password})).toBe(true);
   expect(await codec.verify({hash,password:password.normalize('NFKC')})).toBe(false);
   expect(await codec.verify({hash,password:other})).toBe(false);
  }
  const hash=await codec.hash('Abcdefg!');expect(await codec.verify({hash,password:'Ａbcdefg!'})).toBe(false);
 },30000);
 it('salts equal passwords independently and preserves significant whitespace',async()=>{
  const password='  Ωhello!  ',first=await codec.hash(password),second=await codec.hash(password);
  expect(first===second).toBe(false);expect(first.includes(password)).toBe(false);
  expect(await codec.verify({hash:first,password})).toBe(true);expect(await codec.verify({hash:first,password:password.trim()})).toBe(false);
 },30000);
 it('verifies historical Better Auth scrypt without rewriting old hashes',async()=>{
  const password='old lower only',hash=await hashPassword(password);
  expect(await codec.verify({hash,password})).toBe(true);expect(await codec.verify({hash,password:'different'})).toBe(false);
 },30000);
 it('fails closed for malformed or unsupported stored credential hashes',async()=>{
  for(const hash of ['','unknown:abc','fgscrypt-v9:aaaa:bbbb','fgscrypt-v1:00:00']){
   let valid:boolean;try{valid=await codec.verify({hash,password:'Abcdefg!'});}catch{valid=false;}
   expect(valid).toBe(false);
  }
 });
 it('allows the native UTF16 envelope while shared schemas bound Unicode code points',()=>{
  expect(auth.options.emailAndPassword?.minPasswordLength).toBe(8);
  expect(auth.options.emailAndPassword?.maxPasswordLength).toBe(256);
 });
});

type CapturedMail={to:string;text:string};
async function smtpSink(){
 const messages:CapturedMail[]=[],sockets=new Set<net.Socket>();
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.setEncoding('utf8');socket.write('220 fg-local-test ESMTP\r\n');
  let buffer='',data=false,to='';
  socket.on('data',chunk=>{buffer+=chunk;while(true){
   if(data){const end=buffer.indexOf('\r\n.\r\n');if(end<0)return;const raw=buffer.slice(0,end);buffer=buffer.slice(end+5);data=false;
    const split=raw.indexOf('\r\n\r\n'),headers=raw.slice(0,split),body=raw.slice(split+4).replace(/^\.\./gm,'.');
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

describe('sole admin and password policy through real HTTP/PostgreSQL/SMTP',()=>{
 const origin='http://localhost:5173',secret='auth-admin-fixture-secret-long-enough',password='Abcdefg!';
 let admin:pg.Client,pool:pg.Pool,db:ReturnType<typeof drizzle<typeof schema>>,schemaName:string,server:http.Server,sink:Awaited<ReturnType<typeof smtpSink>>,auth:ReturnType<typeof createFgAuth>,service:AuthService;
 const originalAdmin=process.env.ADMIN_USER_IDS,originalDiscord=process.env.ADMIN_DISCORD_IDS;let sequence=1;
 const email=()=>`admin-${randomUUID()}@fixture.invalid`;
 const post=(path:string,body:object,cookie?:string,ip?:string)=>{const req=supertest(server).post(`/api/auth${path}`).set('Origin',origin).set('X-Forwarded-For',ip??`198.51.100.${sequence++}`);if(cookie)req.set('Cookie',cookie);return req.send(body);};
 const cookie=(response:supertest.Response)=>(response.headers['set-cookie'] as unknown as string[]).map(value=>value.split(';')[0]).join('; ');
 const verify=async(address:string)=>{const text=sink.messages.filter(m=>m.to===address).at(-1)?.text??'',link=new URL(text.match(/https?:\/\/[^\s<>]+/)![0]);const result=await supertest(server).get('/api/auth/verify-email').query({token:link.searchParams.get('token')});expect(result.status).toBe(200);};
 const stored=async(address:string)=>{const rows=await pool.query('SELECT u.id,u.email_verified,a.password FROM "user" u JOIN account a ON a.user_id=u.id WHERE u.email=$1 AND a.provider_id=$2',[address,'credential']);return rows.rows[0] as {id:string;email_verified:boolean;password:string};};
 const existing=async(name:string,pass=password)=>{const id=randomUUID(),address=email(),hash=await hashPassword(pass);await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[id,name,address]);await pool.query('INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES($1,$2,$3,$2,$4,now(),now())',[randomUUID(),id,'credential',hash]);return{id,address,hash};};
 beforeAll(async()=>{
  const env=parseEnv(fs.readFileSync('.env.local','utf8'));if(!env.DATABASE_URL||!env.DISCORD_CLIENT_ID||!env.DISCORD_CLIENT_SECRET)throw new Error('Auth services required for real integration');
  Object.assign(process.env,{BETTER_AUTH_SECRET:secret,BETTER_AUTH_URL:origin,PUBLIC_ORIGIN:origin,DISCORD_CLIENT_ID:env.DISCORD_CLIENT_ID,DISCORD_CLIENT_SECRET:env.DISCORD_CLIENT_SECRET});
  delete process.env.ADMIN_USER_IDS;delete process.env.ADMIN_DISCORD_IDS;
  schemaName=`test_auth_admin_${randomUUID().replaceAll('-','')}`;admin=new pg.Client({connectionString:env.DATABASE_URL});await admin.connect();await admin.query(`CREATE SCHEMA "${schemaName}"`);
  pool=new pg.Pool({connectionString:env.DATABASE_URL,options:`-c search_path=${schemaName}`,max:10,min:4});const ready=await Promise.allSettled(Array.from({length:4},()=>pool.connect()));for(const r of ready)if(r.status==='fulfilled')r.value.release();const failed=ready.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason;db=drizzle(pool,{schema});await migrate(db,{migrationsFolder:'packages/database/migrations',migrationsSchema:schemaName});await schema.seedGames(db);
  sink=await smtpSink();auth=createFgAuth(db,{baseURL:origin,secret,discordClientId:env.DISCORD_CLIENT_ID,discordClientSecret:env.DISCORD_CLIENT_SECRET,mailTransport:sink.transport,mailFrom:'auth@fixture.invalid'});service=new AuthService();service.setDb(db);
  server=http.createServer(toNodeHandler(auth));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 },60000);
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(sink){sink.transport.close();await sink.close();}if(pool)await pool.end();if(admin){if(!/^test_auth_admin_[a-f0-9]{32}$/.test(schemaName))throw new Error('Unsafe fixture cleanup');await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`);await admin.end();}if(originalAdmin===undefined)delete process.env.ADMIN_USER_IDS;else process.env.ADMIN_USER_IDS=originalAdmin;if(originalDiscord===undefined)delete process.env.ADMIN_DISCORD_IDS;else process.env.ADMIN_DISCORD_IDS=originalDiscord;});
 it('enforces composition and code points on native signup including128 astral points',async()=>{
  for(const pass of ['Aa!xxxx','abcdefg!','ABCDEFGx','Aa      ',`A${'😀'.repeat(128)}`])expect((await post('/sign-up/email',{name:'FG player',email:email(),password:pass})).status).toBe(400);
  for(const pass of [password,`A!${'x'.repeat(126)}`,`A${'😀'.repeat(127)}`]){const address=email();expect((await post('/sign-up/email',{name:'FG player',email:address,password:pass})).status).toBe(200);expect((await stored(address)).email_verified).toBe(false);await verify(address);expect((await post('/sign-in/email',{email:address,password:pass})).status).toBe(200);}
 },30000);
 it('does not normalize new credentials on signup or native login',async()=>{
  const address=email(),pass='Ａbcdefg!';expect((await post('/sign-up/email',{name:'FG player',email:address,password:pass})).status).toBe(200);await verify(address);
  expect((await post('/sign-in/email',{email:address,password:pass})).status).toBe(200);expect((await post('/sign-in/email',{email:address,password:pass.normalize('NFKC')})).status).toBe(401);
  const row=await stored(address);expect(row.password.startsWith('fgscrypt-v1:')).toBe(true);expect(row.password.includes(pass)).toBe(false);
 });
 it('keeps actual legacy credential signin and current-password proof working',async()=>{
  const old='old lower only',owner=await existing('Legacy',old),logged=await post('/sign-in/email',{email:owner.address,password:old});expect(logged.status).toBe(200);
  expect((await stored(owner.address)).password===owner.hash).toBe(true);
  expect((await post('/change-password',{currentPassword:old,newPassword:password},cookie(logged))).status).toBe(200);
  expect((await post('/sign-in/email',{email:owner.address,password:old})).status).toBe(401);expect((await post('/sign-in/email',{email:owner.address,password})).status).toBe(200);
 });
 it('never grants by a Discord allowlist, display name, email or multiple IDs',async()=>{
  const owner=await existing('kingame'),other=await existing('Other');process.env.ADMIN_USER_IDS=owner.id;
  await pool.query('INSERT INTO account(id,account_id,provider_id,user_id,created_at,updated_at) VALUES($1,$2,$3,$4,now(),now())',[randomUUID(),'discord-allowlisted','discord',other.id]);process.env.ADMIN_DISCORD_IDS='discord-allowlisted';
  expect(await service.isUserAdmin(other.id)).toBe(false);expect(await service.isUserAdmin(owner.id)).toBe(true);
  process.env.ADMIN_USER_IDS=`${owner.id},${other.id}`;expect(await service.isUserAdmin(owner.id)).toBe(false);expect(await service.isUserAdmin(other.id)).toBe(false);
  delete process.env.ADMIN_USER_IDS;expect(await service.isUserAdmin(owner.id)).toBe(false);
 });
 it('blocks reserved names on public signup, native update, profile and onboarding',async()=>{
  for(const name of ['kingame',' Kingame ','ｋｉｎｇａｍｅ'])expect((await post('/sign-up/email',{name,email:email(),password})).status).toBe(400);
  const owner=await existing('Ordinary'),logged=await post('/sign-in/email',{email:owner.address,password});expect(logged.status).toBe(200);
  expect((await post('/update-user',{name:'kingame'},cookie(logged))).status).toBe(400);
  const profiles=new ProfilesService();profiles.setDb(db);await expect(profiles.updateProfile(owner.id,{displayName:'kingame'})).rejects.toMatchObject({status:422});
  await expect(profiles.onboarding(owner.id,{displayName:'kingame',interestedGames:['Valorant']})).rejects.toMatchObject({status:422});
  expect((await pool.query('SELECT name FROM "user" WHERE id=$1',[owner.id])).rows[0].name).toBe('Ordinary');
 });
 it('logs the reserved alias into only the configured verified credential identity and returns native cookies',async()=>{
  const owner=await existing('kingame'),other=await existing('Ordinary');process.env.ADMIN_USER_IDS=owner.id;
  const logged=await post('/fg/sign-in/admin',{username:'kingame',password});expect(logged.status).toBe(200);expect(logged.body.user.id).toBe(owner.id);expect(logged.body.user).not.toHaveProperty('password');
  const session=await supertest(server).get('/api/auth/get-session').set('Cookie',cookie(logged));expect(session.body.user.id).toBe(owner.id);expect(await service.isUserAdmin(session.body.user.id)).toBe(true);
  expect((await post('/fg/sign-in/admin',{username:'kingame',password:'wrong'})).status).toBe(401);
  expect((await post('/fg/sign-in/admin',{username:'kingame',password,userId:other.id})).status).toBe(400);
  expect((await post('/fg/sign-in/admin',{username:'kingame',password,callbackURL:'https://evil.invalid/'})).status).toBe(403);
  process.env.ADMIN_USER_IDS=`${owner.id},${other.id}`;expect((await post('/fg/sign-in/admin',{username:'kingame',password})).status).toBe(401);expect(await service.isUserAdmin(owner.id)).toBe(false);
  process.env.ADMIN_USER_IDS=owner.id;await pool.query('UPDATE "user" SET email_verified=false WHERE id=$1',[owner.id]);expect((await post('/fg/sign-in/admin',{username:'kingame',password})).status).toBe(403);
 });
 it('rate limits the alias and enforces logout/revoke/ban without trusting an old session',async()=>{
  const owner=await existing('kingame');process.env.ADMIN_USER_IDS=owner.id;
  const statuses=[];for(let i=0;i<7;i++)statuses.push((await post('/fg/sign-in/admin',{username:'kingame',password:'wrong'},undefined,'203.0.113.80')).status);expect(statuses).toContain(429);expect(statuses).toContain(401);
  const logged=await post('/fg/sign-in/admin',{username:'kingame',password});expect(logged.status).toBe(200);
  expect((await post('/sign-out',{},cookie(logged))).status).toBe(200);expect((await supertest(server).get('/api/auth/get-session').set('Cookie',cookie(logged))).body).toBeNull();
  await pool.query('INSERT INTO admin_actions(id,actor_id,target_user_id,action,created_at) VALUES($1,$2,$2,$3,now())',[randomUUID(),owner.id,'BAN']);
  expect((await post('/fg/sign-in/admin',{username:'kingame',password})).status).toBe(403);expect(await service.isUserAdmin(owner.id)).toBe(false);
 },30000);
 it('provisions only one pending owner, retries without resetting the hash and activates only after real verification',async()=>{
  const module=await import('../../../../apps/api/src/modules/auth/auth-provision.js');
  // Retire earlier fixture identities in this owned schema. Production data
  // is never renamed; this test starts with no occupied reserved name.
  await pool.query('UPDATE "user" SET name=$1 WHERE name=$2',['Retired fixture identity','kingame']);
  const occupied=await existing('Occupied ordinary identity');
  await expect(module.provisionAdminAccount(db,{userId:randomUUID(),email:occupied.address,password})).rejects.toThrow();
  await expect(module.provisionAdminAccount(db,{userId:occupied.id,email:email(),password})).rejects.toThrow();
  const userId=randomUUID(),address=email(),input={userId,email:address,password};
  const concurrent=await Promise.all([module.provisionAdminAccount(db,input),module.provisionAdminAccount(db,input)]);
  expect(concurrent.map(result=>result.created).sort()).toEqual([false,true]);expect(concurrent.every(result=>result.verified===false)).toBe(true);
  const before=await stored(address);expect(before.id).toBe(userId);expect(before.email_verified).toBe(false);
  process.env.ADMIN_USER_IDS=userId;expect(await service.isUserAdmin(userId)).toBe(false);
  expect((await post('/fg/sign-in/admin',{username:'kingame',password})).status).toBe(403);
  expect(await module.provisionAdminAccount(db,{...input,password:'Different!123'})).toEqual({created:false,verified:false});expect((await stored(address)).password===before.password).toBe(true);
  expect((await post('/send-verification-email',{email:address})).status).toBe(200);await verify(address);
  expect(await module.provisionAdminAccount(db,input)).toEqual({created:false,verified:true});expect(await service.isUserAdmin(userId)).toBe(true);
  expect((await post('/fg/sign-in/admin',{username:'kingame',password})).status).toBe(200);
  await expect(module.provisionAdminAccount(db,{userId:randomUUID(),email:email(),password})).rejects.toThrow();
  expect((await pool.query('SELECT id FROM "user" WHERE id=$1',[userId])).rowCount).toBe(1);
 });
 it('rejects invalid input, occupied identities and an existing kingame owned by another account',async()=>{
  const module=await import('../../../../apps/api/src/modules/auth/auth-provision.js');
  // Remove only the preceding test's ownership marker in this isolated schema;
  // its occupied kingame remains and must cause refusal instead of takeover.
  await pool.query('DELETE FROM verification WHERE identifier=$1',['fg-admin-provision:v1']);
  const owner=await existing('Occupied');
  for(const input of [{userId:randomUUID(),email:email(),password:'lowercase!'}, {userId:owner.id,email:owner.address,password}, {userId:randomUUID(),email:email(),password}])await expect(module.provisionAdminAccount(db,input)).rejects.toThrow();
  expect((await pool.query('SELECT name FROM "user" WHERE id=$1',[owner.id])).rows[0].name).toBe('Occupied');
 });
});
