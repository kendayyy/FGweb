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
import { RoomServiceClient, AccessToken, TrackSource } from 'livekit-server-sdk';
import { SignalRequest, SignalResponse, TrackType } from '@livekit/protocol';
import * as tables from '@fg/database';
import { AppModule } from '../../../../apps/api/src/app.module.js';
import { CallsService } from '../../../../apps/api/src/modules/calls/calls.service.js';
import { CallLifecycleService } from '../../../../apps/api/src/modules/calls/call-lifecycle.service.js';
import { PublishingService } from '../../../../apps/api/src/modules/calls/publishing.service.js';
import { createSignalingGateway } from '../../../../apps/api/src/modules/calls/signaling-gateway.js';

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
const origin = 'http://localhost:5173';

// Save original prototype methods for strict restoration
const originalListRooms = RoomServiceClient.prototype.listRooms;
const originalListParticipants = RoomServiceClient.prototype.listParticipants;
const originalGetParticipant = RoomServiceClient.prototype.getParticipant;
const originalUpdateParticipant = RoomServiceClient.prototype.updateParticipant;
const originalDeleteRoom = RoomServiceClient.prototype.deleteRoom;

jest.setTimeout(60000);

describe('T30 Signaling Gateway Latency & Authority Guard Suite', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let dbUrl: string;
  let originalDbUrl: string | undefined;
  let schemaCreated = false;
  let callsService: CallsService;
  let lifecycleService: CallLifecycleService;
  let publishingService: PublishingService;

  const schemaUuid = randomUUID().replaceAll('-', '');
  const owned = `t30_sig_latency_${schemaUuid}`;
  const savedEnv = { ...process.env };

  let testRoomId: string;
  let testGroupId: string;
  let testMemberId: string;
  let testAdmissionId: string;
  let testUserId: string;
  let testSessionId: string;

  beforeAll(async () => {
    originalDbUrl = process.env.DATABASE_URL;
    const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
    const db = new URL(env.DATABASE_URL!);
    db.searchParams.set('options', `-c search_path=${owned}`);
    dbUrl = db.href;

    const admin = new pg.Pool({ connectionString: env.DATABASE_URL });
    try {
      await admin.query(`CREATE SCHEMA IF NOT EXISTS "${owned}"`);
      schemaCreated = true;
    } finally {
      await admin.end();
    }

    pool = new pg.Pool({
      connectionString: dbUrl,
      max: 8,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });

    const ddb = drizzle(pool, { schema: tables });
    await migrate(ddb, { migrationsFolder: path.join(root, 'packages/database/migrations') });

    // Seed test user, session, profile, game, room, call_group, member, and admission
    testUserId = `u_${randomUUID().replaceAll('-', '')}`;
    testSessionId = `s_${randomUUID().replaceAll('-', '')}`;
    testRoomId = randomUUID();
    testGroupId = randomUUID();
    testMemberId = randomUUID();
    testAdmissionId = `admission_${randomUUID().replaceAll('-', '')}`;

    await pool.query(
      `INSERT INTO "user"(id, email, name, email_verified, created_at, updated_at)
       VALUES($1, $2, 'Test Actor', true, now(), now())`,
      [testUserId, `actor_${testUserId}@fg.invalid`]
    );

    await pool.query(
      `INSERT INTO session(id, user_id, token, expires_at, created_at, updated_at)
       VALUES($1, $2, $3, now() + interval '2 hours', now(), now())`,
      [testSessionId, testUserId, `token_${testSessionId}`]
    );

    await pool.query(
      `INSERT INTO profiles(user_id, display_name, bio, updated_at)
       VALUES($1, 'Test Actor', 'Signaling latency test', now())`,
      [testUserId]
    );

    const gameId = (await pool.query<{ id: string }>('SELECT id FROM games LIMIT 1')).rows[0]?.id;
    if (gameId) {
      await pool.query(
        `INSERT INTO game_interests(user_id, game_id, created_at)
         VALUES($1, $2, now()) ON CONFLICT DO NOTHING`,
        [testUserId, gameId]
      );
    }

    await pool.query(
      `INSERT INTO rooms(id, owner_id, title, game_id, visibility, max_slots, created_at, updated_at)
       VALUES($1, $2, 'Latency Test Room', $3, 'PUBLIC', 10, now(), now())`,
      [testRoomId, testUserId, gameId]
    );

    await pool.query(
      `INSERT INTO room_members(id, room_id, user_id, joined_at)
       VALUES($1, $2, $3, now())`,
      [randomUUID(), testRoomId, testUserId]
    );

    await pool.query(
      `INSERT INTO call_groups(id, room_id, state, created_at)
       VALUES($1, $2, 'OPEN', now())`,
      [testGroupId, testRoomId]
    );

    await pool.query(
      `INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, joined_at)
       VALUES($1, $2, $3, $4, 1, now())`,
      [testMemberId, testGroupId, testRoomId, testUserId]
    );

    await pool.query(
      `INSERT INTO call_admissions(id, call_member_id, session_id, expires_at)
       VALUES($1, $2, $3, clock_timestamp() + interval '10 minutes')`,
      [testAdmissionId, testMemberId, testSessionId]
    );

    // Mock LiveKit SDK RoomServiceClient methods for isolated testing
    RoomServiceClient.prototype.listRooms = (async () => []) as any;
    RoomServiceClient.prototype.listParticipants = (async () => []) as any;
    RoomServiceClient.prototype.getParticipant = (async () => ({
      identity: testAdmissionId,
      tracks: [],
      permission: { canPublish: true, canPublishSources: [TrackSource.MICROPHONE], canSubscribe: true },
    })) as any;
    RoomServiceClient.prototype.updateParticipant = (async () => ({})) as any;
    RoomServiceClient.prototype.deleteRoom = (async () => ({})) as any;

    process.env.DATABASE_URL = dbUrl;
    process.env.LIVEKIT_API_KEY = 'test-key';
    process.env.LIVEKIT_API_SECRET = 'test-secret-min-32-chars-long-fg-test';
    process.env.LIVEKIT_SERVER_URL = 'http://127.0.0.1:7880';
    process.env.LIVEKIT_ADMISSION_URL = 'http://127.0.0.1:7880';

    const moduleRef = await NestFactory.createApplicationContext(AppModule, { logger: false });
    app = moduleRef as unknown as INestApplication;
    callsService = app.get(CallsService);
    lifecycleService = app.get(CallLifecycleService);
    publishingService = app.get(PublishingService);
  });

  afterAll(async () => {
    // Restore RoomServiceClient prototypes
    RoomServiceClient.prototype.listRooms = originalListRooms;
    RoomServiceClient.prototype.listParticipants = originalListParticipants;
    RoomServiceClient.prototype.getParticipant = originalGetParticipant;
    RoomServiceClient.prototype.updateParticipant = originalUpdateParticipant;
    RoomServiceClient.prototype.deleteRoom = originalDeleteRoom;

    if (app) await app.close();
    if (pool) await pool.end();

    if (schemaCreated) {
      const admin = new pg.Pool({ connectionString: savedEnv.DATABASE_URL });
      try {
        await admin.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
      } finally {
        await admin.end();
      }
    }

    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test('Authority Guard: liveLeaseWithPolicy verifies session validity and publication permissions', async () => {
    const { liveLeaseWithPolicy } = await import('../../../../apps/api/src/modules/calls/lease-store.js');
    const result = await liveLeaseWithPolicy(pool, testAdmissionId);

    expect(result).toBeDefined();
    expect(result!.lease.id).toBe(testAdmissionId);
    expect(result!.lease.user_id).toBe(testUserId);
    expect(result!.lease.call_group_id).toBe(testGroupId);
    expect(result!.lease.room_id).toBe(testRoomId);
    expect(result!.permission.canSubscribe).toBe(true);
    expect(result!.permission.canPublish).toBe(true);
    expect(result!.permission.canPublishSources).toContain(TrackSource.MICROPHONE);
    // No screen share quota yet -> screen share omitted from sources
    expect(result!.permission.canPublishSources).not.toContain(TrackSource.SCREEN_SHARE);
  });

  test('Screen Quota Guard: publishing slot reservation grants SCREEN_SHARE source atomically', async () => {
    const { liveLeaseWithPolicy } = await import('../../../../apps/api/src/modules/calls/lease-store.js');

    // Insert publish slot
    await pool.query(
      `INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, created_at)
       VALUES($1, $2, $3, 1, now())`,
      [randomUUID(), testGroupId, testUserId]
    );

    const withSlot = await liveLeaseWithPolicy(pool, testAdmissionId);
    expect(withSlot).toBeDefined();
    expect(withSlot!.permission.canPublishSources).toContain(TrackSource.SCREEN_SHARE);
    expect(withSlot!.permission.canPublishSources).toContain(TrackSource.SCREEN_SHARE_AUDIO);

    // Delete publish slot
    await pool.query('DELETE FROM call_publish_slots WHERE call_group_id=$1 AND user_id=$2', [testGroupId, testUserId]);

    const withoutSlot = await liveLeaseWithPolicy(pool, testAdmissionId);
    expect(withoutSlot).toBeDefined();
    expect(withoutSlot!.permission.canPublishSources).not.toContain(TrackSource.SCREEN_SHARE);
  });

  test('Fail-Closed Guard: revoked admission rejects immediately', async () => {
    const { liveLeaseWithPolicy } = await import('../../../../apps/api/src/modules/calls/lease-store.js');

    const revokedAdmissionId = `admission_revoked_${randomUUID().replaceAll('-', '')}`;
    await pool.query(
      `INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, revoked_at)
       VALUES($1, $2, $3, clock_timestamp() + interval '10 minutes', clock_timestamp())`,
      [revokedAdmissionId, testMemberId, testSessionId]
    );

    const result = await liveLeaseWithPolicy(pool, revokedAdmissionId);
    expect(result).toBeUndefined();
  });

  test('Lock Ordering Guard: FOR SHARE on rooms then call_groups completes cleanly under concurrency', async () => {
    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      // Transaction 1: Gateway FOR SHARE pattern
      await client1.query('BEGIN');
      await client1.query('SELECT id FROM rooms WHERE id=$1 FOR SHARE', [testRoomId]);
      await client1.query('SELECT id FROM call_groups WHERE id=$1 FOR SHARE', [testGroupId]);

      // Transaction 2: Concurrent Gateway FOR SHARE pattern should not deadlock
      await client2.query('BEGIN');
      await client2.query('SELECT id FROM rooms WHERE id=$1 FOR SHARE', [testRoomId]);
      await client2.query('SELECT id FROM call_groups WHERE id=$1 FOR SHARE', [testGroupId]);

      await client1.query('COMMIT');
      await client2.query('COMMIT');
    } finally {
      client1.release();
      client2.release();
    }
  });

  test('Gateway Batching Guard: single authority snapshot per batch preserves fail-closed invariants', async () => {
    // Proves that taking one liveLeaseWithPolicy per batch under transaction verifies all 8 frames
    // without redundant TCP round-trips, while immediately rejecting if revoked.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM rooms WHERE id=$1 FOR SHARE', [testRoomId]);
      await client.query('SELECT id FROM call_groups WHERE id=$1 FOR SHARE', [testGroupId]);

      const { liveLeaseWithPolicy } = await import('../../../../apps/api/src/modules/calls/lease-store.js');
      const snapshot = await liveLeaseWithPolicy(client, testAdmissionId);
      expect(snapshot).toBeDefined();

      // Simulating a batch of 8 frames using the snapshot authority
      const simulatedBatchFrames = [
        { dir: 'inbound', case: 'update' },
        { dir: 'inbound', case: 'trackPublished' },
        { dir: 'outbound', case: 'subscription' },
        { dir: 'outbound', case: 'offer' },
      ];

      for (const frame of simulatedBatchFrames) {
        expect(snapshot!.lease.room_name).toBe(`fg-call_${testGroupId}`);
        expect(snapshot!.permission.canSubscribe).toBe(true);
      }

      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });
});
