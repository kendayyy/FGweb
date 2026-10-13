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
import { HttpException, NotFoundException } from '@nestjs/common';
import * as tables from '@fg/database';
import {
  ErrorCode,
  PublicProfileSchema,
  RoomMemberSchema,
  type ProfileDTO,
  type RoomMemberDTO,
  IsoDateTimeSchema,
} from '@fg/contracts';
import { ProfilesService } from '../src/modules/profiles/profiles.service.js';
import { RoomsService } from '../src/modules/rooms/rooms.service.js';

function findWorkspaceRoot(startDir: string): string {
  let curr = startDir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(curr, '.env.local')) || fs.existsSync(path.join(curr, 'packages/database/migrations'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(startDir, '../../..');
}

const root = findWorkspaceRoot(path.dirname(fileURLToPath(import.meta.url)));
const owned = `t30_room_profile_${randomUUID().replaceAll('-', '')}`;

let pool: pg.Pool;
let dbUrl: string;
let originalDbUrl: string | undefined;
let schemaCreated = false;
let profilesService: ProfilesService;
let roomsService: RoomsService;
let valorantGame: { id: string; title: string };
let lolGame: { id: string; title: string };

const originalClientQuery = pg.Client.prototype.query;

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
  expectedMessage: string
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
    expect(response.message).toBe(expectedMessage);
  }
}

async function countQueriesDuring<T>(
  action: () => Promise<T>,
  filter?: (queryText: string) => boolean
): Promise<{ result: T; count: number; queries: string[] }> {
  const matchedQueries: string[] = [];
  const wrappedQuery = function (this: unknown, ...args: unknown[]) {
    const raw = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
    if (!filter || filter(raw)) {
      matchedQueries.push(raw);
    }
    return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
  };

  pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;
  try {
    const result = await action();
    return { result, count: matchedQueries.length, queries: matchedQueries };
  } finally {
    pg.Client.prototype.query = originalClientQuery;
  }
}

interface FixtureData {
  owner: { id: string; sessionId: string };
  helper: { id: string; sessionId: string };
  member1: { id: string; sessionId: string };
  member2: { id: string; sessionId: string };
  member3: { id: string; sessionId: string };
  member4: { id: string; sessionId: string };
  outsider: { id: string; sessionId: string };
  banned: { id: string; sessionId: string };
  expiredSessionId: string;
  room: { id: string; conversationId: string };
}

async function seedFixture(): Promise<FixtureData> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS ALL DEFERRED');

    const now = new Date();
    const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const pastExpiry = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const users = [
      { id: `u_owner_${randomUUID()}`, name: 'Owner User', email: `owner_${randomUUID()}@fixture.invalid`, image: 'https://cdn.invalid/owner-img.png' },
      { id: `u_helper_${randomUUID()}`, name: 'Helper User', email: `helper_${randomUUID()}@fixture.invalid`, image: 'https://cdn.invalid/helper-img.png' },
      { id: `u_mem1_${randomUUID()}`, name: 'Member One', email: `mem1_${randomUUID()}@fixture.invalid`, image: null },
      { id: `u_mem2_${randomUUID()}`, name: 'Member Two', email: `mem2_${randomUUID()}@fixture.invalid`, image: 'https://cdn.invalid/mem2-img.png' },
      { id: `u_mem3_${randomUUID()}`, name: 'Member Three', email: `mem3_${randomUUID()}@fixture.invalid`, image: 'https://cdn.invalid/mem3-img.png' },
      { id: `u_mem4_${randomUUID()}`, name: 'Member Four', email: `mem4_${randomUUID()}@fixture.invalid`, image: 'https://cdn.invalid/mem4-img.png' },
      { id: `u_out_${randomUUID()}`, name: 'Outsider User', email: `out_${randomUUID()}@fixture.invalid`, image: null },
      { id: `u_ban_${randomUUID()}`, name: 'Banned User', email: `ban_${randomUUID()}@fixture.invalid`, image: null },
    ];

    for (const u of users) {
      await client.query(
        'INSERT INTO "user"(id, name, email, email_verified, image, created_at, updated_at) VALUES($1, $2, $3, true, $4, $5, $5)',
        [u.id, u.name, u.email, u.image, now.toISOString()]
      );
    }

    // Profiles
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [users[0].id, 'Owner Pro', 'https://cdn.invalid/custom-owner.png', 'Owner bio', 'PLAYING', now.toISOString()]
    );
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [users[1].id, 'Helper Master', null, 'Helper bio', 'LOOKING_FOR_TEAM', now.toISOString()]
    );
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [users[2].id, 'Member One', null, null, 'JUST_CHATTING', now.toISOString()]
    );
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [users[3].id, 'Member Two', 'https://cdn.invalid/custom-m2.png', 'M2 bio', 'PLAYING', now.toISOString()]
    );
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [users[4].id, 'Member Three', 'https://cdn.invalid/custom-m3.png', 'M3 bio', 'JUST_CHATTING', now.toISOString()]
    );
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [users[5].id, 'Member Four', 'https://cdn.invalid/custom-m4.png', 'M4 bio', 'JUST_CHATTING', now.toISOString()]
    );
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [users[6].id, 'Outsider', null, null, 'JUST_CHATTING', now.toISOString()]
    );
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [users[7].id, 'Banned Guy', null, null, 'JUST_CHATTING', now.toISOString()]
    );

    // Game profiles
    await client.query(
      `INSERT INTO game_profiles(id, user_id, game_id, in_game_name, rank, role, play_hours, play_style, created_at, updated_at)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [`gp_${randomUUID()}`, users[0].id, valorantGame.id, 'OwnerVal#123', 'Radiant', 'Duelist', 500, 'Aggressive', now.toISOString()]
    );
    await client.query(
      `INSERT INTO game_profiles(id, user_id, game_id, in_game_name, rank, role, play_hours, play_style, created_at, updated_at)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [`gp_${randomUUID()}`, users[1].id, lolGame.id, 'HelperLOL#456', 'Challenger', 'Mid', 1200, 'Strategic', now.toISOString()]
    );
    await client.query(
      `INSERT INTO game_profiles(id, user_id, game_id, in_game_name, rank, role, play_hours, play_style, created_at, updated_at)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [`gp_${randomUUID()}`, users[3].id, valorantGame.id, 'M2Val#789', 'Immortal', 'Initiator', 350, 'Team-player', now.toISOString()]
    );

    // Sessions
    const sessions: Record<string, string> = {};
    for (const u of users) {
      const sId = `sess_${randomUUID()}`;
      sessions[u.id] = sId;
      await client.query(
        'INSERT INTO "session"(id, token, user_id, expires_at, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $5)',
        [sId, `tok_${randomUUID()}`, u.id, futureExpiry, now.toISOString()]
      );
    }

    const expiredSessionId = `sess_exp_${randomUUID()}`;
    await client.query(
      'INSERT INTO "session"(id, token, user_id, expires_at, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $5)',
      [expiredSessionId, `tok_${randomUUID()}`, users[0].id, pastExpiry, now.toISOString()]
    );

    // Ban for banned user
    await client.query(
      'INSERT INTO admin_actions(id, actor_id, target_user_id, action, reason, created_at) VALUES($1, $2, $3, $4, $5, $6)',
      [`adm_${randomUUID()}`, users[0].id, users[7].id, 'BAN', 'Violation of terms', now.toISOString()]
    );

    // Room conversation
    const conversationId = `conv_${randomUUID()}`;
    await client.query(
      `INSERT INTO conversations(id, kind, created_at, updated_at) VALUES($1, 'ROOM', $2, $2)`,
      [conversationId, now.toISOString()]
    );

    // Room
    const roomId = `room_${randomUUID()}`;
    await client.query(
      `INSERT INTO rooms(id, name, description, game_id, owner_id, owner_role, visibility, invite_policy, player_capacity, conversation_id, conversation_kind, created_at, updated_at)
       VALUES($1, $2, $3, $4, $5, 'OWNER', 'PUBLIC', 'OWNER_APPROVAL', 10, $6, 'ROOM', $7, $7)`,
      [roomId, 'Test Batch Room', 'Room description', valorantGame.id, users[0].id, conversationId, now.toISOString()]
    );

    // Room members (joined_at staggered by 1 second)
    const roles: Array<{ userIdx: number; role: 'OWNER' | 'HELPER' | 'MEMBER'; offsetSec: number }> = [
      { userIdx: 0, role: 'OWNER', offsetSec: 0 },
      { userIdx: 1, role: 'HELPER', offsetSec: 1 },
      { userIdx: 2, role: 'MEMBER', offsetSec: 2 },
      { userIdx: 3, role: 'MEMBER', offsetSec: 3 },
      { userIdx: 4, role: 'MEMBER', offsetSec: 4 },
      { userIdx: 5, role: 'MEMBER', offsetSec: 5 },
    ];

    for (const r of roles) {
      const joinedDate = new Date(now.getTime() + r.offsetSec * 1000).toISOString();
      await client.query(
        `INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, $3, $4, $5)`,
        [`rm_${randomUUID()}`, roomId, users[r.userIdx].id, r.role, joinedDate]
      );
    }

    // Permission grants for helper
    await client.query(
      `INSERT INTO permission_grants(id, room_id, user_id, grantee_role, permission, granted_by, granted_at)
       VALUES($1, $2, $3, 'HELPER', 'MANAGE_MEMBERS', $4, $5)`,
      [`pg_${randomUUID()}`, roomId, users[1].id, users[0].id, now.toISOString()]
    );

    await client.query('COMMIT');

    return {
      owner: { id: users[0].id, sessionId: sessions[users[0].id] },
      helper: { id: users[1].id, sessionId: sessions[users[1].id] },
      member1: { id: users[2].id, sessionId: sessions[users[2].id] },
      member2: { id: users[3].id, sessionId: sessions[users[3].id] },
      member3: { id: users[4].id, sessionId: sessions[users[4].id] },
      member4: { id: users[5].id, sessionId: sessions[users[5].id] },
      outsider: { id: users[6].id, sessionId: sessions[users[6].id] },
      banned: { id: users[7].id, sessionId: sessions[users[7].id] },
      expiredSessionId,
      room: { id: roomId, conversationId },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

jest.setTimeout(60000);

describe('FG T30 - Room Profile Batch Consolidation and Authority Integration', () => {
  let fixture: FixtureData;

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
    const seededGames = (await pool.query<{ id: string; title: string }>('SELECT id, title FROM games')).rows;
    const val = seededGames.find((g) => g.title === 'Valorant');
    const lol = seededGames.find((g) => g.title === 'Liên Minh Huyền Thoại');
    if (!val || !lol) {
      throw new Error('Required seeded games not found');
    }
    valorantGame = val;
    lolGame = lol;

    process.env.DATABASE_URL = dbUrl;
    profilesService = new ProfilesService();
    profilesService.onModuleInit();

    roomsService = new RoomsService(profilesService);
    roomsService.onModuleInit();

    fixture = await seedFixture();
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      try { await roomsService?.onModuleDestroy(); } catch (error) { errors.push(error); }
      try { await profilesService?.onModuleDestroy(); } catch (error) { errors.push(error); }
      try {
        if (schemaCreated) {
          expect(owned).toMatch(/^t30_room_profile_[a-f0-9]{32}$/);
          await pool.query(`DROP SCHEMA "${owned}" CASCADE`);
          expect((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1', [owned])).rowCount).toBe(0);
        }
      } catch (error) { errors.push(error); }
    } finally {
      if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl;
      else delete process.env.DATABASE_URL;
      pg.Client.prototype.query = originalClientQuery;
      try { await pool?.end(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'T30 room-profile batch test cleanup failed');
  });

  describe('1. Single Profile Query Batch Consolidation during listRoomMembers', () => {
    it('executes exactly 1 SQL query targeting user table during listRoomMembers with 6 members', async () => {
      const spyBatch = jest.spyOn(profilesService, 'getPublicProfiles');
      const spySingle = jest.spyOn(profilesService, 'getPublicProfile');

      const { result: members, count: profileQueryCount } = await countQueriesDuring(
        () => roomsService.listRoomMembers(fixture.owner.id, fixture.owner.sessionId, fixture.room.id),
        (q) => /from\s+["']?user["']?/i.test(q)
      );

      expect(spyBatch).toHaveBeenCalledTimes(1);
      expect(spyBatch).toHaveBeenCalledWith([
        fixture.owner.id,
        fixture.helper.id,
        fixture.member1.id,
        fixture.member2.id,
        fixture.member3.id,
        fixture.member4.id,
      ]);
      expect(spySingle).not.toHaveBeenCalled();

      // Exactly 1 SQL query hitting the user/profiles table for all 6 members
      expect(profileQueryCount).toBe(1);
      expect(members).toHaveLength(6);

      spyBatch.mockRestore();
      spySingle.mockRestore();
    });
  });

  describe('2. ProfilesService.getPublicProfiles direct contract & edge cases', () => {
    it('fetches multiple user profiles in exact caller-provided order', async () => {
      const requestedIds = [fixture.member3.id, fixture.owner.id, fixture.member1.id];
      const profiles = await profilesService.getPublicProfiles(requestedIds);

      expect(profiles).toHaveLength(3);
      expect(profiles.map((p) => p.id)).toEqual(requestedIds);
    });

    it('preserves duplicate userIds if provided in the list', async () => {
      const requestedIds = [fixture.member2.id, fixture.owner.id, fixture.member2.id];
      const profiles = await profilesService.getPublicProfiles(requestedIds);

      expect(profiles).toHaveLength(3);
      expect(profiles[0].id).toBe(fixture.member2.id);
      expect(profiles[1].id).toBe(fixture.owner.id);
      expect(profiles[2].id).toBe(fixture.member2.id);
      expect(profiles[0]).toEqual(profiles[2]);
    });

    it('returns empty array immediately with 0 queries when userIds is empty', async () => {
      const { result, count } = await countQueriesDuring(() => profilesService.getPublicProfiles([]));

      expect(result).toEqual([]);
      expect(count).toBe(0);
    });

    it('throws NotFoundException on the FIRST missing user ID in caller order', async () => {
      const missingA = `missing_alpha_${randomUUID()}`;
      const missingB = `missing_beta_${randomUUID()}`;

      // Order 1: missingA comes first
      await expect(
        profilesService.getPublicProfiles([fixture.owner.id, missingA, missingB])
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.NOT_FOUND,
          message: `User profile not found: ${missingA}`,
        },
      });

      // Order 2: missingB comes first
      await expect(
        profilesService.getPublicProfiles([missingB, fixture.owner.id, missingA])
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.NOT_FOUND,
          message: `User profile not found: ${missingB}`,
        },
      });
    });

    it('validates public profiles against PublicProfileSchema and verifies fallbacks', async () => {
      const profiles = await profilesService.getPublicProfiles([
        fixture.owner.id,
        fixture.helper.id,
        fixture.member1.id,
      ]);

      for (const p of profiles) {
        expect(() => PublicProfileSchema.parse(p)).not.toThrow();
      }

      // Owner: custom avatar and game profile
      const ownerProfile = profiles.find((p) => p.id === fixture.owner.id)!;
      expect(ownerProfile.avatarUrl).toBe('https://cdn.invalid/custom-owner.png');
      expect(ownerProfile.customStatus).toBe('PLAYING');
      expect(ownerProfile.gameProfiles).toHaveLength(1);
      expect(ownerProfile.gameProfiles[0].gameTitle).toBe('Valorant');
      expect(ownerProfile.gameProfiles[0].rank).toBe('Radiant');

      // Helper: fallback to user.image
      const helperProfile = profiles.find((p) => p.id === fixture.helper.id)!;
      expect(helperProfile.avatarUrl).toBe('https://cdn.invalid/helper-img.png');
      expect(helperProfile.customStatus).toBe('LOOKING_FOR_TEAM');
      expect(helperProfile.gameProfiles).toHaveLength(1);
      expect(helperProfile.gameProfiles[0].gameTitle).toBe('Liên Minh Huyền Thoại');
      expect(helperProfile.gameProfiles[0].rank).toBe('Challenger');

      // Member 1: null avatarUrl (no custom avatar, user.image is null)
      const member1Profile = profiles.find((p) => p.id === fixture.member1.id)!;
      expect(member1Profile.avatarUrl).toBeNull();
      expect(member1Profile.customStatus).toBe('JUST_CHATTING');
      expect(member1Profile.gameProfiles).toHaveLength(0);
    });
  });

  describe('3. RoomsService.listRoomMembers functionality and ordering', () => {
    it('returns all 6 members with correct roles, joinedAt ISO strings, and permissions', async () => {
      const members = await roomsService.listRoomMembers(
        fixture.owner.id,
        fixture.owner.sessionId,
        fixture.room.id
      );

      expect(members).toHaveLength(6);

      // Verify each item parses with RoomMemberSchema
      for (const m of members) {
        expect(() => RoomMemberSchema.parse(m)).not.toThrow();
        expect(() => IsoDateTimeSchema.parse(m.joinedAt)).not.toThrow();
      }

      // Role order: OWNER first, HELPER second, MEMBERS after
      expect(members[0].role).toBe('OWNER');
      expect(members[0].userId).toBe(fixture.owner.id);
      expect(members[0].permissions).toEqual([]);
      expect(members[0].user?.displayName).toBe('Owner Pro');

      expect(members[1].role).toBe('HELPER');
      expect(members[1].userId).toBe(fixture.helper.id);
      expect(members[1].permissions).toEqual(['MANAGE_MEMBERS']);
      expect(members[1].user?.displayName).toBe('Helper Master');

      expect(members[2].role).toBe('MEMBER');
      expect(members[2].userId).toBe(fixture.member1.id);
      expect(members[2].permissions).toEqual([]);

      expect(members[3].role).toBe('MEMBER');
      expect(members[3].userId).toBe(fixture.member2.id);

      expect(members[4].role).toBe('MEMBER');
      expect(members[4].userId).toBe(fixture.member3.id);

      expect(members[5].role).toBe('MEMBER');
      expect(members[5].userId).toBe(fixture.member4.id);
    });
  });

  describe('4. Authority negative cases for listRoomMembers', () => {
    it('rejects with 401 LOGIN_REQUIRED when session is expired', async () => {
      await expectHttpError(
        () => roomsService.listRoomMembers(fixture.owner.id, fixture.expiredSessionId, fixture.room.id),
        401,
        ErrorCode.LOGIN_REQUIRED,
        'Session expired or revoked'
      );
    });

    it('rejects with 401 LOGIN_REQUIRED when session does not exist', async () => {
      await expectHttpError(
        () => roomsService.listRoomMembers(fixture.owner.id, `non_existent_${randomUUID()}`, fixture.room.id),
        401,
        ErrorCode.LOGIN_REQUIRED,
        'Session expired or revoked'
      );
    });

    it('rejects with 403 FORBIDDEN when user account is banned', async () => {
      await expectHttpError(
        () => roomsService.listRoomMembers(fixture.banned.id, fixture.banned.sessionId, fixture.room.id),
        403,
        ErrorCode.FORBIDDEN,
        'Account is banned'
      );
    });

    it('rejects with 403 FORBIDDEN when user is not a member of the room', async () => {
      await expectHttpError(
        () => roomsService.listRoomMembers(fixture.outsider.id, fixture.outsider.sessionId, fixture.room.id),
        403,
        ErrorCode.FORBIDDEN,
        'User is not a member of this room'
      );
    });

    it('rejects with 404 NOT_FOUND when room does not exist', async () => {
      await expectHttpError(
        () => roomsService.listRoomMembers(fixture.owner.id, fixture.owner.sessionId, `non_existent_${randomUUID()}`),
        404,
        ErrorCode.NOT_FOUND,
        'Room not found'
      );
    });
  });

  describe('5. Writer exclusion on held room FOR SHARE lock', () => {
    it('writer UPDATE rooms is blocked while listRoomMembers holds FOR SHARE lock on room', async () => {
      let readerPid: number | null = null;
      const wrappedQuery = function (this: unknown, ...args: unknown[]) {
        const queryText = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
        if (queryText.includes('FROM rooms WHERE id = $1 FOR SHARE')) {
          readerPid = (this as { processID?: number }).processID ?? null;
        }
        return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
      };
      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;

      const barrier = createDeferred<void>();
      const barrierReached = createDeferred<void>();
      const originalGetPublicProfiles = profilesService.getPublicProfiles.bind(profilesService);
      const spy = jest.spyOn(profilesService, 'getPublicProfiles').mockImplementation(async (ids) => {
        barrierReached.resolve();
        await awaitWithTimeout(barrier.promise, 3000, 'reader holding FOR SHARE lock');
        return originalGetPublicProfiles(ids);
      });

      const writerClient = await pool.connect();
      const writerPid = (writerClient as { processID: number }).processID;
      expect(writerPid).toBeTruthy();

      let listPromise!: Promise<RoomMemberDTO[]>;
      let writerPromise!: Promise<void>;
      try {
        listPromise = roomsService.listRoomMembers(fixture.owner.id, fixture.owner.sessionId, fixture.room.id);
        await awaitWithTimeout(barrierReached.promise, 3000, 'barrier reached');
        expect(readerPid).toBeTruthy();

        writerPromise = (async () => {
          await writerClient.query('BEGIN');
          await writerClient.query('UPDATE rooms SET name = $1 WHERE id = $2', ['Exclusive Name', fixture.room.id]);
          await writerClient.query('COMMIT');
        })();

        let writerBlockedByReader = false;
        for (let i = 0; i < 50; i++) {
          const blockersRow = await pool.query<{ blockers: number[] }>('SELECT pg_blocking_pids($1) AS blockers', [writerPid]);
          const blockers = blockersRow.rows[0]?.blockers ?? [];
          if (readerPid && blockers.includes(readerPid)) {
            writerBlockedByReader = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(writerBlockedByReader).toBe(true);
      } finally {
        barrier.resolve();
        spy.mockRestore();
        pg.Client.prototype.query = originalClientQuery;
        if (listPromise) {
          const members = await awaitWithTimeout(listPromise, 5000, 'listRoomMembers completion');
          expect(members).toHaveLength(6);
        }
        if (writerPromise) {
          await awaitWithTimeout(writerPromise, 5000, 'writer completion');
        }
        writerClient.release();
      }
    });
  });
});
