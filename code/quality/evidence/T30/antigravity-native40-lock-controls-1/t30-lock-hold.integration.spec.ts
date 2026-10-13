import 'reflect-metadata';
import { jest } from '@jest/globals';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { ParticipantInfo_State } from '@livekit/protocol';
import * as tables from '@fg/database';
import { AppModule } from '../../../../apps/api/src/app.module.js';
import { CallsService } from '../../../../apps/api/src/modules/calls/calls.service.js';
import { CallLifecycleService } from '../../../../apps/api/src/modules/calls/call-lifecycle.service.js';
import { PublishingService } from '../../../../apps/api/src/modules/calls/publishing.service.js';
import { createSignedSessionCookie } from '../../../../apps/api/test/test-cookie-helper.js';

function findWorkspaceRoot(startDir: string): string {
  let curr = startDir;
  for (let i = 0; i < 6; i++) {
    if (
      fs.existsSync(path.join(curr, '.env.local')) ||
      fs.existsSync(path.join(curr, 'packages/database/migrations'))
    ) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(startDir, '../../../..');
}

const root = findWorkspaceRoot(path.dirname(fileURLToPath(import.meta.url)));
const authSecret = 't30-lock-hold-cookie-secret-min-32-chars';
const origin = 'http://localhost:5173';

// Save prototype methods for strict restoration
const originalListRooms = RoomServiceClient.prototype.listRooms;
const originalListParticipants = RoomServiceClient.prototype.listParticipants;
const originalGetParticipant = RoomServiceClient.prototype.getParticipant;
const originalUpdateParticipant = RoomServiceClient.prototype.updateParticipant;
const originalDeleteRoom = RoomServiceClient.prototype.deleteRoom;

jest.setTimeout(60000);

describe('T30 Controlled Lock-Hold & Statement Timeout Integration Suite', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let dbUrl: string;
  let originalDbUrl: string | undefined;
  let valorantGame: { id: string; title: string };
  let schemaCreated = false;
  let lifecycleService: CallLifecycleService;
  let callsService: CallsService;
  let publishingService: PublishingService;

  const schemaUuid = randomUUID().replaceAll('-', '');
  const owned = `t30_lock_hold_${schemaUuid}`;
  const cookies: Record<string, string> = {};
  const savedEnv = { ...process.env };

  let activeBarrierRelease: (() => void) | null = null;

  beforeAll(async () => {
    originalDbUrl = process.env.DATABASE_URL;
    const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
    const db = new URL(env.DATABASE_URL!);
    db.searchParams.set('options', `-c search_path=${owned}`);
    dbUrl = db.href;

    pool = new pg.Pool({
      connectionString: dbUrl,
      max: 16,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
    });

    await pool.query(`CREATE SCHEMA "${owned}"`);
    schemaCreated = true;

    await migrate(drizzle(pool), {
      migrationsFolder: path.join(root, 'packages/database/migrations'),
      migrationsSchema: owned,
    });

    await tables.seedGames(drizzle(pool, { schema: tables }));
    const games = (await pool.query<{ id: string; title: string }>('SELECT id, title FROM games')).rows;
    const val = games.find((g) => g.title === 'Valorant');
    if (!val) throw new Error('Valorant game required');
    valorantGame = val;

    for (const id of ['owner', 'viewer', 'contender']) {
      await pool.query(
        'INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES($1, $1, $2, true, now(), now())',
        [id, `${id}@fixture.invalid`]
      );
      await pool.query('INSERT INTO profiles(user_id, display_name) VALUES($1, $1)', [id]);
      await pool.query('INSERT INTO game_interests(id, user_id, game_id) VALUES($1, $1, $2)', [id, valorantGame.id]);
      cookies[id] = await createSignedSessionCookie(authSecret, `tok-${id}`);
      await pool.query(
        "INSERT INTO session(id, user_id, token, expires_at, created_at, updated_at) VALUES($1, $2, $3, now() + interval '1 day', now(), now())",
        [`sess-${id}`, id, `tok-${id}`]
      );
    }

    Object.assign(process.env, env, {
      DATABASE_URL: dbUrl,
      PUBLIC_ORIGIN: origin,
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: authSecret,
      LIVEKIT_SERVER_URL: 'http://127.0.0.1:7880',
      LIVEKIT_ADMISSION_URL: 'ws://127.0.0.1:7880',
      LIVEKIT_API_KEY: 'controlled-test-key',
      LIVEKIT_API_SECRET: 'controlled-test-secret',
    });

    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false, rawBody: true });
    await app.init();

    lifecycleService = app.get(CallLifecycleService);
    callsService = app.get(CallsService);
    publishingService = app.get(PublishingService);

    // Deterministically disable background sweep intervals and callbacks
    if ((lifecycleService as unknown as { timer?: NodeJS.Timeout }).timer) {
      clearInterval((lifecycleService as unknown as { timer: NodeJS.Timeout }).timer);
      (lifecycleService as unknown as { timer?: NodeJS.Timeout }).timer = undefined;
    }
    callsService.setAfterLeave(undefined);
  });

  afterAll(async () => {
    // Restore monkeypatched prototypes immediately
    RoomServiceClient.prototype.listRooms = originalListRooms;
    RoomServiceClient.prototype.listParticipants = originalListParticipants;
    RoomServiceClient.prototype.getParticipant = originalGetParticipant;
    RoomServiceClient.prototype.updateParticipant = originalUpdateParticipant;
    RoomServiceClient.prototype.deleteRoom = originalDeleteRoom;

    // Release any lingering barrier to prevent hangs
    if (activeBarrierRelease) {
      activeBarrierRelease();
      activeBarrierRelease = null;
    }

    const errors: unknown[] = [];
    const cleanup = {
      schemaRemoved: false,
      poolEnded: false,
      prototypesRestored: false,
      envRestored: false,
      appClosed: false,
    };

    try {
      await app?.close();
      cleanup.appClosed = true;
    } catch (err) {
      errors.push(err);
    }

    try {
      if (schemaCreated) {
        expect(owned).toMatch(/^t30_lock_hold_[a-f0-9]{32}$/);
        await pool.query(`DROP SCHEMA "${owned}" CASCADE`);
        cleanup.schemaRemoved =
          (await pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [owned])).rowCount === 0;
        expect(cleanup.schemaRemoved).toBe(true);
      }
    } catch (err) {
      errors.push(err);
    }

    if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl;
    else delete process.env.DATABASE_URL;
    process.env = savedEnv;
    cleanup.envRestored = process.env.DATABASE_URL === originalDbUrl;

    cleanup.prototypesRestored =
      RoomServiceClient.prototype.listRooms === originalListRooms &&
      RoomServiceClient.prototype.listParticipants === originalListParticipants;

    try {
      await pool?.end();
      cleanup.poolEnded = Boolean(pool && (pool as unknown as { ended?: boolean }).ended === true);
    } catch (err) {
      errors.push(err);
    }

    const cleanupFile = path.join(
      root,
      `quality/evidence/T30/lock-hold-cleanup-${schemaUuid}.json`
    );
    fs.writeFileSync(
      cleanupFile,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          ...cleanup,
          errorCount: errors.length,
        },
        null,
        2
      ) + '\n',
      { flag: 'wx' }
    );

    if (errors.length) {
      throw new AggregateError(errors, 'Controlled lock-hold test teardown failed');
    }
  });

  async function seedControlledCall() {
    const convId = `conv_${randomUUID()}`;
    await pool.query(
      "INSERT INTO conversations(id, kind, created_at, updated_at) VALUES($1, 'ROOM', now(), now())",
      [convId]
    );

    const roomId = `room_${randomUUID()}`;
    await pool.query(
      `INSERT INTO rooms(id, name, game_id, owner_id, owner_role, visibility, invite_policy, player_capacity, conversation_id, conversation_kind, created_at, updated_at)
       VALUES($1, 'Controlled Lock Room', $2, 'owner', 'OWNER', 'PUBLIC', 'DIRECT_MEMBER', 10, $3, 'ROOM', now(), now())`,
      [roomId, valorantGame.id, convId]
    );

    await pool.query(
      "INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, 'owner', 'OWNER', now()), ($3, $2, 'viewer', 'MEMBER', now()), ($4, $2, 'contender', 'MEMBER', now())",
      [`rm_${randomUUID()}`, roomId, `rm_${randomUUID()}`, `rm_${randomUUID()}`]
    );

    const callId = randomUUID();
    await pool.query(
      "INSERT INTO call_groups(id, room_id, state, created_at) VALUES($1, $2, 'OPEN', now())",
      [callId, roomId]
    );

    const cmId = `cm_${randomUUID()}`;
    await pool.query(
      "INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at) VALUES($1, $2, $3, 'viewer', 1, false, now())",
      [cmId, callId, roomId]
    );

    const admissionId = `admission_${randomUUID()}`;
    await pool.query(
      "INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, created_at) VALUES($1, $2, 'sess-viewer', now() + interval '1 day', now())",
      [admissionId, cmId]
    );

    return { roomId, callId, cmId, admissionId };
  }

  it('demonstrates structural lock-hold during native RPC await, causing statement timeout 57014 on concurrent FOR SHARE query and mapping blocked PID to lifecycle client PID', async () => {
    const fixture = await seedControlledCall();

    let barrierTriggered = false;
    let signalBarrierReached: (() => void) | null = null;
    const barrierReachedPromise = new Promise<void>((resolve) => {
      signalBarrierReached = resolve;
    });

    const barrierHoldPromise = new Promise<void>((resolve) => {
      activeBarrierRelease = resolve;
    });

    // Monkeypatch ONLY native SDK methods to create an explicit awaited barrier
    // inside reconcileGroup while under canonical room/group FOR UPDATE lock.
    RoomServiceClient.prototype.listRooms = async function (this: RoomServiceClient, names?: string[]) {
      if (names && names.includes(`fg-call_${fixture.callId}`)) {
        barrierTriggered = true;
        signalBarrierReached?.();
        // Awaited Promise barrier under open transaction lock
        await barrierHoldPromise;
        return [{ name: `fg-call_${fixture.callId}`, creationTime: BigInt(Date.now()) }] as any;
      }
      return Reflect.apply(originalListRooms, this, [names]);
    };

    RoomServiceClient.prototype.listParticipants = async function (this: RoomServiceClient, room: string) {
      if (room === `fg-call_${fixture.callId}`) {
        return [
          {
            identity: fixture.admissionId,
            state: ParticipantInfo_State.ACTIVE,
            tracks: [],
            permission: {
              canSubscribe: true,
              canPublish: true,
              canPublishSources: [TrackSource.MICROPHONE],
              canPublishData: false,
              canUpdateMetadata: false,
            },
          },
        ] as any;
      }
      return Reflect.apply(originalListParticipants, this, [room]);
    };

    // Invoke actual service reconcileGroup
    const lifecycleCaller = lifecycleService as unknown as {
      reconcileGroup: (id: string) => Promise<void>;
    };
    const reconcilePromise = lifecycleCaller.reconcileGroup(fixture.callId);

    // Wait until the service reaches the barrier under canonical transaction lock
    await barrierReachedPromise;
    expect(barrierTriggered).toBe(true);

    // Connect an independent real PostgreSQL client with statement_timeout: 3000
    const clientWaiting = new pg.Client({
      connectionString: dbUrl,
      statement_timeout: 3000,
    });
    await clientWaiting.connect();
    const waitingPid = clientWaiting.processID;
    expect(typeof waitingPid).toBe('number');

    const startTime = Date.now();
    // Concurrent query attempts FOR SHARE on the locked room row
    const waitingQueryPromise = clientWaiting.query('SELECT id FROM rooms WHERE id = $1 FOR SHARE', [fixture.roomId]);

    // Give PostgreSQL a moment to register lock wait queue
    await new Promise((r) => setTimeout(r, 200));

    // Probe client checks pg_blocking_pids without exposing raw SQL or params
    const probeClient = await pool.connect();
    let blockedPidObserved: number | null = null;
    let blockingPidObserved: number | null = null;
    let waitEventTypeObserved: string | null = null;
    let waitEventObserved: string | null = null;

    try {
      const probeResult = await probeClient.query<{
        pid: number;
        blocking_pids: number[];
        wait_event_type: string | null;
        wait_event: string | null;
      }>(
        `SELECT pid, pg_blocking_pids(pid) AS blocking_pids, wait_event_type, wait_event
         FROM pg_stat_activity
         WHERE pid = $1`,
        [waitingPid]
      );

      expect(probeResult.rows.length).toBe(1);
      const row = probeResult.rows[0];
      blockedPidObserved = row.pid;
      waitEventTypeObserved = row.wait_event_type;
      waitEventObserved = row.wait_event;

      expect(row.blocking_pids).toBeDefined();
      expect(row.blocking_pids.length).toBeGreaterThan(0);
      blockingPidObserved = row.blocking_pids[0];

      // Verifying blocked PID matches the concurrent client PID
      expect(blockedPidObserved).toBe(waitingPid);

      // Verifying lock wait event
      expect(waitEventTypeObserved).toBe('Lock');

      // Verify safe technical status of the blocking lifecycle connection without raw SQL
      const blockerStatus = await probeClient.query<{
        pid: number;
        backend_type: string;
        state: string;
      }>(
        `SELECT pid, backend_type, state
         FROM pg_stat_activity
         WHERE pid = $1`,
        [blockingPidObserved]
      );
      expect(blockerStatus.rows.length).toBe(1);
      expect(blockerStatus.rows[0].state).toBe('idle in transaction');
    } finally {
      probeClient.release();
    }

    // Await the concurrent query and assert PostgreSQL statement timeout 57014
    let statementError: { code?: string; message?: string } | null = null;
    try {
      await waitingQueryPromise;
    } catch (err: unknown) {
      statementError = err as { code?: string; message?: string };
    } finally {
      await clientWaiting.end().catch(() => {});
    }

    const elapsedMs = Date.now() - startTime;

    // Assert that PostgreSQL threw SQLSTATE 57014 due to statement_timeout: 3000
    expect(statementError).toBeDefined();
    expect(statementError?.code).toBe('57014');
    expect(statementError?.message).toMatch(/statement timeout/i);

    // Verify bounded execution timing: >= 2900ms and < 5000ms
    expect(elapsedMs).toBeGreaterThanOrEqual(2900);
    expect(elapsedMs).toBeLessThan(5000);

    // Release the barrier cleanly so reconcileGroup resumes
    if (activeBarrierRelease) {
      activeBarrierRelease();
      activeBarrierRelease = null;
    }

    // Assert that reconcileGroup finishes cleanly without unhandled rejection
    await expect(reconcilePromise).resolves.toBeUndefined();

    // Verify post-barrier database state integrity: no corruptions or false cleanup
    const roomRow = await pool.query('SELECT id FROM rooms WHERE id = $1', [fixture.roomId]);
    expect(roomRow.rowCount).toBe(1);

    const groupRow = await pool.query('SELECT state FROM call_groups WHERE id = $1', [fixture.callId]);
    expect(groupRow.rows[0]?.state).toBe('OPEN');

    const memberRow = await pool.query(
      'SELECT id FROM call_members WHERE call_group_id = $1 AND left_at IS NULL',
      [fixture.callId]
    );
    expect(memberRow.rowCount).toBe(1);

    // Record verified lock-hold observation
    const observationFile = path.join(
      root,
      `quality/evidence/T30/lock-hold-observation-${schemaUuid}.json`
    );
    fs.writeFileSync(
      observationFile,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          blockedPid: blockedPidObserved,
          blockingPid: blockingPidObserved,
          waitEventType: waitEventTypeObserved,
          waitEvent: waitEventObserved,
          sqlState: statementError?.code,
          elapsedMs,
          callState: groupRow.rows[0]?.state,
          verified: true,
        },
        null,
        2
      ) + '\n',
      { flag: 'wx' }
    );
  });
});
