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
import { RoomServiceClient } from 'livekit-server-sdk';
import { ParticipantInfo_State } from '@livekit/protocol';
import type { ParticipantInfo } from '@livekit/protocol';
import * as tables from '@fg/database';
import { AppModule } from '../../../../../apps/api/src/app.module.js';
import { CallsService } from '../../../../../apps/api/src/modules/calls/calls.service.js';
import { CallLifecycleService } from '../../../../../apps/api/src/modules/calls/call-lifecycle.service.js';
import { PublishingService } from '../../../../../apps/api/src/modules/calls/publishing.service.js';
import { createSignedSessionCookie } from '../../../../../apps/api/test/test-cookie-helper.js';

function findWorkspaceRoot(startDir: string): string {
  let curr = startDir;
  for (let i = 0; i < 7; i++) {
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
  return path.resolve(startDir, '../../../../..');
}

const root = findWorkspaceRoot(path.dirname(fileURLToPath(import.meta.url)));
const authSecret = 't30-noop-write-secret-min-32-chars-long';
const origin = 'http://localhost:5173';

const originalListRooms = RoomServiceClient.prototype.listRooms;
const originalListParticipants = RoomServiceClient.prototype.listParticipants;
const originalGetParticipant = RoomServiceClient.prototype.getParticipant;
const originalUpdateParticipant = RoomServiceClient.prototype.updateParticipant;
const originalDeleteRoom = RoomServiceClient.prototype.deleteRoom;

jest.setTimeout(60000);

describe('T30 CallLifecycleService No-Op Write Integration Suite', () => {
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
  const owned = `t30_noop_corr_${schemaUuid}`;
  const cookies: Record<string, string> = {};
  const savedEnv = { ...process.env };

  let activeParticipants: ParticipantInfo[] = [];

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

    // Mock deterministic SDK presence policy
    RoomServiceClient.prototype.listRooms = async function (this: RoomServiceClient, names?: string[]) {
      if (names && names.length) {
        return names.map((name) => ({ name, creationTime: BigInt(Date.now()) } as any));
      }
      return [];
    };
    RoomServiceClient.prototype.listParticipants = async function (this: RoomServiceClient) {
      return activeParticipants;
    };
    RoomServiceClient.prototype.getParticipant = async function (this: RoomServiceClient) {
      return {} as any;
    };
    RoomServiceClient.prototype.updateParticipant = async function (this: RoomServiceClient) {
      return {} as any;
    };
    RoomServiceClient.prototype.deleteRoom = async function (this: RoomServiceClient) {
      return {} as any;
    };
  });

  afterAll(async () => {
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
        expect(owned).toMatch(/^t30_noop_corr_[a-f0-9]{32}$/);
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
    cleanup.envRestored =
      JSON.stringify(Object.entries(process.env).sort()) ===
      JSON.stringify(Object.entries(savedEnv).sort());

    RoomServiceClient.prototype.listRooms = originalListRooms;
    RoomServiceClient.prototype.listParticipants = originalListParticipants;
    RoomServiceClient.prototype.getParticipant = originalGetParticipant;
    RoomServiceClient.prototype.updateParticipant = originalUpdateParticipant;
    RoomServiceClient.prototype.deleteRoom = originalDeleteRoom;

    cleanup.prototypesRestored =
      RoomServiceClient.prototype.listRooms === originalListRooms &&
      RoomServiceClient.prototype.listParticipants === originalListParticipants &&
      RoomServiceClient.prototype.getParticipant === originalGetParticipant &&
      RoomServiceClient.prototype.updateParticipant === originalUpdateParticipant &&
      RoomServiceClient.prototype.deleteRoom === originalDeleteRoom;

    try {
      await pool?.end();
      cleanup.poolEnded = Boolean(pool && (pool as unknown as { ended?: boolean }).ended === true);
    } catch (err) {
      errors.push(err);
    }

    const cleanupFile = path.join(
      root,
      `quality/evidence/T30/antigravity-lifecycle-noop-write-correction-1/noop-write-cleanup-${schemaUuid}.json`
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
      throw new AggregateError(errors, 'Controlled noop-write test teardown failed');
    }
  });

  async function seedControlledCall() {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const convId = `conv_${randomUUID()}`;
      await db.query(
        "INSERT INTO conversations(id, kind, created_at, updated_at) VALUES($1, 'ROOM', now(), now())",
        [convId]
      );

      const roomId = `room_${randomUUID()}`;
      await db.query(
        `INSERT INTO rooms(id, name, game_id, owner_id, owner_role, visibility, invite_policy, player_capacity, conversation_id, conversation_kind, created_at, updated_at)
         VALUES($1, 'Controlled Noop Room', $2, 'owner', 'OWNER', 'PUBLIC', 'DIRECT_MEMBER', 10, $3, 'ROOM', now(), now())`,
        [roomId, valorantGame.id, convId]
      );

      await db.query(
        "INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, 'owner', 'OWNER', now()), ($3, $2, 'viewer', 'MEMBER', now()), ($4, $2, 'contender', 'MEMBER', now())",
        [`rm_${randomUUID()}`, roomId, `rm_${randomUUID()}`, `rm_${randomUUID()}`]
      );

      const callId = randomUUID();
      await db.query(
        "INSERT INTO call_groups(id, room_id, state, created_at) VALUES($1, $2, 'OPEN', now())",
        [callId, roomId]
      );

      const cmId = `cm_${randomUUID()}`;
      await db.query(
        "INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at) VALUES($1, $2, $3, 'viewer', 1, false, now())",
        [cmId, callId, roomId]
      );

      const admissionId = `admission_${randomUUID()}`;
      await db.query(
        "INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, created_at) VALUES($1, $2, 'sess-viewer', now() + interval '1 day', now())",
        [admissionId, cmId]
      );

      await db.query('COMMIT');
      return { roomId, callId, cmId, admissionId };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async function captureConnectedAtUpdate(fn: () => Promise<void>): Promise<{ count: number; rowCount: number | null }> {
    let count = 0;
    let lastRowCount: number | null = null;
    const origQuery = pg.Client.prototype.query;
    pg.Client.prototype.query = function (...args: any[]) {
      const result = Reflect.apply(origQuery, this, args);
      const text = typeof args[0] === 'string' ? args[0] : (args[0]?.text ?? '');
      if (/UPDATE\s+call_admissions\s+SET\s+connected_at=/i.test(text)) {
        count++;
        if (result && typeof result.then === 'function') {
          result.then(
            (res: any) => {
              lastRowCount = typeof res?.rowCount === 'number' ? res.rowCount : null;
            },
            () => {}
          );
        }
      }
      return result;
    };
    try {
      await fn();
    } finally {
      pg.Client.prototype.query = origQuery;
    }
    return { count, rowCount: lastRowCount };
  }

  it('Fixture 1 (firstpresence): Initial presence executes connection update (rowCount === 1) and sets connected_at timestamp', async () => {
    const fixture = await seedControlledCall();
    activeParticipants = [
      {
        identity: fixture.admissionId,
        state: ParticipantInfo_State.ACTIVE,
        tracks: [],
      } as unknown as ParticipantInfo,
    ];

    const baseTime = Date.now();
    lifecycleService.setClock(() => baseTime);

    const updateCapture = await captureConnectedAtUpdate(async () => {
      await (lifecycleService as any).reconcileGroup(fixture.callId);
    });

    expect(updateCapture.count).toBe(1);
    expect(updateCapture.rowCount).toBe(1);

    const row = (
      await pool.query<{ connected_at: Date; disconnected_at: Date | null }>(
        'SELECT connected_at, disconnected_at FROM call_admissions WHERE id=$1',
        [fixture.admissionId]
      )
    ).rows[0];

    expect(row.connected_at).toBeDefined();
    expect(row.disconnected_at).toBeNull();
    expect(new Date(row.connected_at).getTime()).toBeCloseTo(baseTime, -2);
  });

  it('Fixture 2 (repeatedconnected): Expected 0 writes and unchanged ctid/xmin on already-connected row (actual current source RED must fail expectation)', async () => {
    const fixture = await seedControlledCall();
    activeParticipants = [
      {
        identity: fixture.admissionId,
        state: ParticipantInfo_State.ACTIVE,
        tracks: [],
      } as unknown as ParticipantInfo,
    ];

    const baseTime = Date.now();
    lifecycleService.setClock(() => baseTime);

    // Initial sweep to connect
    await (lifecycleService as any).reconcileGroup(fixture.callId);

    // Privately capture tuple state before second sweep
    const beforeTuple = (
      await pool.query<{ ctid: string; xmin: string; connected_at: Date }>(
        'SELECT ctid::text, xmin::text, connected_at FROM call_admissions WHERE id=$1',
        [fixture.admissionId]
      )
    ).rows[0];

    // Advance clock 5 seconds; participant remains present
    lifecycleService.setClock(() => baseTime + 5000);

    const updateCapture = await captureConnectedAtUpdate(async () => {
      await (lifecycleService as any).reconcileGroup(fixture.callId);
    });

    // Privately capture tuple state after second sweep
    const afterTuple = (
      await pool.query<{ ctid: string; xmin: string; connected_at: Date }>(
        'SELECT ctid::text, xmin::text, connected_at FROM call_admissions WHERE id=$1',
        [fixture.admissionId]
      )
    ).rows[0];

    // Expected behavior under proposed candidate:
    // On current unpatched source, this expectation fails (RED) because source returns rowCount === 1 and mutates ctid/xmin.
    expect(updateCapture.rowCount).toBe(0);
    expect(afterTuple.ctid).toBe(beforeTuple.ctid);
    expect(afterTuple.xmin).toBe(beforeTuple.xmin);
  });

  it('Fixture 3 (reconnect): Disconnected participant reconnecting writes exactly 1 row, clears disconnected_at, and retains first connected_at timestamp', async () => {
    const fixture = await seedControlledCall();

    // 1. Initial connect
    activeParticipants = [
      {
        identity: fixture.admissionId,
        state: ParticipantInfo_State.ACTIVE,
        tracks: [],
      } as unknown as ParticipantInfo,
    ];
    const baseTime = Date.now();
    lifecycleService.setClock(() => baseTime);
    await (lifecycleService as any).reconcileGroup(fixture.callId);

    const firstConnectedTime = (
      await pool.query<{ connected_at: Date }>('SELECT connected_at FROM call_admissions WHERE id=$1', [
        fixture.admissionId,
      ])
    ).rows[0].connected_at;

    // 2. Disconnect (participant absent)
    activeParticipants = [];
    lifecycleService.setClock(() => baseTime + 5000);
    await (lifecycleService as any).reconcileGroup(fixture.callId);

    const disconnectedRow = (
      await pool.query<{ disconnected_at: Date | null }>('SELECT disconnected_at FROM call_admissions WHERE id=$1', [
        fixture.admissionId,
      ])
    ).rows[0];
    expect(disconnectedRow.disconnected_at).not.toBeNull();

    // 3. Reconnect (participant returns)
    activeParticipants = [
      {
        identity: fixture.admissionId,
        state: ParticipantInfo_State.ACTIVE,
        tracks: [],
      } as unknown as ParticipantInfo,
    ];
    lifecycleService.setClock(() => baseTime + 10000);

    const updateCapture = await captureConnectedAtUpdate(async () => {
      await (lifecycleService as any).reconcileGroup(fixture.callId);
    });

    expect(updateCapture.rowCount).toBe(1);

    const reconnectedRow = (
      await pool.query<{ connected_at: Date; disconnected_at: Date | null }>(
        'SELECT connected_at, disconnected_at FROM call_admissions WHERE id=$1',
        [fixture.admissionId]
      )
    ).rows[0];

    // disconnected_at cleared
    expect(reconnectedRow.disconnected_at).toBeNull();
    // Original connected_at retained via COALESCE
    expect(new Date(reconnectedRow.connected_at).getTime()).toBe(new Date(firstConnectedTime).getTime());
  });

  it('Fixture 4 (expired/revoked): Valid native presence released when admission is revoked in database', async () => {
    const fixture = await seedControlledCall();
    activeParticipants = [
      {
        identity: fixture.admissionId,
        state: ParticipantInfo_State.ACTIVE,
        tracks: [],
      } as unknown as ParticipantInfo,
    ];

    const baseTime = Date.now();
    lifecycleService.setClock(() => baseTime);
    await (lifecycleService as any).reconcileGroup(fixture.callId);

    // Revoke admission in database
    await pool.query('UPDATE call_admissions SET revoked_at=now() WHERE id=$1', [fixture.admissionId]);

    // Sweep with native participant still present
    lifecycleService.setClock(() => baseTime + 5000);
    await (lifecycleService as any).reconcileGroup(fixture.callId);

    const memberRow = (
      await pool.query<{ left_at: Date | null }>('SELECT left_at FROM call_members WHERE id=$1', [fixture.cmId])
    ).rows[0];

    // Member released from call despite native presence
    expect(memberRow.left_at).not.toBeNull();
  });

  it('Fixture 5 (absent grace): Absent member sets disconnected_at, remains during 30s grace, released at 30s threshold, and unconnected grace honors expires_at', async () => {
    const fixture = await seedControlledCall();

    // 1. Initial connect
    activeParticipants = [
      {
        identity: fixture.admissionId,
        state: ParticipantInfo_State.ACTIVE,
        tracks: [],
      } as unknown as ParticipantInfo,
    ];
    const baseTime = Date.now();
    lifecycleService.setClock(() => baseTime);
    await (lifecycleService as any).reconcileGroup(fixture.callId);

    // 2. First absent sweep: sets disconnected_at, preserves connected_at, does NOT release
    activeParticipants = [];
    const tDisconnect = baseTime + 10000;
    lifecycleService.setClock(() => tDisconnect);
    await (lifecycleService as any).reconcileGroup(fixture.callId);

    let row = (
      await pool.query<{ connected_at: Date; disconnected_at: Date | null; left_at: Date | null }>(
        'SELECT a.connected_at, a.disconnected_at, m.left_at FROM call_admissions a JOIN call_members m ON m.id=a.call_member_id WHERE a.id=$1',
        [fixture.admissionId]
      )
    ).rows[0];

    expect(row.disconnected_at).not.toBeNull();
    expect(row.left_at).toBeNull();

    // 3. Just-before 30s grace (29 seconds later): remains in call
    lifecycleService.setClock(() => tDisconnect + 29000);
    await (lifecycleService as any).reconcileGroup(fixture.callId);

    row = (
      await pool.query<{ left_at: Date | null }>('SELECT left_at FROM call_members WHERE id=$1', [fixture.cmId])
    ).rows[0];
    expect(row.left_at).toBeNull();

    // 4. At 30s grace (30 seconds later): released from call
    lifecycleService.setClock(() => tDisconnect + 30000);
    await (lifecycleService as any).reconcileGroup(fixture.callId);

    row = (
      await pool.query<{ left_at: Date | null }>('SELECT left_at FROM call_members WHERE id=$1', [fixture.cmId])
    ).rows[0];
    expect(row.left_at).not.toBeNull();

    // 5. Unconnected admission grace: honors expires_at
    const db = await pool.connect();
    let unconnectedAdmissionId = '';
    let unconnectedCmId = '';
    try {
      unconnectedCmId = `cm_${randomUUID()}`;
      await db.query(
        "INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at) VALUES($1, $2, $3, 'contender', 2, false, now())",
        [unconnectedCmId, fixture.callId, fixture.roomId]
      );
      unconnectedAdmissionId = `admission_${randomUUID()}`;
      // expires_at is set to tDisconnect + 40000
      await db.query(
        'INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, created_at) VALUES($1, $2, $3, $4, now())',
        [unconnectedAdmissionId, unconnectedCmId, 'sess-contender', new Date(tDisconnect + 40000)]
      );
    } finally {
      db.release();
    }

    // While time < expires_at (tDisconnect + 35000): unconnected member remains
    lifecycleService.setClock(() => tDisconnect + 35000);
    await (lifecycleService as any).reconcileGroup(fixture.callId);
    let uncRow = (
      await pool.query<{ left_at: Date | null }>('SELECT left_at FROM call_members WHERE id=$1', [unconnectedCmId])
    ).rows[0];
    expect(uncRow.left_at).toBeNull();

    // When time >= expires_at (tDisconnect + 40000): unconnected member released
    lifecycleService.setClock(() => tDisconnect + 40000);
    await (lifecycleService as any).reconcileGroup(fixture.callId);
    uncRow = (
      await pool.query<{ left_at: Date | null }>('SELECT left_at FROM call_members WHERE id=$1', [unconnectedCmId])
    ).rows[0];
    expect(uncRow.left_at).not.toBeNull();
  });
});
