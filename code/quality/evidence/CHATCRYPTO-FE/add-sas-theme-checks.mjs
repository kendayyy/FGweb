import fs from 'node:fs';
import assert from 'node:assert/strict';
const file = 'quality/evidence/CHATCRYPTO-FE/headed-sas-negative.mjs';
let source = fs.readFileSync(file, 'utf8');
const marker = '  await context.setOffline(true);';
assert.equal(source.split(marker).length, 2);
source = source.replace(marker, `  // Real theme control in a second tab emits the browser storage event.
  // The open encrypted composer/device in the first tab must survive it.
  const themePage = await context.newPage();
  await themePage.goto(origin + '/crypto');
  for (const mode of ['light', 'dark']) {
    await themePage.bringToFront();
    const label = mode === 'light' ? 'Chuyển sang Sáng' : 'Chuyển sang Tối';
    if (await themePage.locator('html').getAttribute('data-theme') !== mode)
      await themePage.getByRole('button', { name: label, exact: true }).click();
    await expect(themePage.locator('html')).toHaveAttribute('data-theme', mode);
    await a.bringToFront();
    await expect(a.locator('html')).toHaveAttribute('data-theme', mode);
    await expect(a.getByLabel('Tin nhắn riêng mã hóa', { exact: true })).toHaveValue(privateBody);
    await expect(a.getByText('Đã xác minh bằng SAS trên cả hai thiết bị.', { exact: true })).toBeVisible();
    await a.setViewportSize({ width: 360, height: 900 });
    assert.equal(await a.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await a.screenshot({ path: 'quality/evidence/CHATCRYPTO-FE/sas-theme-' + mode + '-' + owned + '.png' });
    await a.setViewportSize({ width: 1440, height: 1000 });
  }
  await themePage.close();
  console.log(JSON.stringify({ actualThemeControlAndCrossTab: true, lightDark360: true, encryptedDraftAndNativeSasPreserved: true }));
` + marker);
source = source.replace('actualOfflineDraftPreserved: true,', 'actualOfflineDraftPreserved: true, actualLightDarkCrossTab: true,');
fs.writeFileSync(file, source);
