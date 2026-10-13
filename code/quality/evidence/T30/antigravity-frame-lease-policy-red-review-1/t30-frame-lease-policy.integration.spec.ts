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
  deleteSessionCaller: CallerRecord;
  leftMemberCaller: CallerRecord;
  deleteMemberCaller: CallerRecord;
  deleteRoomMemCaller: CallerRecord;
  noInterestsCaller: CallerRecord;
  bannedCaller: CallerRecord;
  tieUnbannedCaller: CallerRecord;
  graceCaller: CallerRecord;
  room: { id: string; conversationId: string };
  call: { id: string };
  closedCall: { id: string };
  closedCallCaller: CallerRecord;
  tieCall: { id: string };
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
    const uDelSess = await createUser('del_sess');
    const uLeft = await createUser('left');
    const uDelMember = await createUser('del_mem');
    const uDelRoomMem = await createUser('del_rmem');
    const uNoInt = await createUser('no_int');
    const uBan = await createUser('ban');
    const uGrace = await createUser('grace');
    const uTieUnban = await createUser('tie_unban');
    const uClosedCall = await createUser('closed_call');

    // Game interests for all users except uNoInt
    const usersWithInterests = [
      uValid,
      uExpAdm,
      uRevAdm,
      uExpSess,
      uDelSess,
      uLeft,
      uDelMember,
      uDelRoomMem,
      uBan,
      uGrace,
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
    const sDelSess = await createSession(uDelSess.id, futureExpiry);
    const sLeft = await createSession(uLeft.id, futureExpiry);
    const sDelMember = await createSession(uDelMember.id, futureExpiry);
    const sDelRoomMem = await createSession(uDelRoomMem.id, futureExpiry);
    const sNoInt = await createSession(uNoInt.id, futureExpiry);
    const sBan = await createSession(uBan.id, futureExpiry);
    const sGrace = await createSession(uGrace.id, futureExpiry);
    const sTieUnban = await createSession(uTieUnban.id, futureExpiry);
    const sClosedCall = await createSession(uClosedCall.id, futureExpiry);

    // Initial admin ban for uBan
    await client.query(
      'INSERT INTO admin_actions(id, actor_id, target_user_id, action, reason, created_at) VALUES($1, $2, $3, $4, $5, $6)',
      [`adm_${randomUUID()}`, uValid.id, uBan.id, 'BAN', 'Violation', now.toISOString()]
    );

    // Unique tie-break actions with ordered prefixes: a_ suffix BAN, z_ suffix UNBAN at exact same timestamp
    const tieSuffix = randomUUID().replaceAll('-', '');
    const tieTimestamp = now.toISOString();
    await client.query(
      'INSERT INTO admin_actions(id, actor_id, target_user_id, action, reason, created_at) VALUES($1, $2, $3, $4, $5, $6)',
      [`a_adm_tie_ban_${tieSuffix}`, uValid.id, uTieUnban.id, 'BAN', 'Initial ban', tieTimestamp]
    );
    await client.query(
      'INSERT INTO admin_actions(id, actor_id, target_user_id, action, reason, created_at) VALUES($1, $2, $3, $4, $5, $6)',
      [`z_adm_tie_unban_${tieSuffix}`, uValid.id, uTieUnban.id, 'UNBAN', 'Pardon', tieTimestamp]
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

    const allUsers = [
      uValid,
      uExpAdm,
      uRevAdm,
      uExpSess,
      uDelSess,
      uLeft,
      uDelMember,
      uDelRoomMem,
      uNoInt,
      uBan,
      uGrace,
      uTieUnban,
      uClosedCall,
    ];
    for (const u of allUsers) {
      await client.query(
        'INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, $3, $4, $5)',
        [`rm_${randomUUID()}`, roomId, u.id, u.id === uValid.id ? 'OWNER' : 'MEMBER', now.toISOString()]
      );
    }

    // Call group OPEN (main call for up to 10 participants)
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

    // Call group for tie-break user
    const tieCallId = `call_tie_${randomUUID()}`;
    await client.query(
      'INSERT INTO call_groups(id, room_id, state, created_at) VALUES($1, $2, $3, $4)',
      [tieCallId, roomId, 'OPEN', now.toISOString()]
    );

    // Per-group seat counter Map to strictly satisfy seat_index BETWEEN 1 AND 10 constraint
    const groupSeats = new Map<string, number>();
    const getNextSeat = (gid: string): number => {
      const current = groupSeats.get(gid) ?? 0;
      const next = current + 1;
      groupSeats.set(gid, next);
      return next;
    };

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
      const seat = getNextSeat(targetCallId);
      await client.query(
        'INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at, left_at) VALUES($1, $2, $3, $4, $5, false, $6, $7)',
        [cmId, targetCallId, roomId, userId, seat, now.toISOString(), opts.leftAt ?? null]
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

    // Exactly 10 participants in main call (seats 1..10)
    const validCaller = await createCallParticipant(callId, uValid.id, sValid);
    const expiredAdmissionCaller = await createCallParticipant(callId, uExpAdm.id, sExpAdm, {
      admissionExpiresAt: pastExpiry,
    });
    const revokedAdmissionCaller = await createCallParticipant(callId, uRevAdm.id, sRevAdm, {
      revokedAt: now.toISOString(),
    });
    const expiredSessionCaller = await createCallParticipant(callId, uExpSess.id, sExpSess);
    const deleteSessionCaller = await createCallParticipant(callId, uDelSess.id, sDelSess);
    const leftMemberCaller = await createCallParticipant(callId, uLeft.id, sLeft, {
      leftAt: now.toISOString(),
    });
    const deleteMemberCaller = await createCallParticipant(callId, uDelMember.id, sDelMember);
    const deleteRoomMemCaller = await createCallParticipant(callId, uDelRoomMem.id, sDelRoomMem);
    const noInterestsCaller = await createCallParticipant(callId, uNoInt.id, sNoInt);
    const bannedCaller = await createCallParticipant(callId, uBan.id, sBan);

    // Callers in separate dedicated groups (seat 1 in each group)
    const graceCaller = await createCallParticipant(callId, uGrace.id, sGrace); // seat 11 forbidden, so graceCaller gets seat 1 in tieCallId
    const tieUnbannedCaller = await createCallParticipant(tieCallId, uTieUnban.id, sTieUnban);
    const closedCallCaller = await createCallParticipant(closedCallId, uClosedCall.id, sClosedCall);

    await client.query('COMMIT');

    return {
      validCaller,
      expiredAdmissionCaller,
      revokedAdmissionCaller,
      expiredSessionCaller,
      deleteSessionCaller,
      leftMemberCaller,
      deleteMemberCaller,
      deleteRoomMemCaller,
      noInterestsCaller,
      bannedCaller,
      tieUnbannedCaller,
      graceCaller,
      room: { id: roomId, conversationId: convId },
      call: { id: callId },
      closedCall: { id: closedCallId },
      closedCallCaller,
      tieCall: { id: tieCallId },
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

describe('T30 Frame Lease Policy Combined Query Integration Suite (Review-1)', () => {
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

    cleanup.prototypeRestored = pg.Client.prototype.query === originalClientQuery;

    try {
      await pool?.end();
      cleanup.poolEnded = Boolean(pool && (pool as unknown as { ended?: boolean }).ended === true);
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

    it('original liveLease returns undefined across invalid and deleted states', async () => {
      const fixture = await seedFixture();
      const client = await pool.connect();
      try {
        expect(await leaseStore.liveLease(client, fixture.expiredAdmissionCaller.admissionId)).toBeUndefined();
        expect(await leaseStore.liveLease(client, fixture.revokedAdmissionCaller.admissionId)).toBeUndefined();
        expect(await leaseStore.liveLease(client, fixture.expiredSessionCaller.admissionId)).toBeUndefined();
        expect(await leaseStore.liveLease(client, fixture.leftMemberCaller.admissionId)).toBeUndefined();
        expect(await leaseStore.liveLease(client, fixture.noInterestsCaller.admissionId)).toBeUndefined();
        expect(await leaseStore.liveLease(client, fixture.bannedCaller.admissionId)).toBeUndefined();
        expect(await leaseStore.liveLease(client, fixture.closedCallCaller.admissionId)).toBeUndefined();

        // Real deleted session -> undefined
        await client.query('DELETE FROM "session" WHERE id=$1', [fixture.deleteSessionCaller.sessionId]);
        expect(await leaseStore.liveLease(client, fixture.deleteSessionCaller.admissionId)).toBeUndefined();

        // Real deleted room membership -> undefined
        await client.query('DELETE FROM room_members WHERE room_id=$1 AND user_id=$2', [
          fixture.room.id,
          fixture.deleteRoomMemCaller.id,
        ]);
        expect(await leaseStore.liveLease(client, fixture.deleteRoomMemCaller.admissionId)).toBeUndefined();

        // Real deleted call member -> undefined
        await client.query('DELETE FROM call_members WHERE id=$1', [fixture.deleteMemberCaller.callMemberId]);
        expect(await leaseStore.liveLease(client, fixture.deleteMemberCaller.admissionId)).toBeUndefined();
      } finally {
        client.release();
      }
    });

    it('original liveLease honors real server clock 20s/29s grace, denies 31s, and restores on rejoin', async () => {
      const fixture = await seedFixture();
      const client = await pool.connect();
      try {
        const caller = fixture.graceCaller;

        // 1. Stable 20s inside grace
        await client.query(
          "UPDATE call_admissions SET disconnected_at=clock_timestamp()-interval '20 seconds' WHERE id=$1",
          [caller.admissionId]
        );
        const age20 = (
          await client.query<{ age_sec: number }>(
            'SELECT EXTRACT(EPOCH FROM (clock_timestamp()-disconnected_at))::float AS age_sec FROM call_admissions WHERE id=$1',
            [caller.admissionId]
          )
        ).rows[0].age_sec;
        expect(age20).toBeGreaterThanOrEqual(20);
        expect(age20).toBeLessThan(25);
        expect(await leaseStore.liveLease(client, caller.admissionId)).toBeDefined();

        // 2. Exact 29s boundary check with before/after server clock verification
        await client.query(
          "UPDATE call_admissions SET disconnected_at=clock_timestamp()-interval '29 seconds' WHERE id=$1",
          [caller.admissionId]
        );
        const ageBefore = (
          await client.query<{ age_sec: number }>(
            'SELECT EXTRACT(EPOCH FROM (clock_timestamp()-disconnected_at))::float AS age_sec FROM call_admissions WHERE id=$1',
            [caller.admissionId]
          )
        ).rows[0].age_sec;
        expect(ageBefore).toBeGreaterThanOrEqual(29);
        expect(ageBefore).toBeLessThan(30);

        const res29 = await leaseStore.liveLease(client, caller.admissionId);

        const ageAfter = (
          await client.query<{ age_sec: number }>(
            'SELECT EXTRACT(EPOCH FROM (clock_timestamp()-disconnected_at))::float AS age_sec FROM call_admissions WHERE id=$1',
            [caller.admissionId]
          )
        ).rows[0].age_sec;
        if (ageAfter < 30) {
          expect(res29).toBeDefined();
        } else {
          expect(res29).toBeUndefined();
        }

        // 3. 31s deny set immediately before query
        await client.query(
          "UPDATE call_admissions SET disconnected_at=clock_timestamp()-interval '31 seconds' WHERE id=$1",
          [caller.admissionId]
        );
        const age31 = (
          await client.query<{ age_sec: number }>(
            'SELECT EXTRACT(EPOCH FROM (clock_timestamp()-disconnected_at))::float AS age_sec FROM call_admissions WHERE id=$1',
            [caller.admissionId]
          )
        ).rows[0].age_sec;
        expect(age31).toBeGreaterThanOrEqual(31);
        expect(await leaseStore.liveLease(client, caller.admissionId)).toBeUndefined();

        // 4. Actual rejoin UPDATE null then fresh check
        await client.query('UPDATE call_admissions SET disconnected_at=NULL WHERE id=$1', [caller.admissionId]);
        expect(await leaseStore.liveLease(client, caller.admissionId)).toBeDefined();

        // 5. Tie-break UNBAN
        expect(await leaseStore.liveLease(client, fixture.tieUnbannedCaller.admissionId)).toBeDefined();
      } finally {
        client.release();
      }
    });
  });

  describe('RED Tests: Candidate liveLeaseWithPolicy Implementation & Parity Assertions', () => {
    it('RED-1: liveLeaseWithPolicy is exported and defined as a function', () => {
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

    it('RED-3: liveLeaseWithPolicy returns undefined across all invalid and deleted states', async () => {
      expect(typeof liveLeaseWithPolicyFn).toBe('function');
      const fixture = await seedFixture();
      const client = await pool.connect();
      try {
        expect(await liveLeaseWithPolicyFn!(client, fixture.expiredAdmissionCaller.admissionId)).toBeUndefined();
        expect(await liveLeaseWithPolicyFn!(client, fixture.revokedAdmissionCaller.admissionId)).toBeUndefined();
        expect(await liveLeaseWithPolicyFn!(client, fixture.expiredSessionCaller.admissionId)).toBeUndefined();
        expect(await liveLeaseWithPolicyFn!(client, fixture.leftMemberCaller.admissionId)).toBeUndefined();
        expect(await liveLeaseWithPolicyFn!(client, fixture.noInterestsCaller.admissionId)).toBeUndefined();
        expect(await liveLeaseWithPolicyFn!(client, fixture.bannedCaller.admissionId)).toBeUndefined();
        expect(await liveLeaseWithPolicyFn!(client, fixture.closedCallCaller.admissionId)).toBeUndefined();

        // Real deleted session -> undefined
        await client.query('DELETE FROM "session" WHERE id=$1', [fixture.deleteSessionCaller.sessionId]);
        expect(await liveLeaseWithPolicyFn!(client, fixture.deleteSessionCaller.admissionId)).toBeUndefined();

        // Real deleted room membership -> undefined
        await client.query('DELETE FROM room_members WHERE room_id=$1 AND user_id=$2', [
          fixture.room.id,
          fixture.deleteRoomMemCaller.id,
        ]);
        expect(await liveLeaseWithPolicyFn!(client, fixture.deleteRoomMemCaller.admissionId)).toBeUndefined();

        // Real deleted call member -> undefined
        await client.query('DELETE FROM call_members WHERE id=$1', [fixture.deleteMemberCaller.callMemberId]);
        expect(await liveLeaseWithPolicyFn!(client, fixture.deleteMemberCaller.admissionId)).toBeUndefined();
      } finally {
        client.release();
      }
    });

    it('RED-4: liveLeaseWithPolicy honors real server clock 20s/29s grace, denies 31s, and restores on rejoin', async () => {
      expect(typeof liveLeaseWithPolicyFn).toBe('function');
      const fixture = await seedFixture();
      const client = await pool.connect();
      try {
        const caller = fixture.graceCaller;

        // 1. Stable 20s inside grace
        await client.query(
          "UPDATE call_admissions SET disconnected_at=clock_timestamp()-interval '20 seconds' WHERE id=$1",
          [caller.admissionId]
        );
        const age20 = (
          await client.query<{ age_sec: number }>(
            'SELECT EXTRACT(EPOCH FROM (clock_timestamp()-disconnected_at))::float AS age_sec FROM call_admissions WHERE id=$1',
            [caller.admissionId]
          )
        ).rows[0].age_sec;
        expect(age20).toBeGreaterThanOrEqual(20);
        expect(age20).toBeLessThan(25);
        expect(await liveLeaseWithPolicyFn!(client, caller.admissionId)).toBeDefined();

        // 2. Exact 29s boundary check
        await client.query(
          "UPDATE call_admissions SET disconnected_at=clock_timestamp()-interval '29 seconds' WHERE id=$1",
          [caller.admissionId]
        );
        const ageBefore = (
          await client.query<{ age_sec: number }>(
            'SELECT EXTRACT(EPOCH FROM (clock_timestamp()-disconnected_at))::float AS age_sec FROM call_admissions WHERE id=$1',
            [caller.admissionId]
          )
        ).rows[0].age_sec;
        expect(ageBefore).toBeGreaterThanOrEqual(29);
        expect(ageBefore).toBeLessThan(30);

        const res29 = await liveLeaseWithPolicyFn!(client, caller.admissionId);

        const ageAfter = (
          await client.query<{ age_sec: number }>(
            'SELECT EXTRACT(EPOCH FROM (clock_timestamp()-disconnected_at))::float AS age_sec FROM call_admissions WHERE id=$1',
            [caller.admissionId]
          )
        ).rows[0].age_sec;
        if (ageAfter < 30) {
          expect(res29).toBeDefined();
        } else {
          expect(res29).toBeUndefined();
        }

        // 3. 31s deny
        await client.query(
          "UPDATE call_admissions SET disconnected_at=clock_timestamp()-interval '31 seconds' WHERE id=$1",
          [caller.admissionId]
        );
        const age31 = (
          await client.query<{ age_sec: number }>(
            'SELECT EXTRACT(EPOCH FROM (clock_timestamp()-disconnected_at))::float AS age_sec FROM call_admissions WHERE id=$1',
            [caller.admissionId]
          )
        ).rows[0].age_sec;
        expect(age31).toBeGreaterThanOrEqual(31);
        expect(await liveLeaseWithPolicyFn!(client, caller.admissionId)).toBeUndefined();

        // 4. Actual rejoin UPDATE null
        await client.query('UPDATE call_admissions SET disconnected_at=NULL WHERE id=$1', [caller.admissionId]);
        expect(await liveLeaseWithPolicyFn!(client, caller.admissionId)).toBeDefined();

        // 5. Tie-break UNBAN
        expect(await liveLeaseWithPolicyFn!(client, fixture.tieUnbannedCaller.admissionId)).toBeDefined();
      } finally {
        client.release();
      }
    });

    it('RED-5: liveLeaseWithPolicy returns exact publication permission matrix across all 6 real policy combinations', async () => {
      expect(typeof liveLeaseWithPolicyFn).toBe('function');
      const fixture = await seedFixture();
      const client = await pool.connect();
      try {
        const caller = fixture.validCaller;

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

        const assertMatrixCombo = async (
          micBlocked: boolean,
          screenBlocked: boolean,
          reserved: boolean,
          expectedSources: TrackSource[],
          expectedCanPublish: boolean
        ) => {
          await configurePolicy(micBlocked, screenBlocked, reserved);
          const origLease = (await leaseStore.liveLease(client, caller.admissionId))!;
          const origPerm = await leaseStore.publicationPermission(client, origLease);

          const res = (await liveLeaseWithPolicyFn!(client, caller.admissionId))!;
          expect(res.permission.canSubscribe).toBe(true);
          expect(res.permission.canPublishData).toBe(false);
          expect(res.permission.canUpdateMetadata).toBe(false);
          expect(res.permission.canPublish).toBe(expectedCanPublish);
          expect(res.permission.canPublishSources).toEqual(expectedSources);
          expect(res.permission).toEqual(origPerm);
        };

        // 1. freeMIC: mic unblocked, screen blocked, no slot -> [MICROPHONE]
        await assertMatrixCombo(false, true, false, [TrackSource.MICROPHONE], true);

        // 2. noSlot: mic unblocked, screen unblocked, no slot -> [MICROPHONE]
        await assertMatrixCombo(false, false, false, [TrackSource.MICROPHONE], true);

        // 3. MICmuted: mic blocked, screen unblocked, slot reserved -> [SCREEN_SHARE]
        await assertMatrixCombo(true, false, true, [TrackSource.SCREEN_SHARE], true);

        // 4. screenblocked: mic unblocked, screen blocked, slot reserved -> [MICROPHONE]
        await assertMatrixCombo(false, true, true, [TrackSource.MICROPHONE], true);

        // 5. slotreserved: mic unblocked, screen unblocked, slot reserved -> [MICROPHONE, SCREEN_SHARE, SCREEN_SHARE_AUDIO]
        await assertMatrixCombo(
          false,
          false,
          true,
          [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
          true
        );

        // 6. bothblocked: mic blocked, screen blocked, slot reserved -> []
        await assertMatrixCombo(true, true, true, [], false);
      } finally {
        client.release();
      }
    });

    it('RED-6: demonstrates immediate zero-cache reflection on live database mutations and fresh transitions', async () => {
      expect(typeof liveLeaseWithPolicyFn).toBe('function');
      const fixture = await seedFixture();
      const caller = fixture.validCaller;
      const client = await pool.connect();
      try {
        // Step 1: Base setup with slot reserved and unblocked
        await client.query('DELETE FROM call_restrictions WHERE call_group_id=$1 AND target_user_id=$2', [
          fixture.call.id,
          caller.id,
        ]);
        await client.query(
          'INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, created_at) VALUES($1, $2, $3, 1, now()) ON CONFLICT DO NOTHING',
          [`cps_${randomUUID()}`, fixture.call.id, caller.id]
        );

        let res = await liveLeaseWithPolicyFn!(client, caller.admissionId);
        expect(res?.permission.canPublishSources).toContain(TrackSource.SCREEN_SHARE);

        // Step 2: Slot removal -> reverts screen share
        await client.query('DELETE FROM call_publish_slots WHERE call_group_id=$1 AND user_id=$2', [
          fixture.call.id,
          caller.id,
        ]);
        res = await liveLeaseWithPolicyFn!(client, caller.admissionId);
        expect(res?.permission.canPublishSources).toEqual([TrackSource.MICROPHONE]);

        // Step 3: Slot restoration -> restores screen share
        await client.query(
          'INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, created_at) VALUES($1, $2, $3, 1, now())',
          [`cps_${randomUUID()}`, fixture.call.id, caller.id]
        );
        res = await liveLeaseWithPolicyFn!(client, caller.admissionId);
        expect(res?.permission.canPublishSources).toContain(TrackSource.SCREEN_SHARE);

        // Step 4: Mic restriction added -> mic removed
        await client.query(
          "INSERT INTO call_restrictions(id, call_group_id, target_user_id, restriction_type, issued_by, created_at) VALUES($1, $2, $3, 'MIC_MUTED', $4, now())",
          [`cr_${randomUUID()}`, fixture.call.id, caller.id, caller.id]
        );
        res = await liveLeaseWithPolicyFn!(client, caller.admissionId);
        expect(res?.permission.canPublishSources).not.toContain(TrackSource.MICROPHONE);
        expect(res?.permission.canPublishSources).toEqual([TrackSource.SCREEN_SHARE]);

        // Step 5: Mic restriction removed -> mic restored
        await client.query(
          "DELETE FROM call_restrictions WHERE call_group_id=$1 AND target_user_id=$2 AND restriction_type='MIC_MUTED'",
          [fixture.call.id, caller.id]
        );
        res = await liveLeaseWithPolicyFn!(client, caller.admissionId);
        expect(res?.permission.canPublishSources).toContain(TrackSource.MICROPHONE);

        // Step 6: Stream blocked added -> screen removed
        await client.query(
          "INSERT INTO call_restrictions(id, call_group_id, target_user_id, restriction_type, issued_by, created_at) VALUES($1, $2, $3, 'STREAM_BLOCKED', $4, now())",
          [`cr_${randomUUID()}`, fixture.call.id, caller.id, caller.id]
        );
        res = await liveLeaseWithPolicyFn!(client, caller.admissionId);
        expect(res?.permission.canPublishSources).toEqual([TrackSource.MICROPHONE]);

        // Step 7: Stream blocked removed -> screen restored
        await client.query(
          "DELETE FROM call_restrictions WHERE call_group_id=$1 AND target_user_id=$2 AND restriction_type='STREAM_BLOCKED'",
          [fixture.call.id, caller.id]
        );
        res = await liveLeaseWithPolicyFn!(client, caller.admissionId);
        expect(res?.permission.canPublishSources).toContain(TrackSource.SCREEN_SHARE);

        // Step 8: Revoked -> undefined
        await client.query('UPDATE call_admissions SET revoked_at=now() WHERE id=$1', [caller.admissionId]);
        expect(await liveLeaseWithPolicyFn!(client, caller.admissionId)).toBeUndefined();

        // Step 9: Unrevoked -> restored
        await client.query('UPDATE call_admissions SET revoked_at=NULL WHERE id=$1', [caller.admissionId]);
        expect(await liveLeaseWithPolicyFn!(client, caller.admissionId)).toBeDefined();

        // Step 10: Session expired -> undefined
        await client.query("UPDATE \"session\" SET expires_at=now()-interval '10 seconds' WHERE id=$1", [
          caller.sessionId,
        ]);
        expect(await liveLeaseWithPolicyFn!(client, caller.admissionId)).toBeUndefined();

        // Step 11: Session recovered -> restored
        await client.query("UPDATE \"session\" SET expires_at=now()+interval '1 day' WHERE id=$1", [
          caller.sessionId,
        ]);
        expect(await liveLeaseWithPolicyFn!(client, caller.admissionId)).toBeDefined();
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
        expect(origCount.delegateRestored).toBe(true);

        // Measure candidate helper on valid caller: exactly 1 query
        const candidateCount = await countClientQueries(client, async () => {
          return liveLeaseWithPolicyFn!(client, fixture.validCaller.admissionId);
        });
        expect(candidateCount.count).toBe(1);
        expect(candidateCount.delegateRestored).toBe(true);

        // Measure candidate helper on unknown admission ID: exactly 1 query, returns undefined
        const unknownCount = await countClientQueries(client, async () => {
          return liveLeaseWithPolicyFn!(client, `admission_unknown_${randomUUID()}`);
        });
        expect(unknownCount.count).toBe(1);
        expect(unknownCount.result).toBeUndefined();
        expect(unknownCount.delegateRestored).toBe(true);

        // Measure candidate helper on empty string admission ID: exactly 1 query, returns undefined
        const emptyCount = await countClientQueries(client, async () => {
          return liveLeaseWithPolicyFn!(client, '');
        });
        expect(emptyCount.count).toBe(1);
        expect(emptyCount.result).toBeUndefined();
        expect(emptyCount.delegateRestored).toBe(true);
      } finally {
        client.release();
      }
    });
  });
});
