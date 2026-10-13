import {startGatewayFixture} from './private-gateway-fixture.mjs';
import {RoomServiceClient} from 'livekit-server-sdk';
import {RoomSchema} from '@fg/contracts';
import {launchNaturalChromium} from './natural-chromium.mjs';
import {captureUiStep} from '../../../tools/telegram-bridge/demo-stream.mjs';
import {createFgSecurityHeaders} from '../../../apps/web/security-headers.mjs';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomUUID, createHash, randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { makeSignature } from 'better-auth/crypto';
import { NestFactory } from '@nestjs/core';
import { chromium, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 30000 });

process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.cache/ms-playwright');
const owned = `loading_fe_${randomUUID().replaceAll('-', '')}`;
assert.match(owned, /^loading_fe_[a-f0-9]{32}$/);
const parent = path.resolve('.runtime/loading3d-fe'), storage = path.join(parent, owned);
const saved = { ...process.env }, env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
const url = new URL(env.DATABASE_URL); url.searchParams.set('options', `-c search_path=${owned}`);
const pool = new pg.Pool({ connectionString: url.href, connectionTimeoutMillis: 5000 });
const secret = 'fe-headed-owned-synthetic-auth-secret-only-32';
const users = [`${owned}-alice`, `${owned}-bob`];
let app, browser, apiBase, uiPage, uiError, naturalBrowser, gateway, callId;
const uiStartedAt=new Date().toISOString(),uiRunId='call-loader-'+owned,uiEvents=[];assert(/^[A-Za-z0-9_-]{1,65}$/.test(uiRunId));let uiStep=0;
async function stream(page,title,action,result,status='RUNNING'){uiPage=page;const shotSession=await page.context().newCDPSession(page),shotInfo=(await shotSession.send('Target.getTargetInfo')).targetInfo,shotWindow=await shotSession.send('Browser.getWindowForTarget',{targetId:shotInfo.targetId});if(shotWindow.bounds.windowState==='minimized')await shotSession.send('Browser.setWindowBounds',{windowId:shotWindow.windowId,bounds:{windowState:'normal'}});await shotSession.detach();await page.bringToFront();const event=await captureUiStep(page,{task:'LOADING3D-FE',runId:uiRunId,step:++uiStep,title,action,result,status,startedAt:uiStartedAt,headed:true,privacySafe:true,maskSelectors:['[role=dialog]','.fg-crypto-panel','.fg-crypto-flow','.fg-crypto-verifications','.fg-private-chat','.fg-private-device','.fg-crypto-secret','.fg-profile-header','.fg-profile-info']});uiEvents.push(event);return event;}
const dist = path.resolve('apps/web/dist');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const entryAssets = [...index.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map(match => path.join(dist, match[1]));
const buildFiles = [path.join(dist, 'index.html'), ...entryAssets, ...fs.readdirSync(path.join(dist, 'assets')).filter(name => name.startsWith('matrix_sdk_crypto_wasm_bg-') && name.endsWith('.wasm')).map(name => path.join(dist, 'assets', name)), ...['modules/auth/auth.service.js', 'modules/profiles/profiles.service.js', 'modules/chat-crypto/crypto-relay.service.js'].map(name => path.resolve('apps/api/dist', name))];
const buildHashes = Object.fromEntries(buildFiles.map(file => [path.relative(process.cwd(), file).replaceAll('\\', '/'), hash(file)]));
const front = http.createServer((req, res) => {

  if (req.url?.startsWith('/api/') || req.url?.startsWith('/socket.io')) {
    const proxy = http.request(new URL(req.url, apiBase), { method: req.method, headers: { ...req.headers, host: new URL(apiBase).host } }, response => {
      res.writeHead(response.statusCode ?? 500, response.headers); response.pipe(res);
    });
    proxy.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(proxy); return;
  }
  const requested = path.resolve(dist, '.' + new URL(req.url ?? '/', 'http://localhost').pathname);
  if (requested !== dist && !requested.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
  const target = fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(dist, 'index.html');
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const security=path.extname(target)==='.html'?createFgSecurityHeaders(fs.readFileSync(target,'utf8')):{};
  res.writeHead(200, { 'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store',...security }); fs.createReadStream(target).pipe(res);
});
front.on('upgrade', (req, socket, head) => {
  if (!apiBase || !req.url?.startsWith('/socket.io')) { socket.destroy(); return; }
  const upstream = http.request(new URL(req.url, apiBase), { headers: { ...req.headers, host: new URL(apiBase).host } });
  upstream.on('upgrade', (response, peer, peerHead) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\n' + Object.entries(response.headers).map(([key,value]) => key + ': ' + value).join('\r\n') + '\r\n\r\n');
    if (head.length) peer.write(head); if (peerHead.length) socket.write(peerHead); socket.pipe(peer); peer.pipe(socket);
    socket.on('error', () => peer.destroy()); peer.on('error', () => socket.destroy());
  });
  upstream.on('error', () => socket.destroy()); upstream.end();
});
try {
  await new Promise(resolve => front.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${front.address().port}`;
  assert.equal((await pool.query("SELECT to_regclass('public.chat_crypto_state') AS value")).rows[0].value, null);
  await pool.query(`CREATE SCHEMA "${owned}"`);
  const client = await pool.connect();
  try { await migrate(drizzle(client), { migrationsFolder: 'packages/database/migrations', migrationsSchema: owned }); } finally { client.release(); }
  for (const user of users) {
    await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())', [user, `${owned}-${user}@example.invalid`]);
    await pool.query('INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$1,now()+interval \'1 day\',now(),now())', [`${owned}-${user}`, user]);
  }
  const tables = await import('@fg/database');
  const games = await tables.seedGames(drizzle(pool, { schema: tables }));
  for (const [index, user] of users.entries()) {
    await pool.query('INSERT INTO profiles(user_id,display_name,bio) VALUES($1,$2,$3)', [user, index ? 'Native Bob' : 'Native Alice', 'Owned headed crypto fixture']);
    await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)', [randomUUID(), user, games[0].id]);
  }
  await pool.query("INSERT INTO conversations(id,kind,user1_id,user2_id) VALUES('headed-dm','DM',$1,$2)", users);
  await pool.query("INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES('headed-dm','E2EE','RECONCILED','KNOWN')");
  for (const user of users) await pool.query("INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES($1,'headed-dm',$2,1,now())", [randomUUID(), user]);
  gateway=await startGatewayFixture({databaseURL:url.href,key:env.LIVEKIT_API_KEY,secret:env.LIVEKIT_API_SECRET,origin,turnTcp:true});
  Object.assign(process.env, { ...env, DATABASE_URL: url.href, PUBLIC_ORIGIN: origin, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: secret,
    LIVEKIT_SERVER_URL:gateway.server,LIVEKIT_ADMISSION_URL:gateway.ws,FG_UPLOADS_DIR: path.join(storage, 'legacy'), FG_CRYPTO_OBJECTS_DIR: path.join(storage, 'opaque'),
    FG_CRYPTO_TRANSPORT_MAX_ROWS_PER_USER: '10000', FG_CRYPTO_TRANSPORT_MAX_PAYLOAD_BYTES_PER_USER: '100000000' });
  const { AppModule } = await import('../../../apps/api/dist/app.module.js');
  const { configureFgHttpBodyParsers } = await import('../../../apps/api/dist/modules/chat-crypto/http-body-parsers.js');
  app = await NestFactory.create(AppModule, { logger: false, bodyParser: false }); configureFgHttpBodyParsers(app);
  await app.listen(0, '127.0.0.1'); apiBase = await app.getUrl();
  naturalBrowser=await launchNaturalChromium(chromium,owned);browser=naturalBrowser.browser;
  const context=naturalBrowser.context;
  async function login(user) {
    const token = `${owned}-${user}`, signature = await makeSignature(token, secret);
    await context.addCookies([{ name: 'better-auth.session_token', value: `${token}.${signature}`, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  }

  await login(users[0]);const a=await context.newPage();uiPage=a;
  await a.goto(origin+'/lobby');await expect(a.getByRole('heading',{name:'Lobby',exact:true,level:1})).toBeVisible();await stream(a,'FG · Kiểm tra giữ cuộc gọi','Mở app thật và fixture LiveKit local','Bắt đầu kiểm giữ cuộc gọi khi dữ liệu khác tải nền');
  const post=async(path,data)=>{const r=await a.request.post(origin+'/api/v1/'+path,{headers:{Origin:origin},data});assert.equal(r.status(),200);return r.json();};
  const room=RoomSchema.parse(await post('rooms',{name:'Loader call preservation',gameId:games[0].id,gameTitle:games[0].title,visibility:'PUBLIC',invitePolicy:'OWNER_APPROVAL',playerCapacity:5}));
  const group=await post('rooms/'+room.id+'/calls',{});callId=group.id;
  await a.goto(origin+'/rooms?roomId='+room.id);await expect(a.getByRole('button',{name:'Vào gọi',exact:true})).toBeVisible();
  await a.getByRole('button',{name:'Vào gọi',exact:true}).click();await expect(a.getByRole('button',{name:'Bật mic',exact:true})).toBeEnabled();await expect(a.getByRole('button',{name:'Rời cuộc gọi',exact:true})).toBeVisible();
  const sfu=new RoomServiceClient(gateway.server,env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET),people=await sfu.listParticipants('fg-call_'+callId);assert.equal(people.length,1);const identity=people[0].identity;
  await a.locator('.fg-call-panel').evaluate(el=>{window.__fgLoaderCallElement=el;});await stream(a,'FG · Cuộc gọi native','Vào gọi qua admission và LiveKit thật','Native SFU có participant; control mic đã connected');
  let release,observed;const held=new Promise(r=>release=r),requested=new Promise(r=>observed=r);const pattern='**/api/v1/rooms/'+room.id;const pending=async route=>{observed();await held;await route.continue();};await a.route(pattern,pending);
  const session=await context.newCDPSession(a),target=(await session.send('Target.getTargetInfo')).targetInfo,win=await session.send('Browser.getWindowForTarget',{targetId:target.targetId});await session.send('Browser.setWindowBounds',{windowId:win.windowId,bounds:{windowState:'minimized'}});await expect.poll(()=>a.evaluate(()=>document.hidden)).toBe(true);await session.send('Browser.setWindowBounds',{windowId:win.windowId,bounds:{windowState:'normal'}});await a.bringToFront();await session.detach();
  await Promise.race([requested,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Real room background request did not start')),10000))]);await expect(a.locator('.fg-initial-loading')).toHaveCount(0);
  assert.equal(await a.locator('.fg-call-panel').evaluate(el=>el===window.__fgLoaderCallElement&&el.isConnected),true);await expect(a.getByRole('button',{name:'Bật mic',exact:true})).toBeEnabled();assert.deepEqual((await sfu.listParticipants('fg-call_'+callId)).map(p=>p.identity),[identity]);
  await stream(a,'FG · Call và tải nền','Ẩn/hiện cửa sổ và refetch phòng khi cuộc gọi đang kết nối','Request phòng thật đang pending; không phủ loader, CallPanel cùng DOM và native participant giữ nguyên');const ready=a.waitForResponse(r=>r.url().endsWith('/api/v1/rooms/'+room.id)&&r.status()===200);release();await ready;await a.unroute(pattern,pending);
  await a.getByRole('button',{name:'Rời cuộc gọi',exact:true}).click();await expect(a.getByRole('button',{name:'Vào gọi',exact:true})).toBeVisible();await expect.poll(async()=>(await sfu.listParticipants('fg-call_'+callId)).length).toBe(0);
  for(const file of buildFiles)assert.equal(hash(file),buildHashes[path.relative(process.cwd(),file).replaceAll(String.fromCharCode(92),'/')]);
  fs.writeFileSync('quality/evidence/LOADING3D-FE/native-call-preservation-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),headed:true,nativeLiveKitParticipant:true,roomBackgroundPendingWhileConnected:true,noInitialOverlayDuringRefetch:true,callDomIdentityPreserved:true,sfuIdentityPreserved:true,micControlConnected:true,explicitLeaveConfirmed:true,buildHashes,mediaCapacityClaim:false},null,2)+'\n',{flag:'wx'});
}catch(problem){uiError=problem;throw problem;}finally{
  try{if(uiPage&&!uiPage.isClosed())await stream(uiPage,'FG · Kết thúc kiểm tra call','Kết thúc kiểm giữ cuộc gọi',uiError?'Run thất bại; giữ evidence thực':'Native call/loader assertions đạt',uiError?'FAILED':'SUCCEEDED');}
  finally{await naturalBrowser?.close();await app?.close();await new Promise(r=>front.close(r));await gateway?.close();await pool.query('DROP SCHEMA IF EXISTS "'+owned+'" CASCADE');assert.equal((await pool.query("SELECT to_regclass('public.chat_crypto_state') IS NULL AS absent")).rows[0].absent,true);await pool.end();process.env=saved;
    if(fs.existsSync(storage)){assert.equal(fs.realpathSync(storage),path.join(fs.realpathSync(parent),owned));fs.rmSync(storage,{recursive:true});}
    fs.writeFileSync('quality/evidence/LOADING3D-FE/ui-stream-call-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),runId:uiRunId,headed:true,status:uiError?'FAILED':'SUCCEEDED',events:uiEvents,deliveryReceiptNotClaimed:true},null,2)+'\n',{flag:'wx'});
  }
}
