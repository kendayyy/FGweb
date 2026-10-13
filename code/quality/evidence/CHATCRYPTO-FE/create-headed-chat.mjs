import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir = 'quality/evidence/CHATCRYPTO-FE';
const source = fs.readFileSync(`${dir}/headed-device.mjs`, 'utf8');
const start = source.indexOf('  await login(users[0]);'), end = source.indexOf('} finally {', start);
assert(start > 0 && end > start);
let prefix = source.slice(0, start).replace("const users = ['browser-alice', 'browser-bob'];", "const users = [`${owned}-alice`, `${owned}-bob`];");
const seeded = `  const tables = await import('@fg/database');
  const games = await tables.seedGames(drizzle(pool, { schema: tables }));
  for (const [index, user] of users.entries()) {
    await pool.query('INSERT INTO profiles(user_id,display_name,bio) VALUES($1,$2,$3)', [user, index ? 'Native Bob' : 'Native Alice', 'Owned headed crypto fixture']);
    await pool.query('INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)', [randomUUID(), user, games[0].id]);
  }
  await pool.query("INSERT INTO conversations(id,kind,user1_id,user2_id) VALUES('headed-dm','DM',$1,$2)", users);
  await pool.query("INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES('headed-dm','E2EE','RECONCILED','KNOWN')");
  for (const user of users) await pool.query("INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES($1,'headed-dm',$2,1,now())", [randomUUID(), user]);
`;
prefix = prefix.replace('  Object.assign(process.env,', seeded + '  Object.assign(process.env,');
prefix = prefix.replace("const front = http.createServer((req, res) => {", "const front = http.createServer((req, res) => {");
const upgrade = `front.on('upgrade', (req, socket, head) => {
  if (!apiBase || !req.url?.startsWith('/socket.io')) { socket.destroy(); return; }
  const upstream = http.request(new URL(req.url, apiBase), { headers: { ...req.headers, host: new URL(apiBase).host } });
  upstream.on('upgrade', (response, peer, peerHead) => {
    socket.write('HTTP/1.1 101 Switching Protocols\\r\\n' + Object.entries(response.headers).map(([key,value]) => key + ': ' + value).join('\\r\\n') + '\\r\\n\\r\\n');
    if (head.length) peer.write(head); if (peerHead.length) socket.write(peerHead); socket.pipe(peer); peer.pipe(socket);
    socket.on('error', () => peer.destroy()); peer.on('error', () => socket.destroy());
  });
  upstream.on('error', () => socket.destroy()); upstream.end();
});
`;
prefix = prefix.replace('try {\n  await new Promise', upgrade + 'try {\n  await new Promise');
const body = `  const contextB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tokenB = owned + '-' + users[1], signatureB = await makeSignature(tokenB, secret);
  await contextB.addCookies([{ name: 'better-auth.session_token', value: tokenB + '.' + signatureB, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  await login(users[0]);
  const a = await context.newPage(), b = await contextB.newPage();
  const legacy = [], payloads = [], privateBody = 'FG native headed private message ' + owned;
  for (const page of [a,b]) page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (/^\\/api\\/v1\\/conversations\\/[^/]+\\/messages/.test(pathname)) legacy.push({ pathname, method: request.method() });
    if (request.method() === 'POST' && pathname === '/api/v1/crypto/conversations/headed-dm/messages') {
      const payload = request.postDataJSON(); assert.equal(JSON.stringify(payload).includes(privateBody), false); payloads.push(payload);
    }
  });
  async function unlock(page) {
    await page.goto(origin + '/crypto'); await expect(page.getByRole('button', { name: 'Tạo mã khôi phục' })).toBeVisible();
    await page.getByRole('button', { name: 'Tạo mã khôi phục' }).click();
    await page.getByRole('checkbox', { name: 'Tôi đã lưu mã ở nơi an toàn' }).check();
    await page.getByRole('button', { name: 'Mở khóa thiết bị', exact: true }).click();
    await expect(page.getByText('Thiết bị đã mở khóa và đăng ký với FG.', { exact: true })).toBeVisible({ timeout: 30000 });
  }
  await unlock(a); await unlock(b);
  async function chat(page, peer) {
    await page.goto(origin + '/users/' + encodeURIComponent(peer) + '/profile');
    await page.getByRole('button', { name: 'Nhắn tin', exact: true }).click();
    await expect(page.getByLabel('Tin nhắn riêng mã hóa', { exact: true })).toBeVisible();
    await page.getByText('Thiết bị người nhận và xác minh', { exact: true }).click();
  }
  await chat(a, users[1]); await chat(b, users[0]);
  await expect(a.getByRole('button', { name: 'Xác minh Native Bob', exact: true })).toBeVisible();
  await a.getByLabel('Tin nhắn riêng mã hóa', { exact: true }).fill(privateBody);
  await a.getByRole('button', { name: 'Gửi mã hóa', exact: true }).click();
  await expect(a.getByRole('alert')).toContainText('Cần thiết bị người nhận đã xác minh');
  assert.equal(await a.getByLabel('Tin nhắn riêng mã hóa', { exact: true }).inputValue(), privateBody);
  assert.equal(Number((await pool.query("SELECT count(*) FROM messages WHERE conversation_id='headed-dm'")).rows[0].count), 0);
  await a.getByRole('button', { name: 'Xác minh Native Bob', exact: true }).click();
  await expect(b.getByRole('button', { name: 'Chấp nhận xác minh', exact: true })).toBeVisible({ timeout: 15000 });
  await b.getByRole('button', { name: 'Chấp nhận xác minh', exact: true }).click();
  await expect(a.getByRole('button', { name: 'Bắt đầu so sánh số', exact: true })).toBeVisible({ timeout: 15000 });
  await a.getByRole('button', { name: 'Bắt đầu so sánh số', exact: true }).click();
  await expect(b.getByRole('button', { name: 'Mở mã so sánh', exact: true })).toBeVisible({ timeout: 15000 });
  await b.getByRole('button', { name: 'Mở mã so sánh', exact: true }).click();
  await expect(a.getByRole('button', { name: 'Các số khớp', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(b.getByRole('button', { name: 'Các số khớp', exact: true })).toBeVisible({ timeout: 15000 });
  const sasA = await a.getByLabel('Ba dãy số xác minh').innerText(), sasB = await b.getByLabel('Ba dãy số xác minh').innerText(); assert.equal(sasA, sasB);
  await a.getByRole('button', { name: 'Các số khớp', exact: true }).click();
  await expect(a.getByText('Đã xác minh bằng SAS trên cả hai thiết bị.', { exact: true })).not.toBeVisible();
  await b.getByRole('button', { name: 'Các số khớp', exact: true }).click();
  for (const page of [a,b]) await expect(page.getByText('Đã xác minh bằng SAS trên cả hai thiết bị.', { exact: true })).toBeVisible({ timeout: 15000 });
  // Commit actual encrypted write, then lose response at the browser boundary.
  let failed = false;
  await a.route('**/api/v1/crypto/conversations/headed-dm/messages', async route => {
    if (route.request().method() === 'POST' && !failed) {
      const response = await route.fetch(); assert.equal(response.status(), 201); failed = true; await route.abort('failed');
    } else await route.continue();
  });
  await a.getByRole('button', { name: 'Gửi mã hóa', exact: true }).click();
  await expect(a.getByRole('alert')).toContainText('Chưa xác nhận gửi thành công');
  assert.equal(await a.getByLabel('Tin nhắn riêng mã hóa', { exact: true }).inputValue(), privateBody);
  await a.getByRole('button', { name: 'Gửi mã hóa', exact: true }).click();
  await expect(a.getByLabel('Tin nhắn riêng mã hóa', { exact: true })).toHaveValue('');
  await expect(b.getByText(privateBody, { exact: true })).toBeVisible({ timeout: 15000 });
  assert.equal(payloads.length, 2); assert.equal(JSON.stringify(payloads[0]), JSON.stringify(payloads[1]));
  assert.equal(Number((await pool.query("SELECT count(*) FROM messages WHERE conversation_id='headed-dm'")).rows[0].count), 1);
  await b.getByRole('button', { name: 'Trả lời Native Alice', exact: true }).click();
  await b.getByLabel('Nhắc tên thành viên').selectOption(users[0]);
  await b.getByLabel('Tin nhắn riêng mã hóa', { exact: true }).fill('FG native reply fixture');
  await b.getByRole('button', { name: 'Gửi mã hóa', exact: true }).click();
  await expect(a.getByText('FG native reply fixture', { exact: true })).toBeVisible({ timeout: 15000 });
  const stored = (await pool.query("SELECT content,crypto_envelope FROM messages WHERE conversation_id='headed-dm'")).rows;
  assert.equal(stored.length, 2); for (const row of stored) { assert.equal(row.content, ''); assert.equal(JSON.stringify(row).includes(privateBody), false); assert.equal(JSON.stringify(row).includes('FG native reply fixture'), false); }
  assert.deepEqual(legacy, []);
  await b.setViewportSize({ width: 360, height: 900 });
  assert.equal(await b.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await b.screenshot({ path: 'quality/evidence/CHATCRYPTO-FE/private-dm-360-' + owned + '.png' });
  for (const file of buildFiles) assert.equal(hash(file), buildHashes[path.relative(process.cwd(), file).replaceAll('\\\\', '/')]);
  fs.writeFileSync('quality/evidence/CHATCRYPTO-FE/headed-chat-proof-' + owned + '.json', JSON.stringify({ recordedAt: new Date().toISOString(), headed: true, buildHashes, actualAuthAndDatabase: true, nativeSasOnBothBrowsers: true, ciphertextRetryAfterLostResponse: true, replyMentionEncrypted: true, noLegacyPrivateCalls: true, mainMutation: false, groupUi: false }, null, 2) + '\\n', { flag: 'wx' });
  console.log(JSON.stringify({ headed: true, actualFgNativePrivateDm: true, nativeBilateralSas: true, unverifiedSendBlockedAndDraftPreserved: true, exactCipherRetryAndDedup: true, nativeReplyMention: true, databaseNoPlaintext: true, noLegacyPrivateProducer: true, mobile360: true, mainMutation: false, groupUi: false }));
  await contextB.close(); await context.close();
`;
fs.writeFileSync(`${dir}/headed-private-chat.mjs`, prefix + body + source.slice(end), { flag: 'wx' });
console.log(JSON.stringify({ actualHeadedPrivateFixtureCreated: true, newTask: false, mockAuth: false, ownedSchemaOnly: true }));
