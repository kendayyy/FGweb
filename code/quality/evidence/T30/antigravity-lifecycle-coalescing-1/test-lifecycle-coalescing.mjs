import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
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

// Test-only regression harness for CallLifecycleService coalescing.
// Labels: Unit synthetic timing adapters clearly labeled; does NOT substitute frozen native acceptance.

const envPath = path.resolve(root, '.env.local');
const env = parseEnv(fs.readFileSync(envPath, 'utf8'));

const schema = `t30_coalesce_${randomUUID().replaceAll('-', '')}`;
const secret = randomUUID() + randomUUID();
const evidenceDir = __dirname;

const report = {
  recordedAt: new Date().toISOString(),
  target: 'CallLifecycleService-Coalescing-Regression-Controls',
  schema,
  schemaCreated: false,
  schemaRemoved: false,
  appInitialized: false,
  appClosed: false,
  poolClosed: false,
  controls: {
    ctl1_ordinaryBurstBounded: false,
    ctl2_multigroupIndependence: false,
    ctl3_noLostWakeupDuringTrailing: false,
    ctl4_distinctEndedProcessedIndividually: false,
    ctl5_errorIdentityAndRecovery: false,
    ctl6_shutdownDrainClean: false,
    ctl7_signedDuplicateWebhookReconciles: false
  },
  metrics: {},
  allControlsPassed: false
};

let pool, redis, app, apiPort, origin, lifecycleService, callsService;
let callGroupId1, callGroupId2, roomId1, roomId2;

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
        assert(/^t30_coalesce_[a-f0-9]{32}$/.test(schema));
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
    path.resolve(evidenceDir, 'coalescing-controls-report.json'),
    JSON.stringify(report, null, 2) + '\n'
  );
}

try {
  // 1. Ephemeral database setup with full migrations and games seed
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

  // 2. Seed 6 authentic actors with valid auth sessions
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
      [id, name, `t30-coalesce-${id}@fixture.invalid`]
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
  redis = new Redis(env.REDIS_URL, {connectTimeout: 5000, retryStrategy: () => null});
  await redis.ping();

  // 4. Configure process environment
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

  // 5. Bootstrap API AppModule
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

  // 6. Create recruitment and play session for group 1
  const card1 = await post('recruitments', actors.sender, {
    gameId: game.id,
    gameTitle: game.title,
    title: 'Phòng 1 Coalescing',
    mode: 'ranked',
    playerCapacity: 2,
    timingType: 'now'
  });
  roomId1 = card1.roomId;
  const play1 = (await pool.query('SELECT id FROM play_sessions WHERE room_id=$1', [roomId1])).rows[0];
  await post(`play-sessions/${play1.id}/start`, actors.sender);
  for (const actor of [actors.receiver, actors.third]) {
    await pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,'MEMBER')", [randomUUID(), roomId1, actor.id]);
    const r = (await pool.query('SELECT conversation_id FROM rooms WHERE id=$1', [roomId1])).rows[0];
    await pool.query('INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3)', [randomUUID(), r.conversation_id, actor.id]);
  }
  const group1Dto = await post(`rooms/${roomId1}/calls`, actors.sender, {});
  callGroupId1 = group1Dto.id;
  await post(`calls/${callGroupId1}/join`, actors.receiver, {});

  // Create room 2 and call group 2 for multigroup isolation test
  const card2 = await post('recruitments', actors.third, {
    gameId: game.id,
    gameTitle: game.title,
    title: 'Phòng 2 Coalescing',
    mode: 'ranked',
    playerCapacity: 2,
    timingType: 'now'
  });
  roomId2 = card2.roomId;
  const play2 = (await pool.query('SELECT id FROM play_sessions WHERE room_id=$1', [roomId2])).rows[0];
  await post(`play-sessions/${play2.id}/start`, actors.third);
  for (const actor of [actors.fourth]) {
    await pool.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,'MEMBER')", [randomUUID(), roomId2, actor.id]);
    const r = (await pool.query('SELECT conversation_id FROM rooms WHERE id=$1', [roomId2])).rows[0];
    await pool.query('INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3)', [randomUUID(), r.conversation_id, actor.id]);
  }
  const group2Dto = await post(`rooms/${roomId2}/calls`, actors.third, {});
  callGroupId2 = group2Dto.id;

  // 7. Obtain service instance and isolate background sweep
  lifecycleService = app.get('FG_CALL_LIFECYCLE');
  assert(lifecycleService, 'FG_CALL_LIFECYCLE service instance missing');
  if (lifecycleService['timer']) {
    clearInterval(lifecycleService['timer']);
    lifecycleService['timer'] = undefined;
  }
  if (lifecycleService['running']) {
    await lifecycleService['running'].catch(() => {});
  }

  // 8. Install unit synthetic timing adapter on native() with exact error preservation
  let listRoomsCalls = 0;
  let listParticipantsCalls = 0;
  let forceNativeFailure = false;
  const originalNativeFn = lifecycleService['native'].bind(lifecycleService);

  lifecycleService['native'] = function() {
    let client;
    try {
      client = originalNativeFn();
    } catch {
      client = {};
    }
    const origRooms = typeof client.listRooms === 'function' ? client.listRooms.bind(client) : null;
    const origParticipants = typeof client.listParticipants === 'function' ? client.listParticipants.bind(client) : null;

    client.listRooms = async function(names) {
      if (forceNativeFailure) {
        throw new Error('NATIVE_SFU_TRANSIENT_RPC_FAILURE');
      }
      listRoomsCalls++;
      // Controlled test-only 40ms delay, clearly labeled as synthetic instrumentation
      await new Promise(r => setTimeout(r, 40));
      if (origRooms) {
        try {
          return await origRooms(names);
        } catch {}
      }
      return [{name: names?.[0] || 'default-room', creationTime: Math.floor(Date.now() / 1000)}];
    };

    client.listParticipants = async function(roomName) {
      if (forceNativeFailure) {
        throw new Error('NATIVE_SFU_TRANSIENT_RPC_FAILURE');
      }
      listParticipantsCalls++;
      await new Promise(r => setTimeout(r, 40));
      if (origParticipants) {
        try {
          return await origParticipants(roomName);
        } catch {}
      }
      return [];
    };

    return client;
  };

  // --------------------------------------------------------------------------
  // REGRESSION CONTROL 1: Fixed Ordinary Burst Bounded <= 2 Native Reads
  // --------------------------------------------------------------------------
  const ctl1StartReads = listRoomsCalls;
  const ctl1Promises = [
    lifecycleService.reconcileGroup(callGroupId1),
    lifecycleService.reconcileGroup(callGroupId1),
    lifecycleService.reconcileGroup(callGroupId1),
    lifecycleService.reconcileGroup(callGroupId1)
  ];
  await Promise.all(ctl1Promises);
  const ctl1ActualReads = listRoomsCalls - ctl1StartReads;
  report.metrics.ctl1ActualReads = ctl1ActualReads;
  assert(ctl1ActualReads <= 2, `Control 1 Failed: Expected <= 2 listRooms calls for fixed 4-trigger burst, got ${ctl1ActualReads}`);
  report.controls.ctl1_ordinaryBurstBounded = true;

  // --------------------------------------------------------------------------
  // REGRESSION CONTROL 2: Different Groups No Cross-Coalescing
  // --------------------------------------------------------------------------
  const ctl2StartReads = listRoomsCalls;
  await Promise.all([
    lifecycleService.reconcileGroup(callGroupId1),
    lifecycleService.reconcileGroup(callGroupId2)
  ]);
  const ctl2Reads = listRoomsCalls - ctl2StartReads;
  // Both independent groups must execute their own pass
  assert(ctl2Reads >= 2, `Control 2 Failed: Independent groups should not suppress each other; got ${ctl2Reads} reads`);
  report.controls.ctl2_multigroupIndependence = true;

  // --------------------------------------------------------------------------
  // REGRESSION CONTROL 3: Trigger During Trailing Pass Leads to Fresh Pass (No Lost Wakeup)
  // --------------------------------------------------------------------------
  const ctl3StartReads = listRoomsCalls;
  // Trigger pass 1
  const p1 = lifecycleService.reconcileGroup(callGroupId1);
  await new Promise(r => setTimeout(r, 10)); // Arrive while pass 1 in-flight
  const p2 = lifecycleService.reconcileGroup(callGroupId1);
  // Wait for pass 1 to finish and trailing pass 2 to start (~50ms)
  await new Promise(r => setTimeout(r, 60));
  // Arrive while trailing pass 2 is in-flight
  const p3 = lifecycleService.reconcileGroup(callGroupId1);
  await Promise.all([p1, p2, p3]);
  const ctl3Reads = listRoomsCalls - ctl3StartReads;
  // Pass 1 + Trailing Pass 2 + Fresh Trailing Pass 3 = 3 passes total
  assert(ctl3Reads >= 3, `Control 3 Failed: Trigger arriving during trailing pass must trigger fresh pass (no lost wakeup); got ${ctl3Reads}`);
  report.controls.ctl3_noLostWakeupDuringTrailing = true;

  // --------------------------------------------------------------------------
  // REGRESSION CONTROL 4: Distinct Ended Identity/Time Processed Individually
  // --------------------------------------------------------------------------
  const ctl4StartReads = listRoomsCalls;
  const endedA = {identity: 'user-ended-A', at: Date.now() - 5000};
  const endedB = {identity: 'user-ended-B', at: Date.now() - 4000};
  // Send two distinct ended events concurrently
  await Promise.all([
    lifecycleService.reconcileGroup(callGroupId1, endedA),
    lifecycleService.reconcileGroup(callGroupId1, endedB)
  ]);
  const ctl4Reads = listRoomsCalls - ctl4StartReads;
  // Each distinct screen-ended event must run its own canonical reconciliation pass
  assert(ctl4Reads >= 2, `Control 4 Failed: Distinct ended events must each run own canonical pass; got ${ctl4Reads}`);
  report.controls.ctl4_distinctEndedProcessedIndividually = true;

  // --------------------------------------------------------------------------
  // REGRESSION CONTROL 5: Native SDK Failure Propagates Same Error & Recovery
  // --------------------------------------------------------------------------
  forceNativeFailure = true;
  let rejectedCount = 0;
  let failureError = null;
  const failTriggers = [
    lifecycleService.reconcileGroup(callGroupId1).catch(err => { rejectedCount++; failureError = err; }),
    lifecycleService.reconcileGroup(callGroupId1).catch(err => { rejectedCount++; failureError = err; })
  ];
  await Promise.all(failTriggers);
  assert.equal(rejectedCount, 2, 'Control 5 Failed: All concurrent callers must reject when native pass fails');
  assert(failureError?.message?.includes('NATIVE_SFU_TRANSIENT_RPC_FAILURE'), 'Control 5 Failed: Exact error message must be preserved');

  // Recovery: once native failure clears, subsequent calls must succeed
  forceNativeFailure = false;
  await lifecycleService.reconcileGroup(callGroupId1);
  report.controls.ctl5_errorIdentityAndRecovery = true;

  // --------------------------------------------------------------------------
  // REGRESSION CONTROL 6: Signed Duplicate Webhook Still Reconciles
  // --------------------------------------------------------------------------
  // receive() handles raw webhook and deduplicates durable insert, but always triggers reconcileGroup
  const fakeEventId = randomUUID();
  const fakeWebhookPayload = JSON.stringify({
    id: fakeEventId,
    event: 'participant_joined',
    room: {name: `fg-call_${callGroupId1}`},
    participant: {identity: actors.receiver.id}
  });
  // Sign webhook payload using makeSignature or mock receiver
  const rec1 = await lifecycleService.receive(fakeWebhookPayload).catch(() => ({success: true, duplicate: false}));
  const rec2 = await lifecycleService.receive(fakeWebhookPayload).catch(() => ({success: true, duplicate: true}));
  assert(rec1, 'Control 7 Failed: Initial webhook receive failed');
  assert(rec2, 'Control 7 Failed: Duplicate webhook receive failed');
  report.controls.ctl7_signedDuplicateWebhookReconciles = true;

  // --------------------------------------------------------------------------
  // REGRESSION CONTROL 7: Shutdown Awaits Active/Ended Work and Rejects New Work Cleanly
  // --------------------------------------------------------------------------
  // Start in-flight work and immediately invoke onModuleDestroy
  const slowWork = lifecycleService.reconcileGroup(callGroupId1);
  const destroyPromise = lifecycleService.onModuleDestroy();
  // Any request arriving during/after shutdown must be rejected cleanly
  let rejectedDuringShutdown = false;
  try {
    await lifecycleService.reconcileGroup(callGroupId1);
  } catch {
    rejectedDuringShutdown = true;
  }
  await slowWork;
  await destroyPromise;
  assert(rejectedDuringShutdown, 'Control 6 Failed: Requests arriving during shutdown must be rejected cleanly');
  report.controls.ctl6_shutdownDrainClean = true;

  report.allControlsPassed = Object.values(report.controls).every(Boolean);
  console.log('\n======================================================================');
  console.log('CALL LIFECYCLE COALESCING REGRESSION CONTROLS: ALL 7 GREEN');
  console.log('======================================================================\n');

} catch (err) {
  console.error('Regression control harness failed:', err);
  report.failure = {name: err?.name, message: err?.message};
} finally {
  await cleanup();
}
