import {setupLegacyArchiveCustody} from './legacy-archive-custody-fixture.mjs';
import {createLegacySourceArchive,restoreLegacySourceArchive} from './legacy-source-archive.mjs';
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
const restored='crypto_fe_'+randomUUID().replaceAll('-','');
let app, browser, apiBase, archiveCustody, reportCustody;
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
  reportCustody=await setupReportCustody();
  Object.assign(process.env, { ...env, ...reportCustody.env, ADMIN_USER_IDS:'', FG_LEGACY_SOURCE_CLEANUP:'enabled', DATABASE_URL: url.href, PUBLIC_ORIGIN: origin, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: secret,
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
  a.on('response', response => { const pathname=new URL(response.url()).pathname; if(pathname.includes('/crypto/')&&response.status()>=400)console.log(JSON.stringify({actualFailurePath:pathname,actualStatus:response.status(),method:response.request().method()})); });
  const { canonicalSignedPayload } = await import('../../../apps/api/dist/modules/chat-crypto/matrix-signatures.js');
  const cohortId='headed-legacy', messageId='headed-legacy-old', imageId=randomUUID();
  const sharp=(await import('sharp')).default;
  const originalImage=new Uint8Array(await sharp({create:{width:24,height:18,channels:3,background:{r:21,g:140,b:70}}}).webp().toBuffer());
  fs.mkdirSync(path.join(storage,'legacy'),{recursive:true});fs.writeFileSync(path.join(storage,'legacy',imageId+'.webp'),originalImage);
  const oldBody='Actual headed historical source from Native Bob';
  const oldSource={version:1,conversationId:'headed-dm',messageId,senderId:users[1],clientMessageId:'old-client',type:'IMAGE',content:oldBody,replyToId:null,mentionedUserIds:[],createdAt:'2026-09-01T00:00:00.000000Z',updatedAt:'2026-09-01T00:00:00.000000Z',attachments:[{id:imageId,fileName:'original.webp',fileSize:originalImage.length,mimeType:'image/webp',plaintextSha256:createHash('sha256').update(originalImage).digest('base64').replace(/=+$/,'')}]};
  await pool.query("UPDATE chat_crypto_state SET migration_state='LEGACY_PENDING' WHERE conversation_id='headed-dm'");
  await pool.query("INSERT INTO chat_crypto_history_cohorts(id,conversation_id,verified_at,verification_basis) VALUES($1,'headed-dm',clock_timestamp(),'EXPLICIT_RECONCILIATION')",[cohortId]);
  for(const user of users)await pool.query("INSERT INTO chat_crypto_cohort_members(cohort_id,conversation_id,user_id) VALUES($1,'headed-dm',$2)",[cohortId,user]);
  await pool.query("INSERT INTO messages(id,conversation_id,sender_id,type,content,client_message_id,created_at,updated_at,encryption_mode) VALUES($1,'headed-dm',$2,'IMAGE',$3,'old-client',$4,$4,'LEGACY_PENDING')",[messageId,users[1],oldBody,oldSource.createdAt]);
  await pool.query("INSERT INTO attachments(id,message_id,conversation_id,url,file_name,file_size,mime_type,encryption_mode) VALUES($1,$2,'headed-dm',$3,'original.webp',$4,'image/webp','LEGACY_PENDING')",[imageId,messageId,'/api/v1/attachments/'+imageId+'/content',originalImage.length]);
  await pool.query("INSERT INTO chat_crypto_legacy_migrations(message_id,conversation_id,cohort_id,original_sha256,state) VALUES($1,'headed-dm',$2,$3,'PREPARED')",[messageId,cohortId,createHash('sha256').update(canonicalSignedPayload(oldSource)).digest('base64').replace(/=+$/,'')]);
  await chat(a,users[1]);await chat(b,users[0]);
  const panel=page=>page.getByRole('region',{name:'Đối soát lịch sử cũ',exact:true});
  for(const page of [a,b]){
    await page.bringToFront();await expect(panel(page)).toBeVisible();
    await panel(page).getByRole('button',{name:'Chọn cohort '+cohortId+' · 1 tin chờ đối soát',exact:true}).click();
  }
  await a.bringToFront();
  await panel(a).getByRole('button',{name:'Đọc nguồn được phép đối soát',exact:true}).click();
  await expect(panel(a).getByText(oldBody,{exact:true})).toBeVisible();
  await a.getByLabel('Tin nhắn riêng mã hóa',{exact:true}).fill('Draft kept through legacy verification');
  await expect(a.getByRole('button',{name:'Gửi mã hóa',exact:true})).toBeDisabled();
  await panel(a).getByRole('button',{name:'Chuẩn bị bản nhập mã hóa',exact:true}).click();
  await expect(panel(a).getByRole('alert')).toContainText('Chưa hoàn tất bước đối soát');
  await expect(panel(a).getByRole('alert')).toContainText('Cần xác minh tất cả thiết bị có quyền lịch sử trước khi chuẩn bị.');
  assert.equal(Number((await pool.query('SELECT count(*) FROM chat_crypto_legacy_candidates')).rows[0].count),0);
  await panel(a).getByRole('button',{name:'Xác minh lịch sử Native Bob',exact:true}).click();
  await b.bringToFront();await panel(b).getByRole('button',{name:'Chấp nhận xác minh',exact:true}).click();
  await a.bringToFront();await panel(a).getByRole('button',{name:'Bắt đầu so sánh số',exact:true}).click();
  await b.bringToFront();await panel(b).getByRole('button',{name:'Mở mã so sánh',exact:true}).click();
  for(const page of [a,b]){await page.bringToFront();await expect(panel(page).getByRole('button',{name:'Các số khớp',exact:true})).toBeVisible();}
  assert.equal(await panel(a).getByLabel('Ba dãy số xác minh').innerText(),await panel(b).getByLabel('Ba dãy số xác minh').innerText());
  await a.bringToFront();await panel(a).getByRole('button',{name:'Các số khớp',exact:true}).click();
  await expect(panel(a).getByText('Đã xác minh bằng SAS trên cả hai thiết bị.',{exact:true})).toHaveCount(0);
  await b.bringToFront();await panel(b).getByRole('button',{name:'Các số khớp',exact:true}).click();
  for(const page of [a,b]){await page.bringToFront();await expect(panel(page).getByText('Đã xác minh bằng SAS trên cả hai thiết bị.',{exact:true})).toBeVisible();}
  await a.bringToFront();await panel(a).getByRole('button',{name:'Chuẩn bị bản nhập mã hóa',exact:true}).click();
  await expect(panel(a).getByText('Đã chuẩn bị và chứng thực trên thiết bị này. Cần các thiết bị thuộc cohort đối soát độc lập và bước kiểm tra server.',{exact:true})).toBeVisible();
  const candidateId=await panel(a).locator('[data-legacy-candidate-id]').getAttribute('data-legacy-candidate-id');assert(candidateId);
  await b.bringToFront();
  await expect.poll(async()=>Number((await pool.query("SELECT count(*) FROM chat_crypto_to_device_events WHERE recipient_user_id=$1 AND conversation_id='headed-dm' AND cohort_id=$2 AND acknowledged_at IS NOT NULL",[users[1],cohortId])).rows[0].count)).toBeGreaterThan(0);
  await panel(b).getByLabel('Mã bản nhập cần đối soát',{exact:true}).fill(candidateId);
  await panel(b).getByRole('button',{name:'Giải mã lại và chứng thực',exact:true}).click();
  await expect(panel(b).getByText('Thiết bị này đã giải mã lại, kiểm tra nguồn/ảnh và gửi chứng thực. Server chưa được coi là hoàn tất migration từ bước này.',{exact:true})).toBeVisible();
  assert.equal(Number((await pool.query('SELECT count(*) FROM chat_crypto_legacy_attestations')).rows[0].count),2);
  const actualCandidate=(await pool.query('SELECT envelope FROM chat_crypto_legacy_candidates WHERE id=$1',[candidateId])).rows[0];assert.equal(JSON.stringify(actualCandidate).includes(oldBody),false);
  const retained=(await pool.query('SELECT content,encryption_mode FROM messages WHERE id=$1',[messageId])).rows[0];assert.equal(retained.content,oldBody);assert.equal(retained.encryption_mode,'LEGACY_PENDING');
  assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(storage,'legacy',imageId+'.webp'))),originalImage);
  await a.bringToFront();await expect(a.getByLabel('Tin nhắn riêng mã hóa',{exact:true})).toHaveValue('Draft kept through legacy verification');
  await a.setViewportSize({width:360,height:900});assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  await a.screenshot({path:'quality/evidence/CHATCRYPTO-FE/legacy-prepare-360-'+owned+'.png'});

  archiveCustody=await setupLegacyArchiveCustody();
  const backup=await createLegacySourceArchive(owned,archiveCustody.env);
  const restoredObjects=await restoreLegacySourceArchive(backup.archive,restored,archiveCustody.env,pool);assert.deepEqual(restoredObjects,backup.proof.objects);
  assert.equal((await pool.query('SELECT content FROM "'+restored+'".messages WHERE id=$1',[messageId])).rows[0].content,oldBody);
  assert.deepEqual(fs.readFileSync(path.join(parent,restored,'legacy',imageId+'.webp')),Buffer.from(originalImage));
  const {CryptoLegacyService}=await import('../../../apps/api/dist/modules/chat-crypto/crypto-legacy.service.js');
  const actor={userId:users[0],sessionId:owned+'-'+users[0]},current=(await pool.query("SELECT membership_revision FROM chat_crypto_state WHERE conversation_id='headed-dm'")).rows[0],deviceId=(await pool.query('SELECT device_id FROM chat_crypto_devices WHERE user_id=$1 AND revoked_at IS NULL',[users[0]])).rows[0].device_id;
  const request={deviceId,membershipRevision:Number(current.membership_revision),cohortId,expectedSourceCount:1},service=app.get(CryptoLegacyService);
  await service.reviewReconciliation(actor,'headed-dm',request);await service.stageReconciliation(actor,'headed-dm',request);await service.convertStagedReconciliation(actor,'headed-dm',request);
  assert.equal((await pool.query("SELECT migration_state FROM chat_crypto_state WHERE conversation_id='headed-dm'")).rows[0].migration_state,'MIGRATING');
  await service.cleanupStagedReconciliation(actor,'headed-dm',request);assert.equal(fs.existsSync(path.join(storage,'legacy',imageId+'.webp')),false);
  const oldClaim='Lịch sử cũ đã nhập và kiểm tra nguồn · tên tác giả gốc là thông tin lưu trước mã hóa, không phải xác minh SAS của tác giả.';
  for(const page of [a,b]){
    await page.bringToFront();const article=page.locator('[data-message-id="'+messageId+'"]');
    await expect(article.getByText(oldBody,{exact:true})).toBeVisible();await expect(article.getByText(oldClaim,{exact:true})).toBeVisible();
    await expect(article.locator('strong')).toHaveText('Native Bob');await expect(article.locator('time')).toHaveAttribute('datetime',oldSource.createdAt);
    const image=article.getByRole('img',{name:'Ảnh lịch sử cũ đã giải mã và kiểm tra nguồn trên thiết bị',exact:true});await expect(image).toBeVisible();
    assert.deepEqual(await image.evaluate(el=>({width:el.naturalWidth,height:el.naturalHeight,blob:el.src.startsWith('blob:')})),{width:24,height:18,blob:true});
    await expect(panel(page)).toHaveCount(0);
  }
  await a.bringToFront();await expect(a.getByLabel('Tin nhắn riêng mã hóa',{exact:true})).toHaveValue('Draft kept through legacy verification');
  await expect(a.getByRole('button',{name:'Gửi mã hóa',exact:true})).toBeEnabled();
  await a.screenshot({path:'quality/evidence/CHATCRYPTO-FE/legacy-read-360-'+owned+'.png'});
  await b.bringToFront();const article=b.locator('[data-message-id="'+messageId+'"]'),reports=[];
  b.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/api/v1/crypto/reports'))reports.push(request);});
  await article.getByRole('checkbox',{name:'Chọn tin để báo cáo',exact:true}).check();await b.getByRole('button',{name:'Xem trước báo cáo (1)',exact:true}).click();
  const preview=b.getByRole('region',{name:'Xem trước bằng chứng báo cáo',exact:true});
  await expect(preview.getByText(oldBody,{exact:true})).toBeVisible();await expect(preview.getByText('Nguồn lịch sử cũ; tác giả gốc chưa được xác thực bằng mã hóa. Ảnh JPG/PNG được chuyển WebP ngay trong bản xem trước này.',{exact:true})).toBeVisible();
  await preview.getByLabel('Lý do báo cáo',{exact:true}).fill('Owned legacy evidence consent fixture');await preview.getByRole('checkbox',{name:'Gửi ảnh 1 của tin này',exact:true}).check();await expect(preview.getByRole('img')).toBeVisible();
  const submit=preview.getByRole('button',{name:'Gửi bằng chứng cho admin',exact:true});await expect(submit).toBeDisabled();assert.equal(reports.length,0);
  await preview.getByRole('button',{name:'Đóng xem trước',exact:true}).click();assert.equal(reports.length,0);
  await article.getByRole('checkbox',{name:'Chọn tin để báo cáo',exact:true}).check();await b.getByRole('button',{name:'Xem trước báo cáo (1)',exact:true}).click();
  await preview.getByLabel('Lý do báo cáo',{exact:true}).fill('Owned legacy evidence consent fixture');await preview.getByRole('checkbox',{name:'Gửi ảnh 1 của tin này',exact:true}).check();await expect(preview.getByRole('img')).toBeVisible();
  await preview.getByRole('checkbox',{name:'Tôi đồng ý gửi đúng nội dung và ảnh đã chọn cho admin',exact:true}).check();
  const receiptPromise=b.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/crypto/reports'&&response.request().method()==='POST');await submit.click();const response=await receiptPromise;assert.equal(response.status(),201);const receipt=await response.json();await expect(preview.getByText('FG đã nhận báo cáo của bạn.',{exact:true})).toBeVisible();
  assert.equal(reports.length,2);const payload=reports.find(request=>new URL(request.url()).pathname==='/api/v1/crypto/reports').postDataJSON();assert.equal(payload.selectedMessages.length,1);assert.equal(payload.selectedMessages[0].messageId,messageId);assert.equal(payload.selectedMessages[0].source,'USER_DISCLOSED');assert.equal(JSON.stringify(payload).includes('Draft kept through legacy verification'),false);
  const stored=(await pool.query('SELECT envelope,source,consented_at FROM chat_crypto_report_evidence WHERE report_id=$1',[receipt.id])).rows;assert.equal(stored.length,1);assert.equal(stored[0].source,'USER_DISCLOSED');assert(stored[0].consented_at);assert.equal(JSON.stringify(stored).includes(oldBody),false);
  const denied=await b.evaluate(async id=>(await fetch('/api/v1/crypto/reports/'+id+'/read',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'})).status,receipt.id);assert.equal(denied,403);
  const reportAuditSha256=reportCustody.assertAuditNoPlaintext([oldBody]),archiveAuditSha256=archiveCustody.assertAuditNoPlaintext([oldBody]);
  // Backup through actual UI; a new browser/device must not inherit old trust.
  await a.evaluate(() => { history.pushState(null, '', '/crypto'); dispatchEvent(new PopStateEvent('popstate')); });
  await a.getByRole('button', { name: 'Tạo mã riêng cho bản khôi phục', exact: true }).click();
  const backupCode = await a.getByLabel('Mã riêng cho bản khôi phục', { exact: true }).inputValue();
  await a.getByRole('checkbox', { name: 'Tôi đã lưu mã bản khôi phục ở nơi an toàn' }).check();
  await a.getByRole('button', { name: 'Mã hóa và lưu bản khôi phục', exact: true }).click();
  await expect(a.getByText('Bản khôi phục khóa đã được mã hóa và lưu. Chỉ mã riêng của bạn mở được bản này.', { exact: true })).toBeVisible({ timeout: 30000 });
  const backupRows = (await pool.query('SELECT ciphertext FROM chat_crypto_recovery_backups WHERE user_id=$1', [users[0]])).rows;
  assert.equal(backupRows.length, 1); assert.equal(backupRows[0].ciphertext.includes(backupCode), false); assert.equal(backupRows[0].ciphertext.includes(oldBody), false);
  const contextC = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tokenC = owned + '-' + users[0], signatureC = await makeSignature(tokenC, secret);
  await contextC.addCookies([{ name: 'better-auth.session_token', value: tokenC + '.' + signatureC, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  const c = await contextC.newPage(); const cDeviceCode = await unlock(c); await chat(c, users[1]);
  await expect(c.getByText(oldBody, { exact: true })).not.toBeVisible();
  const restoreScreen = async () => { await c.bringToFront(); await c.evaluate(() => { history.pushState(null, '', '/crypto'); dispatchEvent(new PopStateEvent('popstate')); }); await c.getByRole('button', { name: 'Nhập bản khôi phục', exact: true }).click(); };
  await restoreScreen();
  await c.getByLabel('Mã riêng cho bản khôi phục', { exact: true }).fill('ResetPassword!123');
  await expect(c.getByRole('button', { name: 'Khôi phục khóa lịch sử', exact: true })).toBeDisabled();
  await c.getByLabel('Mã riêng cho bản khôi phục', { exact: true }).fill(randomBytes(32).toString('base64url'));
  await c.getByRole('button', { name: 'Khôi phục khóa lịch sử', exact: true }).click();
  await expect(c.getByRole('alert')).toContainText('Không khôi phục được. Kiểm tra mã riêng');
  await chat(c, users[1]); await expect(c.getByText(oldBody, { exact: true })).not.toBeVisible();
  await restoreScreen(); await c.getByLabel('Mã riêng cho bản khôi phục', { exact: true }).fill(backupCode);
  await c.getByRole('button', { name: 'Khôi phục khóa lịch sử', exact: true }).click();
  await expect(c.getByText(/Đã kiểm tra \d+ khóa lịch sử, nhập thêm \d+/)).toBeVisible({ timeout: 30000 });
  await chat(c, users[1]);
  await expect(c.getByText(oldBody, { exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect(c.getByText('Lịch sử từ bản khôi phục · thiết bị gửi chưa được xác minh hiện tại.', { exact: true }).first()).toBeVisible();
  await expect(c.getByRole('button', { name: 'Xác minh Native Bob', exact: true })).toBeVisible();
  await expect(c.getByText('Đã xác minh bằng SAS trên cả hai thiết bị.', { exact: true })).not.toBeVisible();
  await c.screenshot({ path: 'quality/evidence/CHATCRYPTO-FE/legacy-recovered-history-' + owned + '.png' });

  const cRow=c.locator('[data-message-id="'+messageId+'"]');await expect(cRow.getByText(oldClaim,{exact:true})).toBeVisible();await expect(cRow.getByRole('img',{name:'Ảnh lịch sử cũ đã giải mã và kiểm tra nguồn trên thiết bị',exact:true})).toBeVisible();
  const recoveredDevice=(await pool.query('SELECT device_id,ed25519_key,curve25519_key FROM chat_crypto_devices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[users[0]])).rows[0];assert.notEqual(recoveredDevice.device_id,deviceId);
  await c.bringToFront();await c.goto(origin+'/crypto');await expect(c.getByRole('heading',{name:'Mở khóa thiết bị',exact:true})).toBeVisible();await c.getByLabel('Mã khôi phục',{exact:true}).fill(cDeviceCode);await c.getByRole('button',{name:'Mở khóa thiết bị',exact:true}).click();await expect(c.getByText('Thiết bị đã mở khóa và đăng ký với FG.',{exact:true})).toBeVisible();
  await chat(c,users[1]);await expect(c.getByText(oldBody,{exact:true})).toBeVisible();await expect(c.getByText('Lịch sử từ bản khôi phục · thiết bị gửi chưa được xác minh hiện tại.',{exact:true})).toBeVisible();await expect(cRow.getByRole('img')).toBeVisible();
  const afterReload=(await pool.query('SELECT device_id,ed25519_key,curve25519_key FROM chat_crypto_devices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[users[0]])).rows[0];assert.deepEqual(afterReload,recoveredDevice);
  await expect(c.getByText('Đã xác minh bằng SAS trên cả hai thiết bị.',{exact:true})).toHaveCount(0);await expect(c.getByRole('button',{name:'Xác minh Native Bob',exact:true})).toBeVisible();
  const viewportProof=[];
  for(const [width,height] of [[1440,900],[1280,800],[390,844],[360,800]]){
    await c.setViewportSize({width,height});
    await expect(cRow.getByRole('img')).toBeVisible();
    await expect(c.getByText(oldBody,{exact:true})).toBeVisible();
    assert.equal(await c.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
    const shot='quality/evidence/CHATCRYPTO-FE/legacy-viewport-'+width+'x'+height+'-'+owned+'.png';
    await c.screenshot({path:shot});viewportProof.push({width,height,path:shot,sha256:hash(shot)});
  }
  fs.writeFileSync('quality/evidence/CHATCRYPTO-FE/legacy-viewport-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),headed:true,buildHashes,actualNativeRecoveredHistory:true,viewports:viewportProof,mainMutation:false},null,2)+String.fromCharCode(10),{flag:'wx'});
  await contextC.close();
  assert.deepEqual(legacy,[]);for(const file of buildFiles)assert.equal(hash(file),buildHashes[path.relative(process.cwd(),file).replaceAll(String.fromCharCode(92),'/')]);
  fs.writeFileSync('quality/evidence/CHATCRYPTO-FE/headed-report-proof-'+owned+'.json',JSON.stringify({recordedAt:new Date().toISOString(),headed:true,buildHashes,actualEncryptedSourceBackupRestore:true,actualIsolatedMigrationActivation:true,actualNativeLegacyReadAndImageBothDevices:true,originalAuthorshipExplicit:true,draftPreserved:true,mobile360:true,actualLegacyImageReportConsent:true,actualLegacyRecoveredDeviceHistory:true,wrongRecoveryCodeDenied:true,recoveredNativeStoreReload:true,newIdentityNoTrust:true,cancelNoDisclosure:true,selectedOnly:true,actualTlsTransitCustody:true,nonAdmin403:true,databaseNoPlaintext:true,reportAuditSha256,archiveAuditSha256,mainMutation:false},null,2)+String.fromCharCode(10),{flag:'wx'});
  console.log(JSON.stringify({headed:true,actualEncryptedSourceBackupRestore:true,actualIsolatedMigrationActivation:true,actualNativeLegacyReadAndImageBothDevices:true,actualLegacyImageReportConsent:true,actualLegacyRecoveredDeviceHistory:true,wrongRecoveryCodeDenied:true,recoveredNativeStoreReload:true,newIdentityNoTrust:true,originalAuthorshipExplicit:true,cancelNoDisclosure:true,selectedOnly:true,nonAdmin403:true,mobile360:true,mainMutation:false}));
  await contextB.close();await context.close();
} finally {
  await browser?.close(); await app?.close(); await new Promise(resolve => front.close(resolve));
  try {
    assert.match(restored,/^crypto_fe_[a-f0-9]{32}$/);await pool.query('DROP SCHEMA IF EXISTS "'+restored+'" CASCADE');const restoredRoot=path.join(parent,restored);if(fs.existsSync(restoredRoot)){assert.equal(fs.realpathSync(restoredRoot),path.join(fs.realpathSync(parent),restored));fs.rmSync(restoredRoot,{recursive:true});}
    assert.match(owned, /^crypto_fe_[a-f0-9]{32}$/); await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
    assert.equal((await pool.query("SELECT to_regclass('public.chat_crypto_state') AS value")).rows[0].value, null);
    if (fs.existsSync(storage)) { assert.equal(fs.realpathSync(storage), path.join(fs.realpathSync(parent), owned)); fs.rmSync(storage, { recursive: true }); }
  } finally { await pool.end(); process.env = saved; await archiveCustody?.close();await reportCustody?.close(); }
}
