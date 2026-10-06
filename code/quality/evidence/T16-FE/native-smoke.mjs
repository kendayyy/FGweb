import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';
import { parseEnv } from 'node:util';
import pg from 'pg';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { NestFactory } from '@nestjs/core';
import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';
import { makeSignature } from 'better-auth/crypto';
import * as tables from '@fg/database';

const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
const schema = `t16_fe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const directory = `quality/evidence/T16-FE/screenshots/${schema}`;
fs.mkdirSync(directory, { recursive: true });

const secret = 't16-fe-native-test-secret-with-at-least-32-characters';
let app, web, browser, pool, redis, createdSchema = false;
let namespace = '';

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });

const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];
const checks = [];

try {
  const scoped = new URL(env.DATABASE_URL);
  scoped.searchParams.set('options', `-c search_path=${schema}`);
  
  // Exact frozen namespace calculation SHA256([host, pathname, options]).slice(0, 16)
  namespace = createHash('sha256')
    .update(JSON.stringify([scoped.host, scoped.pathname, scoped.searchParams.get('options') ?? '']))
    .digest('hex')
    .slice(0, 16);
  assert.equal(namespace.length, 16, 'Computed presence namespace hash must be 16 chars hex string');

  pool = new pg.Pool({
    connectionString: scoped.href,
    max: 5,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  await pool.query(`CREATE SCHEMA "${schema}"`);
  createdSchema = true;
  console.log(`Owned native PostgreSQL schema ${schema} created with namespace hash ${namespace}`);

  const client = await pool.connect();
  try {
    await migrate(drizzle(client), {
      migrationsFolder: path.resolve('packages/database/migrations'),
      migrationsSchema: schema,
    });
  } finally {
    client.release();
  }

  redis = new Redis(env.REDIS_URL, { lazyConnect: true });
  await redis.connect();

  const games = await tables.seedGames(drizzle(pool, { schema: tables }));
  for (const [index, game] of games.entries()) {
    await pool.query(
      `INSERT INTO conversations(id,kind,lobby_id) VALUES($1,'LOBBY',$2)`,
      [`native-t16-conversation-${index}`, game.lobbyId]
    );
  }

  await pool.query(`
    INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at)
    VALUES
      ('native-user-me','Nam','nam@example.com',true,now(),now()),
      ('native-user-peer','Linh','linh@example.com',true,now(),now())
  `);

  await pool.query(`
    INSERT INTO account(id,account_id,provider_id,user_id,created_at,updated_at)
    VALUES
      ('native-acc-1','native-discord-1','discord','native-user-me',now(),now()),
      ('native-acc-2','native-discord-2','discord','native-user-peer',now(),now())
  `);

  await pool.query(`
    INSERT INTO profiles(user_id,display_name,custom_status)
    VALUES
      ('native-user-me','Nam','JUST_CHATTING'),
      ('native-user-peer','Linh','LOOKING_FOR_TEAM')
  `);

  await pool.query(`
    INSERT INTO game_interests(id,user_id,game_id)
    VALUES
      ('native-gi-1','native-user-me',$1),
      ('native-gi-2','native-user-peer',$1)
  `, [games[0].id]);

  await pool.query(`
    INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at)
    VALUES
      ('native-sess-me','native-user-me','native-token-me',now()+interval '1 day',now(),now())
  `);

  const webPort = await freePort();
  Object.assign(process.env, env, {
    DATABASE_URL: scoped.href,
    BETTER_AUTH_SECRET: secret,
    PUBLIC_ORIGIN: `http://127.0.0.1:${webPort}`,
    BETTER_AUTH_URL: `http://127.0.0.1:${webPort}`,
    FG_UPLOADS_DIR: path.resolve('.runtime', schema),
  });

  const { AppModule } = await import('../../../apps/api/dist/app.module.js');
  const { PresenceService } = await import('../../../apps/api/dist/modules/presence/presence.service.js');
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  const api = await app.getUrl();
  const presenceService = app.get(PresenceService);
  assert.equal(presenceService.ns, namespace, 'PresenceService namespace must match computed SHA256 namespace');

  web = await preview({
    root: path.resolve('apps/web'),
    configFile: path.resolve('apps/web/vite.config.ts'),
    preview: {
      host: '127.0.0.1',
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': api,
        '/socket.io': { target: api, ws: true },
      },
    },
  });

  const base = `http://127.0.0.1:${webPort}`;
  browser = await chromium.launch({ headless: true });
  const context1 = await browser.newContext({ viewport: viewports[0] });
  const page1 = await context1.newPage();

  // Test 1: Guest sees online panel without custom status selector and guest never acquires lease
  await page1.goto(base);
  await expect(page1.getByRole('heading', { name: /Cộng đồng/i })).toBeVisible();
  await expect(page1.getByRole('combobox', { name: /Trạng thái/i })).toHaveCount(0);
  
  // Assert guest never leases in Redis namespace
  const guestLeases = await redis.keys(`fg:presence:${namespace}:user_convs:*`);
  assert.equal(guestLeases.length, 0, 'Guest must not acquire Redis presence lease');
  checks.push('Guest observes online panel without custom status selector and acquires 0 leases');

  // Test 2: Authenticated user can change status via PATCH /api/v1/me/status
  const authCookie = {
    name: 'better-auth.session_token',
    value: `native-token-me.${await makeSignature('native-token-me', secret)}`,
    url: base,
    httpOnly: true,
    sameSite: 'Lax',
  };
  await context1.addCookies([authCookie]);
  await page1.reload();

  const statusSelector = page1.getByRole('combobox', { name: /Trạng thái/i });
  await expect(statusSelector).toBeVisible();
  await expect(statusSelector).toBeEnabled();
  await statusSelector.selectOption('LOOKING_FOR_TEAM');

  await expect(statusSelector).toHaveValue('LOOKING_FOR_TEAM');
  const updatedStatusInDb = (
    await pool.query("SELECT custom_status FROM profiles WHERE user_id='native-user-me'")
  ).rows[0].custom_status;
  assert.equal(updatedStatusInDb, 'LOOKING_FOR_TEAM');
  checks.push('Authenticated status update persists to database and reflects in UI');

  // Test 3: 2-tab deduplication test & Redis lease count assertion (poll up to 30s)
  const context2 = await browser.newContext({ viewport: viewports[0] });
  await context2.addCookies([authCookie]);
  const page2 = await context2.newPage();
  await page2.goto(base);
  await expect(page2.getByRole('heading', { name: /Cộng đồng/i })).toBeVisible();

  // Poll Redis actors hash for up to 30 seconds (60 * 500ms) to assert 2 socket leases for 1 user
  let actorCount = 0;
  for (let i = 0; i < 60; i++) {
    const actorHashKeys = await redis.keys(`fg:presence:${namespace}:actors:*`);
    if (actorHashKeys.length > 0) {
      const actors = await redis.hgetall(actorHashKeys[0]);
      actorCount = Object.keys(actors).length;
      if (actorCount >= 2) break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(actorCount, 2, '2 tabs must produce exactly 2 socket leases in Redis actors hash');

  // Verify online list on page 1 contains deduplicated user 'Nam' (exactly 1 instance of 'Nam')
  const userMeElements = page1.locator('span.fg-online-name', { hasText: 'Nam' });
  await expect(userMeElements).toHaveCount(1);
  checks.push('2-tab same-user deduplication verified with 2 socket leases in Redis and 1 UI card');

  // Close tab 2 and assert lease count decreases while user remains online in tab 1
  await context2.close();
  let remainingActorCount = 0;
  for (let i = 0; i < 20; i++) {
    const actorHashKeys = await redis.keys(`fg:presence:${namespace}:actors:*`);
    if (actorHashKeys.length > 0) {
      const actors = await redis.hgetall(actorHashKeys[0]);
      remainingActorCount = Object.keys(actors).length;
      if (remainingActorCount === 1) break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(remainingActorCount, 1, 'Closing 1 of 2 tabs leaves 1 active socket lease in Redis');
  const meStillOnline = await presenceService.isUserOnlineAnywhere('native-user-me');
  assert.equal(meStillOnline, true, 'Closing 1 of 2 tabs leaves user online');

  // Test 4: Game switching refreshes panel & canonical presence scope
  const gameSelect = page1.getByRole('combobox', { name: 'Chọn game' });
  await gameSelect.selectOption(games[1].id);
  await expect(page1.getByRole('heading', { name: /Cộng đồng/i })).toBeVisible();

  // Verify REST API scope: game 2 online user list includes native-user-me after subscribe ACK completes
  let game2IncludesUser = false;
  for (let i = 0; i < 20; i++) {
    const game2UserIds = await presenceService.getOnlineUserIdsForGame(games[1].id);
    if (game2UserIds.includes('native-user-me')) {
      game2IncludesUser = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(game2IncludesUser, true, 'Game 2 scope must include active native-user-me after scope switch');
  
  const game1UserIds = await presenceService.getOnlineUserIdsForGame(games[0].id);
  assert.ok(!game1UserIds.includes('native-user-me'), 'Game 1 scope must exclude native-user-me after switching to Game 2');
  await expect(statusSelector).toHaveValue('LOOKING_FOR_TEAM');

  await gameSelect.selectOption(games[0].id);
  await expect(page1.getByRole('heading', { name: /Cộng đồng/i })).toBeVisible();

  let game1IncludesUser = false;
  for (let i = 0; i < 20; i++) {
    const userIds = await presenceService.getOnlineUserIdsForGame(games[0].id);
    if (userIds.includes('native-user-me')) {
      game1IncludesUser = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(game1IncludesUser, true, 'Game 1 scope must include active native-user-me after switching back');
  checks.push('Game switching updates presence scope correctly and retains custom status');

  // Test 5: Profile link navigation assertion (click link & assert rendered profile name)
  const profileLink = page1.locator('a.fg-online-profile-link').first();
  await expect(profileLink).toBeVisible();
  const href = await profileLink.getAttribute('href');
  assert.ok(href.startsWith('/users/'));
  await profileLink.click();
  await expect(page1).toHaveURL(new RegExp(`/users/.*\/profile`));
  await expect(page1.locator('main')).toBeVisible();
  await expect(page1.locator('main')).toContainText('Nam');
  checks.push('Public profile link encodes opaque user ID and navigates correctly to rendered profile page');

  // Return to Lobby while online and wait for OnlineUsers to load
  await page1.goto(base);
  await expect(page1.getByRole('heading', { name: /Cộng đồng/i })).toBeVisible();

  // Test 5b: Explicit browser offline/reconnect transition test
  await context1.setOffline(true);
  await expect(page1.getByText(/Mất kết nối/i)).toBeVisible();
  await expect(page1.getByRole('combobox', { name: /Trạng thái/i })).toHaveValue('LOOKING_FOR_TEAM');

  await context1.setOffline(false);
  let restoredOnline = false;
  for (let i = 0; i < 20; i++) {
    const list = await presenceService.getOnlineUserIdsForGame(games[0].id);
    if (list.includes('native-user-me')) {
      restoredOnline = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(restoredOnline, true, 'Online user lease and REST list must be restored after context setOffline(false)');
  checks.push('Browser offline transition displays Mất kết nối with status unchanged, reconnect restores REST online lease');

  // Test 6: Viewport responsive checks & screenshots across all 4 viewports BEFORE session revoke
  for (const viewport of viewports) {
    await page1.setViewportSize(viewport);
    await page1.evaluate(() => document.fonts.ready);

    // On mobile viewports (< 1024), switch to "Tìm đội" tab so online panel is visible
    if (viewport.width < 1024) {
      const teamsTab = page1.getByRole('tab', { name: 'Tìm đội' });
      await teamsTab.click();
    }

    await expect(page1.getByRole('heading', { name: /Cộng đồng/i })).toBeVisible();

    const metrics = await page1.evaluate(() => {
      return {
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

    assert(
      metrics.scrollWidth <= metrics.width,
      `Horizontal overflow at viewport ${viewport.width}`
    );

    const undersized = await page1
      .locator('.fg-online-users-panel button, .fg-online-users-panel select, .fg-online-users-panel a')
      .evaluateAll((elements) =>
        elements
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return (
              getComputedStyle(element).display !== 'none' &&
              rect.width > 0 &&
              rect.height > 0 &&
              (rect.width < 44 || rect.height < 44)
            );
          })
          .map((element) => element.getAttribute('aria-label') || element.textContent?.trim())
      );

    assert.deepEqual(
      undersized,
      [],
      `Touch targets below 44px at viewport ${viewport.width}`
    );

    await page1.screenshot({
      path: `${directory}/${viewport.width}x${viewport.height}-presence.png`,
    });
    checks.push({ viewport: viewport.width, metrics });
  }

  // Test 7: Revoked session SQL test (assert heartbeat offline & session revoked)
  await pool.query("UPDATE \"session\" SET expires_at = now() - interval '1 hour' WHERE id = 'native-sess-me'");
  
  // Wait for heartbeat or sweep to detect expired session
  let isOfflineAfterRevoke = false;
  for (let i = 0; i < 35; i++) {
    await presenceService.sweepExpiredLeases();
    const online = await presenceService.isUserOnlineAnywhere('native-user-me');
    if (!online) {
      isOfflineAfterRevoke = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(isOfflineAfterRevoke, true, 'Revoked SQL session must remove active presence leases and mark user offline');
  checks.push('Revoked SQL session removes active leases and sets presence state to offline');

  // Information schema public tables assertion: verify 0 base tables in default public schema
  const publicTablesCount = (
    await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
  ).rows[0].count;
  assert.equal(Number(publicTablesCount), 0, 'Default public schema must contain 0 base tables');

  // Owned schema user table assertion: verify exactly 2 seeded users in owned schema
  const userCountInOwnedSchema = (await pool.query('SELECT count(*) FROM "user"')).rows[0].count;
  assert.equal(Number(userCountInOwnedSchema), 2, 'Owned schema "user" table must have exactly 2 seeded users');

  fs.writeFileSync(
    `${directory}/verified-presence-layout.json`,
    JSON.stringify({ checks, screenshots: directory }, null, 2) + '\n'
  );
  console.log(JSON.stringify({ native: true, checks, screenshots: directory }));
} finally {
  if (browser) await browser.close();
  if (web)
    await new Promise((resolve, reject) =>
      web.httpServer.close((error) => (error ? reject(error) : resolve()))
    );
  if (app) await app.close();

  if (redis && namespace) {
    // Exact owned namespace SCAN/DELETE: fg:presence:<exactownedhash>:* AFTER app & sockets closed
    const ownedKeyPattern = `fg:presence:${namespace}:*`;
    const ownedKeys = await redis.keys(ownedKeyPattern);
    if (ownedKeys.length > 0) {
      await redis.del(...ownedKeys);
    }
    
    // Assert 0 remaining keys matching owned namespace
    const remainingOwnedKeys = await redis.keys(ownedKeyPattern);
    assert.equal(remainingOwnedKeys.length, 0, '0 keys must remain for owned presence namespace after cleanup');
    await redis.quit();
  }

  const storage = path.resolve('.runtime', schema);
  assert(
    storage.startsWith(path.resolve('.runtime') + path.sep) &&
      path.basename(storage) === schema
  );
  fs.rmSync(storage, { recursive: true, force: true });

  if (pool) {
    try {
      if (createdSchema) {
        assert(/^t16_fe_[0-9]+_[a-z0-9]+$/.test(schema));
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        assert.equal(
          (await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1', [schema]))
            .rowCount,
          0
        );
      }
      console.log('Owned native PostgreSQL schema and servers closed cleanly');
    } finally {
      await pool.end();
    }
  }
}
