import 'reflect-metadata';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { makeSignature } from 'better-auth/crypto';
import { NestFactory } from '@nestjs/core';
import { chromium, expect } from '@playwright/test';

process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.cache/ms-playwright');
const owned = `crypto_fe_${randomUUID().replaceAll('-', '')}`;
assert.match(owned, /^crypto_fe_[a-f0-9]{32}$/);
const parent = path.resolve('.runtime/chatcrypto-fe'), storage = path.join(parent, owned);
const saved = { ...process.env }, env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
const url = new URL(env.DATABASE_URL); url.searchParams.set('options', `-c search_path=${owned}`);
const pool = new pg.Pool({ connectionString: url.href, connectionTimeoutMillis: 5000 });
const secret = 'fe-headed-owned-synthetic-auth-secret-only-32';
const users = ['browser-alice', 'browser-bob'];
let app, browser, apiBase;
const dist = path.resolve('apps/web/dist');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const entryAssets = [...index.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map(match => path.join(dist, match[1]));
const buildFiles = [path.join(dist, 'index.html'), ...entryAssets, ...fs.readdirSync(path.join(dist, 'assets')).filter(name => name.startsWith('matrix_sdk_crypto_wasm_bg-') && name.endsWith('.wasm')).map(name => path.join(dist, 'assets', name)), ...['modules/auth/auth.service.js', 'modules/profiles/profiles.service.js', 'modules/chat-crypto/crypto-relay.service.js'].map(name => path.resolve('apps/api/dist', name))];
const buildHashes = Object.fromEntries(buildFiles.map(file => [path.relative(process.cwd(), file).replaceAll('\\', '/'), hash(file)]));
const front = http.createServer((req, res) => {
  if (req.url?.startsWith('/api/')) {
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
  await login(users[0]); const page = await context.newPage();
  page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 400) console.log(JSON.stringify({ phase: 'headed-api-error', endpoint: new URL(response.url()).pathname, status: response.status() })); });
  await page.goto(`${origin}/crypto`); await expect(page.getByRole('heading', { name: 'Mở khóa thiết bị' })).toBeVisible();
  await page.getByRole('button', { name: 'Tạo mã khôi phục' }).click();
  let code = await page.getByLabel('Mã khôi phục', { exact: true }).inputValue(); assert(/^[A-Za-z0-9_-]{43}$/.test(code));
  await expect(page.getByRole('button', { name: 'Mở khóa thiết bị', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Tôi đã lưu mã ở nơi an toàn' }).check();
  await page.getByRole('button', { name: 'Mở khóa thiết bị', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('đăng ký với FG', { timeout: 30000 });
  const original = (await pool.query('SELECT device_id FROM chat_crypto_devices WHERE user_id=$1', [users[0]])).rows;
  assert.equal(original.length, 1); const deviceId = original[0].device_id;
  assert.equal(await page.evaluate(privateCode => Object.values(localStorage).some(value => String(value).includes(privateCode)), code), false);
  assert.ok((await page.evaluate(() => indexedDB.databases())).length > 0);
  const control = page.getByRole('button', { name: 'Khóa thiết bị' });
  const bounds = await control.boundingBox(); assert.ok(bounds && bounds.height >= 44 && bounds.width >= 44);
  assert.equal(await control.evaluate(element => getComputedStyle(element).color === 'rgb(0, 0, 0)'), false);
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await page.screenshot({ path: `quality/evidence/CHATCRYPTO-FE/device-ready-${width}-${owned}.png` });
  }
  await page.getByRole('button', { name: 'Chuyển sang Sáng' }).click();
  await page.screenshot({ path: `quality/evidence/CHATCRYPTO-FE/device-light-360-${owned}.png` });
  const other = await context.newPage(); await other.goto(`${origin}/crypto`);
  async function enter(target, value) { try { await target.getByLabel('Mã khôi phục', { exact: true }).fill(value); } catch { throw new Error('Recovery input failed (value redacted)'); } }
  await expect(other.getByRole('heading', { name: 'Mở khóa thiết bị' })).toBeVisible();
  await enter(other, code); await other.getByRole('button', { name: 'Mở khóa thiết bị', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('tab khác');
  await page.getByRole('button', { name: 'Khóa thiết bị' }).click();
  await other.getByRole('button', { name: 'Mở khóa thiết bị', exact: true }).click();
  await expect(other.getByRole('status')).toContainText('đăng ký với FG');
  await other.reload(); await expect(other.getByRole('heading', { name: 'Mở khóa thiết bị' })).toBeVisible();
  await enter(other, 'A'.repeat(43)); await other.getByRole('button', { name: 'Mở khóa thiết bị', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('Không mở được thiết bị');
  await enter(other, code); await other.getByRole('button', { name: 'Mở khóa thiết bị', exact: true }).click();
  await expect(other.getByRole('status')).toContainText('đăng ký với FG');
  assert.deepEqual((await pool.query('SELECT device_id FROM chat_crypto_devices WHERE user_id=$1', [users[0]])).rows, original);
  await other.getByRole('button', { name: 'Khóa thiết bị' }).click();
  const missingOrigin = await context.request.delete(`${origin}/api/v1/crypto/devices/${deviceId}`); assert.equal(missingOrigin.status(), 403);
  const revoked = await context.request.delete(`${origin}/api/v1/crypto/devices/${deviceId}`, { headers: { Origin: origin } }); assert.equal(revoked.status(), 200);
  await enter(other, code); await other.getByRole('button', { name: 'Mở khóa thiết bị', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('thu hồi');
  await login(users[1]); await other.reload();
  await expect(other.getByRole('button', { name: 'Tạo mã khôi phục' })).toBeVisible();
  await other.getByRole('button', { name: 'Tạo mã khôi phục' }).click();
  code = await other.getByLabel('Mã khôi phục', { exact: true }).inputValue();
  await other.getByRole('checkbox', { name: 'Tôi đã lưu mã ở nơi an toàn' }).check();
  await other.getByRole('button', { name: 'Mở khóa thiết bị', exact: true }).click();
  await expect(other.getByRole('status')).toContainText('đăng ký với FG');
  const bob = (await pool.query('SELECT device_id FROM chat_crypto_devices WHERE user_id=$1', [users[1]])).rows;
  assert.equal(bob.length, 1); assert.notEqual(bob[0].device_id, deviceId);
  await other.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(other.getByRole('heading', { name: 'Yêu cầu xác thực tài khoản' })).toBeVisible();
  assert.equal((await context.request.get(`${origin}/api/v1/me`)).status(), 401);
  code = ''; await context.close();
  for (const file of buildFiles) assert.equal(hash(file), buildHashes[path.relative(process.cwd(), file).replaceAll('\\', '/')]);
  fs.writeFileSync(`quality/evidence/CHATCRYPTO-FE/headed-device-proof-${owned}.json`, JSON.stringify({ recordedAt: new Date().toISOString(), headed: true, buildHashes, actualAuthAndDatabase: true, actualNativeBrowserStore: true, fixtureSchema: owned, mainMutation: false, fullChatUi: false }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ headed: true, productionBuiltFgApp: true, actualAuthAndDatabase: true, actualBrowserWasmIndexedDB: true, wrongCodeAndReloadStableIdentity: true, webLocksMultiTab: true, revokedDeviceDenied: true, accountStoreSeparation: true, actualLogout: true, darkLightAnd360px: true, controls44px: true, mainMutation: false, fullPrivateChatUi: false }));
} finally {
  await browser?.close(); await app?.close(); await new Promise(resolve => front.close(resolve));
  try {
    assert.match(owned, /^crypto_fe_[a-f0-9]{32}$/); await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
    assert.equal((await pool.query("SELECT to_regclass('public.chat_crypto_state') AS value")).rows[0].value, null);
    if (fs.existsSync(storage)) { assert.equal(fs.realpathSync(storage), path.join(fs.realpathSync(parent), owned)); fs.rmSync(storage, { recursive: true }); }
  } finally { await pool.end(); process.env = saved; }
}
