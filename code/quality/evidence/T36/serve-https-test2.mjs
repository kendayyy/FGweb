import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import * as tables from '@fg/database';
import {NestFactory} from '@nestjs/core';
import {makeSignature} from 'better-auth/crypto';
import {static as staticFiles} from 'express';
import {Queue} from 'bullmq';
import {createNotificationRuntime} from '../../../apps/worker/dist/index.js';
import {createPushAdapter} from '../../../apps/worker/dist/push.js';
import {createFgSecurityHeaders} from '../../../apps/web/security-headers.mjs';

const root=path.resolve('.runtime/t36/tunnel'),runId='t36-https-'+randomUUID().replaceAll('-','');
const privateDir=path.join(root,runId),evidence='quality/evidence/T36/'+runId;
fs.mkdirSync(privateDir,{recursive:true});fs.mkdirSync(evidence,{recursive:true});
const require=createRequire(import.meta.url),env=parseEnv(fs.readFileSync('.env.local','utf8'));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const pin=JSON.parse(fs.readFileSync(root+'/cloudflared-release.json','utf8'));
const binary=root+'/cloudflared-2026.10.0.exe';
assert.equal('sha256:'+hash(binary),pin.digest);assert.equal(pin.tag,'2026.10.0');
const ledger=JSON.parse(fs.readFileSync('quality/tasks.json'));assert.equal(ledger.tasks.find(t=>t.id==='T36').status,'IN_PROGRESS');
const sourcePins=['apps/api/dist/app.module.js','apps/api/dist/modules/auth/auth.service.js','apps/api/dist/modules/push/push.service.js','apps/worker/dist/index.js','apps/web/dist/index.html','apps/web/dist/sw.js','apps/web/dist/manifest.webmanifest','apps/web/security-headers.mjs'].map(p=>({path:p,sha256:hash(p)}));
const manifest=JSON.parse(fs.readFileSync('apps/web/dist/manifest.webmanifest'));assert.equal(manifest.name,'FG');assert.equal(manifest.short_name,'FG');
const schema='t36_https_'+randomUUID().replaceAll('-',''),queueName='fg-t36-https-'+randomUUID(),secret=randomBytes(48).toString('base64url'),controlToken=randomBytes(32).toString('base64url');
const actors={},deliveries=[],producers=[],timers=new Map(),port=57836,controlPort=57837;
let app,pool,runtime,tunnel,origin,control,created=false,closing=false,game,mailCalls=0,subscriptionTimer;
const writePrivate=(name,value)=>fs.writeFileSync(path.join(privateDir,name),JSON.stringify(value,null,2)+'\n');
const saveStatus=()=>{const state={runId,pid:process.pid,tunnelPid:tunnel?.pid,origin,port,controlPort,controlToken,schema,queueName,privateDir,evidence,startedAt,ready:Boolean(app&&runtime),expiresAt,accounts:Object.fromEntries(Object.entries(actors).filter(([key])=>key!=='sender').map(([key,a])=>[key,{name:a.name,email:a.email,password:a.password,userId:a.id}]))};writePrivate('session.json',state);fs.writeFileSync(root+'/active-session.json',JSON.stringify(state,null,2)+'\n');};
const startedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
const redactError=error=>({at:new Date().toISOString(),name:error?.name??'Error',code:error?.code??null,message:'T36_HTTPS_RUNTIME_OPERATION_FAILED'});
async function close(reason='requested'){
 if(closing)return;closing=true;clearInterval(subscriptionTimer);for(const handles of timers.values())for(const handle of handles)clearTimeout(handle);
 const cleanup={controlClosed:false,workerClosed:false,appClosed:false,ownedQueuesRemoved:false,ownedSchemaRemoved:false,poolClosed:false,tunnelStopped:false};
 for(const [key,fn]of [
  ['controlClosed',async()=>{if(control)await new Promise(r=>control.close(r));}],
  ['workerClosed',async()=>runtime?.close()],
  ['appClosed',async()=>app?.close()],
  ['ownedQueuesRemoved',async()=>{if(runtime)for(const channel of ['inApp','delivery']){assert(/^fg-t36-https-[a-f0-9-]{36}$/.test(queueName));const q=new Queue(runtime.queueNames[channel],{connection:{url:env.REDIS_URL},prefix:runtime.prefixes[channel]});await q.obliterate({force:true});await q.close();}}],
  ['ownedSchemaRemoved',async()=>{if(created){assert(/^t36_https_[a-f0-9]{32}$/.test(schema));await pool.query('DROP SCHEMA "'+schema+'" CASCADE');}}],
  ['poolClosed',async()=>pool?.end()],
  ['tunnelStopped',async()=>{if(tunnel&&!tunnel.killed)tunnel.kill();}]
 ])try{await fn();cleanup[key]=true;}catch{}
 fs.writeFileSync(evidence+'/cleanup.json',JSON.stringify({at:new Date().toISOString(),reason,cleanup,sourceUnchanged:sourcePins.every(p=>hash(p.path)===p.sha256),mailCalls},null,2)+'\n');
 writePrivate('stopped.json',{at:new Date().toISOString(),reason,cleanup});
 process.exit(Object.values(cleanup).every(Boolean)?0:1);
}
process.once('SIGINT',()=>void close('SIGINT'));process.once('SIGTERM',()=>void close('SIGTERM'));
async function api(method,route,actor,body){
 const response=await fetch('http://127.0.0.1:'+port+'/api/v1/'+route,{method,headers:{Cookie:'__Secure-better-auth.session_token='+actor.cookie,Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 assert(response.ok,'Owned producer API status '+response.status);return response.json();
}
async function invite(key){
 const actor=actors[key];assert(actor&&key!=='sender');
 await api('POST','friends/requests',actors.sender,{targetUserId:actor.id});
 producers.push({at:new Date().toISOString(),actor:key,kind:'FRIEND_INVITE',realApi:true});
}
async function reminder(key){
 const actor=actors[key];assert(actor&&key!=='sender');
 const card=await api('POST','recruitments',actors.sender,{gameId:game.id,gameTitle:game.title,title:'FG — Hẹn chơi kiểm thử',mode:'ranked',playerCapacity:3,timingType:'scheduledAt',scheduledAt:new Date(Date.now()+30*60000).toISOString()});
 const client=await pool.connect();try{
  await client.query('BEGIN');
  const play=(await client.query('SELECT id,player_capacity FROM play_sessions WHERE room_id=$1',[card.roomId])).rows[0];
  const room=(await client.query('SELECT conversation_id FROM rooms WHERE id=$1',[card.roomId])).rows[0];
  await client.query('INSERT INTO room_members(id,room_id,user_id) VALUES($1,$2,$3)',[randomUUID(),card.roomId,actor.id]);
  await client.query('INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3)',[randomUUID(),room.conversation_id,actor.id]);
  await client.query('INSERT INTO team_members(id,play_session_id,user_id,slot_index,player_capacity) VALUES($1,$2,$3,2,$4)',[randomUUID(),play.id,actor.id,play.player_capacity]);
  await client.query("UPDATE play_sessions SET scheduled_at=clock_timestamp()+interval '9 minutes' WHERE id=$1",[play.id]);
  await client.query('COMMIT');
  producers.push({at:new Date().toISOString(),actor:key,kind:'REMINDER_10MIN',roomId:card.roomId,realRecruitmentApi:true,ownedScheduleAccelerated:true});
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function publicStatus(){return{at:new Date().toISOString(),runId,origin,pid:process.pid,ready:!closing,deliveries,producers,mailCalls,subscriptions:(await pool.query('SELECT user_id,count(*)::int AS count FROM push_subscriptions GROUP BY user_id')).rows,automaticPushCases:Object.fromEntries([...timers.keys()].map(key=>[key,true]))};}
try{
 // Reserve/check our two loopback ports before provisioning or opening a tunnel.
 for(const candidate of [port,controlPort]){const check=createServer();await new Promise((resolve,reject)=>{check.once('error',reject);check.listen(candidate,'127.0.0.1',resolve);});await new Promise(r=>check.close(r));}
 const tunnelLog=fs.createWriteStream(path.join(privateDir,'cloudflared.log'));
 tunnel=spawn(binary,['tunnel','--no-autoupdate','--url','http://127.0.0.1:'+port],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 const originPromise=new Promise((resolve,reject)=>{let output='';const timeout=setTimeout(()=>reject(new Error('Tunnel origin deadline')),90000);for(const channel of [tunnel.stdout,tunnel.stderr])channel.on('data',chunk=>{tunnelLog.write(chunk);output=(output+chunk.toString()).slice(-24000);const match=output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match){clearTimeout(timeout);resolve(match[0]);}});tunnel.once('error',()=>{clearTimeout(timeout);reject(new Error('Tunnel process failed'));});tunnel.once('exit',()=>{clearTimeout(timeout);reject(new Error('Tunnel process exited'));if(app&&!closing)void close('tunnel-exited');});});
 origin=await originPromise;
 const dbURL=new URL(env.DATABASE_URL);dbURL.searchParams.set('options','-c search_path='+schema);
 pool=new pg.Pool({connectionString:dbURL.href,max:8,connectionTimeoutMillis:5000,statement_timeout:15000});
 await pool.query('CREATE SCHEMA "'+schema+'"');created=true;
 await migrate(drizzle(pool),{migrationsFolder:path.resolve('packages/database/migrations'),migrationsSchema:schema});
 await tables.seedGames(drizzle(pool,{schema:tables}));game=(await pool.query("SELECT id,title FROM games WHERE title='Valorant'")).rows[0];assert(game);
 const {hashFgPassword}=require(path.resolve('apps/api/dist/modules/auth/auth-password.js'));
 for(const [key,name]of Object.entries({iphone:'FG iPhone',android:'FG Android',pc:'FG PC',sender:'Nam demo'})){
  const id=randomUUID(),token=randomUUID(),email='fg-'+key+'@example.invalid',password='FG!'+randomBytes(18).toString('base64url');
  await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',[id,name,email]);
  await pool.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$2)',[id,name]);
  await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)',[randomUUID(),id,game.id]);
  await pool.query('INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),id,await hashFgPassword(password)]);
  // Producer-only seeded session; human testers authenticate normally with credentials.
  if(key==='sender')await pool.query('INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval \'1 day\',now(),now())',[randomUUID(),id,token]);
  actors[key]={id,name,email,password,cookie:token+'.'+await makeSignature(token,secret)};
  for(const type of ['DM','MENTION','FRIEND_INVITE','ROOM_INVITE','TEAM_INVITE','JOIN_REQUEST','JOIN_REQUEST_RESULT','REMINDER_10MIN'])await pool.query('INSERT INTO notification_preferences(id,user_id,notification_type,in_app,push,email) VALUES($1,$2,$3,true,$4,false)',[randomUUID(),id,type,['FRIEND_INVITE','REMINDER_10MIN'].includes(type)]);
 }
 Object.assign(process.env,env,{DATABASE_URL:dbURL.href,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:secret,ADMIN_USER_IDS:'',LIVEKIT_SERVER_URL:'',LIVEKIT_ADMISSION_URL:'',FG_UPLOADS_DIR:path.join(privateDir,'uploads'),FG_CRYPTO_OBJECTS_DIR:path.join(privateDir,'crypto-objects')});delete process.env.ADMIN_DISCORD_IDS;
 const {AppModule}=require(path.resolve('apps/api/dist/app.module.js'));
 const {configureFgHttpBodyParsers}=require(path.resolve('apps/api/dist/modules/chat-crypto/http-body-parsers.js'));
 app=await NestFactory.create(AppModule,{logger:false,abortOnError:false,bodyParser:false});
 app.getHttpAdapter().getInstance().set('trust proxy','loopback');
 app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const requestPath=new URL(req.url,origin).pathname;
  if(requestPath.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
  if(requestPath.startsWith('/_t36')||requestPath.startsWith('/.'))return res.status(404).json({statusCode:404,message:'Not found'});
  // A public temporary test origin is not an open registration or mail relay.
  if(requestPath.startsWith('/api/auth/')&&!['/api/auth/sign-in/email','/api/auth/sign-out','/api/auth/get-session','/api/auth/fg/password-status'].includes(requestPath))return res.status(403).json({statusCode:403,code:'TEST_ACCOUNT_ONLY',message:'Bản kiểm thử dùng tài khoản đã được cấp; chức năng này chưa mở trên đường dẫn tạm.'});
  next();
 });
 configureFgHttpBodyParsers(app);
 const built=path.resolve('apps/web/dist'),html=fs.readFileSync(built+'/index.html','utf8'),headers=createFgSecurityHeaders(html,[origin,origin.replace('https:','wss:')]);
 const assets=staticFiles(built,{index:false,dotfiles:'deny',setHeaders:res=>{for(const[k,v]of Object.entries(headers))res.setHeader(k,v);}});
 app.use((req,res,next)=>{
  const requestPath=new URL(req.url,origin).pathname;
  if(requestPath.startsWith('/api/')||requestPath.startsWith('/socket.io'))return next();
  if(!['GET','HEAD'].includes(req.method))return res.status(405).end();
  if(requestPath==='/sw.js'||requestPath==='/manifest.webmanifest')res.setHeader('Cache-Control','no-store');
  if(!path.extname(requestPath)&&String(req.headers.accept).includes('text/html')||requestPath==='/index.html'){
   for(const[k,v]of Object.entries(headers))res.setHeader(k,v);res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control',requestPath==='/index.html'?'public, max-age=0, must-revalidate':'no-store');return res.end(req.method==='HEAD'?undefined:html);
  }
  return assets(req,res,next);
 });
 await app.listen(port,'127.0.0.1');
 const push=createPushAdapter({subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY});
 runtime=await createNotificationRuntime({databaseURL:dbURL.href,redisURL:env.REDIS_URL,publicOrigin:origin,queueName,push:{send:async(target,payload,id)=>{const result=await push.send(target,payload,id);deliveries.push({at:new Date().toISOString(),status:result.status,tag:payload.tag});return result;}},email:{send:async()=>{mailCalls++;throw new Error('Email disabled for isolated device test');}}});
 control=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.headers.authorization!=='Bearer '+controlToken){res.writeHead(403);return res.end('{}');}
  try{
   if(req.method==='GET'&&req.url==='/status')return res.end(JSON.stringify(await publicStatus()));
   if(req.method==='POST'&&req.url==='/stop'){res.end('{"stopping":true}');setTimeout(()=>void close('local-owner-stop'),50);return;}
   res.writeHead(404);res.end('{}');
  }catch(error){res.writeHead(500);res.end(JSON.stringify(redactError(error)));}
 });
 await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(controlPort,'127.0.0.1',resolve);});
 // One real invite and one accelerated real schedule reminder per tester after
 // first native registration; no repeated campaigns or automatic permission.
 let checking=false;
 subscriptionTimer=setInterval(async()=>{
  if(checking||closing)return;checking=true;
  try{for(const key of ['iphone','android','pc']){
   if(timers.has(key))continue;
   const row=(await pool.query('SELECT count(*)::int AS count FROM push_subscriptions WHERE user_id=$1',[actors[key].id])).rows[0];if(!row.count)continue;
   const safe=operation=>()=>void operation(key).catch(error=>{fs.appendFileSync(evidence+'/producer-errors.jsonl',JSON.stringify({...redactError(error),actor:key})+'\n');});
   timers.set(key,[setTimeout(safe(invite),60000),setTimeout(safe(reminder),120000)]);
   producers.push({at:new Date().toISOString(),actor:key,kind:'AUTO_CASES_SCHEDULED',inviteAfterSeconds:60,reminderAfterSeconds:120});
  }}catch(error){fs.appendFileSync(evidence+'/producer-errors.jsonl',JSON.stringify(redactError(error))+'\n');}finally{checking=false;}
 },3000);
 saveStatus();
 fs.writeFileSync(root+'/FG-test-access.txt',[
  'FG — tài khoản kiểm thử riêng tư',
  'URL: '+origin+'/login',
  'Mở bằng Safari trên iPhone hoặc Chrome trên Android. Sau khi cài, mở FG từ màn hình chính.',
  '',
  ...['iphone','android','pc'].flatMap(key=>[actors[key].name,'Email: '+actors[key].email,'Mật khẩu: '+actors[key].password,'']),
  'Trong trang Thông báo: Bật Push và cho phép quyền thông báo trên thiết bị.',
  'Sau lần đăng ký Push đầu tiên: lời mời sau khoảng 60 giây, nhắc lịch sau khoảng 120 giây (một lượt cho mỗi tài khoản).',
  'Hãy đưa FG xuống nền/khóa màn hình rồi bấm thông báo nhận được.',
  'Bản test dùng dữ liệu giả lập riêng, tài khoản thường; đăng ký mới, email và Discord không được mở trên link tạm.',
  'Giữ PC và tunnel đang chạy. Phiên test tự kết thúc sau 24 giờ.',
 ].join('\r\n'),'utf8');
 fs.writeFileSync(evidence+'/runtime-ready.json',JSON.stringify({at:new Date().toISOString(),runId,origin,pid:process.pid,tunnelPid:tunnel.pid,cloudflared:{version:pin.tag,sha256:hash(binary)},schema,queueName,prefixes:runtime.prefixes,sourcePins,canonicalName:manifest.name,canonicalShortName:manifest.short_name,syntheticNonAdminHumanAccounts:3,humanRealPasswordLoginRequired:true,secureCookies:true,csrfPreserved:true,emailDisabled:true,publicFixtureControl:false,privateControlLoopback:true,automaticPushCases:{inviteDelaySeconds:60,reminderDelaySeconds:120,oncePerTester:true},physicalAcceptanceStillRequired:true,expiresAt},null,2)+'\n',{flag:'wx'});
 setTimeout(()=>void close('24-hour-test-expiry'),24*60*60*1000).unref();
 process.stdout.write(JSON.stringify({runId,origin,ready:true})+'\n');
}catch(error){fs.writeFileSync(evidence+'/startup-failure.json',JSON.stringify(redactError(error),null,2)+'\n');await close('startup-failed');}
