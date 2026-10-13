import 'reflect-metadata';
import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as tables from '@fg/database';
import { TrackSource } from 'livekit-server-sdk';
import * as leaseStore from '../../../../apps/api/src/modules/calls/lease-store.js';

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
const schemaUuid = randomUUID().replaceAll('-', '');
const owned = `t30_frame_lease_policy_${schemaUuid}`;

let pool: pg.Pool;
let dbUrl: string;
let originalDbUrl: string | undefined;
let schemaCreated = false;
let valorantGame: { id: string; title: string };

const originalClientQuery = pg.Client.prototype.query;

export type LiveLeaseWithPolicyResult = {
  lease: leaseStore.LiveLease;
  permission: {
    canSubscribe: boolean;
    canPublish: boolean;
    canPublishSources: TrackSource[];
    canPublishData: boolean;
    canUpdateMetadata: boolean;
  };
};

export type LiveLeaseWithPolicyFunction = (
  db: pg.Pool | pg.PoolClient,
  id: string
) => Promise<LiveLeaseWithPolicyResult | undefined>;

/**
 * Access the proposed combined helper via namespace typing without named import compilation failure.
 * When unadopted source does not export liveLeaseWithPolicy, this evaluates to undefined and tests fail
 * assertions intentionally (RED) rather than crashing the test harness.
 */
const liveLeaseWithPolicyFn = (
  leaseStore as { liveLeaseWithPolicy?: LiveLeaseWithPolicyFunction }
).liveLeaseWithPolicy;

interface CallerRecord {
  id: string;
  name: string;
  sessionId: string;
  callMemberId: string;
  admissionId: string;
}

interface FixtureData {
  validCaller: CallerRecord;
  expiredAdmissionCaller: CallerRecord;
  revokedAdmissionCaller: CallerRecord;
  expiredSessionCaller: CallerRecord;
  leftMemberCaller: CallerRecord;
  disconnected29sCaller: CallerRecord;
  disconnected35sCaller: CallerRecord;
  noInterestsCaller: CallerRecord;
  bannedCaller: CallerRecord;
  tieUnbannedCaller: CallerRecord;
  room: { id: string; conversationId: string };
  call: { id: string };
  closedCall: { id: string };
  closedCallCaller: CallerRecord;
}

async function seedFixture(): Promise<FixtureData> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS ALL DEFERRED');

    const now = new Date();
    const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const pastExpiry = new Date(Date.now() - 60 * 1000).toISOString();

    const createUser = async (tag: string) => {
      const u = {
        id: `u_${tag}_${randomUUID()}`,
        name: `User ${tag}`,
        email: `${tag}_${randomUUID()}@fixture.invalid`,
      };
      await client.query(
        'INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES($1, $2, $3, true, $4, $4)',
        [u.id, u.name, u.email, now.toISOString()]
      );
      await client.query(
        'INSERT INTO profiles(user_id, display_name, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $4)',
        [u.id, u.name, 'JUST_CHATTING', now.toISOString()]
      );
      return u;
    };

    const uValid = await createUser('valid');
    const uExpAdm = await createUser('exp_adm');
    const uRevAdm = await createUser('rev_adm');
    const uExpSess = await createUser('exp_sess');
    const uLeft = await createUser('left');
    const uDisc29 = await createUser('disc29');
    const uDisc35 = await createUser('disc35');
    const uNoInt = await createUser('no_int');
    const uBan = await createUser('ban');
    const uTieUnban = await createUser('tie_unban');
    const uClosedCall = await createUser('closed_call');

    // Game interests for all except uNoInt
    const usersWithInterests = [
      uValid,
      uExpAdm,
      uRevAdm,
      uExpSess,
      uLeft,
      uDisc29,
      uDisc35,
      uBan,
      uTieUnban,
      uClosedCall,
    ];
    for (const u of usersWithInterests) {
      await client.query(
        'INSERT INTO game_interests(id, user_id, game_id) VALUES($1, $2, $3)',
        [`gi_${randomUUID()}`, u.id, valorantGame.id]
      );
    }

    // Sessions
    const createSession = async (userId: string, expiresAt: string) => {
      const sId = `sess_${randomUUID()}`;
      await client.query(
        'INSERT INTO "session"(id, token, user_id, expires_at, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $5)',
        [sId, `tok_${randomUUID()}`, userId, expiresAt, now.toISOString()]
      );
      return sId;
    };

    const sValid = await createSession(uValid.id, futureExpiry);
    const sExpAdm = await createSession(uExpAdm.id, futureExpiry);
    const sRevAdm = await createSession(uRevAdm.id, futureExpiry);
    const sExpSess = await createSession(uExpSess.id, pastExpiry);
    const sLeft = await createSession(uLeft.id, futureExpiry);
    const sDisc29 = await createSession(uDisc29.id, futureExpiry);
    const sDisc35 = await createSession(uDisc35.id, futureExpiry);
    const sNoInt = await createSession(uNoInt.id, futureExpiry);
    const sBan = await createSession(uBan.id, futureExpiry);
    const sTieUnban = await createSession(uTieUnban.id, futureExpiry);
    const sClosedCall = await createSession(uClosedCall.id, futureExpiry);

    // Admin actions for banned and tie-break unbanned
    await client.query(
      'INSERT INTO admin_actions(id, actor_id, target_user_id, action, reason, created_at) VALUES($1, $2, $3, $4, $5, $6)',
      [`adm_${randomUUID()}`, uValid.id, uBan.id, 'BAN', 'Violation', now.toISOString()]
    );

    // Tie-break: two actions at identical created_at, UNBAN has higher lexical ID
    const tieTimestamp = now.toISOString();
    await client.query(
      'INSERT INTO admin_actions(id, actor_id, target_user_id, action, reason, created_at) VALUES($1, $2, $3, $4, $5, $6)',
      ['adm_tie_1_ban', uValid.id, uTieUnban.id, 'BAN', 'Initial ban', tieTimestamp]
    );
    await client.query(
      'INSERT INTO admin_actions(id, actor_id, target_user_id, action, reason, created_at) VALUES($1, $2, $3, $4, $5, $6)',
      ['adm_tie_2_unban', uValid.id, uTieUnban.id, 'UNBAN', 'Pardon', tieTimestamp]
    );

    // Room
    const convId = `conv_${randomUUID()}`;
    await client.query(
      'INSERT INTO conversations(id, kind, created_at, updated_at) VALUES($1, $2, $3, $3)',
      [convId, 'ROOM', now.toISOString()]
    );

    const roomId = `room_${randomUUID()}`;
    await client.query(
      `INSERT INTO rooms(id, name, game_id, owner_id, owner_role, visibility, invite_policy, player_capacity, conversation_id, conversation_kind, created_at, updated_at)
       VALUES($1, 'Frame Lease Room', $2, $3, 'OWNER', 'PUBLIC', 'DIRECT_MEMBER', 10, $4, 'ROOM', $5, $5)`,
      [roomId, valorantGame.id, uValid.id, convId, now.toISOString()]
    );

    // Room members for all users
    const allUsers = [
      uValid,
      uExpAdm,
      uRevAdm,
      uExpSess,
      uLeft,
      uDisc29,
      uDisc35,
      uNoInt,
      uBan,
      uTieUnban,
      uClosedCall,
    ];
    for (const u of allUsers) {
      await client.query(
        'INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, $3, $4, $5)',
        [`rm_${randomUUID()}`, roomId, u.id, u.id === uValid.id ? 'OWNER' : 'MEMBER', now.toISOString()]
      );
    }

    // Call group OPEN
    const callId = `call_${randomUUID()}`;
    await client.query(
      'INSERT INTO call_groups(id, room_id, state, created_at) VALUES($1, $2, $3, $4)',
      [callId, roomId, 'OPEN', now.toISOString()]
    );

    // Call group CLOSED
    const closedCallId = `call_closed_${randomUUID()}`;
    await client.query(
      'INSERT INTO call_groups(id, room_id, state, created_at) VALUES($1, $2, $3, $4)',
      [closedCallId, roomId, 'CLOSED', now.toISOString()]
    );

    let seat = 1;
    const createCallParticipant = async (
      targetCallId: string,
      userId: string,
      sessionId: string,
      opts: {
        leftAt?: string | null;
        admissionExpiresAt?: string;
        revokedAt?: string | null;
        disconnectedAt?: string | null;
      } = {}
    ): Promise<CallerRecord> => {
      const cmId = `cm_${randomUUID()}`;
      await client.query(
        'INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at, left_at) VALUES($1, $2, $3, $4, $5, false, $6, $7)',
        [cmId, targetCallId, roomId, userId, seat++, now.toISOString(), opts.leftAt ?? null]
      );
      const admId = `admission_${randomUUID()}`;
      await client.query(
        'INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, created_at, revoked_at, disconnected_at) VALUES($1, $2, $3, $4, $5, $6, $7)',
        [
          admId,
          cmId,
          sessionId,
          opts.admissionExpiresAt ?? futureExpiry,
          now.toISOString(),
          opts.revokedAt ?? null,
          opts.disconnectedAt ?? null,
        ]
      );
      return {
        id: userId,
        name: `User ${userId.slice(0, 8)}`,
        sessionId,
        callMemberId: cmId,
        admissionId: admId,
      };
    };

    const validCaller = await createCallParticipant(callId, uValid.id, sValid);
    const expiredAdmissionCaller = await createCallParticipant(callId, uExpAdm.id, sExpAdm, {
      admissionExpiresAt: pastExpiry,
    });
    const revokedAdmissionCaller = await createCallParticipant(callId, uRevAdm.id, sRevAdm, {
      revokedAt: now.toISOString(),
    });
    const expiredSessionCaller = await createCallParticipant(callId, uExpSess.id, sExpSess);
    const leftMemberCaller = await createCallParticipant(callId, uLeft.id, sLeft, {
      leftAt: now.toISOString(),
    });

    const disc29Time = new Date(Date.now() - 29 * 1000).toISOString();
    const disconnected29sCaller = await createCallParticipant(callId, uDisc29.id, sDisc29, {
      disconnectedAt: disc29Time,
    });

    const disc35Time = new Date(Date.now() - 35 * 1000).toISOString();
    const disconnected35sCaller = await createCallParticipant(callId, uDisc35.id, sDisc35, {
      disconnectedAt: disc35Time,
    });

    const noInterestsCaller = await createCallParticipant(callId, uNoInt.id, sNoInt);
    const bannedCaller = await createCallParticipant(callId, uBan.id, sBan);
    const tieUnbannedCaller = await createCallParticipant(callId, uTieUnban.id, sTieUnban);

    const closedCallCaller = await createCallParticipant(closedCallId, uClosedCall.id, sClosedCall);

    await client.query('COMMIT');

    return {
      validCaller,
      expiredAdmissionCaller,
      revokedAdmissionCaller,
      expiredSessionCaller,
      leftMemberCaller,
      disconnected29sCaller,
      disconnected35sCaller,
      noInterestsCaller,
      bannedCaller,
      tieUnbannedCaller,
      room: { id: roomId, conversationId: convId },
      call: { id: callId },
      closedCall: { id: closedCallId },
      closedCallCaller,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function countClientQueries<T>(
  client: pg.PoolClient,
  action: () => Promise<T>
): Promise<{ result: T; count: number }> {
  let count = 0;
  const orig = client.query.bind(client);
  const spy = function (...args: unknown[]) {
    count++;
    return (orig as (...a: unknown[]) => unknown)(...args);
  };
  (client as { query: unknown }).query = spy;
  try {
    const result = await action();
    return { result, count };
  } finally {
    (client as { query: unknown }).query = orig;
  }
}

jest.setTimeout(60000);

describe('T30 Frame Lease Policy Combined Query Integration Suite', () => {
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

    process.env.DATABASE_URL = dbUrl;
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    const cleanup = {
      schemaRemoved: false,
      poolEnded: false,
      prototypeRestored: false,
      envRestored: false,
    };

    try {
      if (schemaCreated) {
        expect(owned).toMatch(/^t30_frame_lease_policy_[a-f0-9]{32}$/);
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
    cleanup.envRestored = process.env.DATABASE_URL === originalDbUrl;

    pg.Client.prototype.query = originalClientQuery;
    cleanup.prototypeRestored = pg.Client.prototype.query === originalClientQuery;

    try {
      await pool?.end();
      cleanup.poolEnded = Boolean(pool);
    } catch (err) {
      errors.push(err);
    }

    const cleanupFile = path.join(
      root,
      `quality/evidence/T30/frame-lease-policy-cleanup-${schemaUuid}.json`
    );
    fs.writeFileSync(
      cleanupFile,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          schema: owned,
          ...cleanup,
          errorCount: errors.length,
        },
        null,
        2
      ) + '\n',
      { flag: 'wx' }
    );

    if (errors.length) {
      throw new AggregateError(errors, 'Owned frame lease policy cleanup failed');
    }
  });

  describe('Control Tests: Baseline Behavior of Existing Unmodified Functions', () => {
    it('original liveLease resolves a full valid lease for active caller', async () => {
      const fixture = await seedFixture();
      const lease = await leaseStore.liveLease(pool, fixture.validCaller.admissionId);
      expect(lease).toBeDefined();
      expect(lease?.id).toBe(fixture.validCaller.admissionId);
      expect(lease?.user_id).toBe(fixture.validCaller.id);
      expect(lease?.room_name).toBe(`fg-call_${fixture.call.id}`);
      expect(lease?.session_expires_at).toBeInstanceOf(Date);
    });

    it('original publicationPermission produces correct baseline permission', async () => {
      const fixture = await seedFixture();
      const lease = (await leaseStore.liveLease(pool, fixture.validCaller.admissionId))!;
      const perm = await leaseStore.publicationPermission(pool, lease);
      expect(perm.canSubscribe).toBe(true);
      expect(perm.canPublish).toBe(true);
      expect(perm.canPublishSources).toContain(TrackSource.MICROPHONE);
      expect(perm.canPublishData).toBe(false);
      expect(perm.canUpdateMetadata).toBe(false);
    });

    it('original liveLease returns undefined across invalid states', async () => {
      const fixture = await seedFixture();
      expect(await leaseStore.liveLease(pool, fixture.expiredAdmissionCaller.admissionId)).toBeUndefined();
      expect(await leaseStore.liveLease(pool, fixture.revokedAdmissionCaller.admissionId)).toBeUndefined();
      expect(await leaseStore.liveLease(pool, fixture.expiredSessionCaller.admissionId)).toBeUndefined();
      expect(await leaseStore.liveLease(pool, fixture.leftMemberCaller.admissionId)).toBeUndefined();
      expect(await leaseStore.liveLease(pool, fixture.disconnected35sCaller.admissionId)).toBeUndefined();
      expect(await leaseStore.liveLease(pool, fixture.noInterestsCaller.admissionId)).toBeUndefined();
      expect(await leaseStore.liveLease(pool, fixture.bannedCaller.admissionId)).toBeUndefined();
      expect(await leaseStore.liveLease(pool, fixture.closedCallCaller.admissionId)).toBeUndefined();
    });

    it('original liveLease honors 30s grace window and tie-break UNBAN', async () => {
      const fixture = await seedFixture();
      expect(await leaseStore.liveLease(pool, fixture.disconnected29sCaller.admissionId)).toBeDefined();
      expect(await leaseStore.liveLease(pool, fixture.tieUnbannedCaller.admissionId)).toBeDefined();
    });
  });

  describe('RED Tests: Candidate liveLeaseWithPolicy Implementation & Parity Assertions', () => {
    it('RED-1: liveLeaseWithPolicy is exported and defined as a function', () => {
      // Clean, deterministic RED: fails with "Expected: 'function', Received: 'undefined'" before source implementation
      expect(typeof liveLeaseWithPolicyFn).toBe('function');
    });

    it('RED-2: liveLeaseWithPolicy returns identical lease and permission matching original functions on valid caller', async () => {
      expect(typeof liveLeaseWithPolicyFn).toBe('function');
      const fixture = await seedFixture();

      const origLease = await leaseStore.liveLease(pool, fixture.validCaller.admissionId);
      const origPerm = await leaseStore.publicationPermission(pool, origLease!);

      const candidate = await liveLeaseWithPolicyFn!(pool, fixture.validCaller.admissionId);
      expect(candidate).toBeDefined();
      expect(candidate?.lease).toEqual(origLease);
      expect(candidate?.permission).toEqual(origPerm);
    });

    it('RED-3: liveLeaseWithPolicy returns undefined for all invalidation guards (matching liveLease)', async () => {
      expect(typeof liveLeaseWithPolicyFn).toBe('function');
      const fixture = await seedFixture();

      // Expired admission
      expect(await liveLeaseWithPolicyFn!(pool, fixture.expiredAdmissionCaller.admissionId)).toBeUndefined();
      // Revoked admission
      expect(await liveLeaseWithPolicyFn!(pool, fixture.revokedAdmissionCaller.admissionId)).toBeUndefined();
      // Expired session
      expect(await liveLeaseWithPolicyFn!(pool, fixture.expiredSessionCaller.admissionId)).toBeUndefined();
      // Left call member
      expect(await liveLeaseWithPolicyFn!(pool, fixture.leftMemberCaller.admissionId)).toBeUndefined();
      // Disconnected > 30s
      expect(await liveLeaseWithPolicyFn!(pool, fixture.disconnected35sCaller.admissionId)).toBeUndefined();
      // Missing game interests
      expect(await liveLeaseWithPolicyFn!(pool, fixture.noInterestsCaller.admissionId)).toBeUndefined();
      // Banned user
      expect(await liveLeaseWithPolicyFn!(pool, fixture.bannedCaller.admissionId)).toBeUndefined();
      // Closed group
      expect(await liveLeaseWithPolicyFn!(pool, fixture.closedCallCaller.admissionId)).toBeUndefined();
      // Empty / unknown admission ID
      expect(await liveLeaseWithPolicyFn!(pool, `admission_unknown_${randomUUID()}`)).toBeUndefined();
      expect(await liveLeaseWithPolicyFn!(pool, '')).toBeUndefined();
    });

    it('RED-4: liveLeaseWithPolicy returns valid lease for disconnected within 29s and tie-break UNBAN', async () => {
      expect(typeof liveLeaseWithPolicyFn).toBe('function');
      const fixture = await seedFixture();

      const disc29 = await liveLeaseWithPolicyFn!(pool, fixture.disconnected29sCaller.admissionId);
      expect(disc29).toBeDefined();
      expect(disc29?.lease.id).toBe(fixture.disconnected29sCaller.admissionId);

      const tieUnban = await liveLeaseWithPolicyFn!(pool, fixture.tieUnbannedCaller.admissionId);
      expect(tieUnban).toBeDefined();
      expect(tieUnban?.lease.id).toBe(fixture.tieUnbannedCaller.admissionId);
    });

    it('RED-5: liveLeaseWithPolicy returns exact publication permission matrix across all 6 real policy combinations', async () => {
      expect(typeof liveLeaseWithPolicyFn).toBe('function');
      const fixture = await seedFixture();
      const client = await pool.connect();
      try {
        const caller = fixture.validCaller;

        // Helper to configure real restrictions and slots in DB
        const configurePolicy = async (micBlocked: boolean, screenBlocked: boolean, reserved: boolean) => {
          await client.query('DELETE FROM call_restrictions WHERE call_group_id=$1 AND target_user_id=$2', [
            fixture.call.id,
            caller.id,
          ]);
          await client.query('DELETE FROM call_publish_slots WHERE call_group_id=$1 AND user_id=$2', [
            fixture.call.id,
            caller.id,
          ]);
          if (micBlocked) {
            await client.query(
              "INSERT INTO call_restrictions(id, call_group_id, target_user_id, restriction_type, issued_by, created_at) VALUES($1, $2, $3, 'MIC_MUTED', $4, now())",
              [`cr_${randomUUID()}`, fixture.call.id, caller.id, caller.id]
            );
          }
          if (screenBlocked) {
            await client.query(
              "INSERT INTO call_restrictions(id, call_group_id, target_user_id, restriction_type, issued_by, created_at) VALUES($1, $2, $3, 'STREAM_BLOCKED', $4, now())",
              [`cr_${randomUUID()}`, fixture.call.id, caller.id, caller.id]
            );
          }
          if (reserved) {
            await client.query(
              'INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, created_at) VALUES($1, $2, $3, 1, now())',
              [`cps_${randomUUID()}`, fixture.call.id, caller.id]
            );
          }
        };

        // 1. freeMIC: mic unblocked, screen blocked, no slot reserved -> [MICROPHONE]
        await configurePolicy(false, true, false);
        let res = (await liveLeaseWithPolicyFn!(client, caller.admissionId))!;
        expect(res.permission.canSubscribe).toBe(true);
        expect(res.permission.canPublish).toBe(true);
        expect(res.permission.canPublishSources).toEqual([TrackSource.MICROPHONE]);
        expect(res.permission.canPublishData).toBe(false);
        expect(res.permission.canUpdateMetadata).toBe(false);

        // 2. noSlot: mic unblocked, screen unblocked, no slot reserved -> [MICROPHONE]
        await configurePolicy(false, false, false);
        res = (await liveLeaseWithPolicyFn!(client, caller.admissionId))!;
        expect(res.permission.canPublish).toBe(true);
        expect(res.permission.canPublishSources).toEqual([TrackSource.MICROPHONE]);

        // 3. MICmuted: mic blocked, screen unblocked, slot reserved -> [SCREEN_SHARE]
        await configurePolicy(true, false, true);
        res = (await liveLeaseWithPolicyFn!(client, caller.admissionId))!;
        expect(res.permission.canPublish).toBe(true);
        expect(res.permission.canPublishSources).toEqual([TrackSource.SCREEN_SHARE]);

        // 4. screenblocked: mic unblocked, screen blocked, slot reserved -> [MICROPHONE]
        await configurePolicy(false, true, true);
        res = (await liveLeaseWithPolicyFn!(client, caller.admissionId))!;
        expect(res.permission.canPublish).toBe(true);
        expect(res.permission.canPublishSources).toEqual([TrackSource.MICROPHONE]);

        // 5. slotreserved: mic unblocked, screen unblocked, slot reserved -> [MICROPHONE, SCREEN_SHARE, SCREEN_SHARE_AUDIO]
        await configurePolicy(false, false, true);
        res = (await liveLeaseWithPolicyFn!(client, caller.admissionId))!;
        expect(res.permission.canPublish).toBe(true);
        expect(res.permission.canPublishSources).toEqual([
          TrackSource.MICROPHONE,
          TrackSource.SCREEN_SHARE,
          TrackSource.SCREEN_SHARE_AUDIO,
        ]);

        // 6. bothblocked: mic blocked, screen blocked, slot reserved -> []
        await configurePolicy(true, true, true);
        res = (await liveLeaseWithPolicyFn!(client, caller.admissionId))!;
        expect(res.permission.canPublish).toBe(false);
        expect(res.permission.canPublishSources).toEqual([]);
      } finally {
        client.release();
      }
    });

    it('RED-6: demonstrates immediate zero-cache reflection on live database mutations between calls', async () => {
      expect(typeof liveLeaseWithPolicyFn).toBe('function');
      const fixture = await seedFixture();
      const caller = fixture.validCaller;
      const client = await pool.connect();
      try {
        // Step 1: Start with slot reserved and unmuted
        await client.query('DELETE FROM call_restrictions WHERE call_group_id=$1 AND target_user_id=$2', [
          fixture.call.id,
          caller.id,
        ]);
        await client.query(
          'INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, created_at) VALUES($1, $2, $3, 1, now()) ON CONFLICT DO NOTHING',
          [`cps_${randomUUID()}`, fixture.call.id, caller.id]
        );

        const first = await liveLeaseWithPolicyFn!(client, caller.admissionId);
        expect(first?.permission.canPublishSources).toContain(TrackSource.SCREEN_SHARE);

        // Step 2: Mutate DB to block screen
        await client.query(
          "INSERT INTO call_restrictions(id, call_group_id, target_user_id, restriction_type, issued_by, created_at) VALUES($1, $2, $3, 'STREAM_BLOCKED', $4, now())",
          [`cr_${randomUUID()}`, fixture.call.id, caller.id, caller.id]
        );

        const second = await liveLeaseWithPolicyFn!(client, caller.admissionId);
        expect(second?.permission.canPublishSources).not.toContain(TrackSource.SCREEN_SHARE);
        expect(second?.permission.canPublishSources).toContain(TrackSource.MICROPHONE);

        // Step 3: Mutate DB to revoke admission
        await client.query('UPDATE call_admissions SET revoked_at=now() WHERE id=$1', [caller.admissionId]);

        const third = await liveLeaseWithPolicyFn!(client, caller.admissionId);
        expect(third).toBeUndefined();
      } finally {
        client.release();
      }
    });

    it('RED-7: executes exactly 1 real PostgreSQL query during single helper invocation (vs 2 for sequential original)', async () => {
      expect(typeof liveLeaseWithPolicyFn).toBe('function');
      const fixture = await seedFixture();
      const client = await pool.connect();
      try {
        // Measure sequential original: liveLease + publicationPermission
        const origCount = await countClientQueries(client, async () => {
          const l = await leaseStore.liveLease(client, fixture.validCaller.admissionId);
          return leaseStore.publicationPermission(client, l!);
        });
        expect(origCount.count).toBe(2);

        // Measure candidate helper: must execute exactly 1 query
        const candidateCount = await countClientQueries(client, async () => {
          return liveLeaseWithPolicyFn!(client, fixture.validCaller.admissionId);
        });
        expect(candidateCount.count).toBe(1);
      } finally {
        client.release();
      }
    });
  });
});
