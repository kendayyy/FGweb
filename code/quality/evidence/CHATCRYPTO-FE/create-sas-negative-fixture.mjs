import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir = 'quality/evidence/CHATCRYPTO-FE';
let source = fs.readFileSync(`${dir}/new-device-headed-source.mjs`, 'utf8');
const marker = "  await a.getByRole('button', { name: 'Xác minh Native Bob', exact: true }).click();";
assert.equal(source.split(marker).length, 2);
const negative = `  // Real native SAS mismatch and cancellation must never confer device trust.
  async function startNegativeSas() {
    await a.bringToFront();
    await a.getByRole('button', { name: 'Xác minh Native Bob', exact: true }).click();
    await b.bringToFront();
    await b.getByRole('button', { name: 'Chấp nhận xác minh', exact: true }).click();
    await a.bringToFront();
    await a.getByRole('button', { name: 'Bắt đầu so sánh số', exact: true }).click();
    await b.bringToFront();
    await b.getByRole('button', { name: 'Mở mã so sánh', exact: true }).click();
    for (const page of [a,b]) {
      await page.bringToFront();
      await expect(page.getByRole('button', { name: 'Các số khớp', exact: true })).toBeVisible();
    }
    assert.equal(await a.getByLabel('Ba dãy số xác minh').innerText(), await b.getByLabel('Ba dãy số xác minh').innerText());
  }
  const cancelledText = 'Xác minh đã bị hủy. Thiết bị chưa được xác nhận từ lượt này.';
  for (const action of ['Không khớp', 'Hủy xác minh']) {
    await startNegativeSas();
    const actor = action === 'Không khớp' ? a : b;
    await actor.bringToFront();
    await actor.getByRole('button', { name: action, exact: true }).click();
    for (const page of [a,b]) {
      await page.bringToFront();
      await expect(page.getByText(cancelledText, { exact: true }).last()).toBeVisible();
      await expect(page.getByText('Đã xác minh bằng SAS trên cả hai thiết bị.', { exact: true })).toHaveCount(0);
    }
    await a.bringToFront();
    await a.getByRole('button', { name: 'Gửi mã hóa', exact: true }).click();
    await expect(a.getByRole('alert')).toContainText('Cần thiết bị người nhận đã xác minh');
    assert.equal(await a.getByLabel('Tin nhắn riêng mã hóa', { exact: true }).inputValue(), privateBody);
    assert.equal(Number((await pool.query("SELECT count(*) FROM messages WHERE conversation_id='headed-dm'")).rows[0].count), 0);
  }
  console.log(JSON.stringify({ actualNativeMismatchAndCancel: true, noTrustOrMessageAfterCancelledSas: true }));
`;
source = source.replace(marker, negative + marker);
const offlineMarker = '  // Commit actual encrypted write, then lose response at the browser boundary.';
assert.equal(source.split(offlineMarker).length, 2);
source = source.replace(offlineMarker, `  await a.bringToFront();
  await context.setOffline(true);
  try {
    await a.getByRole('button', { name: 'Gửi mã hóa', exact: true }).click();
    await expect(a.getByRole('alert')).toContainText('Chưa xác nhận gửi thành công');
    assert.equal(await a.getByLabel('Tin nhắn riêng mã hóa', { exact: true }).inputValue(), privateBody);
    assert.equal(Number((await pool.query("SELECT count(*) FROM messages WHERE conversation_id='headed-dm'")).rows[0].count), 0);
  } finally { await context.setOffline(false); }
  console.log(JSON.stringify({ actualOfflineSendDeniedAndDraftPreserved: true }));
` + offlineMarker);
source = source.replace('nativeSasOnBothBrowsers: true,', 'nativeSasOnBothBrowsers: true, nativeMismatchAndCancellation: true, actualOfflineDraftPreserved: true,');
fs.writeFileSync(`${dir}/headed-sas-negative.mjs`, source, { flag: 'wx' });
console.log('Created finite headed SAS mismatch/cancel/offline fixture from pinned new-device source.');
