import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { ALLOWED_GAMES } from '@fg/contracts';
import { getAuthTables } from 'better-auth/db';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as schema from '../../../packages/database/src/index.js';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AccountRecord {
  id: string;
  accountId: string;
  providerId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface SessionRecord {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface VerificationRecord {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

function loadLocalEnv(): Record<string, string> {
  if (process.env.DATABASE_URL) {
    return process.env as Record<string, string>;
  }
  const envPath = path.resolve(import.meta.dirname, '../../../.env.local');
  const content = fs.readFileSync(envPath, 'utf8');
  return parseEnv(content) as Record<string, string>;
}

function getPgErrorCode(err: unknown): string | undefined {
  const pgErr = err as { code?: string; cause?: { code?: string } };
  return pgErr.cause?.code ?? pgErr.code;
}

describe('T04 - Identity, Profiles, and Game Catalog Schema', () => {
  let client: pg.Client;
  let db: NodePgDatabase<typeof schema> & { $client: pg.Client };
  let schemaName: string;

  beforeAll(async () => {
    const codeRootDir = path.resolve(import.meta.dirname, '../../../');
    process.chdir(codeRootDir);

    const env = loadLocalEnv();
    schemaName = `t37_reg_t04_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    client = new pg.Client({ connectionString: env.DATABASE_URL });
    await client.connect();

    // Create an isolated disposable schema for this test run
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}"`);

    // Use single client connection so search_path is maintained
    db = drizzle(client, { schema });

    // Run real migrations on the isolated schema
    const migrationsFolder = path.resolve(codeRootDir, 'packages/database/migrations');
    await migrate(db, { migrationsFolder, migrationsSchema: schemaName });
  });

  afterAll(async () => {
    if (client) {
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } catch (err) {
        console.error('Failed to cleanup schema:', err);
        throw err;
      } finally {
        await client.end();
      }
    }
  });

  it('should match installed Better Auth 1.7.7 auth table metadata structure', () => {
    const authTables = getAuthTables({});
    expect(authTables).toHaveProperty('user');
    expect(authTables).toHaveProperty('account');
    expect(authTables).toHaveProperty('session');
    expect(authTables).toHaveProperty('verification');

    expect(authTables.user.fields).toHaveProperty('name');
    expect(authTables.user.fields).toHaveProperty('email');
    expect(authTables.account.fields).toHaveProperty('providerId');
    expect(authTables.account.fields).toHaveProperty('accountId');
    expect(authTables.session.fields).toHaveProperty('token');
    expect(authTables.verification.fields).toHaveProperty('identifier');
    expect(authTables.verification.fields).toHaveProperty('value');
  });

  it('should seed 7 approved games and one Lobby per game idempotently with exact name Lobby', async () => {
    const seeded1 = await schema.seedGames(db);
    expect(seeded1).toHaveLength(7);

    // Run seed again to verify idempotency and identical IDs
    const seeded2 = await schema.seedGames(db);
    expect(seeded2).toHaveLength(7);
    expect(seeded1).toEqual(seeded2);

    const allGames = await db.select().from(schema.games);
    expect(allGames).toHaveLength(7);

    const gameTitles = allGames.map((g) => g.title);
    expect(gameTitles.sort()).toEqual([...ALLOWED_GAMES].sort());

    const uniqueGameIds = new Set(allGames.map((g) => g.id));
    expect(uniqueGameIds.size).toBe(7);

    const allLobbies = await db.select().from(schema.lobbies);
    expect(allLobbies).toHaveLength(7);

    const uniqueLobbyGameIds = new Set(allLobbies.map((l) => l.gameId));
    expect(uniqueLobbyGameIds.size).toBe(7);

    // Spec assertion: Every lobby must be named exact "Lobby"
    for (const lobby of allLobbies) {
      expect(lobby.name).toBe('Lobby');
    }
  });

  it('should allow Better Auth drizzle adapter to create and read all 4 models: user, account, session, verification', async () => {
    const adapterFactory = drizzleAdapter(db, {
      provider: 'pg',
      schema,
    });
    const adapter = adapterFactory({});
    const now = new Date();

    // 1. User
    const createdUser = await adapter.create<UserRecord>({
      model: 'user',
      data: {
        name: 'Better Auth Gamer',
        email: 'ba_gamer@example.com',
        emailVerified: true,
        image: 'https://example.com/avatar.png',
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(createdUser).toBeDefined();
    expect(createdUser.id).toBeDefined();

    const foundUser = await adapter.findOne<UserRecord>({
      model: 'user',
      where: [{ field: 'id', value: createdUser.id }],
    });
    expect(foundUser).toBeDefined();
    expect(foundUser?.email).toBe('ba_gamer@example.com');
    expect(foundUser?.name).toBe('Better Auth Gamer');

    // 2. Account
    const createdAccount = await adapter.create<AccountRecord>({
      model: 'account',
      data: {
        accountId: 'discord_888777666',
        providerId: 'discord',
        userId: createdUser.id,
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(createdAccount).toBeDefined();
    expect(createdAccount.accountId).toBe('discord_888777666');

    const foundAccount = await adapter.findOne<AccountRecord>({
      model: 'account',
      where: [{ field: 'id', value: createdAccount.id }],
    });
    expect(foundAccount).toBeDefined();
    expect(foundAccount?.providerId).toBe('discord');

    // 3. Session
    const expiresAt = new Date(Date.now() + 3600000);
    const createdSession = await adapter.create<SessionRecord>({
      model: 'session',
      data: {
        token: 'session_token_xyz_999',
        userId: createdUser.id,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(createdSession).toBeDefined();

    const foundSession = await adapter.findOne<SessionRecord>({
      model: 'session',
      where: [{ field: 'id', value: createdSession.id }],
    });
    expect(foundSession).toBeDefined();
    expect(foundSession?.token).toBe('session_token_xyz_999');

    // 4. Verification
    const createdVerification = await adapter.create<VerificationRecord>({
      model: 'verification',
      data: {
        identifier: 'verify_email_ba_gamer@example.com',
        value: 'code_123456',
        expiresAt,
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(createdVerification).toBeDefined();

    const foundVerification = await adapter.findOne<VerificationRecord>({
      model: 'verification',
      where: [{ field: 'id', value: createdVerification.id }],
    });
    expect(foundVerification).toBeDefined();
    expect(foundVerification?.value).toBe('code_123456');
  });

  it('should enforce unique constraints with real PostgreSQL pg 23505 errors', async () => {
    const userId1 = 'user_dup_unique_1';
    const userId2 = 'user_dup_unique_2';
    const now = new Date();

    await db.insert(schema.user).values({
      id: userId1,
      name: 'User One',
      email: 'unique_user1@example.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    // 1. Duplicate email rejection (pg 23505)
    try {
      await db.insert(schema.user).values({
        id: userId2,
        name: 'User Two',
        email: 'unique_user1@example.com',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      expect.fail('Should have rejected duplicate user email');
    } catch (err: unknown) {
      expect(getPgErrorCode(err)).toBe('23505');
    }

    await db.insert(schema.user).values({
      id: userId2,
      name: 'User Two',
      email: 'unique_user2@example.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    // 2. Duplicate providerId + accountId rejection (pg 23505)
    await db.insert(schema.account).values({
      id: 'acc_uniq_1',
      accountId: 'discord_unique_id',
      providerId: 'discord',
      userId: userId1,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await db.insert(schema.account).values({
        id: 'acc_uniq_2',
        accountId: 'discord_unique_id',
        providerId: 'discord',
        userId: userId2,
        createdAt: now,
        updatedAt: now,
      });
      expect.fail('Should have rejected duplicate Discord identity');
    } catch (err: unknown) {
      expect(getPgErrorCode(err)).toBe('23505');
    }

    const [game] = await db.select().from(schema.games).limit(1);

    // 3. Duplicate game_profiles (userId + gameId) rejection (pg 23505)
    await db.insert(schema.gameProfiles).values({
      id: 'gp_uniq_1',
      userId: userId1,
      gameId: game.id,
    });

    try {
      await db.insert(schema.gameProfiles).values({
        id: 'gp_uniq_2',
        userId: userId1,
        gameId: game.id,
      });
      expect.fail('Should have rejected duplicate game profile for same user and game');
    } catch (err: unknown) {
      expect(getPgErrorCode(err)).toBe('23505');
    }

    // 4. Duplicate game_interests (userId + gameId) rejection (pg 23505)
    await db.insert(schema.gameInterests).values({
      id: 'gi_uniq_1',
      userId: userId1,
      gameId: game.id,
    });

    try {
      await db.insert(schema.gameInterests).values({
        id: 'gi_uniq_2',
        userId: userId1,
        gameId: game.id,
      });
      expect.fail('Should have rejected duplicate game interest for same user and game');
    } catch (err: unknown) {
      expect(getPgErrorCode(err)).toBe('23505');
    }

    // 5. Duplicate lobbies (gameId) rejection (pg 23505)
    try {
      await db.insert(schema.lobbies).values({
        id: 'lobby_dup_1',
        gameId: game.id,
        name: 'Lobby Duplicate',
      });
      expect.fail('Should have rejected duplicate lobby for same gameId');
    } catch (err: unknown) {
      expect(getPgErrorCode(err)).toBe('23505');
    }
  });

  it('should support optional rank and profile fields on game_profiles', async () => {
    const userId = 'user_profile_opt_test';
    const now = new Date();

    await db.insert(schema.user).values({
      id: userId,
      name: 'Profile Tester',
      email: 'proftester_opt@example.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    const gamesList = await db.select().from(schema.games).limit(2);

    await db.insert(schema.gameProfiles).values({
      id: 'gp_opt_1',
      userId,
      gameId: gamesList[0].id,
      inGameName: 'ProGamerX',
      rank: 'Diamond I',
      role: 'Jungler',
      playHours: 450.5,
      playStyle: 'Aggressive',
    });

    const [gp] = await db
      .select()
      .from(schema.gameProfiles)
      .where(eq(schema.gameProfiles.id, 'gp_opt_1'));

    expect(gp).toBeDefined();
    expect(gp.rank).toBe('Diamond I');
    expect(gp.inGameName).toBe('ProGamerX');
    expect(gp.playHours).toBe(450.5);

    await db.insert(schema.gameProfiles).values({
      id: 'gp_opt_norank',
      userId,
      gameId: gamesList[1].id,
      inGameName: 'CasualPlayer',
    });

    const [gpNoRank] = await db
      .select()
      .from(schema.gameProfiles)
      .where(eq(schema.gameProfiles.id, 'gp_opt_norank'));

    expect(gpNoRank).toBeDefined();
    expect(gpNoRank.rank).toBeNull();
  });

  it('should enforce invalid FK constraints with real PostgreSQL pg 23503 errors', async () => {
    const now = new Date();

    // 1. Invalid userId on session (pg 23503)
    try {
      await db.insert(schema.session).values({
        id: 'sess_invalid_fk',
        token: 'tok_invalid_fk',
        userId: 'non_existent_user_id',
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: now,
        updatedAt: now,
      });
      expect.fail('Should have rejected invalid userId foreign key');
    } catch (err: unknown) {
      expect(getPgErrorCode(err)).toBe('23503');
    }

    // 2. Invalid gameId on game_profiles (pg 23503)
    const userId = 'user_fk_assert_test';
    await db.insert(schema.user).values({
      id: userId,
      name: 'FK Assert Tester',
      email: 'fk_assert@example.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await db.insert(schema.gameProfiles).values({
        id: 'gp_invalid_game_fk',
        userId,
        gameId: 'non_existent_game_id',
      });
      expect.fail('Should have rejected invalid gameId foreign key');
    } catch (err: unknown) {
      expect(getPgErrorCode(err)).toBe('23503');
    }

    // 3. Invalid gameId on lobbies (pg 23503)
    try {
      await db.insert(schema.lobbies).values({
        id: 'lobby_invalid_game_fk',
        gameId: 'non_existent_game_id',
        name: 'Lobby',
      });
      expect.fail('Should have rejected invalid gameId on lobbies');
    } catch (err: unknown) {
      expect(getPgErrorCode(err)).toBe('23503');
    }
  });
});
