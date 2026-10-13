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
import { HttpException } from '@nestjs/common';
import * as tables from '@fg/database';
import {
  ErrorCode,
  CallParticipantSchema,
  type CallParticipantDTO,
  IsoDateTimeSchema,
} from '@fg/contracts';
import { CallsService } from '../../../../apps/api/src/modules/calls/calls.service.js';
import type { AuthService } from '../../../../apps/api/src/modules/auth/auth.service.js';
import type { RoomsService } from '../../../../apps/api/src/modules/rooms/rooms.service.js';
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
const owned = `t30_call_lease_batch_${randomUUID().replaceAll('-', '')}`;

let pool: pg.Pool;
let callsPool: pg.Pool;
let dbUrl: string;
let originalDbUrl: string | undefined;
let schemaCreated = false;
let callsService: CallsService;
let valorantGame: { id: string; title: string };

const originalClientQuery = pg.Client.prototype.query;

type LiveLeasesFunction = (
  db: pg.Pool | pg.PoolClient,
  ids: string[]
) => Promise<leaseStore.LiveLease[]>;

/**
 * Access the proposed bulk helper via namespace typing without named import compilation failure.
 * When unbatched source does not export liveLeases, this evaluates to undefined and tests fail
 * assertions intentionally (RED) rather than crashing the test harness.
 */
const liveLeasesFn = (leaseStore as { liveLeases?: LiveLeasesFunction }).liveLeases;

type CallsServiceWithPool = { pool: pg.Pool };

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function awaitWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout waiting for ${label} after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function expectHttpError(
  action: () => Promise<unknown>,
  expectedStatus: number,
  expectedCode: ErrorCode,
  expectedMessage?: string
) {
  try {
    await action();
    throw new Error('Expected action to throw HttpException, but it succeeded');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const httpErr = error as HttpException;
    expect(httpErr.getStatus()).toBe(expectedStatus);
    const response = httpErr.getResponse() as { code?: string; message?: string };
    expect(response.code).toBe(expectedCode);
    if (expectedMessage !== undefined) {
      expect(response.message).toBe(expectedMessage);
    }
  }
}

/**
 * Lossless pg.Client query observer that counts admissions lease guard queries.
 * Forwarding all arguments, callbacks, Promises, and errors losslessly to the underlying pg client.
 * Identifies the exact shape of liveLease / liveLeases queries (FROM call_admissions a JOIN call_members).
 */
async function countLeaseQueriesDuring<T>(
  action: () => Promise<T>
): Promise<{ result: T; count: number; totalCount: number }> {
  let count = 0;
  let totalCount = 0;
  const wrappedQuery = function (this: unknown, ...args: unknown[]) {
    totalCount++;
    const raw =
      typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
    if (/\bfrom\s+["']?call_admissions["']?\s+a\s+join\s+["']?call_members["']?/i.test(raw)) {
      count++;
    }
    return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
  };

  pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;
  try {
    const result = await action();
    return { result, count, totalCount };
  } finally {
    pg.Client.prototype.query = originalClientQuery;
  }
}

interface CallerRecord {
  id: string;
  name: string;
  sessionId: string;
  callMemberId: string;
  admissionId: string;
}

interface FixtureData {
  owner: CallerRecord;
  member2: CallerRecord;
  member3: CallerRecord;
  outsider: { id: string; sessionId: string };
  banned: { id: string; sessionId: string };
  notOnboarded: { id: string; sessionId: string };
  room: { id: string; conversationId: string };
  call: { id: string };
}

async function seedFixture(): Promise<FixtureData> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS ALL DEFERRED');

    const now = new Date();
    const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const uOwner = {
      id: `u_owner_${randomUUID()}`,
      name: 'Caller One',
      email: `c1_${randomUUID()}@fixture.invalid`,
      image: 'https://cdn.invalid/c1-user.png',
    };
    const uM2 = {
      id: `u_m2_${randomUUID()}`,
      name: 'Caller Two',
      email: `c2_${randomUUID()}@fixture.invalid`,
      image: null,
    };
    const uM3 = {
      id: `u_m3_${randomUUID()}`,
      name: 'Caller Three',
      email: `c3_${randomUUID()}@fixture.invalid`,
      image: 'https://cdn.invalid/c3-user.png',
    };
    const uOut = {
      id: `u_out_${randomUUID()}`,
      name: 'Outsider User',
      email: `out_${randomUUID()}@fixture.invalid`,
      image: null,
    };
    const uBan = {
      id: `u_ban_${randomUUID()}`,
      name: 'Banned User',
      email: `ban_${randomUUID()}@fixture.invalid`,
      image: null,
    };
    const uNoOnboard = {
      id: `u_no_onboard_${randomUUID()}`,
      name: 'Not Onboarded User',
      email: `noonboard_${randomUUID()}@fixture.invalid`,
      image: null,
    };

    const users = [uOwner, uM2, uM3, uOut, uBan, uNoOnboard];
    for (const u of users) {
      await client.query(
        'INSERT INTO "user"(id, name, email, email_verified, image, created_at, updated_at) VALUES($1, $2, $3, true, $4, $5, $5)',
        [u.id, u.name, u.email, u.image, now.toISOString()]
      );
    }

    // Profiles:
    // owner: custom avatar and PLAYING status
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [uOwner.id, 'Caller One', 'https://cdn.invalid/c1.png', 'Bio 1', 'PLAYING', now.toISOString()]
    );
    // member2: null avatar and JUST_CHATTING status
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [uM2.id, 'Caller Two', null, 'Bio 2', 'JUST_CHATTING', now.toISOString()]
    );
    // member3: custom avatar and LOOKING_FOR_TEAM status
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [uM3.id, 'Caller Three', 'https://cdn.invalid/c3.png', 'Bio 3', 'LOOKING_FOR_TEAM', now.toISOString()]
    );
    // outsider: default profile
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, NULL, NULL, $3, $4, $4)',
      [uOut.id, 'Outsider User', 'JUST_CHATTING', now.toISOString()]
    );
    // banned: default profile
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, NULL, NULL, $3, $4, $4)',
      [uBan.id, 'Banned User', 'JUST_CHATTING', now.toISOString()]
    );
    // notOnboarded: profile present, but NO game_interests row
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, NULL, NULL, $3, $4, $4)',
      [uNoOnboard.id, 'Not Onboarded User', 'JUST_CHATTING', now.toISOString()]
    );

    // Game interests for all except notOnboarded
    for (const u of [uOwner, uM2, uM3, uOut, uBan]) {
      await client.query(
        'INSERT INTO game_interests(id, user_id, game_id) VALUES($1, $2, $3)',
        [`gi_${randomUUID()}`, u.id, valorantGame.id]
      );
    }

    // Sessions for all users
    const sessions: Record<string, string> = {};
    for (const u of users) {
      const sId = `sess_${randomUUID()}`;
      sessions[u.id] = sId;
      await client.query(
        'INSERT INTO "session"(id, token, user_id, expires_at, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $5)',
        [sId, `tok_${randomUUID()}`, u.id, futureExpiry, now.toISOString()]
      );
    }

    // Initial admin ban for banned user
    await client.query(
      'INSERT INTO admin_actions(id, actor_id, target_user_id, action, reason, created_at) VALUES($1, $2, $3, $4, $5, $6)',
      [`adm_${randomUUID()}`, uOwner.id, uBan.id, 'BAN', 'Violation of terms', now.toISOString()]
    );

    // Room conversation
    const conversationId = `conv_${randomUUID()}`;
    await client.query(
      'INSERT INTO conversations(id, kind, created_at, updated_at) VALUES($1, $2, $3, $3)',
      [conversationId, 'ROOM', now.toISOString()]
    );

    // Room
    const roomId = `room_${randomUUID()}`;
    await client.query(
      `INSERT INTO rooms(id, name, description, game_id, owner_id, owner_role, visibility, invite_policy, player_capacity, conversation_id, conversation_kind, created_at, updated_at)
       VALUES($1, $2, $3, $4, $5, 'OWNER', 'PUBLIC', 'OWNER_APPROVAL', 10, $6, 'ROOM', $7, $7)`,
      [roomId, 'Call Test Room', 'Room description', valorantGame.id, uOwner.id, conversationId, now.toISOString()]
    );

    // Room members: owner, member2, member3, banned, notOnboarded (outsider is NOT added)
    const roomMembers: Array<{ userId: string; role: 'OWNER' | 'MEMBER'; offsetSec: number }> = [
      { userId: uOwner.id, role: 'OWNER', offsetSec: 0 },
      { userId: uM2.id, role: 'MEMBER', offsetSec: 1 },
      { userId: uM3.id, role: 'MEMBER', offsetSec: 2 },
      { userId: uBan.id, role: 'MEMBER', offsetSec: 3 },
      { userId: uNoOnboard.id, role: 'MEMBER', offsetSec: 4 },
    ];
    for (const rm of roomMembers) {
      const joinedIso = new Date(now.getTime() + rm.offsetSec * 1000).toISOString();
      await client.query(
        'INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, $3, $4, $5)',
        [`rm_${randomUUID()}`, roomId, rm.userId, rm.role, joinedIso]
      );
    }

    // Call group in room
    const callId = `call_${randomUUID()}`;
    await client.query(
      'INSERT INTO call_groups(id, room_id, state, created_at) VALUES($1, $2, $3, $4)',
      [callId, roomId, 'OPEN', now.toISOString()]
    );

    // Call members (seat index 1, 2, 3)
    const cmOwnerId = `cm_${randomUUID()}`;
    const cmM2Id = `cm_${randomUUID()}`;
    const cmM3Id = `cm_${randomUUID()}`;

    // owner: seat 1, unmuted (is_muted = false)
    await client.query(
      'INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at) VALUES($1, $2, $3, $4, 1, false, $5)',
      [cmOwnerId, callId, roomId, uOwner.id, now.toISOString()]
    );
    // member2: seat 2, muted (is_muted = true)
    await client.query(
      'INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at) VALUES($1, $2, $3, $4, 2, true, $5)',
      [cmM2Id, callId, roomId, uM2.id, new Date(now.getTime() + 1000).toISOString()]
    );
    // member3: seat 3, muted (is_muted = true)
    await client.query(
      'INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index, is_muted, joined_at) VALUES($1, $2, $3, $4, 3, true, $5)',
      [cmM3Id, callId, roomId, uM3.id, new Date(now.getTime() + 2000).toISOString()]
    );

    // Call admissions: mediaIdentity format admission_<uuid> to strictly satisfy contracts regex
    const admOwnerId = `admission_${randomUUID()}`;
    const admM2Id = `admission_${randomUUID()}`;
    const admM3Id = `admission_${randomUUID()}`;

    const admissionExpiry = new Date(Date.now() + 60 * 1000).toISOString();

    await client.query(
      'INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, created_at) VALUES($1, $2, $3, $4, $5)',
      [admOwnerId, cmOwnerId, sessions[uOwner.id], admissionExpiry, now.toISOString()]
    );
    await client.query(
      'INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, created_at) VALUES($1, $2, $3, $4, $5)',
      [admM2Id, cmM2Id, sessions[uM2.id], admissionExpiry, now.toISOString()]
    );
    await client.query(
      'INSERT INTO call_admissions(id, call_member_id, session_id, expires_at, created_at) VALUES($1, $2, $3, $4, $5)',
      [admM3Id, cmM3Id, sessions[uM3.id], admissionExpiry, now.toISOString()]
    );

    // Call publish slot for owner (isPublishing = true)
    await client.query(
      'INSERT INTO call_publish_slots(id, call_group_id, user_id, ordinal, created_at) VALUES($1, $2, $3, 1, $4)',
      [`cps_${randomUUID()}`, callId, uOwner.id, now.toISOString()]
    );

    // Call restriction for member2 (micRestricted = true)
    await client.query(
      `INSERT INTO call_restrictions(id, call_group_id, target_user_id, restriction_type, issued_by, created_at)
       VALUES($1, $2, $3, 'MIC_MUTED', $4, $5)`,
      [`cr_${randomUUID()}`, callId, uM2.id, uOwner.id, now.toISOString()]
    );

    await client.query('COMMIT');

    return {
      owner: {
        id: uOwner.id,
        name: uOwner.name,
        sessionId: sessions[uOwner.id],
        callMemberId: cmOwnerId,
        admissionId: admOwnerId,
      },
      member2: {
        id: uM2.id,
        name: uM2.name,
        sessionId: sessions[uM2.id],
        callMemberId: cmM2Id,
        admissionId: admM2Id,
      },
      member3: {
        id: uM3.id,
        name: uM3.name,
        sessionId: sessions[uM3.id],
        callMemberId: cmM3Id,
        admissionId: admM3Id,
      },
      outsider: { id: uOut.id, sessionId: sessions[uOut.id] },
      banned: { id: uBan.id, sessionId: sessions[uBan.id] },
      notOnboarded: { id: uNoOnboard.id, sessionId: sessions[uNoOnboard.id] },
      room: { id: roomId, conversationId },
      call: { id: callId },
    };
  } catch (seedErr) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      throw new AggregateError([seedErr, rbErr], 'Seed transaction and rollback failed', {
        cause: rbErr,
      });
    }
    throw seedErr;
  } finally {
    client.release();
  }
}

jest.setTimeout(60000);

describe('T30 Call Participant Lease Batching Integration & Contract Suite', () => {
  beforeAll(async () => {
    originalDbUrl = process.env.DATABASE_URL;
    const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
    const db = new URL(env.DATABASE_URL!);
    db.searchParams.set('options', `-c search_path=${owned}`);
    dbUrl = db.href;

    pool = new pg.Pool({
      connectionString: dbUrl,
      max: 20,
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
    const seededGames = (
      await pool.query<{ id: string; title: string }>('SELECT id, title FROM games')
    ).rows;
    const val = seededGames.find((g) => g.title === 'Valorant');
    if (!val) {
      throw new Error('Required seeded Valorant game not found');
    }
    valorantGame = val;

    process.env.DATABASE_URL = dbUrl;

    // Direct instantiation with minimal inert dependency substitutes.
    // CallsService.participants executes DB actor/session/ban/room/group guards and calls zero auth/rooms methods.
    const mockAuthService = {
      setCallHooks: () => {},
    } as unknown as AuthService;

    const mockRoomsService = {
      setCallRevoker: () => {},
    } as unknown as RoomsService;

    callsService = new CallsService(mockAuthService, mockRoomsService);
    callsPool = new pg.Pool({
      connectionString: dbUrl,
      max: 16,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
    });
    (callsService as unknown as CallsServiceWithPool).pool = callsPool;
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    const cleanup={schemaRemoved:false,callsPoolEnded:false,bootstrapPoolEnded:false,queryDelegateRestored:false,databaseEnvironmentRestored:false};
    try { await callsPool?.end(); cleanup.callsPoolEnded=Boolean(callsPool); } catch(error){errors.push(error);}
    try { if(schemaCreated){expect(owned).toMatch(/^t30_call_lease_batch_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA "${owned}" CASCADE`);cleanup.schemaRemoved=(await pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[owned])).rowCount===0;expect(cleanup.schemaRemoved).toBe(true);} } catch(error){errors.push(error);}
    if(originalDbUrl!==undefined)process.env.DATABASE_URL=originalDbUrl;else delete process.env.DATABASE_URL;
    cleanup.databaseEnvironmentRestored=process.env.DATABASE_URL===originalDbUrl;
    pg.Client.prototype.query=originalClientQuery;cleanup.queryDelegateRestored=pg.Client.prototype.query===originalClientQuery;
    try {await pool?.end();cleanup.bootstrapPoolEnded=Boolean(pool);}catch(error){errors.push(error);}
    fs.writeFileSync(path.join(root,'quality/evidence/T30/call-participant-lease-batch-cleanup-'+owned.slice('t30_call_lease_batch_'.length)+'.json'),JSON.stringify({recordedAt:new Date().toISOString(),...cleanup,errorCount:errors.length},null,2)+'\n',{flag:'wx'});
    if(errors.length)throw new AggregateError(errors,'Owned call lease batch cleanup failed');
  });

  describe('1. Single Guarded Lease Query Batch Consolidation during CallsService.participants (Counter RED/GREEN Case)', () => {
    it('executes exactly 1 guarded lease query during CallsService.participants with 3 valid callers (Counter RED on unbatched source)', async () => {
      const fixture = await seedFixture();

      const { result: participants, count: leaseQueryCount } = await countLeaseQueriesDuring(() =>
        callsService.participants(fixture.owner.id, fixture.owner.sessionId, fixture.call.id)
      );

      // On unbatched original source: participantDtos runs serial per-row await liveLease -> 3 queries (true SQL counter RED).
      // On proposed batched source: candidate admissions fetched once via batched liveLeases -> exactly 1 query (GREEN).
      expect(leaseQueryCount).toBe(1);

      expect(participants).toHaveLength(3);

      // Full DTO contract verification: order, seat, media identity, flags, and ISO datetime
      for (const p of participants) {
        expect(() => CallParticipantSchema.parse(p)).not.toThrow();
        expect(() => IsoDateTimeSchema.parse(p.joinedAt)).not.toThrow();
      }

      // Seat 1: Caller One (owner, publisher, unmuted)
      expect(participants[0].userId).toBe(fixture.owner.id);
      expect(participants[0].mediaIdentity).toBe(fixture.owner.admissionId);
      expect(participants[0].isPublishing).toBe(true);
      expect(participants[0].isMuted).toBe(false);
      expect(participants[0].micRestricted).toBe(false);
      expect(participants[0].user?.displayName).toBe('Caller One');
      expect(participants[0].user?.avatarUrl).toBe('https://cdn.invalid/c1.png');
      expect(participants[0].user?.customStatus).toBe('PLAYING');

      // Seat 2: Caller Two (muted, micRestricted via call_restrictions)
      expect(participants[1].userId).toBe(fixture.member2.id);
      expect(participants[1].mediaIdentity).toBe(fixture.member2.admissionId);
      expect(participants[1].isPublishing).toBe(false);
      expect(participants[1].isMuted).toBe(true);
      expect(participants[1].micRestricted).toBe(true);
      expect(participants[1].user?.displayName).toBe('Caller Two');
      expect(participants[1].user?.avatarUrl).toBeNull();
      expect(participants[1].user?.customStatus).toBe('JUST_CHATTING');

      // Seat 3: Caller Three (muted, normal member)
      expect(participants[2].userId).toBe(fixture.member3.id);
      expect(participants[2].mediaIdentity).toBe(fixture.member3.admissionId);
      expect(participants[2].isPublishing).toBe(false);
      expect(participants[2].isMuted).toBe(true);
      expect(participants[2].micRestricted).toBe(false);
      expect(participants[2].user?.displayName).toBe('Caller Three');
      expect(participants[2].user?.avatarUrl).toBe('https://cdn.invalid/c3.png');
      expect(participants[2].user?.customStatus).toBe('LOOKING_FOR_TEAM');
    });

    it('returns empty array with 0 lease queries when call group has zero participants', async () => {
      const fixture = await seedFixture();

      const emptyCallId = `call_empty_${randomUUID()}`;
      await pool.query(
        'INSERT INTO call_groups(id, room_id, state, created_at) VALUES($1, $2, $3, now())',
        [emptyCallId, fixture.room.id, 'OPEN']
      );

      const { result: emptyParticipants, count: emptyCount } = await countLeaseQueriesDuring(() =>
        callsService.participants(fixture.owner.id, fixture.owner.sessionId, emptyCallId)
      );

      expect(emptyCount).toBe(0);
      expect(emptyParticipants).toEqual([]);
    });
  });

  describe('2. Standalone Bulk Helper liveLeases Contract & Equivalence', () => {
    it('bulk helper liveLeases is exported and returns empty array with 0 SQL queries for empty input', async () => {
      // Unbatched current source does not yet export liveLeases; this fails assertion intentionally (RED).
      expect(typeof liveLeasesFn).toBe('function');
      const { result, count, totalCount } = await countLeaseQueriesDuring(() => liveLeasesFn!(pool, []));
      expect(count).toBe(0);
      expect(result).toEqual([]);
      expect(totalCount).toBe(0);
    });

    it('bulk helper liveLeases fetches matching leases with 1 SQL query and handles absent IDs and duplicates', async () => {
      expect(typeof liveLeasesFn).toBe('function');
      const fixture = await seedFixture();
      const absentId = `admission_absent_${randomUUID()}`;
      const inputIds = [
        fixture.owner.admissionId,
        absentId,
        fixture.owner.admissionId,
        fixture.member2.admissionId,
      ];

      const { result: leases, count } = await countLeaseQueriesDuring(() =>
        liveLeasesFn!(pool, inputIds)
      );

      expect(count).toBe(1);
      expect(leases).toBeDefined();
      const returnedIds = leases.map((l) => l.id);
      expect(returnedIds).toHaveLength(2);
      expect(returnedIds).toContain(fixture.owner.admissionId);
      expect(returnedIds).toContain(fixture.member2.admissionId);
      expect(returnedIds).not.toContain(absentId);
    });

    it('bulk helper liveLeases returns results structurally equivalent to individual liveLease calls', async () => {
      expect(typeof liveLeasesFn).toBe('function');
      const fixture = await seedFixture();
      const candidateIds = [
        fixture.owner.admissionId,
        fixture.member2.admissionId,
        fixture.member3.admissionId,
      ];

      // Single queries executed individually
      const individualLeases: Array<leaseStore.LiveLease | undefined> = [];
      for (const id of candidateIds) {
        individualLeases.push(await leaseStore.liveLease(pool, id));
      }

      // Bulk call
      const { result: bulkLeases, count } = await countLeaseQueriesDuring(() =>
        liveLeasesFn!(pool, candidateIds)
      );

      expect(count).toBe(1);
      expect(bulkLeases).toHaveLength(3);

      for (let i = 0; i < candidateIds.length; i++) {
        const single = individualLeases[i];
        expect(single).toBeDefined();
        const fromBulk = bulkLeases.find((b) => b.id === candidateIds[i]);
        expect(fromBulk).toBeDefined();
        expect(fromBulk).toEqual(single);
      }
    });
  });

  describe('3. Lease Invalidation Branches & Negative Participant Tests', () => {
    it('omits participant with revoked lease admission (revoked_at IS NOT NULL) while preserving other valid callers', async () => {
      const fixture = await seedFixture();

      await pool.query(
        'UPDATE call_admissions SET revoked_at = clock_timestamp() WHERE id = $1',
        [fixture.member3.admissionId]
      );

      const res = await callsService.participants(
        fixture.owner.id,
        fixture.owner.sessionId,
        fixture.call.id
      );

      expect(res).toHaveLength(2);
      expect(res.map((p) => p.userId)).toEqual([fixture.owner.id, fixture.member2.id]);
      expect(res.find((p) => p.userId === fixture.member3.id)).toBeUndefined();
      for (const p of res) {
        expect(() => CallParticipantSchema.parse(p)).not.toThrow();
      }
    });

    it('omits participant with expired admission (created_at earlier to obey check constraint) while preserving other callers', async () => {
      const fixture = await seedFixture();

      await pool.query(
        "UPDATE call_admissions SET created_at = clock_timestamp() - interval '2 minutes', expires_at = clock_timestamp() - interval '1 minute' WHERE id = $1",
        [fixture.member3.admissionId]
      );

      const res = await callsService.participants(
        fixture.owner.id,
        fixture.owner.sessionId,
        fixture.call.id
      );

      expect(res).toHaveLength(2);
      expect(res.map((p) => p.userId)).toEqual([fixture.owner.id, fixture.member2.id]);
      expect(res.find((p) => p.userId === fixture.member3.id)).toBeUndefined();
    });

    it('omits participant disconnected > 30 seconds but includes participant within 30-second reconnect window', async () => {
      const fixture = await seedFixture();

      // Case A: Disconnected > 30s (exceeded grace period -> omitted)
      await pool.query(
        "UPDATE call_admissions SET disconnected_at = clock_timestamp() - interval '35 seconds' WHERE id = $1",
        [fixture.member3.admissionId]
      );

      const resDisconnected = await callsService.participants(
        fixture.owner.id,
        fixture.owner.sessionId,
        fixture.call.id
      );
      expect(resDisconnected.map((p) => p.userId)).toEqual([fixture.owner.id, fixture.member2.id]);
      expect(resDisconnected.find((p) => p.userId === fixture.member3.id)).toBeUndefined();

      // Case B: Reconnected within 30s (< 30s -> valid reconnect -> included)
      await pool.query(
        "UPDATE call_admissions SET disconnected_at = clock_timestamp() - interval '10 seconds' WHERE id = $1",
        [fixture.member3.admissionId]
      );

      const resReconnected = await callsService.participants(
        fixture.owner.id,
        fixture.owner.sessionId,
        fixture.call.id
      );
      expect(resReconnected.map((p) => p.userId)).toEqual([
        fixture.owner.id,
        fixture.member2.id,
        fixture.member3.id,
      ]);
      expect(resReconnected.find((p) => p.userId === fixture.member3.id)).toBeDefined();
    });

    it('omits participant when call_members.left_at is set while preserving other valid callers', async () => {
      const fixture = await seedFixture();

      await pool.query('UPDATE call_members SET left_at = clock_timestamp() WHERE id = $1', [
        fixture.member3.callMemberId,
      ]);

      const res = await callsService.participants(
        fixture.owner.id,
        fixture.owner.sessionId,
        fixture.call.id
      );

      expect(res).toHaveLength(2);
      expect(res.map((p) => p.userId)).toEqual([fixture.owner.id, fixture.member2.id]);
      expect(res.find((p) => p.userId === fixture.member3.id)).toBeUndefined();
    });

    it('omits participant when session is expired, deleted, or belongs to another user', async () => {
      const fixture = await seedFixture();

      // Sub-case A: Session expired
      await pool.query(
        "UPDATE session SET expires_at = clock_timestamp() - interval '1 minute' WHERE id = $1",
        [fixture.member3.sessionId]
      );

      const resExpired = await callsService.participants(
        fixture.owner.id,
        fixture.owner.sessionId,
        fixture.call.id
      );
      expect(resExpired.map((p) => p.userId)).toEqual([fixture.owner.id, fixture.member2.id]);

      // Sub-case B: Session wrong owner (user_id mismatch)
      await pool.query(
        "UPDATE session SET expires_at = clock_timestamp() + interval '1 day', user_id = $1 WHERE id = $2",
        [fixture.owner.id, fixture.member3.sessionId]
      );

      const resWrongOwner = await callsService.participants(
        fixture.owner.id,
        fixture.owner.sessionId,
        fixture.call.id
      );
      expect(resWrongOwner.map((p) => p.userId)).toEqual([fixture.owner.id, fixture.member2.id]);
      await pool.query("UPDATE session SET user_id=$1,expires_at=clock_timestamp()+interval '1 day' WHERE id=$2",[fixture.member3.id,fixture.member3.sessionId]);
      expect((await callsService.participants(fixture.owner.id,fixture.owner.sessionId,fixture.call.id)).map(p=>p.userId)).toEqual([fixture.owner.id,fixture.member2.id,fixture.member3.id]);
      await pool.query('DELETE FROM session WHERE id=$1',[fixture.member3.sessionId]);
      expect((await callsService.participants(fixture.owner.id,fixture.owner.sessionId,fixture.call.id)).map(p=>p.userId)).toEqual([fixture.owner.id,fixture.member2.id]);
    });

    it('omits participant when room membership is revoked while preserving other valid callers', async () => {
      const fixture = await seedFixture();

      await pool.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [
        fixture.room.id,
        fixture.member3.id,
      ]);

      const res = await callsService.participants(
        fixture.owner.id,
        fixture.owner.sessionId,
        fixture.call.id
      );

      expect(res).toHaveLength(2);
      expect(res.map((p) => p.userId)).toEqual([fixture.owner.id, fixture.member2.id]);
    });

    it('omits participant when profile is missing while preserving other valid callers', async () => {
      const fixture = await seedFixture();

      await pool.query('DELETE FROM profiles WHERE user_id = $1', [fixture.member3.id]);

      const res = await callsService.participants(
        fixture.owner.id,
        fixture.owner.sessionId,
        fixture.call.id
      );

      expect(res).toHaveLength(2);
      expect(res.map((p) => p.userId)).toEqual([fixture.owner.id, fixture.member2.id]);
    });

    it('omits participant when game interest is missing while preserving other valid callers', async () => {
      const fixture = await seedFixture();

      await pool.query('DELETE FROM game_interests WHERE user_id = $1', [fixture.member3.id]);

      const res = await callsService.participants(
        fixture.owner.id,
        fixture.owner.sessionId,
        fixture.call.id
      );

      expect(res).toHaveLength(2);
      expect(res.map((p) => p.userId)).toEqual([fixture.owner.id, fixture.member2.id]);
    });

    it('omits participant upon admin BAN and restores participant upon subsequent UNBAN', async () => {
      const fixture = await seedFixture();

      // Apply BAN action
      await pool.query(
        "INSERT INTO admin_actions(id, actor_id, target_user_id, action, created_at) VALUES($1, $2, $3, 'BAN', clock_timestamp())",
        [`ban_act_${randomUUID()}`, fixture.owner.id, fixture.member3.id]
      );

      const resBan = await callsService.participants(
        fixture.owner.id,
        fixture.owner.sessionId,
        fixture.call.id
      );
      expect(resBan.map((p) => p.userId)).toEqual([fixture.owner.id, fixture.member2.id]);
      expect(resBan.find((p) => p.userId === fixture.member3.id)).toBeUndefined();

      // Apply subsequent UNBAN action
      await pool.query(
        "INSERT INTO admin_actions(id, actor_id, target_user_id, action, created_at) VALUES($1, $2, $3, 'UNBAN', clock_timestamp() + interval '1 second')",
        [`unban_act_${randomUUID()}`, fixture.owner.id, fixture.member3.id]
      );

      const resUnban = await callsService.participants(
        fixture.owner.id,
        fixture.owner.sessionId,
        fixture.call.id
      );
      expect(resUnban.map((p) => p.userId)).toEqual([
        fixture.owner.id,
        fixture.member2.id,
        fixture.member3.id,
      ]);
      expect(resUnban.find((p) => p.userId === fixture.member3.id)).toBeDefined();
    });
  });

  describe('4. Caller Access Authority & Frozen Error Contracts', () => {
    it('rejects with 404 NOT_FOUND when call group does not exist', async () => {
      const fixture = await seedFixture();
      await expectHttpError(
        () =>
          callsService.participants(
            fixture.owner.id,
            fixture.owner.sessionId,
            `call_nonexistent_${randomUUID()}`
          ),
        404,
        ErrorCode.NOT_FOUND,
        'Call not found'
      );
    });

    it('rejects with 409 CALL_CLOSED when call group is closed', async () => {
      const fixture = await seedFixture();
      const closedCallId = `call_closed_${randomUUID()}`;
      await pool.query(
        'INSERT INTO call_groups(id, room_id, state, created_at) VALUES($1, $2, $3, now())',
        [closedCallId, fixture.room.id, 'CLOSED']
      );

      await expectHttpError(
        () => callsService.participants(fixture.owner.id, fixture.owner.sessionId, closedCallId),
        409,
        ErrorCode.CALL_CLOSED,
        'Call is closed'
      );
    });

    it('rejects with 403 FORBIDDEN when reading actor is not a room member (outsider)', async () => {
      const fixture = await seedFixture();
      await expectHttpError(
        () =>
          callsService.participants(
            fixture.outsider.id,
            fixture.outsider.sessionId,
            fixture.call.id
          ),
        403,
        ErrorCode.FORBIDDEN,
        'Current room membership required'
      );
    });

    it('rejects with 401 LOGIN_REQUIRED when reading actor session is expired', async () => {
      const fixture = await seedFixture();
      const expiredSessionId = `sess_exp_${randomUUID()}`;
      await pool.query(
        "INSERT INTO \"session\"(id, token, user_id, expires_at, created_at, updated_at) VALUES($1, $2, $3, clock_timestamp() - interval '1 minute', now(), now())",
        [expiredSessionId, `tok_${randomUUID()}`, fixture.owner.id]
      );

      await expectHttpError(
        () => callsService.participants(fixture.owner.id, expiredSessionId, fixture.call.id),
        401,
        ErrorCode.LOGIN_REQUIRED,
        'Session expired or revoked'
      );
    });

    it('rejects with 403 FORBIDDEN when reading actor is banned', async () => {
      const fixture = await seedFixture();
      await expectHttpError(
        () =>
          callsService.participants(fixture.banned.id, fixture.banned.sessionId, fixture.call.id),
        403,
        ErrorCode.FORBIDDEN,
        'Account is banned'
      );
    });

    it('rejects with 403 FORBIDDEN when reading actor is not onboarded (missing game interest)', async () => {
      const fixture = await seedFixture();
      await expectHttpError(
        () =>
          callsService.participants(
            fixture.notOnboarded.id,
            fixture.notOnboarded.sessionId,
            fixture.call.id
          ),
        403,
        ErrorCode.FORBIDDEN,
        'Onboarding required'
      );
    });
  });

  describe('5. Post-Lock-Wait Actor State Guard Race (Writer Room UPDATE vs Reader participants SHARE)', () => {
    it('blocks reader on writer held FOR UPDATE lock, detects blocking via pg_blocking_pids, and rejects with 401 on invalidated session upon lock release', async () => {
      const fixture = await seedFixture();

      const writerClient = await pool.connect();
      const writerPid = (writerClient as unknown as { processID: number }).processID;

      let writerBegan = false;
      let writerCommitted = false;
      let readerPromise: Promise<CallParticipantDTO[]> | undefined;
      const cleanupErrors: unknown[] = [];
      let testError: unknown;

      try {
        expect(writerPid).toBeTruthy();

        // 1. Writer acquires exclusive row lock on room
        await writerClient.query('BEGIN');
        writerBegan = true;
        await writerClient.query('SELECT * FROM rooms WHERE id = $1 FOR UPDATE', [fixture.room.id]);

        // 2. Reader starts participants() which requests FOR SHARE on the same room row
        readerPromise = callsService.participants(
          fixture.owner.id,
          fixture.owner.sessionId,
          fixture.call.id
        );
        // Suppress unhandled rejection while in-flight
        readerPromise.catch(() => {});

        // 3. Verify reader is actually blocked by writer in PostgreSQL via pg_blocking_pids
        let readerBlockedByWriter = false;
        let blockedReaderPid: number | null = null;
        const barrierStart = Date.now();

        while (Date.now() - barrierStart < 1500) {
          const check = await pool.query<{ pid: number; blockers: number[] }>(
            `SELECT pid, pg_blocking_pids(pid) AS blockers
             FROM pg_stat_activity a
             WHERE $1 = ANY(pg_blocking_pids(a.pid))
             AND EXISTS(SELECT 1 FROM pg_locks l JOIN pg_class c ON c.oid=l.relation JOIN pg_namespace n ON n.oid=c.relnamespace WHERE l.pid=a.pid AND n.nspname=$2 AND c.relname='rooms')`,
            [writerPid,owned]
          );
          if (check.rows.length > 0) {
            readerBlockedByWriter = true;
            blockedReaderPid = check.rows[0].pid;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }

        expect(readerBlockedByWriter).toBe(true);
        expect(blockedReaderPid).toBeTruthy();

        // 4. While reader is blocked waiting for room lock, mutate the reading actor's session
        await pool.query(
          "UPDATE session SET expires_at = clock_timestamp() - interval '1 minute' WHERE id = $1",
          [fixture.owner.sessionId]
        );

        // 5. Writer commits and releases the lock
        await writerClient.query('COMMIT');
        writerCommitted = true;

        // 6. Reader wakes up, proceeds to actor check, and rejects with 401 LOGIN_REQUIRED (no stale DTO returned)
        try {
          await awaitWithTimeout(readerPromise, 1500, 'reader completion after lock release');
          throw new Error('Expected reader to throw HttpException, but it succeeded');
        } catch (err) {
          expect(err).toBeInstanceOf(HttpException);
          const httpErr = err as HttpException;
          expect(httpErr.getStatus()).toBe(401);
          const res = httpErr.getResponse() as { code?: string; message?: string };
          expect(res.code).toBe(ErrorCode.LOGIN_REQUIRED);
          expect(res.message).toBe('Session expired or revoked');
        }
      } catch (err) {
        testError = err;
      } finally {
        if (writerBegan && !writerCommitted) {
          try {
            await writerClient.query('ROLLBACK');
          } catch (rbErr) {
            cleanupErrors.push(rbErr);
          }
        }
        try {
          writerClient.release();
        } catch (relErr) {
          cleanupErrors.push(relErr);
        }
        if (readerPromise) {
          try {
            await readerPromise;
          } catch {
            // Expected rejection caught above
          }
        }
      }

      if (testError !== undefined || cleanupErrors.length) {
        throw new AggregateError(
          [...(testError === undefined ? [] : [testError]), ...cleanupErrors],
          'Post-lock-wait guard race assertion or cleanup failed',
          { cause: testError }
        );
      }
    });
  });

  describe('6. Late Lease Revocation Before Query Execution (Fresh Database Guard State)', () => {
    it('omits participant concurrently revoked right before lease query executes, rejecting stale pre-query states', async () => {
      const fixture = await seedFixture();

      let hookFired = false;
      const wrappedQuery = function (this: unknown, ...args: unknown[]) {
        const raw =
          typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
        if (!hookFired && /\bfrom\s+["']?call_admissions["']?\s+a\b/i.test(raw)) {
          hookFired = true;
          // Intercept right before query executes in PostgreSQL: revoke caller3 admission concurrently
          return (async () => {
            await pool.query(
              'UPDATE call_admissions SET revoked_at = clock_timestamp() WHERE id = $1',
              [fixture.member3.admissionId]
            );
            return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(
              this,
              args
            );
          })();
        }
        return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
      };

      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;

      try {
        const res = await callsService.participants(
          fixture.owner.id,
          fixture.owner.sessionId,
          fixture.call.id
        );
        expect(hookFired).toBe(true);

        // Caller3 was revoked right before the lease query ran, so caller3 MUST be omitted
        expect(res.map((p) => p.userId)).toEqual([fixture.owner.id, fixture.member2.id]);
        expect(res.find((p) => p.userId === fixture.member3.id)).toBeUndefined();

        // Caller1 and caller2 remain valid and fully populated
        expect(res[0].userId).toBe(fixture.owner.id);
        expect(res[1].userId).toBe(fixture.member2.id);
        for (const p of res) {
          expect(() => CallParticipantSchema.parse(p)).not.toThrow();
        }
      } finally {
        pg.Client.prototype.query = originalClientQuery;
      }
    });
    it('omits participant expired right before lease query executes, rejecting stale pre-query states', async () => {
      const fixture = await seedFixture();

      let hookFired = false;
      const wrappedQuery = function (this: unknown, ...args: unknown[]) {
        const raw =
          typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
        if (!hookFired && /\bfrom\s+["']?call_admissions["']?\s+a\b/i.test(raw)) {
          hookFired = true;
          // Intercept right before query executes in PostgreSQL: revoke caller3 admission concurrently
          return (async () => {
            await pool.query(
              'UPDATE call_admissions SET created_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE id = $1',
              [fixture.member3.admissionId]
            );
            return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(
              this,
              args
            );
          })();
        }
        return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
      };

      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;

      try {
        const res = await callsService.participants(
          fixture.owner.id,
          fixture.owner.sessionId,
          fixture.call.id
        );
        expect(hookFired).toBe(true);

        // Caller3 was expired right before the lease query ran, so caller3 MUST be omitted
        expect(res.map((p) => p.userId)).toEqual([fixture.owner.id, fixture.member2.id]);
        expect(res.find((p) => p.userId === fixture.member3.id)).toBeUndefined();

        // Caller1 and caller2 remain valid and fully populated
        expect(res[0].userId).toBe(fixture.owner.id);
        expect(res[1].userId).toBe(fixture.member2.id);
        for (const p of res) {
          expect(() => CallParticipantSchema.parse(p)).not.toThrow();
        }
      } finally {
        pg.Client.prototype.query = originalClientQuery;
      }
    });
  });
});
