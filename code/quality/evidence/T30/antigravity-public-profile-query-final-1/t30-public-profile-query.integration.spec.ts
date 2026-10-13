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
import { NotFoundException } from '@nestjs/common';
import { ZodError } from 'zod';
import * as tables from '@fg/database';
import { ErrorCode, PublicProfileSchema, type ProfileDTO } from '@fg/contracts';
import { ProfilesService } from '../src/modules/profiles/profiles.service.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const owned = `t30_profile_${randomUUID().replaceAll('-', '')}`;

let pool: pg.Pool;
let dbUrl: string;
let originalDbUrl: string | undefined;
let created = false;
let service: ProfilesService;
let valorantGame: { id: string; title: string };
let lolGame: { id: string; title: string };

const originalClientQuery = pg.Client.prototype.query;

async function countQueriesDuring<T>(action: () => Promise<T>): Promise<{ result: T; count: number }> {
  let capturedQueries = 0;
  const wrappedQuery = function (this: unknown, ...args: unknown[]) {
    capturedQueries++;
    return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
  };

  pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;
  try {
    const result = await action();
    return { result, count: capturedQueries };
  } finally {
    pg.Client.prototype.query = originalClientQuery;
  }
}

jest.setTimeout(30000);

describe('ProfilesService.getPublicProfile query consolidation and contract baseline', () => {
  beforeAll(async () => {
    originalDbUrl = process.env.DATABASE_URL;
    const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
    const db = new URL(env.DATABASE_URL!);
    db.searchParams.set('options', `-c search_path=${owned}`);
    dbUrl = db.href;

    pool = new pg.Pool({
      connectionString: dbUrl,
      max: 10,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
    });

    await pool.query(`CREATE SCHEMA "${owned}"`);
    created = true;

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
    service = new ProfilesService();
    service.onModuleInit();
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      try { await service?.onModuleDestroy(); } catch (error) { errors.push(error); }
      try {
        if (created) {
          expect(owned).toMatch(/^t30_profile_[a-f0-9]{32}$/);
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
    if (errors.length) throw new AggregateError(errors, 'Owned public-profile query cleanup failed');
  });

  it('fetches normal profile with two game profiles in a single query and returns exact DTO shape', async () => {
    const userId = `user-full-${randomUUID()}`;
    const now = new Date();

    await pool.query(
      'INSERT INTO "user"(id, name, email, email_verified, image, created_at, updated_at) VALUES($1, $2, $3, true, $4, $5, $5)',
      [userId, 'Hoàng Nam', `${userId}@fixture.invalid`, 'https://cdn.invalid/user-default.png', now]
    );

    await pool.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [userId, 'Nam Pro', 'https://cdn.invalid/custom-avatar.png', 'Competitive FPS player', 'PLAYING', now]
    );

    await pool.query(
      `INSERT INTO game_profiles(id, user_id, game_id, in_game_name, rank, role, play_hours, play_style, created_at, updated_at)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [randomUUID(), userId, valorantGame.id, 'Nam#VN1', 'Immortal 3', 'Duelist', 450, 'Tryhard', now]
    );

    await pool.query(
      `INSERT INTO game_profiles(id, user_id, game_id, in_game_name, rank, role, play_hours, play_style, created_at, updated_at)
       VALUES($1, $2, $3, $4, $5, NULL, NULL, NULL, $6, $6)`,
      [randomUUID(), userId, lolGame.id, 'Nam#LOL', 'Challenger', now]
    );

    const { result, count } = await countQueriesDuring(() => service.getPublicProfile(userId));

    // Consolidates 3 separate queries into exactly 1
    expect(count).toBe(1);

    // Conforms strictly to contract schema
    const parsed: ProfileDTO = PublicProfileSchema.parse(result);
    expect(result).toStrictEqual(parsed);
    expect(parsed.id).toBe(userId);
    expect(parsed.displayName).toBe('Nam Pro');
    expect(parsed.avatarUrl).toBe('https://cdn.invalid/custom-avatar.png');
    expect(parsed.bio).toBe('Competitive FPS player');
    expect(parsed.customStatus).toBe('PLAYING');
    expect(parsed.createdAt).toBe(now.toISOString());
    expect(parsed.gameProfiles).toHaveLength(2);

    const valProfile = parsed.gameProfiles.find((gp) => gp.gameId === valorantGame.id);
    expect(valProfile).toBeDefined();
    expect(valProfile?.gameTitle).toBe('Valorant');
    expect(valProfile?.inGameName).toBe('Nam#VN1');
    expect(valProfile?.rank).toBe('Immortal 3');
    expect(valProfile?.role).toBe('Duelist');
    expect(valProfile?.playHours).toBe(450);
    expect(valProfile?.playStyle).toBe('Tryhard');

    const lolProfile = parsed.gameProfiles.find((gp) => gp.gameId === lolGame.id);
    expect(lolProfile).toBeDefined();
    expect(lolProfile?.gameTitle).toBe('Liên Minh Huyền Thoại');
    expect(lolProfile?.inGameName).toBe('Nam#LOL');
    expect(lolProfile?.rank).toBe('Challenger');
    expect(lolProfile?.role).toBeUndefined();
    expect(lolProfile?.playHours).toBeUndefined();
    expect(lolProfile?.playStyle).toBeUndefined();
  });

  it('fetches user without profile or games in a single query with fallback values', async () => {
    const userId = `user-bare-${randomUUID()}`;
    const now = new Date();

    await pool.query(
      'INSERT INTO "user"(id, name, email, email_verified, image, created_at, updated_at) VALUES($1, $2, $3, true, $4, $5, $5)',
      [userId, 'Plain User', `${userId}@fixture.invalid`, 'https://cdn.invalid/plain-user.png', now]
    );

    const { result, count } = await countQueriesDuring(() => service.getPublicProfile(userId));

    // Consolidated into 1 query
    expect(count).toBe(1);

    const parsed: ProfileDTO = PublicProfileSchema.parse(result);
    expect(result).toStrictEqual(parsed);
    expect(parsed.id).toBe(userId);
    expect(parsed.displayName).toBe('Plain User'); // Fallback to dbUser.name
    expect(parsed.avatarUrl).toBe('https://cdn.invalid/plain-user.png'); // Fallback to dbUser.image
    expect(parsed.bio).toBeNull();
    expect(parsed.customStatus).toBe('JUST_CHATTING'); // Default status
    expect(parsed.gameProfiles).toEqual([]);
    expect(parsed.createdAt).toBe(now.toISOString());
  });

  it('falls back to user image when profile avatarUrl is empty string', async () => {
    const userId = `user-empty-avatar-${randomUUID()}`;
    const now = new Date();

    await pool.query(
      'INSERT INTO "user"(id, name, email, email_verified, image, created_at, updated_at) VALUES($1, $2, $3, true, $4, $5, $5)',
      [userId, 'Empty Avatar User', `${userId}@fixture.invalid`, 'https://cdn.invalid/provider-img.png', now]
    );

    await pool.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [userId, 'Empty Avatar Display', '', 'Bio text', 'JUST_CHATTING', now]
    );

    const { result, count } = await countQueriesDuring(() => service.getPublicProfile(userId));
    expect(count).toBe(1);
    expect(result.avatarUrl).toBe('https://cdn.invalid/provider-img.png');
  });

  it('preserves explicit null avatar when profile avatarUrl is null even if user has image', async () => {
    const userId = `user-null-avatar-${randomUUID()}`;
    const now = new Date();

    await pool.query(
      'INSERT INTO "user"(id, name, email, email_verified, image, created_at, updated_at) VALUES($1, $2, $3, true, $4, $5, $5)',
      [userId, 'Null Avatar User', `${userId}@fixture.invalid`, 'https://cdn.invalid/provider-img.png', now]
    );

    await pool.query(
      'INSERT INTO profiles(user_id, display_name, avatar_url, bio, custom_status, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [userId, 'Null Avatar Display', null, 'Bio text', 'JUST_CHATTING', now]
    );

    const { result, count } = await countQueriesDuring(() => service.getPublicProfile(userId));
    expect(count).toBe(1);
    expect(result.avatarUrl).toBeNull();
  });

  it('throws exact 404 NOT_FOUND when user does not exist', async () => {
    const missingId = `nonexistent-${randomUUID()}`;

    let thrownError: unknown;
    try {
      await countQueriesDuring(() => service.getPublicProfile(missingId));
    } catch (err: unknown) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(NotFoundException);
    if (!(thrownError instanceof NotFoundException)) {
      throw new Error('Expected NotFoundException');
    }
    expect(thrownError.getStatus()).toBe(404);
    expect(thrownError.getResponse()).toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: `User profile not found: ${missingId}`,
    });
  });

  it('rejects with ZodError if game catalog has an invalid title, preserving contract integrity', async () => {
    const userId = `user-bad-game-${randomUUID()}`;
    const badGameId = `bad-game-${randomUUID()}`;
    const now = new Date();

    await pool.query(
      'INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES($1, $2, $3, true, $4, $4)',
      [userId, 'Bad Game User', `${userId}@fixture.invalid`, now]
    );

    await pool.query(
      'INSERT INTO games(id, title, description, icon_url, banner_url, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6, $6)',
      [badGameId, 'Unrecognized Non-Catalog Game', 'Test game', 'https://cdn.invalid/icon.png', 'https://cdn.invalid/banner.png', now]
    );

    await pool.query(
      `INSERT INTO game_profiles(id, user_id, game_id, in_game_name, rank, role, play_hours, play_style, created_at, updated_at)
       VALUES($1, $2, $3, 'Tester', 'Gold', NULL, NULL, NULL, $4, $4)`,
      [randomUUID(), userId, badGameId, now]
    );

    let thrownError: unknown;
    try {
      await service.getPublicProfile(userId);
    } catch (err: unknown) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(ZodError);
  });
});
