import assert from 'node:assert/strict';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('.cache/ms-playwright');
const { chromium } = await import('@playwright/test');
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<title>FG setup probe</title><h1>Liên Minh Huyền Thoại · Đang tìm đội · Rời cuộc gọi</h1>');
  assert.equal(await page.title(), 'FG setup probe');
  assert.equal(await page.locator('h1').textContent(), 'Liên Minh Huyền Thoại · Đang tìm đội · Rời cuộc gọi');
  console.log('PASS: project Chromium launched and rendered Vietnamese text');
} catch {
  console.error('FAIL: Chromium unavailable or rendering probe failed');
  process.exitCode = 1;
} finally { await browser?.close(); }
