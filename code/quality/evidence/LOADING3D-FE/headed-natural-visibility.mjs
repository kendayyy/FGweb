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
let app, browser, apiBase, uiPage, uiError, naturalBrowser;
const uiStartedAt=new Date().toISOString(),uiRunId='natural-visibility-'+owned,uiEvents=[];let uiStep=0;
async function stream(page,title,action,result,status='RUNNING'){uiPage=page;await page.bringToFront();const event=await captureUiStep(page,{task:'LOADING3D-FE',runId:uiRunId,step:++uiStep,title,action,result,status,startedAt:uiStartedAt,headed:true,privacySafe:true,maskSelectors:['[role=dialog]','.fg-crypto-panel','.fg-crypto-flow','.fg-crypto-verifications','.fg-private-chat','.fg-private-device','.fg-crypto-secret','.fg-profile-header','.fg-profile-info']});uiEvents.push(event);return event;}
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
  Object.assign(process.env, { ...env, DATABASE_URL: url.href, PUBLIC_ORIGIN: origin, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: secret,
    FG_UPLOADS_DIR: path.join(storage, 'legacy'), FG_CRYPTO_OBJECTS_DIR: path.join(storage, 'opaque'),
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
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tokenB = owned + '-' + users[1], signatureB = await makeSignature(tokenB, secret);
  await contextB.addCookies([{ name: 'better-auth.session_token', value: tokenB + '.' + signatureB, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  await login(users[0]);
  const a = await context.newPage(), b = await contextB.newPage();
  const legacy = [], payloads = [], privateBody = 'FG native headed private message ' + owned;
  for (const page of [a,b]) page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (/^\/api\/v1\/conversations\/[^/]+\/messages/.test(pathname)) legacy.push({ pathname, method: request.method() });
    if (request.method() === 'POST' && pathname === '/api/v1/crypto/conversations/headed-dm/messages') {
      const payload = request.postDataJSON(); assert.equal(JSON.stringify(payload).includes(privateBody), false); payloads.push(payload);
    }
  });
  async function unlock(page) {
    await page.bringToFront();
    await page.goto(origin + '/crypto'); await expect(page.getByRole('button', { name: 'Tạo mã khôi phục' })).toBeVisible();
    await page.getByRole('button', { name: 'Tạo mã khôi phục' }).click();
    await page.getByRole('checkbox', { name: 'Tôi đã lưu mã ở nơi an toàn' }).check();
    await page.getByRole('button', { name: 'Mở khóa thiết bị', exact: true }).click();
    await expect(page.getByText('Thiết bị đã mở khóa và đăng ký với FG.', { exact: true })).toBeVisible({ timeout: 30000 });
  }


  let release;await a.route('**/api/v1/games',async route=>{await new Promise(resolve=>{release=resolve;});await route.continue();});await a.bringToFront();await a.goto(origin+'/');await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toBeVisible();await stream(a,'FG · Visibility diagnostic','Giữ request thật khi pending','Chẩn đoán Chromium visibility, chưa nghiệm thu task');
  const session=await context.newCDPSession(a),info=(await session.send('Target.getTargetInfo')).targetInfo,window=(await session.send('Browser.getWindowForTarget',{targetId:info.targetId}));const observations=[];
  const read=async method=>{await new Promise(r=>setTimeout(r,300));observations.push({method,bounds:(await session.send('Browser.getWindowForTarget',{targetId:info.targetId})).bounds,state:await a.evaluate(()=>({hidden:document.hidden,visibility:document.visibilityState,focus:document.hasFocus()}))});};
  await session.send('Emulation.setFocusEmulationEnabled',{enabled:false});await session.send('Browser.setWindowBounds',{windowId:window.windowId,bounds:{windowState:'minimized'}});await read('minimize-no-focus-or-background-flags');await session.send('Browser.setWindowBounds',{windowId:window.windowId,bounds:{windowState:'normal'}});await a.bringToFront();
  const popupEvent=context.waitForEvent('page');await a.evaluate(()=>{window.open('/login','_blank');});const popup=await popupEvent;await popup.waitForLoadState();await popup.bringToFront();await read('actual-window-open-background-page');await popup.close();await a.bringToFront();
  const browserSession=await browser.newBrowserCDPSession();const created=await browserSession.send('Target.createTarget',{url:origin+'/login',browserContextId:info.browserContextId,newWindow:false,background:false});await session.send('Emulation.setFocusEmulationEnabled',{enabled:false});await browserSession.send('Target.activateTarget',{targetId:created.targetId});await read('native-target-tab-activation');await browserSession.send('Target.closeTarget',{targetId:created.targetId});await a.bringToFront();
  release();await expect(a.getByRole('heading',{name:/Lobby/,level:1})).toBeVisible();fs.writeFileSync('quality/evidence/LOADING3D-FE/natural-visibility-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),diagnosticOnly:true,taskAcceptance:false,observations},null,2)+'\n',{flag:'wx'});assert(observations.some(x=>x.state.hidden),'Natural browser must deliver actual hidden state');console.log(JSON.stringify({diagnosticOnly:true,noDefaults:true,observations}));
} catch(problem){uiError=problem;throw problem;} finally {
  try {
  await app?.close(); await new Promise(resolve => front.close(resolve));
  try {
    assert.match(owned, /^loading_fe_[a-f0-9]{32}$/); await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
    assert.equal((await pool.query("SELECT to_regclass('public.chat_crypto_state') AS value")).rows[0].value, null);
    if (fs.existsSync(storage)) { assert.equal(fs.realpathSync(storage), path.join(fs.realpathSync(parent), owned)); fs.rmSync(storage, { recursive: true }); }
  } finally { await pool.end(); process.env = saved; }
  } catch(cleanupError){uiError??=cleanupError;throw cleanupError;} finally {
    try{if(uiPage&&!uiPage.isClosed())await stream(uiPage,'FG · Kết thúc UI test','Kết thúc assertions và cleanup fixture',uiError?'Run thất bại; xem evidence task đã che thông tin nhạy cảm':'Assertions native/loader và cleanup fixture đều đạt',uiError?'FAILED':'SUCCEEDED');}
    finally{await naturalBrowser?.close();await browser?.close();fs.writeFileSync('quality/evidence/LOADING3D-FE/ui-stream-producer-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),runId:uiRunId,startedAt:uiStartedAt,status:uiError?'FAILED':'SUCCEEDED',headed:true,privacyReviewed:true,events:uiEvents,deliveryReceiptNotClaimed:true},null,2)+'\n',{flag:'wx'});}
  }
}
