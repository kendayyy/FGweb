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
import { ZodError } from 'zod';
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

type BatchProfilesAdapter = {
  getPublicProfiles(userIds: string[]): Promise<ProfileDTO[]>;
};

function getBatchProfilesAdapter(service: ProfilesService): BatchProfilesAdapter {
  return service as unknown as BatchProfilesAdapter;
}

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

async function countProfileQueriesDuring<T>(action: () => Promise<T>): Promise<{ result: T; count: number }> {
  let count = 0;
  const wrappedQuery = function (this: unknown, ...args: unknown[]) {
    const raw = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
    if (/from\s+["']?user["']?/i.test(raw) && /left\s+join\s+["']?profiles["']?/i.test(raw)) {
      count++;
    }
    return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
  };

  pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;
  try {
    const result = await action();
    return { result, count };
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

    // Profiles:
    // owner: custom avatar
    // helper: avatar_url='' to trigger fallback to user.image
    // member1: avatar_url=null and image=null -> yields null
    // member2..4: custom avatars
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [users[0].id, 'Owner Pro', 'https://cdn.invalid/custom-owner.png', 'Owner bio', 'PLAYING', now.toISOString()]
    );
    await client.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [users[1].id, 'Helper Master', '', 'Helper bio', 'LOOKING_FOR_TEAM', now.toISOString()]
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
  } catch (seedErr) {
    try {
      await client.query('ROLLBACK');
    } catch (rbErr) {
      throw new AggregateError([seedErr, rbErr], 'Seed failed and rollback failed');
    }
    throw seedErr;
  } finally {
    client.release();
  }
}

async function createExplicitNullAvatarUser(): Promise<string> {
  const userId = `u_null_av_${randomUUID()}`;
  const now = new Date().toISOString();
  await pool.query(
    'INSERT INTO "user"(id, name, email, email_verified, image, created_at, updated_at) VALUES($1, $2, $3, true, $4, $5, $5)',
    [userId, 'Explicit Null User', `${userId}@fixture.invalid`, 'https://cdn.invalid/provider-avatar.png', now]
  );
  await pool.query(
    'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, NULL, $3, $4, $5, $5)',
    [userId, 'Explicit Null Profile', 'Bio', 'JUST_CHATTING', now]
  );
  return userId;
}

async function createBareUser(): Promise<{ id: string; name: string; image: string; createdAtIso: string }> {
  const userId = `u_bare_${randomUUID()}`;
  const now = new Date().toISOString();
  const image = 'https://cdn.invalid/bare-provider.png';
  const name = 'Bare User';
  await pool.query(
    'INSERT INTO "user"(id, name, email, email_verified, image, created_at, updated_at) VALUES($1, $2, $3, true, $4, $5, $5)',
    [userId, name, `${userId}@fixture.invalid`, image, now]
  );
  return { id: userId, name, image, createdAtIso: now };
}

jest.setTimeout(60000);

describe('FG T30 - Room Profile Batch Consolidation and Authority Integration', () => {
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

  describe('1. Single Profile Query Batch Consolidation during listRoomMembers (Counter RED/GREEN Case)', () => {
    it('executes exactly 1 SQL query targeting user and profiles table during listRoomMembers with 6 members', async () => {
      const fixture = await seedFixture();

      const { result: members, count: profileQueryCount } = await countProfileQueriesDuring(() =>
        roomsService.listRoomMembers(fixture.owner.id, fixture.owner.sessionId, fixture.room.id)
      );

      // On proposed source, count is 1. On unbatched original source, count is 6 (true SQL counter RED).
      expect(profileQueryCount).toBe(1);
      expect(members).toHaveLength(6);

      // Verify full exact RoomMemberSchema DTO, order, grants, summaries, and ISO timestamps
      for (const m of members) {
        expect(() => RoomMemberSchema.parse(m)).not.toThrow();
        expect(() => IsoDateTimeSchema.parse(m.joinedAt)).not.toThrow();
      }

      expect(members[0].role).toBe('OWNER');
      expect(members[0].userId).toBe(fixture.owner.id);
      expect(members[0].permissions).toEqual([]);
      expect(members[0].user?.displayName).toBe('Owner Pro');
      expect(members[0].user?.avatarUrl).toBe('https://cdn.invalid/custom-owner.png');

      expect(members[1].role).toBe('HELPER');
      expect(members[1].userId).toBe(fixture.helper.id);
      expect(members[1].permissions).toEqual(['MANAGE_MEMBERS']);
      expect(members[1].user?.displayName).toBe('Helper Master');
      expect(members[1].user?.avatarUrl).toBe('https://cdn.invalid/helper-img.png');

      expect(members[2].role).toBe('MEMBER');
      expect(members[2].userId).toBe(fixture.member1.id);
      expect(members[2].permissions).toEqual([]);
      expect(members[2].user?.avatarUrl).toBeNull();

      expect(members[3].role).toBe('MEMBER');
      expect(members[3].userId).toBe(fixture.member2.id);

      expect(members[4].role).toBe('MEMBER');
      expect(members[4].userId).toBe(fixture.member3.id);

      expect(members[5].role).toBe('MEMBER');
      expect(members[5].userId).toBe(fixture.member4.id);
    });
  });

  describe('2. ProfilesService.getPublicProfiles direct contract & edge cases (with structural typed batch adapter)', () => {
    it('fetches multiple user profiles in exact caller-provided order with exactly 1 SQL query', async () => {
      const fixture = await seedFixture();
      const batchAdapter = getBatchProfilesAdapter(profilesService);
      const requestedIds = [fixture.member3.id, fixture.owner.id, fixture.member1.id];

      const { result: profiles, count } = await countProfileQueriesDuring(() =>
        batchAdapter.getPublicProfiles(requestedIds)
      );

      expect(count).toBe(1);
      expect(profiles).toHaveLength(3);
      expect(profiles.map((p) => p.id)).toEqual(requestedIds);

      for (const p of profiles) {
        expect(p).toEqual(PublicProfileSchema.parse(p));
      }
    });

    it('preserves duplicate userIds if provided in the list with exactly 1 SQL query', async () => {
      const fixture = await seedFixture();
      const batchAdapter = getBatchProfilesAdapter(profilesService);
      const requestedIds = [fixture.member2.id, fixture.owner.id, fixture.member2.id];

      const { result: profiles, count } = await countProfileQueriesDuring(() =>
        batchAdapter.getPublicProfiles(requestedIds)
      );

      expect(count).toBe(1);
      expect(profiles).toHaveLength(3);
      expect(profiles[0].id).toBe(fixture.member2.id);
      expect(profiles[1].id).toBe(fixture.owner.id);
      expect(profiles[2].id).toBe(fixture.member2.id);
      expect(profiles[0]).toEqual(profiles[2]);

      for (const p of profiles) {
        expect(p).toEqual(PublicProfileSchema.parse(p));
      }
    });

    it('returns empty array immediately with 0 queries when userIds is empty', async () => {
      const batchAdapter = getBatchProfilesAdapter(profilesService);
      const { result, count } = await countProfileQueriesDuring(() => batchAdapter.getPublicProfiles([]));

      expect(count).toBe(0);
      expect(result).toEqual([]);
    });

    it('throws NotFoundException with 404 status and exact message on the FIRST missing user ID in caller order', async () => {
      const fixture = await seedFixture();
      const batchAdapter = getBatchProfilesAdapter(profilesService);
      const missingA = `missing_alpha_${randomUUID()}`;
      const missingB = `missing_beta_${randomUUID()}`;

      // Case 1: missingA comes first in caller order
      try {
        await batchAdapter.getPublicProfiles([fixture.owner.id, missingA, missingB]);
        throw new Error('Expected getPublicProfiles to throw NotFoundException');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        const nf = err as NotFoundException;
        expect(nf.getStatus()).toBe(404);
        const res = nf.getResponse() as { code?: string; message?: string };
        expect(res.code).toBe(ErrorCode.NOT_FOUND);
        expect(res.message).toBe(`User profile not found: ${missingA}`);
      }

      // Case 2: missingB comes first in caller order
      try {
        await batchAdapter.getPublicProfiles([missingB, fixture.owner.id, missingA]);
        throw new Error('Expected getPublicProfiles to throw NotFoundException');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        const nf = err as NotFoundException;
        expect(nf.getStatus()).toBe(404);
        const res = nf.getResponse() as { code?: string; message?: string };
        expect(res.code).toBe(ErrorCode.NOT_FOUND);
        expect(res.message).toBe(`User profile not found: ${missingB}`);
      }
    });

    it('validates public profiles against PublicProfileSchema and tests avatar fallback policy', async () => {
      const fixture = await seedFixture();
      const batchAdapter = getBatchProfilesAdapter(profilesService);
      const profiles = await batchAdapter.getPublicProfiles([
        fixture.owner.id,
        fixture.helper.id,
        fixture.member1.id,
      ]);

      for (const p of profiles) {
        expect(p).toEqual(PublicProfileSchema.parse(p));
      }

      // Owner: custom avatar and game profile
      const ownerProfile = profiles.find((p) => p.id === fixture.owner.id)!;
      expect(ownerProfile.avatarUrl).toBe('https://cdn.invalid/custom-owner.png');
      expect(ownerProfile.customStatus).toBe('PLAYING');
      expect(ownerProfile.gameProfiles).toHaveLength(1);
      expect(ownerProfile.gameProfiles[0].gameTitle).toBe('Valorant');
      expect(ownerProfile.gameProfiles[0].rank).toBe('Radiant');

      // Helper: avatar_url='' falls back to user.image
      const helperProfile = profiles.find((p) => p.id === fixture.helper.id)!;
      expect(helperProfile.avatarUrl).toBe('https://cdn.invalid/helper-img.png');
      expect(helperProfile.customStatus).toBe('LOOKING_FOR_TEAM');
      expect(helperProfile.gameProfiles).toHaveLength(1);
      expect(helperProfile.gameProfiles[0].gameTitle).toBe('Liên Minh Huyền Thoại');
      expect(helperProfile.gameProfiles[0].rank).toBe('Challenger');

      // Member 1: null avatar_url and null user.image -> null
      const member1Profile = profiles.find((p) => p.id === fixture.member1.id)!;
      expect(member1Profile.avatarUrl).toBeNull();
      expect(member1Profile.customStatus).toBe('JUST_CHATTING');
      expect(member1Profile.gameProfiles).toHaveLength(0);
    });

    it('enforces avatar policy: explicit profile.avatar_url=NULL yields null even if user.image exists', async () => {
      const userId = await createExplicitNullAvatarUser();
      const batchAdapter = getBatchProfilesAdapter(profilesService);
      const [profile] = await batchAdapter.getPublicProfiles([userId]);

      expect(profile).toBeDefined();
      expect(profile.avatarUrl).toBeNull();
      expect(profile).toEqual(PublicProfileSchema.parse(profile));
    });

    it('handles bare user without profiles and gameProfile rows with default values', async () => {
      const bareUser = await createBareUser();
      const batchAdapter = getBatchProfilesAdapter(profilesService);
      const [profile] = await batchAdapter.getPublicProfiles([bareUser.id]);

      expect(profile).toBeDefined();
      expect(profile.id).toBe(bareUser.id);
      expect(profile.displayName).toBe(bareUser.name);
      expect(profile.avatarUrl).toBe(bareUser.image);
      expect(profile.bio).toBeNull();
      expect(profile.customStatus).toBe('JUST_CHATTING');
      expect(profile.gameProfiles).toEqual([]);
      expect(profile.createdAt).toBe(bareUser.createdAtIso);
      expect(profile).toEqual(PublicProfileSchema.parse(profile));
    });

    it('rejects entire batch when game title fails GameTitleSchema and returns no partial DTO', async () => {
      const fixture = await seedFixture();
      const batchAdapter = getBatchProfilesAdapter(profilesService);

      // Corrupt game title in scoped schema
      await pool.query('UPDATE games SET title = $1 WHERE id = $2', ['Invalid Game Title Outside Catalog', lolGame.id]);

      try {
        let thrownError: unknown;
        try {
          await batchAdapter.getPublicProfiles([fixture.owner.id, fixture.helper.id]);
        } catch (err) {
          thrownError = err;
        }
        expect(thrownError).toBeInstanceOf(ZodError);
        const zodErr = thrownError as ZodError;
        expect(zodErr.issues.length).toBeGreaterThan(0);
      } finally {
        // Restore game title
        await pool.query('UPDATE games SET title = $1 WHERE id = $2', ['Liên Minh Huyền Thoại', lolGame.id]);
      }
    });
  });

  describe('3. RoomsService.listRoomMembers functionality and ordering', () => {
    it('returns all 6 members with correct roles, joinedAt ISO strings, and permissions', async () => {
      const fixture = await seedFixture();
      const members = await roomsService.listRoomMembers(
        fixture.owner.id,
        fixture.owner.sessionId,
        fixture.room.id
      );

      expect(members).toHaveLength(6);

      // Verify each item parses with RoomMemberSchema and IsoDateTimeSchema
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
      const fixture = await seedFixture();
      await expectHttpError(
        () => roomsService.listRoomMembers(fixture.owner.id, fixture.expiredSessionId, fixture.room.id),
        401,
        ErrorCode.LOGIN_REQUIRED,
        'Session expired or revoked'
      );
    });

    it('rejects with 401 LOGIN_REQUIRED when an existing session is deleted', async () => {
      const fixture = await seedFixture();
      const deletedSessionId = `sess_del_${randomUUID()}`;
      const now = new Date();
      const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await pool.query(
        'INSERT INTO "session"(id, token, user_id, expires_at, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $5)',
        [deletedSessionId, `tok_${randomUUID()}`, fixture.owner.id, futureExpiry, now.toISOString()]
      );

      await pool.query('DELETE FROM "session" WHERE id = $1', [deletedSessionId]);

      await expectHttpError(
        () => roomsService.listRoomMembers(fixture.owner.id, deletedSessionId, fixture.room.id),
        401,
        ErrorCode.LOGIN_REQUIRED,
        'Session expired or revoked'
      );
    });

    it('rejects with 401 LOGIN_REQUIRED when session does not exist', async () => {
      const fixture = await seedFixture();
      await expectHttpError(
        () => roomsService.listRoomMembers(fixture.owner.id, `non_existent_${randomUUID()}`, fixture.room.id),
        401,
        ErrorCode.LOGIN_REQUIRED,
        'Session expired or revoked'
      );
    });

    it('rejects with 403 FORBIDDEN when user account is banned', async () => {
      const fixture = await seedFixture();
      await expectHttpError(
        () => roomsService.listRoomMembers(fixture.banned.id, fixture.banned.sessionId, fixture.room.id),
        403,
        ErrorCode.FORBIDDEN,
        'Account is banned'
      );
    });

    it('rejects with 403 FORBIDDEN when user is not a member of the room', async () => {
      const fixture = await seedFixture();
      await expectHttpError(
        () => roomsService.listRoomMembers(fixture.outsider.id, fixture.outsider.sessionId, fixture.room.id),
        403,
        ErrorCode.FORBIDDEN,
        'User is not a member of this room'
      );
    });

    it('rejects with 404 NOT_FOUND when room does not exist', async () => {
      const fixture = await seedFixture();
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
      const fixture = await seedFixture();

      let readerPid: number | null = null;
      let profileIntercepted = false;

      const barrierReached = createDeferred<void>();
      const releaseBarrier = createDeferred<void>();

      // Attach immediate no-op catchers to avoid unhandled rejections
      barrierReached.promise.catch(() => {});
      releaseBarrier.promise.catch(() => {});

      const writerClient = await pool.connect();
      const writerPid = (writerClient as { processID: number }).processID;
      expect(writerPid).toBeTruthy();

      let writerBegan = false;
      let writerCommitted = false;
      let listPromise: Promise<RoomMemberDTO[]> | undefined;
      let writerPromise: Promise<void> | undefined;

      const wrappedQuery = function (this: unknown, ...args: unknown[]) {
        const rawText = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';

        // Capture reader PID on actual Rooms SELECT ... FROM rooms WHERE id = $1 FOR SHARE
        if (rawText.includes('FROM rooms WHERE id = $1 FOR SHARE')) {
          readerPid = (this as { processID?: number }).processID ?? null;
        }

        const isProfileQuery = /from\s+["']?user["']?/i.test(rawText) && /left\s+join\s+["']?profiles["']?/i.test(rawText);

        if (!profileIntercepted && isProfileQuery) {
          profileIntercepted = true;

          // Handle callback-style (pg.Pool.query invokes Client.query with callback)
          if (typeof args[args.length - 1] === 'function') {
            const originalCb = args[args.length - 1] as (err: unknown, res: unknown) => void;
            args[args.length - 1] = function (err: unknown, res: unknown) {
              if (err) {
                barrierReached.reject(err);
                return originalCb.call(this, err, res);
              }
              barrierReached.resolve();
              releaseBarrier.promise
                .then(() => {
                  originalCb.call(this, null, res);
                })
                .catch((relErr) => {
                  originalCb.call(this, relErr, null);
                });
            };
            return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
          }

          // Handle promise-style fallback
          const promise = (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
          if (promise && typeof (promise as Promise<unknown>).then === 'function') {
            return (promise as Promise<unknown>).then(
              async (res) => {
                barrierReached.resolve();
                await releaseBarrier.promise;
                return res;
              },
              (err) => {
                barrierReached.reject(err);
                throw err;
              }
            );
          }
          return promise;
        }

        return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
      };

      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;

      const cleanupErrors: unknown[] = [];

      try {
        // Start listRoomMembers in background
        listPromise = roomsService.listRoomMembers(fixture.owner.id, fixture.owner.sessionId, fixture.room.id);
        listPromise.catch((err) => {
          barrierReached.reject(err);
        });

        // Wait until profile query executes and pauses before callback returns to RoomsService
        await awaitWithTimeout(barrierReached.promise, 3000, 'profile query execution barrier');
        expect(readerPid).toBeTruthy();

        // Now start the independent writer transaction
        await writerClient.query('BEGIN');
        writerBegan = true;

        writerPromise = (async () => {
          await writerClient.query('UPDATE rooms SET name = $1 WHERE id = $2', ['Blocked Name', fixture.room.id]);
          await writerClient.query('COMMIT');
          writerCommitted = true;
        })();
        writerPromise.catch(() => {});

        // Poll pg_blocking_pids to verify that writerPid is blocked by readerPid
        let writerBlockedByReader = false;
        for (let i = 0; i < 50; i++) {
          const blockersRow = await pool.query<{ blockers: number[] }>(
            'SELECT pg_blocking_pids($1) AS blockers',
            [writerPid]
          );
          const blockers = blockersRow.rows[0]?.blockers ?? [];
          if (readerPid && blockers.includes(readerPid)) {
            writerBlockedByReader = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(writerBlockedByReader).toBe(true);

        // Release the barrier so profile query result returns and RoomsService commits
        releaseBarrier.resolve();

        // Settle both reader and writer
        const members = await awaitWithTimeout(listPromise, 3000, 'listRoomMembers completion');
        expect(members).toHaveLength(6);
        for (const m of members) {
          expect(() => RoomMemberSchema.parse(m)).not.toThrow();
        }

        await awaitWithTimeout(writerPromise, 3000, 'writer transaction completion');
        expect(writerCommitted).toBe(true);

        // Proof of COMMIT success
        const updatedRoom = await pool.query<{ name: string }>('SELECT name FROM rooms WHERE id = $1', [fixture.room.id]);
        expect(updatedRoom.rows[0]?.name).toBe('Blocked Name');
      } finally {
        // Always release barrier in case of any failure
        releaseBarrier.resolve();
        pg.Client.prototype.query = originalClientQuery;

        // Settle writer if still running
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
        if (listPromise) {
          await listPromise.catch(() => {});
        }
        if (writerPromise) {
          await writerPromise.catch(() => {});
        }
      }

      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, 'Writer exclusion cleanup failed');
      }
    });
  });
});
