import {setupReportCustody} from './report-custody-fixture.mjs';
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
let app, browser, apiBase, custody;
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
  custody = await setupReportCustody();
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
  const {hashFgPassword}=await import('../../../apps/api/dist/modules/auth/auth-password.js');
  const fixturePasswordHash=await hashFgPassword('A!'+randomBytes(24).toString('hex'));
  await pool.query('UPDATE "user" SET name=$2 WHERE id=$1',[users[0],'kingame']);
  await pool.query('INSERT INTO "account"(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES($1,$2,$3,$2,$4,now(),now())',[randomUUID(),users[0],'credential',fixturePasswordHash]);
  const games = await tables.seedGames(drizzle(pool, { schema: tables }));
  for (const [index, user] of users.entries()) {
    await pool.query('INSERT INTO profiles(user_id,display_name,bio) VALUES($1,$2,$3)', [user, index ? 'Native Bob' : 'Native Alice', 'Owned headed crypto fixture']);
    await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)', [randomUUID(), user, games[0].id]);
  }
  await pool.query("INSERT INTO conversations(id,kind,user1_id,user2_id) VALUES('headed-dm','DM',$1,$2)", users);
  await pool.query("INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES('headed-dm','E2EE','RECONCILED','KNOWN')");
  for (const user of users) await pool.query("INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES($1,'headed-dm',$2,1,now())", [randomUUID(), user]);
  Object.assign(process.env, { ...env, ...custody.env, ADMIN_USER_IDS: users[0], DATABASE_URL: url.href, PUBLIC_ORIGIN: origin, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: secret,
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
    await page.getByRole('checkbox', { name: 'Tôi đã lưu mã ở nơi an toàn' }).check();
    await page.getByRole('button', { name: 'Mở khóa thiết bị', exact: true }).click();
    await expect(page.getByText('Thiết bị đã mở khóa và đăng ký với FG.', { exact: true })).toBeVisible({ timeout: 30000 });
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

  async function send(page,text) {
    await page.bringToFront(); await page.getByLabel('Tin nhắn riêng mã hóa',{exact:true}).fill(text);
    await page.getByRole('button',{name:'Gửi mã hóa',exact:true}).click();
    await expect(page.getByLabel('Tin nhắn riêng mã hóa',{exact:true})).toHaveValue('');
  }
  await send(a,privateBody);
  await b.bringToFront();await expect(b.getByText(privateBody,{exact:true})).toBeVisible();
  await b.getByRole('button',{name:'Trả lời Native Alice',exact:true}).click();
  const selectedText='Native selected report text',imageText='Native selected report image';
  await send(b,selectedText);
  await a.bringToFront();await expect(a.getByText(selectedText,{exact:true})).toBeVisible();
  const sharp=(await import('sharp')).default;
  const png=await sharp({create:{width:24,height:18,channels:4,background:{r:10,g:100,b:180,alpha:1}}}).png().toBuffer();
  await a.locator('input[type=file]').setInputFiles({name:'native-report.png',mimeType:'image/png',buffer:png});
  await expect(a.getByText('Ảnh 1 · 24 × 18 · đã mã hóa trên thiết bị',{exact:true})).toBeVisible();
  await send(a,imageText);await b.bringToFront();await expect(b.getByText(imageText,{exact:true})).toBeVisible();
  const imageArticle=b.locator('article[data-message-id]').filter({has:b.getByText(imageText,{exact:true})});
  await expect(imageArticle.locator('img')).toBeVisible();
  const reportRequests=[];
  b.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/api/v1/crypto/reports'))reportRequests.push(request);});
  const textArticle=b.locator('article[data-message-id]').filter({has:b.getByText(selectedText,{exact:true})});
  const textId=await textArticle.getAttribute('data-message-id'),imageId=await imageArticle.getAttribute('data-message-id');
  await textArticle.getByRole('checkbox',{name:'Chọn tin để báo cáo',exact:true}).check();
  await imageArticle.getByRole('checkbox',{name:'Chọn tin để báo cáo',exact:true}).check();
  await b.getByRole('button',{name:'Xem trước báo cáo (2)',exact:true}).click();
  const preview=b.getByRole('region',{name:'Xem trước bằng chứng báo cáo',exact:true});
  await expect(preview.getByText(selectedText,{exact:true})).toBeVisible();
  await expect(preview.getByText(imageText,{exact:true})).toBeVisible();
  await expect(preview.getByText(privateBody,{exact:true})).not.toBeVisible();
  await preview.getByLabel('Lý do báo cáo',{exact:true}).fill('Native report selected-only consent fixture');
  await preview.getByRole('checkbox',{name:'Gửi ảnh 1 của tin này',exact:true}).check();
  await expect(preview.getByRole('img',{name:'Ảnh 1 được chọn làm bằng chứng',exact:true})).toBeVisible();
  const submit=preview.getByRole('button',{name:'Gửi bằng chứng cho admin',exact:true});
  await expect(submit).toBeDisabled();
  assert.equal(reportRequests.length,0);
  assert.equal((await pool.query('SELECT count(*) FROM chat_crypto_report_evidence')).rows[0].count,'0');
  await b.setViewportSize({width:360,height:900});await preview.scrollIntoViewIfNeeded();
  assert(await b.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
  await b.screenshot({path:'quality/evidence/CHATCRYPTO-FE/report-preview-360-'+owned+'.png'});
  // Cancel removes preview local plaintext and URLs; no disclosure request.
  await preview.getByRole('button',{name:'Đóng xem trước',exact:true}).click();await expect(preview).not.toBeVisible();assert.equal(reportRequests.length,0);
  await textArticle.getByRole('checkbox',{name:'Chọn tin để báo cáo',exact:true}).check();await imageArticle.getByRole('checkbox',{name:'Chọn tin để báo cáo',exact:true}).check();
  await b.getByRole('button',{name:'Xem trước báo cáo (2)',exact:true}).click();
  await preview.getByLabel('Lý do báo cáo',{exact:true}).fill('Native report selected-only consent fixture');
  await preview.getByRole('checkbox',{name:'Gửi ảnh 1 của tin này',exact:true}).check();await expect(preview.getByRole('img')).toBeVisible();
  await preview.getByRole('checkbox',{name:'Tôi đồng ý gửi đúng nội dung và ảnh đã chọn cho admin',exact:true}).check();
  const receiptPromise=b.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/crypto/reports'&&response.request().method()==='POST');
  await submit.click();const receiptResponse=await receiptPromise;assert.equal(receiptResponse.status(),201);const receipt=await receiptResponse.json();
  await expect(preview.getByText('FG đã nhận báo cáo của bạn.',{exact:true})).toBeVisible();
  assert.equal(reportRequests.length,2); // one selected image and one text evidence transaction
  const reportPayload=reportRequests.find(r=>new URL(r.url()).pathname==='/api/v1/crypto/reports').postDataJSON();
  assert.deepEqual(reportPayload.selectedMessages.map(m=>m.messageId).sort(),[textId,imageId].sort());
  assert.equal(JSON.stringify(reportPayload).includes(privateBody),false);
  assert(reportPayload.selectedMessages.every(m=>m.source==='USER_DISCLOSED'));
  async function read(page){return page.evaluate(async id=>{const r=await fetch('/api/v1/crypto/reports/'+id+'/read',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});return {status:r.status,body:await r.json()};},receipt.id);}
  const auditBefore=(await pool.query('SELECT count(*) FROM chat_crypto_report_audit')).rows[0].count;
  assert.equal((await read(b)).status,403);assert.equal((await pool.query('SELECT count(*) FROM chat_crypto_report_audit')).rows[0].count,auditBefore);
  const adminRead=await read(a);assert.equal(adminRead.status,201);assert.equal(adminRead.body.selectedMessages.length,2);
  assert.deepEqual(adminRead.body.selectedMessages.map(m=>m.text).sort(),[selectedText,imageText].sort());
  assert(adminRead.body.selectedMessages.every(m=>m.authenticity==='USER_SUPPLIED_UNVERIFIED'));
  const evidence=(await pool.query('SELECT envelope,source,consented_at FROM chat_crypto_report_evidence WHERE report_id=$1',[receipt.id])).rows;
  assert.equal(evidence.length,2);assert(evidence.every(row=>row.source==='USER_DISCLOSED'&&row.consented_at));
  assert(!JSON.stringify(evidence).includes(selectedText));assert(!JSON.stringify(evidence).includes(imageText));
  const imageReceiptId=adminRead.body.selectedMessages.find(m=>m.messageId===imageId).reportAttachmentIds[0];
  const binary=await a.evaluate(async ({reportId,imageId})=>{const r=await fetch('/api/v1/crypto/reports/'+reportId+'/attachments/'+imageId);return {status:r.status,bytes:[...new Uint8Array(await r.arrayBuffer())]};},{reportId:receipt.id,imageId:imageReceiptId});
  assert.equal(binary.status,200);const dimensions=await sharp(Buffer.from(binary.bytes)).metadata();assert.equal(dimensions.width,24);assert.equal(dimensions.height,18);
  const auditSha256=custody.assertAuditNoPlaintext([selectedText,imageText,privateBody]);
  assert.deepEqual(legacy,[]);for(const file of buildFiles)assert.equal(hash(file),buildHashes[path.relative(process.cwd(),file).replaceAll('\\','/')]);
  fs.writeFileSync('quality/evidence/CHATCRYPTO-FE/headed-report-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),headed:true,buildHashes,realNativeSelectedImage:true,noPreConsentDisclosure:true,cancelNoDisclosure:true,selectedOnlyTextAndImage:true,quotedUnselectedMessageExcluded:true,actualTlsTransitCustody:true,nonAdmin403:true,adminSelectedReadAudit:true,databaseNoPlaintext:true,auditSha256,mobile360:true,mainMutation:false},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({headed:true,noPreConsentDisclosure:true,cancelNoDisclosure:true,actualTlsTransitCustody:true,selectedOnlyTextAndImage:true,nonAdmin403:true,adminSelectedReadAudit:true,nativeImageDisclosure:true,mobile360:true,mainMutation:false}));
  await contextB.close();await context.close();
} finally {
  await browser?.close(); await app?.close(); await new Promise(resolve => front.close(resolve));
  try {
    assert.match(owned, /^crypto_fe_[a-f0-9]{32}$/); await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
    assert.equal((await pool.query("SELECT to_regclass('public.chat_crypto_state') AS value")).rows[0].value, null);
    if (fs.existsSync(storage)) { assert.equal(fs.realpathSync(storage), path.join(fs.realpathSync(parent), owned)); fs.rmSync(storage, { recursive: true }); }
  } finally { await pool.end(); process.env = saved; await custody?.close(); }
}
