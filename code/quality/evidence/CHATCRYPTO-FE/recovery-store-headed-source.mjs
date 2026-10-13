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
const owned = `crypto_fe_${randomUUID().replaceAll('-', '')}`;
assert.match(owned, /^crypto_fe_[a-f0-9]{32}$/);
const parent = path.resolve('.runtime/chatcrypto-fe'), storage = path.join(parent, owned);
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
  res.writeHead(200, { 'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(target).pipe(res);
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
  browser = await chromium.launch({ headless: false, slowMo: 180 });
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
    const localCode = await page.getByLabel('Mã khôi phục', { exact: true }).inputValue();
    await page.getByRole('checkbox', { name: 'Tôi đã lưu mã ở nơi an toàn' }).check();
    await page.getByRole('button', { name: 'Mở khóa thiết bị', exact: true }).click();
    await expect(page.getByText('Thiết bị đã mở khóa và đăng ký với FG.', { exact: true })).toBeVisible({ timeout: 30000 });
    return localCode;
  }
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
  // Commit actual encrypted write, then lose response at the browser boundary.
  let failed = false;
  await a.bringToFront();
  await a.route('**/api/v1/crypto/conversations/headed-dm/messages', async route => {
    if (route.request().method() === 'POST' && !failed) {
      const response = await route.fetch(); assert.equal(response.status(), 201); failed = true; await route.abort('failed');
      console.log(JSON.stringify({ actualEncryptedCommitResponseLost: true }));
    } else await route.continue();
  });
  await a.bringToFront();
  await a.getByRole('button', { name: 'Gửi mã hóa', exact: true }).click();
  await a.bringToFront();
  await expect(a.getByRole('alert')).toContainText('Chưa xác nhận gửi thành công');
  assert.equal(await a.getByLabel('Tin nhắn riêng mã hóa', { exact: true }).inputValue(), privateBody);
  await a.bringToFront();
  await a.getByRole('button', { name: 'Gửi mã hóa', exact: true }).click();
  await a.bringToFront();
  await expect(a.getByLabel('Tin nhắn riêng mã hóa', { exact: true })).toHaveValue('');
  await b.bringToFront();
  await expect(b.getByText(privateBody, { exact: true })).toBeVisible({ timeout: 15000 });
  assert.equal(payloads.length, 2); assert.equal(JSON.stringify(payloads[0]), JSON.stringify(payloads[1]));
  assert.equal(Number((await pool.query("SELECT count(*) FROM messages WHERE conversation_id='headed-dm'")).rows[0].count), 1);
  await b.bringToFront();
  await b.getByRole('button', { name: 'Trả lời Native Alice', exact: true }).click();
  await b.bringToFront();
  await b.getByLabel('Nhắc tên thành viên').selectOption(users[0]);
  await b.bringToFront();
  await b.getByLabel('Tin nhắn riêng mã hóa', { exact: true }).fill('FG native reply fixture');
  await b.bringToFront();
  await b.getByRole('button', { name: 'Gửi mã hóa', exact: true }).click();
  await a.bringToFront();
  await expect(a.getByText('FG native reply fixture', { exact: true })).toBeVisible({ timeout: 15000 });
  const stored = (await pool.query("SELECT content,crypto_envelope FROM messages WHERE conversation_id='headed-dm'")).rows;
  assert.equal(stored.length, 2); for (const row of stored) { assert.equal(row.content, ''); assert.equal(JSON.stringify(row).includes(privateBody), false); assert.equal(JSON.stringify(row).includes('FG native reply fixture'), false); }
  assert.deepEqual(legacy, []);
  const sharp = (await import('sharp')).default;
  const sourceImage = await sharp({ create: { width: 24, height: 18, channels: 3, background: { r: 38, g: 156, b: 84 } } }).png().toBuffer();
  await a.bringToFront();
  await a.getByLabel('Ảnh riêng (tối đa 4)').setInputFiles({ name: 'private-fixture.png', mimeType: 'image/png', buffer: sourceImage });
  await expect(a.getByText('Ảnh 1 · 24 × 18 · đã mã hóa trên thiết bị', { exact: true })).toBeVisible();
  await a.getByRole('button', { name: 'Gửi mã hóa', exact: true }).click();
  await expect(a.getByText('Ảnh 1 · 24 × 18 · đã mã hóa trên thiết bị', { exact: true })).not.toBeVisible();
  await b.bringToFront();
  const privateImage = b.getByRole('img', { name: 'Ảnh riêng đã giải mã và kiểm tra trên thiết bị' });
  await expect(privateImage).toBeVisible({ timeout: 30000 });
  assert.deepEqual(await privateImage.evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight, protocol: new URL(image.src).protocol })), { width: 24, height: 18, protocol: 'blob:' });
  const imageRows = (await pool.query("SELECT m.content,a.mime_type,a.encryption_mode FROM messages m JOIN attachments a ON a.message_id=m.id WHERE m.conversation_id='headed-dm'")).rows;
  assert.equal(imageRows.length, 1); assert.equal(imageRows[0].content, '');
  assert.equal(imageRows[0].mime_type, 'application/octet-stream');
  await a.bringToFront();
  await a.getByLabel('Ảnh riêng (tối đa 4)').setInputFiles({ name: 'not-allowed.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(a.getByRole('alert')).toContainText('Chỉ nhận JPG/PNG/WebP tối đa 5MiB và 20MP');
  await a.getByLabel('Ảnh riêng (tối đa 4)').setInputFiles({ name: 'oversized.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(a.getByRole('alert')).toContainText('Chỉ nhận JPG/PNG/WebP tối đa 5MiB và 20MP');
  const oversizedPixels = await sharp({ create: { width: 5001, height: 4000, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();
  assert(oversizedPixels.length < 5 * 1024 * 1024);
  await a.getByLabel('Ảnh riêng (tối đa 4)').setInputFiles({ name: 'over-20mp.png', mimeType: 'image/png', buffer: oversizedPixels });
  await expect(a.getByRole('alert')).toContainText('Chỉ nhận JPG/PNG/WebP tối đa 5MiB và 20MP');
  assert.equal(Number((await pool.query("SELECT count(*) FROM attachments WHERE conversation_id='headed-dm'")).rows[0].count), 1);
  // Backup through actual UI; a new browser/device must not inherit old trust.
  await a.evaluate(() => { history.pushState(null, '', '/crypto'); dispatchEvent(new PopStateEvent('popstate')); });
  await a.getByRole('button', { name: 'Tạo mã riêng cho bản khôi phục', exact: true }).click();
  const backupCode = await a.getByLabel('Mã riêng cho bản khôi phục', { exact: true }).inputValue();
  await a.getByRole('checkbox', { name: 'Tôi đã lưu mã bản khôi phục ở nơi an toàn' }).check();
  await a.getByRole('button', { name: 'Mã hóa và lưu bản khôi phục', exact: true }).click();
  await expect(a.getByText('Bản khôi phục khóa đã được mã hóa và lưu. Chỉ mã riêng của bạn mở được bản này.', { exact: true })).toBeVisible({ timeout: 30000 });
  const backupRows = (await pool.query('SELECT ciphertext FROM chat_crypto_recovery_backups WHERE user_id=$1', [users[0]])).rows;
  assert.equal(backupRows.length, 1); assert.equal(backupRows[0].ciphertext.includes(backupCode), false); assert.equal(backupRows[0].ciphertext.includes(privateBody), false);
  const contextC = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tokenC = owned + '-' + users[0], signatureC = await makeSignature(tokenC, secret);
  await contextC.addCookies([{ name: 'better-auth.session_token', value: tokenC + '.' + signatureC, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  const c = await contextC.newPage(); const cDeviceCode = await unlock(c); await chat(c, users[1]);
  await expect(c.getByText(privateBody, { exact: true })).not.toBeVisible();
  const restoreScreen = async () => { await c.bringToFront(); await c.evaluate(() => { history.pushState(null, '', '/crypto'); dispatchEvent(new PopStateEvent('popstate')); }); await c.getByRole('button', { name: 'Nhập bản khôi phục', exact: true }).click(); };
  await restoreScreen();
  await c.getByLabel('Mã riêng cho bản khôi phục', { exact: true }).fill('ResetPassword!123');
  await expect(c.getByRole('button', { name: 'Khôi phục khóa lịch sử', exact: true })).toBeDisabled();
  await c.getByLabel('Mã riêng cho bản khôi phục', { exact: true }).fill(randomBytes(32).toString('base64url'));
  await c.getByRole('button', { name: 'Khôi phục khóa lịch sử', exact: true }).click();
  await expect(c.getByRole('alert')).toContainText('Không khôi phục được. Kiểm tra mã riêng');
  await chat(c, users[1]); await expect(c.getByText(privateBody, { exact: true })).not.toBeVisible();
  await restoreScreen(); await c.getByLabel('Mã riêng cho bản khôi phục', { exact: true }).fill(backupCode);
  await c.getByRole('button', { name: 'Khôi phục khóa lịch sử', exact: true }).click();
  await expect(c.getByText(/Đã kiểm tra \d+ khóa lịch sử, nhập thêm \d+/)).toBeVisible({ timeout: 30000 });
  await chat(c, users[1]);
  await expect(c.getByText(privateBody, { exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect(c.getByText('Lịch sử từ bản khôi phục · thiết bị gửi chưa được xác minh hiện tại.', { exact: true }).first()).toBeVisible();
  await expect(c.getByRole('button', { name: 'Xác minh Native Bob', exact: true })).toBeVisible();
  await expect(c.getByText('Đã xác minh bằng SAS trên cả hai thiết bị.', { exact: true })).not.toBeVisible();
  await c.screenshot({ path: 'quality/evidence/CHATCRYPTO-FE/recovered-history-' + owned + '.png' });
  // Close/reopen the actual encrypted native IndexedDB store, without another backup import.
  await c.bringToFront();await c.goto(origin+'/crypto');
  await expect(c.getByRole('heading',{name:'Mở khóa thiết bị',exact:true})).toBeVisible();
  await c.getByLabel('Mã khôi phục',{exact:true}).fill(cDeviceCode);
  await c.getByRole('button',{name:'Mở khóa thiết bị',exact:true}).click();
  await expect(c.getByText('Thiết bị đã mở khóa và đăng ký với FG.',{exact:true})).toBeVisible();
  await chat(c,users[1]);
  await expect(c.getByText(privateBody,{exact:true}).first()).toBeVisible({timeout:30000});
  await expect(c.getByText('Lịch sử từ bản khôi phục · thiết bị gửi chưa được xác minh hiện tại.',{exact:true}).first()).toBeVisible();
  await expect(c.getByRole('button',{name:'Xác minh Native Bob',exact:true})).toBeVisible();
  await expect(c.getByText('Đã xác minh bằng SAS trên cả hai thiết bị.',{exact:true})).not.toBeVisible();

  await c.evaluate(() => { history.pushState(null, '', '/crypto'); dispatchEvent(new PopStateEvent('popstate')); });
  const restoredDeviceId = (await c.getByText(/^ID: FG_/).innerText()).replace(/^ID: /, '');
  assert.match(restoredDeviceId, /^FG_[a-f0-9-]{36}$/);
  const deniedSync = [];
  c.on('response', response => { if (new URL(response.url()).pathname === '/api/v1/crypto/sync' && response.status() === 403) deniedSync.push(true); });
  await a.bringToFront();
  await a.getByRole('button', { name: 'Tải lại thiết bị', exact: true }).click();
  await a.getByRole('button', { name: 'Thu hồi ' + restoredDeviceId, exact: true }).click();
  await expect(a.getByRole('button', { name: 'Thu hồi ' + restoredDeviceId, exact: true })).not.toBeVisible();
  assert.notEqual((await pool.query('SELECT revoked_at FROM chat_crypto_devices WHERE user_id=$1 AND device_id=$2', [users[0], restoredDeviceId])).rows[0].revoked_at, null);
  const revokedQueueCount = Number((await pool.query('SELECT count(*) FROM chat_crypto_to_device_events WHERE recipient_user_id=$1 AND recipient_device_id=$2', [users[0], restoredDeviceId])).rows[0].count);
  await c.bringToFront();
  await expect(c.getByRole('heading', { name: 'Mở khóa thiết bị', exact: true })).toBeVisible({ timeout: 15000 });
  assert(deniedSync.length > 0, 'Revoked native device sync must actually return403');
  const afterRevokeBody = 'Native post-revocation epoch fixture';
  await chat(a, users[1]);
  await a.getByLabel('Tin nhắn riêng mã hóa', { exact: true }).fill(afterRevokeBody);
  await a.getByRole('button', { name: 'Gửi mã hóa', exact: true }).click();
  await expect(a.getByLabel('Tin nhắn riêng mã hóa', { exact: true })).toHaveValue('');
  await b.bringToFront();
  await expect(b.getByText(afterRevokeBody, { exact: true })).toBeVisible({ timeout: 30000 });
  assert.equal(Number((await pool.query('SELECT count(*) FROM chat_crypto_to_device_events WHERE recipient_user_id=$1 AND recipient_device_id=$2', [users[0], restoredDeviceId])).rows[0].count), revokedQueueCount);
  assert.deepEqual(legacy, []);
  await contextC.close();
  await b.bringToFront();
  await b.bringToFront();
  await b.setViewportSize({ width: 360, height: 900 });
  assert.equal(await b.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await b.locator('.fg-private-composer').scrollIntoViewIfNeeded();
  assert.equal(await b.evaluate(() => {
    const messages = document.querySelector('.fg-private-messages').getBoundingClientRect();
    const composer = document.querySelector('.fg-private-composer').getBoundingClientRect();
    return messages.bottom <= composer.top;
  }), true, 'Messages and composer must not overlap at 360px');
  await b.bringToFront();
  await b.screenshot({ path: 'quality/evidence/CHATCRYPTO-FE/private-dm-360-' + owned + '.png' });
  for (const file of buildFiles) assert.equal(hash(file), buildHashes[path.relative(process.cwd(), file).replaceAll('\\', '/')]);
  fs.writeFileSync('quality/evidence/CHATCRYPTO-FE/headed-chat-proof-' + owned + '.json', JSON.stringify({ recordedAt: new Date().toISOString(), headed: true, buildHashes, actualAuthAndDatabase: true, nativeSasOnBothBrowsers: true, ciphertextRetryAfterLostResponse: true, replyMentionEncrypted: true, noLegacyPrivateCalls: true, mainMutation: false, groupUi: false }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ headed: true, actualFgNativePrivateDm: true, nativeBilateralSas: true, unverifiedSendBlockedAndDraftPreserved: true, exactCipherRetryAndDedup: true, nativeReplyMention: true, nativeImageUploadAndDecode: true, invalidImageRejectedBeforeUpload: true, actualRecoveryUiAndFreshDevice: true, wrongCodeAndPasswordNoBypass: true, recoveredProvenance: true, actualUiRemoteDeviceRevocation: true, revokedSync403AndNoFutureKeyRouting: true, databaseNoPlaintext: true, noLegacyPrivateProducer: true, mobile360: true, mainMutation: false, groupUi: false }));
  await contextB.close(); await context.close();
} finally {
  await browser?.close(); await app?.close(); await new Promise(resolve => front.close(resolve));
  try {
    assert.match(owned, /^crypto_fe_[a-f0-9]{32}$/); await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
    assert.equal((await pool.query("SELECT to_regclass('public.chat_crypto_state') AS value")).rows[0].value, null);
    if (fs.existsSync(storage)) { assert.equal(fs.realpathSync(storage), path.join(fs.realpathSync(parent), owned)); fs.rmSync(storage, { recursive: true }); }
  } finally { await pool.end(); process.env = saved; }
}
