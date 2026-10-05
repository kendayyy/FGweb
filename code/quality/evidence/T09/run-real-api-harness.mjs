import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { chromium } from '@playwright/test';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { makeSignature } from 'better-auth/crypto';
import * as schema from '@fg/database';
import assert from 'node:assert/strict';
import { MeDTOSchema } from '@fg/contracts';

const { Pool } = pg;

function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function waitForHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      http
        .get(url, (res) => {
          res.resume();
          resolve(res.statusCode);
        })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Timeout waiting for HTTP server at ${url}`));
          } else {
            setTimeout(check, 300);
          }
        });
    }
    check();
  });
}

async function terminateChildProcess(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Owned test process did not exit')), 5000);
    proc.once('exit', () => { clearTimeout(timeout); resolve(); });
    proc.kill('SIGTERM');
  });
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is required to run real API integration harness');
  }
  for (const key of ['BETTER_AUTH_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET']) {
    assert.ok(process.env[key], `Required local configuration missing: ${key}`);
  }

  // Refuse execution if ports 3000 or 5173 are already bound by another process
  const port3000Free = await isPortAvailable(3000);
  const port5173Free = await isPortAvailable(5173);

  if (!port3000Free) {
    throw new Error('Port 3000 is already in use by another process. Refusing port collision.');
  }
  if (!port5173Free) {
    throw new Error('Port 5173 is already in use by another process. Refusing port collision.');
  }

  const schemaName = `t09_harness_${Date.now()}`;
  console.log(`Setting up temporary PostgreSQL schema with drizzle migrations: ${schemaName}`);

  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();

  let apiServer = null;
  let webServer = null;
  let browser = null;
  let harnessError = null;

  const screenshotDir = path.resolve('quality/evidence/T09/screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const testSecret = process.env.BETTER_AUTH_SECRET;

  try {
    // 1. Create temporary schema and run migrations
    await client.query(`CREATE SCHEMA "${schemaName}";`);
    await client.query(`SET search_path TO "${schemaName}";`);

    const db = drizzle(client, { schema });
    const migrationsFolder = path.resolve('packages/database/migrations');
    await migrate(db, { migrationsFolder, migrationsSchema: schemaName });
    await schema.seedGames(db);

    console.log('Temporary schema created and migrations applied successfully.');

    // 2. Start compiled Nest API server using process.execPath with shell: false
    console.log('Starting compiled Nest API server on port 3000...');
    const apiDbUrl = new URL(dbUrl);
    apiDbUrl.searchParams.set('options', `-c search_path=${schemaName}`);
    const env = {
      ...process.env,
      DATABASE_URL: apiDbUrl.toString(),
      PGOPTIONS: `-c search_path=${schemaName}`,
      PORT: '3000',
      PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN || 'http://localhost:5173',
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || 'http://localhost:5173',
      BETTER_AUTH_SECRET: testSecret,
      DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
      DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
    };

    apiServer = spawn(process.execPath, ['apps/api/dist/main.js'], {
      env,
      cwd: path.resolve('.'),
      stdio: 'pipe',
      shell: false,
    });
    apiServer.stdout.resume();
    apiServer.stderr.resume();

    assert.equal(await waitForHttp('http://127.0.0.1:3000/api/v1/me'), 401);
    console.log(`API server responded on port 3000 (PID: ${apiServer.pid}).`);

    // 3. Start Vite preview using process.execPath and direct vite.js binary with shell: false
    console.log('Starting Vite preview server on port 5173...');
    const viteBinPath = path.resolve('node_modules/vite/bin/vite.js');

    webServer = spawn(process.execPath, [viteBinPath, 'preview', '--host', '127.0.0.1', '--port', '5173'], {
      cwd: path.resolve('apps/web'),
      stdio: 'pipe',
      shell: false,
    });
    webServer.stdout.resume();
    webServer.stderr.resume();

    await waitForHttp('http://127.0.0.1:5173/');
    console.log(`Vite preview server ready on port 5173 (PID: ${webServer.pid}).`);

    // 4. Run Playwright UI & Real API Integration checks
    browser = await chromium.launch({ headless: true });

    const viewports = [
      { width: 1440, height: 900, name: '1440x900' },
      { width: 1280, height: 800, name: '1280x800' },
      { width: 390, height: 844, name: '390x844' },
      { width: 360, height: 800, name: '360x800' },
    ];

    // Check 1: Guest /me returns 401 via proxy
    const context = await browser.newContext({ viewport: viewports[0] });
    const page = await context.newPage();

    console.log('Testing GET /api/v1/me guest response (expecting 401)...');
    const meRes = await page.request.get('http://localhost:5173/api/v1/me');
    if (meRes.status() !== 401) {
      throw new Error(`Expected guest /me to return 401, got ${meRes.status()}`);
    }
    console.log('✓ Guest GET /api/v1/me returned 401 Unauthorized as expected.');

    // Check 2: POST /api/auth/sign-in/social returns valid Discord OAuth URL
    console.log('Testing POST /api/auth/sign-in/social (expecting 200 with Discord OAuth URL)...');
    const signInRes = await page.request.post('http://localhost:5173/api/auth/sign-in/social', {
      headers: {
        origin: 'http://localhost:5173',
      },
      data: {
        provider: 'discord',
        callbackURL: 'http://localhost:5173/lobby',
        errorCallbackURL: 'http://localhost:5173/login?error=oauth_denied',
      },
    });

    const errText = await signInRes.text();
    if (signInRes.status() !== 200) {
      throw new Error(`Expected sign-in/social to return 200, got ${signInRes.status()}: ${errText}`);
    }
    const signInJson = JSON.parse(errText);
    const parsedUrl = new URL(signInJson.url);
    if (parsedUrl.hostname !== 'discord.com' || !parsedUrl.pathname.includes('/oauth2/authorize')) {
      throw new Error(`Expected Discord OAuth URL on discord.com with /oauth2/authorize path, got: ${signInJson.url}`);
    }
    console.log('✓ POST /api/auth/sign-in/social returned valid Discord OAuth URL.');

    // Check 3: Seed explicit test-only session into temp schema & verify authenticated guard
    const testUserId = `usr_harness_${Date.now()}`;
    const testSessionToken = `token_harness_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 86400000);
    const now = new Date();

    await client.query(
      `INSERT INTO "${schemaName}"."user" ("id", "name", "email", "email_verified", "created_at", "updated_at") VALUES ($1, $2, $3, $4, $5, $6);`,
      [testUserId, 'Harness User', 'harness@fg.vn', true, now, now]
    );
    await client.query(
      `INSERT INTO "${schemaName}"."account" ("id", "account_id", "provider_id", "user_id", "created_at", "updated_at") VALUES ($1, $2, $3, $4, $5, $6);`,
      [`acc_${testUserId}`, 'discord_harness_123', 'discord', testUserId, now, now]
    );
    await client.query(
      `INSERT INTO "${schemaName}"."profiles" ("user_id", "display_name", "created_at", "updated_at") VALUES ($1, $2, $3, $4);`,
      [testUserId, 'Harness Gamer', now, now]
    );
    await client.query(
      `INSERT INTO "${schemaName}"."session" ("id", "token", "user_id", "expires_at", "created_at", "updated_at") VALUES ($1, $2, $3, $4, $5, $6);`,
      [`sess_${testUserId}`, testSessionToken, testUserId, expiresAt, now, now]
    );

    // Compute signed session cookie for Better Auth
    const signature = await makeSignature(testSessionToken, testSecret);
    const signedCookieValue = `${testSessionToken}.${signature}`;

    console.log('Testing authenticated GET /api/v1/me with signed test session token...');
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: signedCookieValue,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
      },
    ]);

    const meAuthRes = await page.request.get('http://localhost:5173/api/v1/me');
    if (meAuthRes.status() !== 200) {
      throw new Error(`Expected authenticated /me to return 200, got ${meAuthRes.status()}`);
    }
    const meIdentity = MeDTOSchema.parse(await meAuthRes.json());
    assert.equal(meIdentity.id, testUserId);
    console.log('✓ Authenticated GET /api/v1/me returned 200 OK with validated MeDTO.');

    // Capture screenshots across all 4 viewports in authenticated & guest contexts
    console.log('Capturing verified screenshots across 4 viewports...');
    const routes = [
      { path: '/', name: 'lobby-guest' },
      { path: '/login', name: 'login-page' },
      { path: '/login?error=oauth_denied', name: 'login-error-state' },
      { path: '/protected', name: 'protected-member-shell' },
    ];

    for (const vp of viewports) {
      const vpContext = await browser.newContext({ viewport: vp });
      const fixtureCookies = [
        {
          name: 'better-auth.session_token',
          value: signedCookieValue,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
        },
      ];
      const vpPage = await vpContext.newPage();

      for (const r of routes) {
        await vpContext.clearCookies();
        if (r.path === '/protected') await vpContext.addCookies(fixtureCookies);
        await vpPage.goto(`http://localhost:5173${r.path}`, { waitUntil: 'networkidle' });
        if (r.path === '/protected') {
          await vpPage.getByText('Khu vực dành riêng cho thành viên đã xác thực.', {exact:false}).waitFor({state:'visible'});
        } else if (r.name === 'lobby-guest') {
          await vpPage.locator('header').getByRole('button', {name:'Đăng nhập bằng Discord'}).waitFor({state:'visible'});
        } else if (r.name === 'login-error-state') {
          await vpPage.getByTestId('oauth-error-banner').waitFor({state:'visible'});
        }

        // Strict touch target assertion: button height must be at least 44px
        const buttons = await vpPage.$$('button');
        for (const btn of buttons) {
          const box = await btn.boundingBox();
          if (box && (box.height < 44 || box.width < 44)) {
            throw new Error(`Touch target assertion failed: button height ${box.height}px < 44px on ${vp.name} (${r.name})`);
          }
        }

        // Strict layout overflow assertion: scrollWidth must not exceed innerWidth
        const overflow = await vpPage.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.window.innerWidth);
        if (overflow) {
          throw new Error(`Layout overflow assertion failed: scrollWidth > innerWidth on ${r.path} at ${vp.name}`);
        }

        const filename = `${r.name}-${vp.name}.png`;
        await vpPage.screenshot({ path: path.join(screenshotDir, filename), fullPage: false });
        console.log(`✓ Captured ${filename}`);
      }

      await vpContext.close();
    }

    await page.goto('http://localhost:5173/protected', {waitUntil:'networkidle'});
    await page.getByText('Khu vực dành riêng cho thành viên đã xác thực.', {exact:false}).waitFor({state:'visible'});
    const logoutResponse = page.waitForResponse(response => response.url().endsWith('/api/auth/sign-out') && response.request().method() === 'POST');
    await page.locator('header').getByRole('button', {name:'Đăng xuất'}).click();
    assert.equal((await logoutResponse).status(), 200);
    await page.locator('header').getByRole('button', {name:'Đăng nhập bằng Discord'}).waitFor({state:'visible'});
    assert.equal(await page.getByText('Khu vực dành riêng cho thành viên đã xác thực.', {exact:false}).count(), 0);
    const replay = await fetch('http://localhost:5173/api/v1/me', {headers:{Cookie:`better-auth.session_token=${encodeURIComponent(signedCookieValue)}`}});
    assert.equal(replay.status, 401);
    const remaining = await client.query(`SELECT count(*)::int AS count FROM "${schemaName}"."session" WHERE token=$1`, [testSessionToken]);
    assert.equal(remaining.rows[0].count, 0);
    console.log('✓ Real browser logout200; protected UI cleared; old signed cookie replay401; fixture session deleted.');
    await context.close();

    const results = {
      timestamp: new Date().toISOString(),
      schemaName,
      apiPid: apiServer.pid,
      webPid: webServer.pid,
      checks: [
        { name: 'GET /api/v1/me guest', status: 401, pass: meRes.status() === 401, type: 'real_api' },
        { name: 'POST /api/auth/sign-in/social Discord OAuth URL', status: 200, pass: true, type: 'real_api' },
        { name: 'Seeded test session fixture lookup', status: meAuthRes.status(), pass: meAuthRes.status() === 200, type: 'test_fixture' },
        { name: 'Real browser logout and old cookie replay; database session deletion', pass: true, type: 'real_api_test_fixture' },
        { name: 'UI Viewport screenshots & 44px target validation', count: 16, pass: true, type: 'playwright' },
      ],
    };

    fs.writeFileSync(path.resolve('quality/evidence/T09/api-harness-results.json'), JSON.stringify(results, null, 2));
    console.log('Real API Harness executed successfully!');
  } catch (err) {
    harnessError = err;
  } finally {
    console.log('Beginning cleanup of browser, child processes, and temporary schema...');
    for (const cleanup of [
      () => browser?.close(),
      () => terminateChildProcess(webServer),
      () => terminateChildProcess(apiServer),
    ]) {
      try { await cleanup(); }
      catch (err) { harnessError ??= err; }
    }

    try {
      console.log(`Cleaning up temporary database schema: ${schemaName}`);
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
      const schemasLeft = await client.query('SELECT count(*)::int AS count FROM pg_namespace WHERE nspname=$1', [schemaName]);
      assert.equal(schemasLeft.rows[0].count, 0);
      client.release();
      await pool.end();
      console.log('Schema cleanup complete.');
    } catch (dbErr) {
      console.error('Database schema cleanup error:', dbErr);
      client.release();
      await pool.end().catch(() => {});
      if (!harnessError) {
        harnessError = new Error(`Database schema cleanup failed for ${schemaName}`, { cause: dbErr });
      }
    }
  }

  if (harnessError) {
    throw harnessError;
  }
}

main().catch((err) => {
  console.error('Real API Integration Harness Failed:', err);
  process.exit(1);
});
