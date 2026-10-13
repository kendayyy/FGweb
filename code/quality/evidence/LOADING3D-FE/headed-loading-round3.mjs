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
let app, browser, apiBase;
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
  browser = await chromium.launch({ headless: false, slowMo: 180, ignoreDefaultArgs: ['--disable-backgrounding-occluded-windows'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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

  const loadingShots=[];
  let gamesDelay=2000,holdGames=false,releaseGames;
  const delayedRequest=async route=>{if(holdGames&&route.request().url().endsWith('/games'))await new Promise(resolve=>{releaseGames=resolve;});await new Promise(r=>setTimeout(r,route.request().url().endsWith('/me')?1200:gamesDelay));await route.continue();};
  await a.route('**/api/v1/me',delayedRequest);await a.route('**/api/v1/games',delayedRequest);
  for(const theme of ['dark','light'])for(const [width,height]of [[1440,900],[1280,800],[390,844],[360,800]]){
    await a.setViewportSize({width,height});await a.bringToFront();
    await a.addInitScript(value=>localStorage.setItem('fg.theme',value),theme);
    await a.goto(origin+'/');
    await expect(a.getByRole('progressbar',{name:'Đang kiểm tra phiên làm việc'})).toBeVisible();
    await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toBeVisible();
    assert.equal(await a.locator('.fg-loading-turn').evaluate(el=>getComputedStyle(el).animationDuration),'6s');
    assert.equal(await a.getByRole('progressbar',{name:'Đang tải các game',exact:true}).getAttribute('aria-valuenow'),null);
    assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
    assert.equal(await a.evaluate(()=>document.documentElement.dataset.theme),theme);
    const file='quality/evidence/LOADING3D-FE/loading-'+theme+'-'+width+'x'+height+'-'+owned+'.png';await a.screenshot({path:file});loadingShots.push({theme,width,height,path:file,sha256:hash(file)});
    await expect(a.getByRole('heading',{name:/Lobby/,level:1})).toBeVisible();
  }
  holdGames=true;await a.goto(origin+'/');await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toBeVisible();
  const windowSession=await context.newCDPSession(a),targetInfo=await windowSession.send('Target.getTargetInfo');
  const windowInfo=await windowSession.send('Browser.getWindowForTarget',{targetId:targetInfo.targetInfo.targetId});
  await windowSession.send('Browser.setWindowBounds',{windowId:windowInfo.windowId,bounds:{windowState:'minimized'}});
  await expect.poll(()=>a.evaluate(()=>document.hidden)).toBe(true);await expect(a.locator('.fg-initial-loading')).toHaveAttribute('data-hidden','true');assert.equal(await a.locator('.fg-loading-turn').evaluate(el=>getComputedStyle(el).animationPlayState),'paused');
  await windowSession.send('Browser.setWindowBounds',{windowId:windowInfo.windowId,bounds:{windowState:'normal'}});await a.bringToFront();await expect.poll(()=>a.evaluate(()=>document.hidden)).toBe(false);await expect(a.locator('.fg-initial-loading')).toHaveAttribute('data-hidden','false');assert.equal(await a.locator('.fg-loading-turn').evaluate(el=>getComputedStyle(el).animationPlayState),'running');
  holdGames=false;releaseGames();await expect(a.getByRole('heading',{name:/Lobby/,level:1})).toBeVisible();await windowSession.detach();
  await a.emulateMedia({reducedMotion:'reduce'});await a.goto(origin+'/');await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toBeVisible();assert.equal(await a.locator('.fg-loading-turn').evaluate(el=>getComputedStyle(el).animationName),'none');
  await a.unroute('**/api/v1/me',delayedRequest);await a.unroute('**/api/v1/games',delayedRequest);await a.emulateMedia({reducedMotion:'no-preference'});
  let rejected=false;const failOnce=async route=>{if(!rejected){rejected=true;await route.abort('failed');}else await route.continue();};
  await a.route('**/api/v1/games',failOnce);await a.goto(origin+'/');await expect(a.getByRole('alert').filter({hasText:'Không tải được danh sách game'})).toBeVisible();await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toHaveCount(0);await a.getByRole('button',{name:'Thử lại',exact:true}).first().click();await expect(a.getByRole('heading',{name:/Lobby/,level:1})).toBeVisible();await a.unroute('**/api/v1/games',failOnce);
  await a.route('**/api/v1/games',delayedRequest);await a.goto(origin+'/');await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toBeVisible();await a.evaluate(()=>{history.pushState(null,'','/login');dispatchEvent(new PopStateEvent('popstate'));});await expect(a.getByRole('progressbar',{name:'Đang tải các game',exact:true})).toHaveCount(0);await a.unroute('**/api/v1/games',delayedRequest);
  fs.writeFileSync('quality/evidence/LOADING3D-FE/headed-loading-boundary-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),headed:true,realApiDb:true,networkDelayedNotSuccessMocked:true,bootstrapAndLobby:true,actualNetworkErrorRetry:true,cancelNavigationRemovesLoader:true,reducedMotionStatic:true,actualHiddenWindowVisibilityPauseResume:true,indeterminateProgress:true,rotationSeconds:6,loadingShots,buildHashes},null,2)+'\n',{flag:'wx'});

  await unlock(a); await unlock(b);
  async function chat(page, peer) {
    await page.bringToFront();
    // Use the browser's SPA history navigation; retain the opened native device.
    await page.evaluate(url => { history.pushState(null, '', url); dispatchEvent(new PopStateEvent('popstate')); }, '/users/' + encodeURIComponent(peer) + '/profile');
    await page.getByRole('button', { name: 'Nhắn tin', exact: true }).click();
    await expect(page.getByLabel('Tin nhắn riêng mã hóa', { exact: true })).toBeVisible();
    await page.getByText('Thiết bị người nhận và xác minh', { exact: true }).click();
  }
  await chat(a, users[1]); await chat(b, users[0]);
  await a.bringToFront();
  await expect(a.getByRole('button', { name: 'Xác minh Native Bob', exact: true })).toBeVisible();
  await a.bringToFront();
  await a.getByLabel('Tin nhắn riêng mã hóa', { exact: true }).fill(privateBody);
  await a.bringToFront();
  await a.getByRole('button', { name: 'Gửi mã hóa', exact: true }).click();
  await a.bringToFront();
  await expect(a.getByRole('alert')).toContainText('Cần thiết bị người nhận đã xác minh');
  assert.equal(await a.getByLabel('Tin nhắn riêng mã hóa', { exact: true }).inputValue(), privateBody);
  assert.equal(Number((await pool.query("SELECT count(*) FROM messages WHERE conversation_id='headed-dm'")).rows[0].count), 0);
  await a.bringToFront();
  await a.getByRole('button', { name: 'Xác minh Native Bob', exact: true }).click();
  await b.bringToFront();
  await expect(b.getByRole('button', { name: 'Chấp nhận xác minh', exact: true })).toBeVisible({ timeout: 15000 });
  await b.bringToFront();
  await b.getByRole('button', { name: 'Chấp nhận xác minh', exact: true }).click();
  await a.bringToFront();
  await expect(a.getByRole('button', { name: 'Bắt đầu so sánh số', exact: true })).toBeVisible({ timeout: 15000 });
  await a.bringToFront();
  await a.getByRole('button', { name: 'Bắt đầu so sánh số', exact: true }).click();
  await b.bringToFront();
  await expect(b.getByRole('button', { name: 'Mở mã so sánh', exact: true })).toBeVisible({ timeout: 15000 });
  await b.bringToFront();
  await b.getByRole('button', { name: 'Mở mã so sánh', exact: true }).click();
  await a.bringToFront();
  await expect(a.getByRole('button', { name: 'Các số khớp', exact: true })).toBeVisible({ timeout: 15000 });
  await b.bringToFront();
  await expect(b.getByRole('button', { name: 'Các số khớp', exact: true })).toBeVisible({ timeout: 15000 });
  const sasA = await a.getByLabel('Ba dãy số xác minh').innerText(), sasB = await b.getByLabel('Ba dãy số xác minh').innerText(); assert.equal(sasA, sasB);
  await a.bringToFront();
  await a.getByRole('button', { name: 'Các số khớp', exact: true }).click();
  await a.bringToFront();
  await expect(a.getByText('Đã xác minh bằng SAS trên cả hai thiết bị.', { exact: true })).not.toBeVisible();
  await b.bringToFront();
  await b.getByRole('button', { name: 'Các số khớp', exact: true }).click();
  for (const page of [a,b]) { await page.bringToFront(); await expect(page.getByText('Đã xác minh bằng SAS trên cả hai thiết bị.', { exact: true })).toBeVisible({ timeout: 15000 }); }


  const cspResponse=await b.request.get(origin+'/');assert.equal(cspResponse.status(),200);assert(cspResponse.headers()['content-security-policy']);
  await b.evaluate(()=>{window.__qaBlockedInline=0;window.__qaCspViolations=[];document.addEventListener('securitypolicyviolation',event=>window.__qaCspViolations.push(event.effectiveDirective));const script=document.createElement('script');script.textContent='window.__qaBlockedInline=1';document.body.append(script);});
  await expect.poll(()=>b.evaluate(()=>window.__qaCspViolations.length)).toBeGreaterThan(0);assert.equal(await b.evaluate(()=>window.__qaBlockedInline),0);
  const marker='qa-xss-'+owned;
  const attack='<img src=x onerror="window.__qaXssExecution=1"><svg onload="window.__qaXssExecution=2"></svg><script>window.__qaXssExecution=3</script>'+marker;
  for(const page of [a,b])await page.evaluate(()=>{window.__qaXssExecution=0;});
  await a.bringToFront();await a.getByLabel('Tin nhắn riêng mã hóa',{exact:true}).fill(attack);await a.getByRole('button',{name:'Gửi mã hóa',exact:true}).click();
  for(const page of [a,b]){await page.bringToFront();await expect(page.getByText(attack,{exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>window.__qaXssExecution),0);assert.equal(await page.locator('[data-message-id] img[src="x"]').count(),0);const stored=await page.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage)),session:Object.fromEntries(Object.entries(sessionStorage))}));assert.equal(JSON.stringify(stored).includes(marker),false);}
  assert(payloads.length>0);for(const payload of payloads)assert.equal(JSON.stringify(payload).includes(marker),false);
  const rows=(await pool.query("SELECT content,crypto_envelope FROM messages WHERE conversation_id='headed-dm'")).rows;assert.equal(rows.length,1);assert.equal(rows[0].content,'');assert.equal(JSON.stringify(rows).includes(marker),false);
  const opaque=fs.existsSync(path.join(storage,'opaque'))?fs.readdirSync(path.join(storage,'opaque')):[];assert.deepEqual(opaque,[]);
  const viewportShots=[];for(const [width,height]of [[1440,900],[1280,800],[390,844],[360,800]]){await b.setViewportSize({width,height});await expect(b.getByText(attack,{exact:true})).toBeVisible();assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);const file='quality/evidence/LOADING3D-FE/xss-'+width+'x'+height+'-'+owned+'.png';await b.screenshot({path:file});viewportShots.push({width,height,path:file,sha256:hash(file)});}
  await a.bringToFront();await a.getByLabel('Tin nhắn riêng mã hóa',{exact:true}).fill('qa-unsent-memory-draft-'+owned);
  const storageScan=await a.evaluate(async ({marker,draft})=>{
    const contains=value=>{
      if(typeof value==='string')return value.includes(marker)||value.includes(draft);
      if(value instanceof ArrayBuffer)return contains(new TextDecoder().decode(value));
      if(ArrayBuffer.isView(value))return contains(new TextDecoder().decode(value));
      if(value&&typeof value==='object')return Object.entries(value).some(([key,item])=>contains(key)||contains(item));
      return false;
    };
    let stores=0,entries=0,found=false;
    for(const info of await indexedDB.databases()){
      if(!info.name)continue;
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(info.name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Cannot inspect actual IndexedDB'));});
      try{for(const name of Array.from(db.objectStoreNames)){stores++;await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly'),request=tx.objectStore(name).openCursor();request.onerror=()=>reject(new Error('Cannot inspect stored entry'));tx.onabort=()=>reject(new Error('Inspection transaction aborted'));request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve();return;}entries++;if(entries>20000){reject(new Error('Inspection bound exceeded'));return;}found ||=contains(cursor.key)||contains(cursor.value);cursor.continue();};});}}finally{db.close();}
    }
    return {stores,entries,found,webStorageFound:contains(Object.fromEntries(Object.entries(localStorage)))||contains(Object.fromEntries(Object.entries(sessionStorage)))};
  },{marker,draft:'qa-unsent-memory-draft-'+owned});
  assert(storageScan.stores>0);assert(storageScan.entries>0);assert.equal(storageScan.found,false);assert.equal(storageScan.webStorageFound,false);
  const beforeLogout=(await pool.query("SELECT count(*) FROM messages WHERE conversation_id='headed-dm'")).rows[0].count;
  await a.getByRole('button',{name:'Đóng tin nhắn',exact:true}).first().click();
  await a.getByRole('button',{name:'Đăng xuất',exact:true}).click();
  await expect(a.getByText(attack,{exact:true})).toHaveCount(0);await expect(a.getByLabel('Tin nhắn riêng mã hóa',{exact:true})).toHaveCount(0);
  const afterLogoutStatus=await a.evaluate(async()=>{const response=await fetch('/api/v1/crypto/devices',{credentials:'include'});return response.status;});assert.equal(afterLogoutStatus,401);
  assert.equal((await pool.query("SELECT count(*) FROM messages WHERE conversation_id='headed-dm'")).rows[0].count,beforeLogout);
  assert.deepEqual(legacy,[]);for(const file of buildFiles)assert.equal(hash(file),buildHashes[path.relative(process.cwd(),file).replaceAll(String.fromCharCode(92),'/')]);
  fs.writeFileSync('quality/evidence/LOADING3D-FE/headed-loading-native-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),headed:true,buildHashes,nativeSasAndMegolm:true,appliedAppHelperCspEnforced:true,inlineInjectionBlocked:true,actualEncryptedMarkupAsText:true,noMarkupExecution:true,noPlaintextTransportDbOrWebStorage:true,actualIndexedDbScan:storageScan,logoutSessionRevokedAndPrivateUiAbsent:true,afterLogoutStatus,viewportShots,mainMutation:false},null,2)+String.fromCharCode(10),{flag:'wx'});
  console.log(JSON.stringify({headed:true,nativeSasAndMegolm:true,proposedCspEnforced:true,inlineInjectionBlocked:true,actualEncryptedMarkupAsText:true,noMarkupExecution:true,noPlaintextTransportDbOrWebStorage:true,indexedDbMarkerAbsent:true,logoutSessionRevokedAndPrivateUiAbsent:true,mainMutation:false}));
  await contextB.close();await context.close();
} finally {
  await browser?.close(); await app?.close(); await new Promise(resolve => front.close(resolve));
  try {
    assert.match(owned, /^loading_fe_[a-f0-9]{32}$/); await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
    assert.equal((await pool.query("SELECT to_regclass('public.chat_crypto_state') AS value")).rows[0].value, null);
    if (fs.existsSync(storage)) { assert.equal(fs.realpathSync(storage), path.join(fs.realpathSync(parent), owned)); fs.rmSync(storage, { recursive: true }); }
  } finally { await pool.end(); process.env = saved; }
}
