import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { createNativeHarness } from './native-harness.mjs';
const h = await createNativeHarness();
try {
  for (let i = 0; i < 60; i++) {
    const suffix = String(i).padStart(2, '0'), id = `native-request-${suffix}`;
    await h.pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())', [id, `Lời mời trang ${suffix}`, `${id}@example.test`]);
    await h.pool.query("INSERT INTO profiles(user_id,display_name,custom_status) VALUES($1,$2,'JUST_CHATTING')", [id, `Lời mời trang ${suffix}`]);
    await h.pool.query("INSERT INTO friend_requests(id,sender_id,receiver_id,status,created_at,updated_at) VALUES($1,$2,'native-a','PENDING',now()-($3::int*interval '1 second'),now())", [`request-pagination-${suffix}`, id, i]);
  }
  const a = await h.context('native-a');
  const response = await a.request.get(`${h.base}/api/v1/friends/requests?direction=INCOMING`);
  assert.equal(response.status(), 200);
  const first = await response.json();
  assert.equal(first.items.length, 50); assert.equal(first.hasMore, true); assert(first.nextCursor);
  const p = await a.newPage(), requests = [];
  p.on('request', r => { const u = new URL(r.url()); if (u.pathname === '/api/v1/friends/requests' && r.method() === 'GET') requests.push({ direction: u.searchParams.get('direction'), cursor: u.searchParams.has('cursor') }); });
  await p.goto(h.base);
  await p.getByRole('button', { name: 'Bạn bè', exact: true }).click();
  const dialog = p.getByTestId('friends-modal');
  await dialog.getByRole('tab', { name: /Lời mời/ }).click();
  const rows = dialog.getByText(/^Lời mời trang [0-9]{2}$/);
  await expect.poll(() => rows.count(), { timeout: 15000 }).toBeGreaterThanOrEqual(50);
  if (await rows.count() < 60) await dialog.getByRole('button', { name: 'Tải thêm', exact: true }).click();
  await expect(rows).toHaveCount(60, { timeout: 15000 });
  assert.equal(new Set(await rows.allTextContents()).size, 60);
  assert(requests.some(r => r.direction === 'INCOMING' && r.cursor));
  await dialog.getByRole('button', { name: 'Đã gửi', exact: true }).click();
  await expect(rows).toHaveCount(0);
  await expect(dialog.getByText('Chưa có lời mời nào.')).toBeVisible();
  assert.equal((await h.pool.query("SELECT count(*)::int AS count FROM friend_requests WHERE status='PENDING'")).rows[0].count, 60);
  console.log(JSON.stringify({ realPostgres: true, realCompiledApi: true, realBuiltWeb: true, checks: ['60 unique incoming requests with real cursor; outgoing direction contains no incoming rows; read-only SQL unchanged'], requests }));
} finally { await h.cleanup(); console.log('Owned request pagination fixture cleaned.'); }
