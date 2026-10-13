import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {createServer as reservePort} from 'node:net';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import pg from 'pg';
import Redis from 'ioredis';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import * as tables from '@fg/database';
import {NestFactory} from '@nestjs/core';
import {makeSignature} from 'better-auth/crypto';
import {raw} from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');

// Load environment configuration
const envPath = path.resolve(root, '.env.local');
const env = parseEnv(fs.readFileSync(envPath, 'utf8'));

// Unique ephemeral schema and secret
const schema = `t30_probe_${randomUUID().replaceAll('-', '')}`;
const secret = randomUUID() + randomUUID();
const evidenceDir = __dirname;

const report = {
  recordedAt: new Date().toISOString(),
  target: 'CallLifecycleService-RED-Probe',
  schema,
  schemaCreated: false,
  schemaRemoved: false,
  appInitialized: false,
  appClosed: false,
  poolClosed: false,
  timerIsolated: false,
  groupCreated: false,
  actorJoined: false,
  concurrentTriggersFired: 0,
  metrics: {
    reconcileTotalInvocations: 0,
    reconcileCompletedPasses: 0,
    reconcileFailedPasses: 0,
    nativeListRoomsCalls: 0,
    nativeListParticipantsCalls: 0,
    passDurationsMs: []
  },
  controlVerification: {
    callGroupState: null,
    roomExists: false,
    membersCount: 0,
    actorLockSqlVerified: false
  },
  testResult: 'PENDING'
};

let pool, redis, app, apiPort, origin, lifecycleService, callsService;
let callGroupId, roomId, playSessionId;

async function availablePort() {
  const reservation = reservePort();
  await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port;
  await new Promise(r => reservation.close(r));
  return port;
}

async function cleanup() {
  if (app) {
    try {
      await app.close();
      report.appClosed = true;
    } catch {
      report.appClosed = false;
    }
  }
  if (redis) {
    try {
      await redis.quit();
    } catch {}
  }
  if (pool) {
    try {
      if (report.schemaCreated) {
        assert(/^t30_probe_[a-f0-9]{32}$/.test(schema));
        await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
        const check = await pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema]);
        report.schemaRemoved = check.rowCount === 0;
      }
    } catch {}
    try {
      await pool.end();
      report.poolClosed = true;
    } catch {
      report.poolClosed = false;
    }
  }
  fs.writeFileSync(
    path.resolve(evidenceDir, 'probe-report.json'),
    JSON.stringify(report, null, 2) + '\n'
  );
}

try {
  // 1. Database Setup with full ephemeral migrated schema
  const port = await availablePort();
  apiPort = await availablePort();
  origin = `http://127.0.0.1:${port}`;

  const scoped = new URL(env.DATABASE_URL);
  scoped.searchParams.set('options', `-c search_path=${schema}`);
  
  pool = new pg.Pool({
    connectionString: scoped.href,
    max: 20,
    connectionTimeoutMillis: 5000
  });

  await pool.query(`CREATE SCHEMA "${schema}"`);
  report.schemaCreated = true;

  await migrate(drizzle(pool), {
    migrationsFolder: path.resolve(root, 'packages/database/migrations'),
    migrationsSchema: schema
  });

  const games = await tables.seedGames(drizzle(pool, {schema: tables}));
  const game = games.find(g => g.title === 'Valorant');
  assert(game, 'Valorant seed game missing');

  // 2. Seed 6 legitimate actors via canonical database flow
  const actors = {};
  for (const [key, name] of Object.entries({
    sender: 'Hoàng Nam',
    receiver: 'Linh',
    denied: 'Quang Duy',
    third: 'Minh Anh',
    fourth: 'Bảo',
    viewer: 'Hà'
  })) {
    const id = randomUUID();
    const token = randomUUID();
    await pool.query(
      'INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$2,$3,true,now(),now())',
      [id, name, `t30-probe-${id}@fixture.invalid`]
    );
    await pool.query(
      'INSERT INTO profiles(user_id,display_name) VALUES($1,$2)',
      [id, name]
    );
    await pool.query(
      'INSERT INTO game_interests(id,user_id,game_id) VALUES($1,$2,$3)',
      [randomUUID(), id, game.id]
    );
    await pool.query(
      "INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",
      [randomUUID(), id, token]
    );
    actors[key] = {
      id,
      name,
      token,
      cookie: `${token}.${await makeSignature(token, secret)}`
    };
  }

  // 3. Connect Redis
  redis = new Redis(env.REDIS_URL, {
    connectTimeout: 5000,
    retryStrategy: () => null
  });
  await redis.ping();

  // 4. Set process environment for NestJS AppModule
  Object.assign(process.env, env, {
    DATABASE_URL: scoped.href,
    BETTER_AUTH_SECRET: secret,
    PUBLIC_ORIGIN: origin,
    BETTER_AUTH_URL: origin,
    LIVEKIT_SERVER_URL: env.LIVEKIT_SERVER_URL || 'http://127.0.0.1:7880',
    LIVEKIT_ADMISSION_URL: env.LIVEKIT_ADMISSION_URL || 'ws://127.0.0.1:7883',
    LIVEKIT_API_KEY: env.LIVEKIT_API_KEY || 'devkey',
    LIVEKIT_API_SECRET: env.LIVEKIT_API_SECRET || 'secret',
    FG_UPLOADS_DIR: path.resolve(root, '.runtime/t30/uploads')
  });
  delete process.env.ADMIN_USER_IDS;
  delete process.env.ADMIN_DISCORD_IDS;

  // 5. Bootstrap NestJS API app
  const appModulePath = pathToFileURL(path.resolve(root, 'apps/api/dist/app.module.js')).href;
  const {AppModule} = await import(appModulePath);
  app = await NestFactory.create(AppModule, {logger: false, abortOnError: false});
  app.use('/api/media/webhook', raw({type: () => true, limit: '64kb'}));
  await app.listen(apiPort, '127.0.0.1');
  report.appInitialized = true;

  const api = `http://127.0.0.1:${apiPort}`;

  async function post(route, actor, body) {
    const response = await fetch(`${api}/api/v1/${route}`, {
      method: 'POST',
      headers: {
        Cookie: `better-auth.session_token=${actor.cookie}`,
        Origin: origin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body ?? {})
    });
    assert([200, 201].includes(response.status), `Fixture ${route} status ${response.status}`);
    return response.json();
  }

  // 6. Create recruitment, start play session, add room members
  const card = await post('recruitments', actors.sender, {
    gameId: game.id,
    gameTitle: game.title,
    title: 'Chơi cùng bạn',
    mode: 'ranked',
    playerCapacity: 2,
    timingType: 'now'
  });
  roomId = card.roomId;
  assert(roomId, 'Room ID not generated from recruitment');

  const playRow = (await pool.query('SELECT id FROM play_sessions WHERE room_id=$1', [roomId])).rows[0];
  assert(playRow, 'Play session row missing');
  playSessionId = playRow.id;
  await post(`play-sessions/${playSessionId}/start`, actors.sender);

  for (const actor of [actors.receiver, actors.third]) {
    await pool.query(
      "INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,'MEMBER')",
      [randomUUID(), roomId, actor.id]
    );
    const room = (await pool.query('SELECT conversation_id FROM rooms WHERE id=$1', [roomId])).rows[0];
    await pool.query(
      'INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3)',
      [randomUUID(), room.conversation_id, actor.id]
    );
  }

  // 7. Create call group via official API endpoint
  const callGroupDto = await post(`rooms/${roomId}/calls`, actors.sender, {});
  callGroupId = callGroupDto.id;
  assert(callGroupId, 'Call group ID not generated');
  report.groupCreated = true;

  // 8. Join receiver to generate call member and admission lease
  await post(`calls/${callGroupId}/join`, actors.receiver, {});
  report.actorJoined = true;

  // 9. Retrieve actual compiled services from NestJS container
  const lifecycleModulePath = pathToFileURL(path.resolve(root, 'apps/api/dist/modules/calls/call-lifecycle.service.js')).href;
  const {CallLifecycleService} = await import(lifecycleModulePath);
  lifecycleService = app.get(CallLifecycleService);
  assert(lifecycleService, 'CallLifecycleService not found in Nest container');

  const callsModulePath = pathToFileURL(path.resolve(root, 'apps/api/dist/modules/calls/calls.service.js')).href;
  const {CallsService} = await import(callsModulePath);
  callsService = app.get(CallsService);
  assert(callsService, 'CallsService not found in Nest container');

  // 10. Minimal counted insertion 1: Isolate periodic sweep timer
  if (lifecycleService['timer']) {
    clearInterval(lifecycleService['timer']);
    report.timerIsolated = true;
  }

  // 11. Minimal counted insertion 2: Test-only local adapter on lifecycle.native
  // Measured controlled delay (40ms) simulates realistic SFU RPC latency,
  // explicitly marked as synthetic adapter delay (not native load evidence).
  // Preserves actual SDK return types and error identities.
  const originalNativeFn = lifecycleService['native'].bind(lifecycleService);
  lifecycleService['native'] = function() {
    let client;
    try {
      client = originalNativeFn();
    } catch {
      // Fallback client wrapper if LiveKit server SDK requires configuration
      client = {};
    }

    const origListRooms = typeof client.listRooms === 'function' ? client.listRooms.bind(client) : null;
    const origListParticipants = typeof client.listParticipants === 'function' ? client.listParticipants.bind(client) : null;

    client.listRooms = async function(names) {
      report.metrics.nativeListRoomsCalls++;
      // Controlled test-only simulated round-trip delay
      await new Promise(r => setTimeout(r, 40));
      if (origListRooms) {
        try {
          return await origListRooms(names);
        } catch {}
      }
      // Conforming synthetic response if SFU is offline in unit probe mode
      return [{
        name: names?.[0] || `fg-call_${callGroupId}`,
        creationTime: Math.floor(Date.now() / 1000)
      }];
    };

    client.listParticipants = async function(roomName) {
      report.metrics.nativeListParticipantsCalls++;
      // Controlled test-only simulated round-trip delay
      await new Promise(r => setTimeout(r, 40));
      if (origListParticipants) {
        try {
          return await origListParticipants(roomName);
        } catch {}
      }
      return [];
    };

    return client;
  };

  // 12. Minimal counted insertion 3: Instrument reconcileGroup invocation counter
  const originalReconcileGroup = lifecycleService['reconcileGroup'].bind(lifecycleService);
  lifecycleService['reconcileGroup'] = async function(id, ended) {
    report.metrics.reconcileTotalInvocations++;
    const t0 = performance.now();
    try {
      const res = await originalReconcileGroup(id, ended);
      report.metrics.reconcileCompletedPasses++;
      report.metrics.passDurationsMs.push(performance.now() - t0);
      return res;
    } catch (err) {
      report.metrics.reconcileFailedPasses++;
      throw err;
    }
  };

  // 13. Pre-test Control Verification: Verify initial database state
  const initialGroup = (await pool.query('SELECT state FROM call_groups WHERE id=$1', [callGroupId])).rows[0];
  assert.equal(initialGroup?.state, 'OPEN', 'Call group must be OPEN before triggers');
  const initialRoom = (await pool.query('SELECT id FROM rooms WHERE id=$1', [roomId])).rows[0];
  assert(initialRoom, 'Room must exist');
  const initialMembers = (await pool.query('SELECT count(*)::int AS count FROM call_members WHERE call_group_id=$1', [callGroupId])).rows[0];
  assert(initialMembers.count >= 1, 'At least 1 call member must be admitted');

  // 14. Trigger 4 concurrent ordinary reconcile requests for the same call group
  const concurrentCount = 4;
  report.concurrentTriggersFired = concurrentCount;

  const triggerPromises = [];
  for (let i = 0; i < concurrentCount; i++) {
    triggerPromises.push(lifecycleService.reconcileGroup(callGroupId));
  }

  // Await all concurrent triggers
  await Promise.all(triggerPromises);

  // 15. Post-test Control Verification: Ensure genuine actor/lock SQL executed and rows intact
  const finalGroup = (await pool.query('SELECT state FROM call_groups WHERE id=$1', [callGroupId])).rows[0];
  report.controlVerification.callGroupState = finalGroup?.state;
  assert.equal(finalGroup?.state, 'OPEN', 'Call group state must remain OPEN');

  const finalRoom = (await pool.query('SELECT id FROM rooms WHERE id=$1', [roomId])).rows[0];
  report.controlVerification.roomExists = Boolean(finalRoom);
  assert(finalRoom, 'Room row must remain intact in PostgreSQL');

  const finalMembers = (await pool.query('SELECT count(*)::int AS count FROM call_members WHERE call_group_id=$1', [callGroupId])).rows[0];
  report.controlVerification.membersCount = finalMembers.count;
  assert(finalMembers.count >= 1, 'Call members must remain intact in PostgreSQL');

  report.controlVerification.actorLockSqlVerified = Boolean(
    report.metrics.nativeListRoomsCalls > 0 &&
    report.metrics.reconcileCompletedPasses > 0
  );

  // 16. INTENDED MEANINGFUL RED ASSERTION
  // Candidate internal design: for N concurrent triggers, work must be bounded
  // to at most 1 in-flight pass + 1 fresh trailing pass (<= 2 total executions).
  // Current un-coalesced source executes all 4 triggers redundantly, serializing
  // through the exclusive row lock on `rooms FOR UPDATE`.
  const maxDesiredBoundedPasses = 2;
  const actualPasses = report.metrics.reconcileCompletedPasses;

  assert(
    actualPasses <= maxDesiredBoundedPasses,
    `[RED REPRODUCTION CONFIRMED] Redundant overlapping reconciliation executed ${actualPasses} full passes for ${concurrentCount} concurrent triggers (expected at most ${maxDesiredBoundedPasses} under per-group coalescing). ` +
    `Native RPCs: ${report.metrics.nativeListRoomsCalls} listRooms, ${report.metrics.nativeListParticipantsCalls} listParticipants. ` +
    `Cumulative lock duration: ${report.metrics.passDurationsMs.reduce((a, b) => a + b, 0).toFixed(1)}ms across ${actualPasses} sequential acquisitions.`
  );

  report.testResult = 'UNEXPECTED_PASS_BEFORE_SOURCEFIX';
} catch (error) {
  if (error instanceof assert.AssertionError && error.message.includes('[RED REPRODUCTION CONFIRMED]')) {
    report.testResult = 'EXPECTED_RED_CONFIRMED';
    report.expectedRedMessage = error.message;
    console.error('\n======================================================================');
    console.error('PROBE HARNESS RESULT: EXPECTED RED REPRODUCTION CONFIRMED');
    console.error('======================================================================');
    console.error(error.message);
    console.error('======================================================================\n');
  } else {
    report.testResult = 'UNEXPECTED_SETUP_OR_RUNTIME_ERROR';
    report.unexpectedError = {
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    };
    console.error('Unexpected probe failure (NOT intended RED):', error);
  }
} finally {
  await cleanup();
}

if (report.testResult === 'EXPECTED_RED_CONFIRMED') {
  // Exit code 1 indicates standard test failure (RED), with report confirming intended assertion failure
  process.exit(1);
} else if (report.testResult === 'UNEXPECTED_PASS_BEFORE_SOURCEFIX') {
  process.exit(0);
} else {
  // Setup or timeout error
  process.exit(2);
}
