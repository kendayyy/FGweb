import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { createNativeHarness } from './native-harness.mjs';
const h = await createNativeHarness();
try {
  for (let i = 0; i < 60; i++) {
    const suffix = String(i).padStart(2, '0'), id = `native-dm-peer-${suffix}`, conv = `native-dm-${suffix}`;
    await h.pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())', [id, `Bạn DM ${suffix}`, `${id}@example.test`]);
    await h.pool.query("INSERT INTO profiles(user_id,display_name,custom_status) VALUES($1,$2,'JUST_CHATTING')", [id, `Bạn DM ${suffix}`]);
    await h.pool.query("INSERT INTO conversations(id,kind,user1_id,user2_id,created_at,updated_at) VALUES($1,'DM',LEAST($2::text,$3::text),GREATEST($2::text,$3::text),now()-($4::int*interval '1 second'),now()-($4::int*interval '1 second'))", [conv, 'native-a', id, i]);
    for (const member of ['native-a', id]) await h.pool.query('INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3)', [`member-${conv}-${member}`, conv, member]);
  }
  const a = await h.context('native-a'), response = await a.request.get(`${h.base}/api/v1/direct-conversations`);
  assert.equal(response.status(), 200);
  const first = await response.json(); assert.equal(first.items.length, 50); assert.equal(first.hasMore, true); assert(first.nextCursor);
  assert(!first.items.some(c => c.conversationId === 'native-dm-59'));
  const p = await a.newPage(), cursorRequests = [];
  p.on('request', r => { const u = new URL(r.url()); if (u.pathname === '/api/v1/direct-conversations' && r.method() === 'GET') cursorRequests.push(u.searchParams.has('cursor')); });
  await p.goto(`${h.base}/users/native-dm-peer-59/profile`);
  const opener = p.getByTestId('btn-open-dm'); await expect(opener).toBeEnabled({ timeout: 15000 }); await opener.click();
  const panel = p.getByTestId('direct-messages-panel'); await expect(panel).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Tin nhắn riêng', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(panel.getByText('Bạn DM 59', { exact: true }).first()).toBeVisible();
  assert(cursorRequests.includes(true), 'UI never followed real direct conversation cursor');
  assert.equal((await h.pool.query("SELECT count(*)::int AS count FROM conversations WHERE kind='DM'")).rows[0].count, 60);
  assert.equal((await h.pool.query('SELECT count(*)::int AS count FROM friendships')).rows[0].count, 0);
  console.log(JSON.stringify({ realPostgres: true, realCompiledApi: true, realBuiltWeb: true, checks: ['API first50 excludes older DM59; profile opens actual existing DM59 and actual peer through cursor pages; composer available without friendship; no duplicate DM'], cursorRequests }));
} finally { await h.cleanup(); console.log('Owned DM pagination fixture cleaned.'); }
