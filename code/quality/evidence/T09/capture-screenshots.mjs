import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const screenshotDir = path.resolve('quality/evidence/T09/screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      http.get(url, () => {
        resolve(true);
      }).on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for server at ${url}`));
        } else {
          setTimeout(check, 300);
        }
      });
    }
    check();
  });
}

async function main() {
  console.log('Starting Vite preview server...');
  const server = spawn('npm', ['run', 'preview', '--workspace', '@fg/web', '--', '--host', '127.0.0.1', '--port', '5173'], {
    cwd: path.resolve('.'),
    shell: true,
    stdio: 'ignore',
  });

  await waitForServer('http://127.0.0.1:5173/');
  console.log('Vite preview server is ready.');

  console.log('Launching browser for screenshots...');
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { width: 1440, height: 900, name: '1440x900' },
    { width: 1280, height: 800, name: '1280x800' },
    { width: 390, height: 844, name: '390x844' },
    { width: 360, height: 800, name: '360x800' },
  ];

  const routes = [
    { path: '/', name: 'lobby-guest' },
    { path: '/login', name: 'login-page' },
    { path: '/login?error=oauth_denied', name: 'login-error-state' },
    { path: '/protected', name: 'protected-auth-prompt' },
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    for (const r of routes) {
      await page.goto(`http://127.0.0.1:5173${r.path}`, { waitUntil: 'networkidle' });
      const filename = `${r.name}-${vp.name}.png`;
      await page.screenshot({ path: path.join(screenshotDir, filename), fullPage: false });
      console.log(`Saved screenshot: ${filename}`);
    }

    await context.close();
  }

  await browser.close();
  server.kill();
  console.log('Screenshots capture complete.');
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
