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
import { ParticipantInfo_State, type ParticipantInfo } from '@livekit/protocol';
import * as tables from '@fg/database';
import { AppModule } from '../../../../apps/api/src/app.module.js';
import { CallsService } from '../../../../apps/api/src/modules/calls/calls.service.js';
import { CallLifecycleService } from '../../../../apps/api/src/modules/calls/call-lifecycle.service.js';
import { PublishingService } from '../../../../apps/api/src/modules/calls/publishing.service.js';
import * as leaseStore from '../../../../apps/api/src/modules/calls/lease-store.js';
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
const authSecret = 't30-pub-fresh-policy-cookie-min-32-chars';
const origin = 'http://localhost:5173';

const originalUpdateParticipant = RoomServiceClient.prototype.updateParticipant;
const originalGetParticipant = RoomServiceClient.prototype.getParticipant;

interface ObservedNativeUpdate {
  roomName: string;
  identity: string;
  permission: {
    canSubscribe?: boolean;
    canPublish?: boolean;
    canPublishSources?: TrackSource[];
    canPublishData?: boolean;
    canUpdateMetadata?: boolean;
  };
}

let observedUpdates: ObservedNativeUpdate[] = [];

/**
 * Non-intrusive query counter preserving exact original callback/promise semantics
 * without inspecting, parsing, or logging SQL, parameters, or result payloads.
 */
async function countClientQueries<T>(
  client: pg.PoolClient,
  action: () => Promise<T>
): Promise<{ result: T; count: number; delegateRestored: boolean }> {
  let count = 0;
  const hasOwn = Object.prototype.hasOwnProperty.call(client, 'query');
  const originalDesc = Object.getOwnPropertyDescriptor(client, 'query');
  const originalMethod = client.query;

  const spy = function (this: unknown, ...args: unknown[]) {
    count++;
    return (originalMethod as (...a: unknown[]) => unknown).apply(this, args);
  };

  Object.defineProperty(client, 'query', {
    value: spy,
    writable: true,
    configurable: true,
    enumerable: originalDesc?.enumerable ?? true,
  });

  let delegateRestored = false;
  try {
    const result = await action();
    if (hasOwn && originalDesc) {
      Object.defineProperty(client, 'query', originalDesc);
    } else {
      delete (client as Partial<pg.PoolClient>).query;
    }
    delegateRestored = client.query === originalMethod;
    return { result, count, delegateRestored };
  } finally {
    if (hasOwn && originalDesc) {
      Object.defineProperty(client, 'query', originalDesc);
    } else {
      delete (client as Partial<pg.PoolClient>).query;
    }
    delegateRestored = client.query === originalMethod;
  }
}

jest.setTimeout(60000);

describe('T30 Publishing Fresh Policy Combined Query & Behavioral Parity Suite', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let dbUrl: string;
  let originalDbUrl: string | undefined;
  let valorantGame: { id: string; title: string };
  let schemaCreated = false;
  let callsService: CallsService;
  let publishingService: PublishingService;
  let lifecycleService: CallLifecycleService;

  const schemaUuid = randomUUID().replaceAll('-', '');
  const owned = `t30_pub_fresh_${schemaUuid}`;
  const cookies: Record<string, string> = {};
  const savedEnv = { ...process.env };

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

    for (const id of ['owner', 'peer1', 'peer2']) {
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
      LIVEKIT_API_KEY: 'test-api-key',
      LIVEKIT_API_SECRET: 'test-api-secret',
    });

    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false, rawBody: true });
    await app.init();

    callsService = app.get(CallsService);
    publishingService = app.get(PublishingService);
    lifecycleService = app.get(CallLifecycleService);

    // Disable background sweeps deterministically
    if ((lifecycleService as unknown as { timer?: NodeJS.Timeout }).timer) {
      clearInterval((lifecycleService as unknown as { timer: NodeJS.Timeout }).timer);
      (lifecycleService as unknown as { timer?: NodeJS.Timeout }).timer = undefined;
    }
    callsService.setAfterLeave(undefined);

    // Mock native RoomServiceClient methods to observe updates without live SFU
    RoomServiceClient.prototype.updateParticipant = async function (
      roomName: string,
      identity: string,
      data: { permission?: any }
    ) {
      observedUpdates.push({ roomName, identity, permission: data?.permission });
      return {} as any;
    };

    RoomServiceClient.prototype.getParticipant = async function (roomName: string, identity: string) {
      return {
        identity,
        state: ParticipantInfo_State.ACTIVE,
        tracks: [],
        permission: {
          canSubscribe: true,
          canPublish: false,
          canPublishSources: [],
          canPublishData: false,
          canUpdateMetadata: false,
        },
      } as any;
    };
  });

  afterAll(async () => {
    RoomServiceClient.prototype.updateParticipant = originalUpdateParticipant;
    RoomServiceClient.prototype.getParticipant = originalGetParticipant;

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
        expect(owned).toMatch(/^t30_pub_fresh_[a-f0-9]{32}$/);
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
    cleanup.envRestored = JSON.stringify(Object.entries(process.env).sort()) === JSON.stringify(Object.entries(savedEnv).sort());

    cleanup.prototypesRestored =
      RoomServiceClient.prototype.updateParticipant === originalUpdateParticipant &&
      RoomServiceClient.prototype.getParticipant === originalGetParticipant;

    try {
      await pool?.end();
      cleanup.poolEnded = Boolean(pool && (pool as unknown as { ended?: boolean }).ended === true);
    } catch (err) {
      errors.push(err);
    }

    const cleanupFile = path.join(
      root,
      `quality/evidence/T30/pub-fresh-policy-cleanup-${schemaUuid}.json`
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

    for(const key of ['schemaRemoved','poolEnded','prototypesRestored','envRestored','appClosed'] as const) expect(cleanup[key]).toBe(true);
    if (errors.length) throw new AggregateError(errors, 'Publishing fresh policy teardown failed');
  });

  beforeEach(async () => {
    observedUpdates = [];
    await pool.query('DELETE FROM rooms');
    await pool.query("DELETE FROM conversations WHERE kind='ROOM'");
    await pool.query("UPDATE session SET expires_at=now()+interval '1 day'");
  });

  interface CallerFixture {
    roomId: string;
    callId: string;
    ownerId: string;
    peer1: { userId: string; cmId: string; admissionId: string; sessionId: string };
    peer2: { userId: string; cmId: string; admissionId: string; sessionId: string };
  }

  async function seedFixture(client: pg.PoolClient): Promise<CallerFixture> {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    try {
      const convId = `conv_${randomUUID()}`;
      await client.query("INSERT INTO conversations(id, kind, created_at, updated_at) VALUES($1, 'ROOM', now(), now())", [convId]);

      const roomId = `room_${randomUUID()}`;
      await client.query(
        `INSERT INTO rooms(id, name, game_id, owner_id, owner_role, visibility, invite_policy, player_capacity, conversation_id, conversation_kind, created_at, updated_at)
         VALUES($1, 'Fresh Policy Test Room', $2, 'owner', 'OWNER', 'PUBLIC', 'DIRECT_MEMBER', 10, $3, 'ROOM', now(), now())`,
        [roomId, valorantGame.id, convId]
      );

      await client.query(
        `INSERT INTO room_members(id, room_id, user_id, role, joined_at)
         VALUES($1, $2, 'owner', 'OWNER', now()), ($3, $2, 'peer1', 'MEMBER', now()), ($4, $2, 'peer2', 'MEMBER', now())`,
        [`rm_${randomUUID()}`, roomId, `rm_${randomUUID()}`, `rm_${randomUUID()}`]
      );

      const callId = randomUUID();
      await client.query("INSERT INTO call_groups(id, room_id, state, created_at) VALUES($1, $2, 'OPEN', now())", [callId, roomId]);

      const createParticipant = async (userId: string, seat: number) => {
        const cmId = `cm_${randomUUID()}`;
        await client.query(
          'INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at) VALUES($1, $2, $3, $4, $5, false, now())',
          [cmId, callId, roomId, userId, seat]
        );
        const admissionId = `admission_${randomUUID()}`;
        await client.query(
          "INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, created_at) VALUES($1, $2, $3, now() + interval '1 day', now())",
          [admissionId, cmId, `sess-${userId}`]
        );
        return { userId, cmId, admissionId, sessionId: `sess-${userId}` };
      };

      const peer1 = await createParticipant('peer1', 1);
      const peer2 = await createParticipant('peer2', 2);

      await client.query('COMMIT');
      await client.query('BEGIN');
      await client.query("SET LOCAL TIME ZONE 'UTC'");
      await client.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[roomId]);
      await client.query('SELECT id FROM call_groups WHERE id=$1 FOR UPDATE',[callId]);
      return { roomId, callId, ownerId: 'owner', peer1, peer2 };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  describe('Control Tests: Parity and Baseline Invariants', () => {
    it('Control-1: existing syncNativePermissions callers remain functional with unchanged get/error behavior', async () => {
      const client = await pool.connect();
      try {
        const fixture = await seedFixture(client);
        const lease = (await leaseStore.liveLease(client, fixture.peer1.admissionId))!;
        expect(lease).toBeDefined();

        const returnedPeer = await callsService.syncNativePermissions(client, lease);
        expect(returnedPeer).toBeDefined();
        expect(returnedPeer?.identity).toBe(fixture.peer1.admissionId);

        // Verification of native update with baseline microphone permission
        expect(observedUpdates.length).toBe(1);
        expect(observedUpdates[0].identity).toBe(fixture.peer1.admissionId);
        expect(observedUpdates[0].permission.canPublish).toBe(true);
        expect(observedUpdates[0].permission.canPublishSources).toEqual([TrackSource.MICROPHONE]);
      } finally {
        await client.query('ROLLBACK');client.release();
      }
    });

    it('Control-2: verifies all six original policy combinations and exact updates', async () => {
      const client = await pool.connect();
      try {
        const fixture = await seedFixture(client);
        const peerInfo: ParticipantInfo = {
          identity: fixture.peer1.admissionId,
          state: ParticipantInfo_State.ACTIVE,
          tracks: [],
          permission: {
            canSubscribe: true,
            canPublish: false,
            canPublishSources: [],
            canPublishData: false,
            canUpdateMetadata: false,
          },
        } as any;

        const configurePolicy = async (micBlocked: boolean, screenBlocked: boolean, reserved: boolean) => {
          await client.query('DELETE FROM call_restrictions WHERE call_group_id=$1 AND target_user_id=$2', [
            fixture.callId,
            fixture.peer1.userId,
          ]);
          await client.query('DELETE FROM call_publish_slots WHERE call_group_id=$1 AND user_id=$2', [
            fixture.callId,
            fixture.peer1.userId,
          ]);
          if (micBlocked) {
            await client.query(
              "INSERT INTO call_restrictions(id, call_group_id, target_user_id, restriction_type, issued_by, created_at) VALUES($1, $2, $3, 'MIC_MUTED', $4, now())",
              [`cr_${randomUUID()}`, fixture.callId, fixture.peer1.userId, fixture.ownerId]
            );
          }
          if (screenBlocked) {
            await client.query(
              "INSERT INTO call_restrictions(id, call_group_id, target_user_id, restriction_type, issued_by, created_at) VALUES($1, $2, $3, 'STREAM_BLOCKED', $4, now())",
              [`cr_${randomUUID()}`, fixture.callId, fixture.peer1.userId, fixture.ownerId]
            );
          }
          if (reserved) {
            await client.query(
              'INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, created_at) VALUES($1, $2, $3, 1, now())',
              [`cps_${randomUUID()}`, fixture.callId, fixture.peer1.userId]
            );
          }
        };

        const testCombination = async (
          micBlocked: boolean,
          screenBlocked: boolean,
          reserved: boolean,
          expectedSources: TrackSource[],
          expectedCanPublish: boolean
        ) => {
          observedUpdates = [];
          await configurePolicy(micBlocked, screenBlocked, reserved);

          peerInfo.permission!.canPublishData=true;
          peerInfo.permission!.canUpdateMetadata=true;
          peerInfo.permission!.canSubscribe=false;
          // Invoke reconcileWithin with peer
          await publishingService.reconcileWithin(client, fixture.callId, [peerInfo], new Date());

          expect(observedUpdates.length).toBe(1);
          expect(observedUpdates[0].identity).toBe(fixture.peer1.admissionId);
          expect(observedUpdates[0].permission.canPublish).toBe(expectedCanPublish);
          expect(observedUpdates[0].permission).toEqual({canSubscribe:true,canPublish:expectedCanPublish,canPublishSources:expectedSources,canPublishData:false,canUpdateMetadata:false});
        };

        // 1. freeMIC: mic unblocked, screen blocked, no slot -> [MICROPHONE]
        await testCombination(false, true, false, [TrackSource.MICROPHONE], true);

        // 2. noSlot: mic unblocked, screen unblocked, no slot -> [MICROPHONE]
        await testCombination(false, false, false, [TrackSource.MICROPHONE], true);

        // 3. MICmuted: mic blocked, screen unblocked, slot reserved -> [SCREEN_SHARE]
        await testCombination(true, false, true, [TrackSource.SCREEN_SHARE], true);

        // 4. screenblocked: mic unblocked, screen blocked, slot reserved -> [MICROPHONE]
        await testCombination(false, true, true, [TrackSource.MICROPHONE], true);

        // 5. slotreserved: mic unblocked, screen unblocked, slot reserved -> [MICROPHONE, SCREEN_SHARE, SCREEN_SHARE_AUDIO]
        await testCombination(
          false,
          false,
          true,
          [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
          true
        );

        // 6. bothblocked: mic blocked, screen blocked, slot reserved -> []
        await testCombination(true, true, true, [], false);
      } finally {
        await client.query('ROLLBACK');client.release();
      }
    });

    it('Control-3: slot deleted by actual reconcile immediately reflects new policy in peer update', async () => {
      const client = await pool.connect();
      try {
        const fixture = await seedFixture(client);

        // Reserve screen slot in DB
        await client.query(
          "INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, created_at) VALUES($1, $2, $3, 1, now() - interval '35 seconds')",
          [`cps_${randomUUID()}`, fixture.callId, fixture.peer1.userId]
        );

        // Peer has no screen track in native presence
        const peerInfo: ParticipantInfo = {
          identity: fixture.peer1.admissionId,
          state: ParticipantInfo_State.ACTIVE,
          tracks: [], // No SCREEN_SHARE track
          permission: {
            canSubscribe: true,
            canPublish: true,
            canPublishSources: [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE],
            canPublishData: false,
            canUpdateMetadata: false,
          },
        } as any;

        observedUpdates = [];
        // Reconcile deletes expired unobserved slot in first loop, then evaluates peer in second loop
        await publishingService.reconcileWithin(client, fixture.callId, [peerInfo], new Date());

        // Verify slot was deleted from DB
        const slotsAfter = await client.query('SELECT id FROM call_publish_slots WHERE call_group_id=$1', [
          fixture.callId,
        ]);
        expect(slotsAfter.rowCount).toBe(0);

        // Verify that the native permission update immediately stripped SCREEN_SHARE
        expect(observedUpdates.length).toBe(1);
        expect(observedUpdates[0].permission.canPublishSources).toEqual([TrackSource.MICROPHONE]);
      } finally {
        await client.query('ROLLBACK');client.release();
      }
    });

    it('Control-4: repeated invocation after restriction/revocation/expiration never grants or reuses old result', async () => {
      const client = await pool.connect();
      try {
        const fixture = await seedFixture(client);
        const peerInfo: ParticipantInfo = {
          identity: fixture.peer1.admissionId,
          state: ParticipantInfo_State.ACTIVE,
          tracks: [],
          permission: {
            canSubscribe: true,
            canPublish: true,
            canPublishSources: [TrackSource.MICROPHONE],
            canPublishData: false,
            canUpdateMetadata: false,
          },
        } as any;

        // 1. Restriction inserted: microphone blocked
        await client.query(
          "INSERT INTO call_restrictions(id, call_group_id, target_user_id, restriction_type, issued_by, created_at) VALUES($1, $2, $3, 'MIC_MUTED', $4, now())",
          [`cr_${randomUUID()}`, fixture.callId, fixture.peer1.userId, fixture.ownerId]
        );
        observedUpdates = [];
        await publishingService.reconcileWithin(client, fixture.callId, [peerInfo], new Date());
        expect(observedUpdates.length).toBe(1);
        expect(observedUpdates[0].permission.canPublish).toBe(false);
        expect(observedUpdates[0].permission.canPublishSources).toEqual([]);

        // 2. Admission revoked: no update granted
        await client.query('UPDATE call_admissions SET revoked_at=now() WHERE id=$1', [
          fixture.peer1.admissionId,
        ]);
        observedUpdates = [];
        await publishingService.reconcileWithin(client, fixture.callId, [peerInfo], new Date());
        expect(observedUpdates.length).toBe(0);

        // 3. Admission unrevoked but session expired: no update granted
        await client.query('UPDATE call_admissions SET revoked_at=NULL WHERE id=$1', [
          fixture.peer1.admissionId,
        ]);
        await client.query("UPDATE \"session\" SET expires_at=now()-interval '10 seconds' WHERE id=$1", [
          fixture.peer1.sessionId,
        ]);
        observedUpdates = [];
        await publishingService.reconcileWithin(client, fixture.callId, [peerInfo], new Date());
        expect(observedUpdates.length).toBe(0);
      } finally {
        await client.query('ROLLBACK');client.release();
      }
    });

    it('Control-5: supports distinct users across distinct connection clients and pools', async () => {
      const client1 = await pool.connect();
      const secondPool = new pg.Pool({connectionString:dbUrl,max:1,connectionTimeoutMillis:5000,statement_timeout:15000});
      const client2 = await secondPool.connect();
      try {
        const fixture = await seedFixture(client1);

        const peer1Info: ParticipantInfo = {
          identity: fixture.peer1.admissionId,
          state: ParticipantInfo_State.ACTIVE,
          tracks: [],
          permission: { canSubscribe: true, canPublish: false, canPublishSources: [] } as any,
        } as any;

        const peer2Info: ParticipantInfo = {
          identity: fixture.peer2.admissionId,
          state: ParticipantInfo_State.ACTIVE,
          tracks: [],
          permission: { canSubscribe: true, canPublish: false, canPublishSources: [] } as any,
        } as any;

        observedUpdates = [];
        await publishingService.reconcileWithin(client1, fixture.callId, [peer1Info], new Date());
        expect(observedUpdates.length).toBe(1);
        expect(observedUpdates[0].identity).toBe(fixture.peer1.admissionId);

        // Commit own fixture, then acquire the same canonical locks on a distinct pool.
        await client1.query('COMMIT');
        await client2.query('BEGIN');
        await client2.query("SET LOCAL TIME ZONE 'UTC'");
        await client2.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE',[fixture.roomId]);
        await client2.query('SELECT id FROM call_groups WHERE id=$1 FOR UPDATE',[fixture.callId]);
        observedUpdates = [];
        await publishingService.reconcileWithin(client2, fixture.callId, [peer2Info], new Date());
        expect(observedUpdates.length).toBe(1);
        expect(observedUpdates[0].identity).toBe(fixture.peer2.admissionId);
      } finally {
        await client1.query('ROLLBACK');client1.release();
        await client2.query('ROLLBACK');client2.release();
        await secondPool.end();expect((secondPool as unknown as {ended:boolean}).ended).toBe(true);
      }
    });
  });

  describe('RED Tests: Candidate Combined Query Contract vs Current Original Double-Query', () => {
    it('RED-2: reconcileWithin executes exactly ONE combined fresh query per peer under lock (vs 2 sequential queries in original source)', async () => {
      const client = await pool.connect();
      try {
        const fixture = await seedFixture(client);

        // Ensure call_publish_slots has 0 rows for this call
        await client.query('DELETE FROM call_publish_slots WHERE call_group_id=$1', [fixture.callId]);

        const peerInfo: ParticipantInfo = {
          identity: fixture.peer1.admissionId,
          state: ParticipantInfo_State.ACTIVE,
          tracks: [],
          permission: {
            canSubscribe: true,
            canPublish: true,
            canPublishSources: [TrackSource.MICROPHONE],
            canPublishData: false,
            canUpdateMetadata: false,
          },
        } as any;

        // Count queries executed during reconcileWithin for 1 participant peer:
        // Expected with proposed single-query syncLiveNativePermissions:
        //   Query 1: SELECT FROM call_publish_slots WHERE call_group_id=$1
        //   Query 2: SELECT FROM call_admissions ... (single combined liveLeaseWithPolicy query for peer)
        //   Total: 2 queries
        // On current unmodified source:
        //   Query 1: SELECT FROM call_publish_slots WHERE call_group_id=$1
        //   Query 2: liveLease query for peer
        //   Query 3: publicationSources query for peer
        //   Total: 3 queries -> FAILS contract assertion with Received: 3
        const { count, delegateRestored } = await countClientQueries(client, async () => {
          await publishingService.reconcileWithin(client, fixture.callId, [peerInfo], new Date());
        });

        expect(delegateRestored).toBe(true);
        expect(count).toBe(2);
      } finally {
        await client.query('ROLLBACK');client.release();
      }
    });

    it('RED-3: reconcileWithin per-peer query overhead strictly equals 1 query per participant across multi-peer batch', async () => {
      const client = await pool.connect();
      try {
        const fixture = await seedFixture(client);
        await client.query('DELETE FROM call_publish_slots WHERE call_group_id=$1', [fixture.callId]);

        const peers: ParticipantInfo[] = [
          {
            identity: fixture.peer1.admissionId,
            state: ParticipantInfo_State.ACTIVE,
            tracks: [],
            permission: { canSubscribe: true, canPublish: true, canPublishSources: [TrackSource.MICROPHONE] } as any,
          } as any,
          {
            identity: fixture.peer2.admissionId,
            state: ParticipantInfo_State.ACTIVE,
            tracks: [],
            permission: { canSubscribe: true, canPublish: true, canPublishSources: [TrackSource.MICROPHONE] } as any,
          } as any,
        ];

        // For 2 peers:
        // Proposed candidate: 1 (slots) + 2 * 1 (per peer) = 3 total queries.
        // Current unmodified source: 1 (slots) + 2 * 2 (per peer) = 5 total queries.
        // Net per-peer queries = (total - 1) / peers.length = 1.
        const { count, delegateRestored } = await countClientQueries(client, async () => {
          await publishingService.reconcileWithin(client, fixture.callId, peers, new Date());
        });

        expect(delegateRestored).toBe(true);
        const perPeerQueries = (count - 1) / peers.length;
        expect(perPeerQueries).toBe(1);
      } finally {
        await client.query('ROLLBACK');client.release();
      }
    });
  });

  describe('Original SDK semantics and fresh authority between peers',()=>{
    const peer=(identity:string)=>({identity,state:ParticipantInfo_State.ACTIVE,tracks:[],permission:{canSubscribe:true,canPublish:false,canPublishSources:[],canPublishData:true,canUpdateMetadata:true}} as unknown as ParticipantInfo);
    it('matching current policy returns the exact known peer without SDK lookup or update',async()=>{
      const client=await pool.connect(),savedGet=RoomServiceClient.prototype.getParticipant;
      try{
        const fixture=await seedFixture(client),known=peer(fixture.peer1.admissionId);
        known.permission={canSubscribe:true,canPublish:true,canPublishSources:[TrackSource.MICROPHONE],canPublishData:false,canUpdateMetadata:false} as ParticipantInfo['permission'];
        RoomServiceClient.prototype.getParticipant=async()=>{throw new Error('Known peer lookup must not occur');};
        expect(await callsService.syncLiveNativePermissions(client,known)).toBe(known);
        expect(observedUpdates).toHaveLength(0);
      }finally{RoomServiceClient.prototype.getParticipant=savedGet;await client.query('ROLLBACK');client.release();}
    });
    it('native update rejection preserves the exact original error identity',async()=>{
      const client=await pool.connect(),savedUpdate=RoomServiceClient.prototype.updateParticipant;
      try{
        const fixture=await seedFixture(client),error=new Error('Controlled native update rejection');
        RoomServiceClient.prototype.updateParticipant=async()=>{throw error;};
        await expect(callsService.syncLiveNativePermissions(client,peer(fixture.peer1.admissionId))).rejects.toBe(error);
      }finally{RoomServiceClient.prototype.updateParticipant=savedUpdate;await client.query('ROLLBACK');client.release();}
    });
    it('original sync lookup retains benign not_found and exact other rejection identity',async()=>{
      const client=await pool.connect(),savedGet=RoomServiceClient.prototype.getParticipant;
      try{
        const fixture=await seedFixture(client),lease=(await leaseStore.liveLease(client,fixture.peer1.admissionId))!;
        RoomServiceClient.prototype.getParticipant=async()=>{throw Object.assign(new Error('Controlled gone'),{code:'not_found'});};
        expect(await callsService.syncNativePermissions(client,lease)).toBeUndefined();
        const error=new Error('Controlled lookup rejection');RoomServiceClient.prototype.getParticipant=async()=>{throw error;};
        await expect(callsService.syncNativePermissions(client,lease)).rejects.toBe(error);
        expect(observedUpdates).toHaveLength(0);
      }finally{RoomServiceClient.prototype.getParticipant=savedGet;await client.query('ROLLBACK');client.release();}
    });
    it('next peer freshly observes session expiry after the previous awaited native update',async()=>{
      const client=await pool.connect(),savedUpdate=RoomServiceClient.prototype.updateParticipant;
      try{
        const fixture=await seedFixture(client),peers=[peer(fixture.peer1.admissionId),peer(fixture.peer2.admissionId)];
        RoomServiceClient.prototype.updateParticipant=async function(...args){
          const result=await savedUpdate.apply(this,args);
          await client.query("UPDATE session SET expires_at=now()-interval '10 seconds' WHERE id=$1",[fixture.peer2.sessionId]);
          return result;
        };
        await publishingService.reconcileWithin(client,fixture.callId,peers,new Date());
        expect(observedUpdates.map(x=>x.identity)).toEqual([fixture.peer1.admissionId]);
        expect(await leaseStore.liveLease(client,fixture.peer2.admissionId)).toBeUndefined();
      }finally{RoomServiceClient.prototype.updateParticipant=savedUpdate;await client.query('ROLLBACK');client.release();}
    });
  });
});
