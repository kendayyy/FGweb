import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import pg from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import fs from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import * as schema from '@fg/database';
import {
  PublicProfileSchema,
  PrivateProfileSchema,
  GameSchema,
  InterestsResponseSchema,
  GameProfileSchema,
} from '@fg/contracts';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { ProfilesService } from '../src/modules/profiles/profiles.service.js';
import { createSignedSessionCookie } from './test-cookie-helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadLocalEnv(): Record<string, string> {
  if (process.env.DATABASE_URL) {
    return process.env as unknown as Record<string, string>;
  }
  const envPath = path.resolve(__dirname, '../../../.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    return parseEnv(content) as unknown as Record<string, string>;
  }
  return process.env as unknown as Record<string, string>;
}

describe('T10 - Profile & Game-Interest APIs (Integration)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let client: pg.PoolClient;
  let db: NodePgDatabase<typeof schema>;
  let schemaName: string;
  let authService: AuthService;
  let profilesService: ProfilesService;
  let seededGames: Array<{ id: string; title: string; lobbyId: string }>;
  const secret = 'test_secret_key_minimum_32_characters_long_123456';
  const publicOrigin = 'http://localhost:5173';

  beforeAll(async () => {
    const env = loadLocalEnv();
    const databaseUrl = env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/fgweb';
    schemaName = `test_t10_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    pool = new pg.Pool({ connectionString: databaseUrl });
    client = await pool.connect();

    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}"`);

    db = drizzle(client, { schema });

    const rootDir = path.resolve(__dirname, '../../..');
    const migrationsFolder = path.resolve(rootDir, 'packages/database/migrations');
    await migrate(db, { migrationsFolder, migrationsSchema: schemaName });

    seededGames = await schema.seedGames(db);

    process.env.DATABASE_URL = databaseUrl;
    process.env.TEST_DB_SCHEMA = schemaName;
    process.env.PUBLIC_ORIGIN = publicOrigin;
    process.env.BETTER_AUTH_URL = publicOrigin;
    process.env.BETTER_AUTH_SECRET = secret;
    process.env.DISCORD_CLIENT_ID = env.DISCORD_CLIENT_ID || 'mock_discord_client_id';
    process.env.DISCORD_CLIENT_SECRET = env.DISCORD_CLIENT_SECRET || 'mock_discord_client_secret';

    app = await NestFactory.create(AppModule, { logger: false });
    authService = app.get(AuthService);
    profilesService = app.get(ProfilesService);

    authService.setDb(db);
    profilesService.setDb(db);

    await app.init();
  }, 60000);

  afterAll(async () => {
    const errors: Error[] = [];
    if (app) {
      try {
        await app.close();
      } catch (err) {
        errors.push(err as Error);
      }
    }
    if (client) {
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } catch (err) {
        errors.push(err as Error);
      } finally {
        try {
          client.release();
        } catch (err) {
          errors.push(err as Error);
        }
      }
    }
    if (pool) {
      try {
        await pool.end();
      } catch (err) {
        errors.push(err as Error);
      }
    }
    if (errors.length > 0) {
      throw new Error(`Cleanup failed with errors: ${errors.map((e) => e.message).join('; ')}`);
    }
  });

  async function createUserSession(opts?: { name?: string; email?: string; image?: string; isBanned?: boolean }) {
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const sessionToken = `sess_token_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const expiresAt = new Date(Date.now() + 86400000);
    const userImage = opts?.image ?? 'https://cdn.discordapp.com/avatars/123/abc.png';

    await db.insert(schema.user).values({
      id: userId,
      name: opts?.name || 'Test Gamer',
      email: opts?.email || `${userId}@example.com`,
      emailVerified: true,
      image: userImage,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.account).values({
      id: `acc_${userId}`,
      accountId: `discord_${userId}`,
      accessToken: 'test-access-token',
      providerId: 'discord',
      userId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.session).values({
      id: `sess_${userId}`,
      token: sessionToken,
      userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    if (opts?.isBanned) {
      await db.insert(schema.adminActions).values({
        id: `action_ban_${userId}`,
        targetUserId: userId,
        actorId: userId,
        action: 'BAN',
        reason: 'Test ban',
        createdAt: now,
      });
    }

    const cookie = await createSignedSessionCookie(secret, sessionToken);
    return { userId, sessionToken, cookie, userImage };
  }

  describe('1. GET /api/v1/users/:id/profile (Public Profile)', () => {
    it('returns 404 for non-existent user ID', async () => {
      await supertest(app.getHttpServer())
        .get('/api/v1/users/non_existent_user_9999/profile')
        .expect(404);
    });

    it('returns PublicProfileSchema without exposing private fields for existing user', async () => {
      const { userId } = await createUserSession({ name: 'Public User' });

      // Create profile record
      const now = new Date();
      await db.insert(schema.profiles).values({
        userId,
        displayName: 'Public Gamer Tag',
        bio: 'Hello gaming world',
        customStatus: 'LOOKING_FOR_TEAM',
        createdAt: now,
        updatedAt: now,
      });

      const res = await supertest(app.getHttpServer())
        .get(`/api/v1/users/${userId}/profile`)
        .expect(200);

      expect(PublicProfileSchema.safeParse(res.body).success).toBe(true);
      expect(res.body.id).toBe(userId);
      expect(res.body.displayName).toBe('Public Gamer Tag');
      expect(res.body.bio).toBe('Hello gaming world');
      expect(res.body.customStatus).toBe('LOOKING_FOR_TEAM');
      expect(res.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);

      // Assert private fields are stripped / not present
      expect(res.body.email).toBeUndefined();
      expect(res.body.discordId).toBeUndefined();
      expect(res.body.emailVerified).toBeUndefined();
      expect(res.body.accessToken).toBeUndefined();
    });
  });

  describe('2. GET /api/v1/games (7 Games Catalog)', () => {
    it('returns all 7 catalog games matching GameSchema', async () => {
      const res = await supertest(app.getHttpServer())
        .get('/api/v1/games')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(7);

      for (const game of res.body) {
        expect(GameSchema.safeParse(game).success).toBe(true);
      }
    });

    it('filters games by search query parameter', async () => {
      const res = await supertest(app.getHttpServer())
        .get('/api/v1/games?search=Valorant')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].title).toBe('Valorant');
    });
  });

  describe('3. Security & Access Control (Guest, CSRF, Ban & Identity Isolation)', () => {
    it('guest mutation returns 401 LOGIN_REQUIRED', async () => {
      await supertest(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Origin', publicOrigin)
        .send({ displayName: 'New Name' })
        .expect(401);

      await supertest(app.getHttpServer())
        .post('/api/v1/me/onboarding')
        .set('Origin', publicOrigin)
        .send({ displayName: 'Onboard User', interestedGames: ['Valorant'] })
        .expect(401);

      await supertest(app.getHttpServer())
        .put('/api/v1/me/interests')
        .set('Origin', publicOrigin)
        .send({ interestedGames: ['Valorant'] })
        .expect(401);

      const gameId = seededGames[0].id;
      await supertest(app.getHttpServer())
        .put(`/api/v1/me/game-profiles/${gameId}`)
        .set('Origin', publicOrigin)
        .send({ role: 'Duelist' })
        .expect(401);
    });

    it('rejects state mutation with foreign or missing Origin header (403 FORBIDDEN)', async () => {
      const { cookie } = await createUserSession();

      await supertest(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Cookie', [cookie])
        .send({ displayName: 'CSRF Attempt' })
        .expect(403);

      await supertest(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Cookie', [cookie])
        .set('Origin', 'http://malicious-attacker.com')
        .send({ displayName: 'CSRF Attempt' })
        .expect(403);
    });

    it('banned session returns 403 FORBIDDEN', async () => {
      const { cookie } = await createUserSession({ isBanned: true });

      await supertest(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Cookie', [cookie])
        .set('Origin', publicOrigin)
        .send({ displayName: 'Banned Update' })
        .expect(403);
    });

    it('rejects cross-user payload overrides and preserves other user profiles', async () => {
      const userA = await createUserSession({ name: 'User A' });
      const userB = await createUserSession({ name: 'User B' });

      // Seed profile for User B
      await db.insert(schema.profiles).values({
        userId: userB.userId,
        displayName: 'Original User B',
        bio: 'Bio B',
      });

      // User A attempts to send payload with userId: userB.userId
      const res = await supertest(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Cookie', [userA.cookie])
        .set('Origin', publicOrigin)
        .send({ id: userB.userId, displayName: 'Hacked User B' });

      // Either extra field 'id' returns 422 or update applies to User A only
      expect([200, 422]).toContain(res.status);

      // Verify User B profile in DB remains untouched
      const [profileB] = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, userB.userId));

      expect(profileB.displayName).toBe('Original User B');
    });
  });

  describe('4. POST /api/v1/me/onboarding', () => {
    it('atomically onboarding persists profile and interests without rank requirement', async () => {
      const { userId, cookie } = await createUserSession();

      // Ensure user is initially NOT onboarded
      expect(await authService.isUserOnboarded(userId)).toBe(false);

      const res = await supertest(app.getHttpServer())
        .post('/api/v1/me/onboarding')
        .set('Cookie', [cookie])
        .set('Origin', publicOrigin)
        .send({
          displayName: 'Pro Player',
          bio: 'Aiming for radiant',
          interestedGames: ['Valorant', 'Liên Minh Huyền Thoại'],
        })
        .expect(200);

      expect(PrivateProfileSchema.safeParse(res.body).success).toBe(true);
      expect(res.body.displayName).toBe('Pro Player');
      expect(res.body.bio).toBe('Aiming for radiant');

      // Verify AuthService.isUserOnboarded returns true now
      expect(await authService.isUserOnboarded(userId)).toBe(true);
    });

    it('rolls back transaction on invalid interest game title (422 INVALID_INPUT)', async () => {
      const { userId, cookie } = await createUserSession();

      await supertest(app.getHttpServer())
        .post('/api/v1/me/onboarding')
        .set('Cookie', [cookie])
        .set('Origin', publicOrigin)
        .send({
          displayName: 'Fail Player',
          interestedGames: ['NonExistentGame123' as unknown as string],
        })
        .expect(422);

      expect(await authService.isUserOnboarded(userId)).toBe(false);
    });
  });

  describe('5. PUT /api/v1/me/interests', () => {
    it('rejects duplicate, unknown, or empty interests with 422 and preserves prior data', async () => {
      const { userId, cookie } = await createUserSession();

      // First onboard validly
      await supertest(app.getHttpServer())
        .post('/api/v1/me/onboarding')
        .set('Cookie', [cookie])
        .set('Origin', publicOrigin)
        .send({
          displayName: 'Gamer One',
          interestedGames: ['Valorant'],
        })
        .expect(200);

      // Attempt empty array
      await supertest(app.getHttpServer())
        .put('/api/v1/me/interests')
        .set('Cookie', [cookie])
        .set('Origin', publicOrigin)
        .send({ interestedGames: [] })
        .expect(422);

      // Attempt duplicates
      await supertest(app.getHttpServer())
        .put('/api/v1/me/interests')
        .set('Cookie', [cookie])
        .set('Origin', publicOrigin)
        .send({ interestedGames: ['Valorant', 'Valorant'] })
        .expect(422);

      // Verify prior interests preserved
      const interests = await db
        .select()
        .from(schema.gameInterests)
        .where(eq(schema.gameInterests.userId, userId));

      expect(interests.length).toBe(1);
    });

    it('successfully replaces interests list atomically', async () => {
      const { userId, cookie } = await createUserSession();

      // Onboard first
      await supertest(app.getHttpServer())
        .post('/api/v1/me/onboarding')
        .set('Cookie', [cookie])
        .set('Origin', publicOrigin)
        .send({
          displayName: 'Interest Swapper',
          interestedGames: ['Valorant'],
        })
        .expect(200);

      const res = await supertest(app.getHttpServer())
        .put('/api/v1/me/interests')
        .set('Cookie', [cookie])
        .set('Origin', publicOrigin)
        .send({
          interestedGames: ['Dota 2', 'Roblox', 'Free Fire'],
        })
        .expect(200);

      expect(InterestsResponseSchema.safeParse(res.body).success).toBe(true);
      expect(res.body.interestedGames).toEqual(['Dota 2', 'Roblox', 'Free Fire']);

      const interestsInDb = await db
        .select()
        .from(schema.gameInterests)
        .where(eq(schema.gameInterests.userId, userId));

      expect(interestsInDb.length).toBe(3);
    });
  });

  describe('6. PUT /api/v1/me/game-profiles/:gameId', () => {
    it('returns 404 for non-existent gameId in route', async () => {
      const { cookie } = await createUserSession();

      await supertest(app.getHttpServer())
        .put('/api/v1/me/game-profiles/non_existent_game_id')
        .set('Cookie', [cookie])
        .set('Origin', publicOrigin)
        .send({ role: 'Carry' })
        .expect(404);
    });

    it('upserts game profile and enforces PUT replacement semantics for omitted optional fields', async () => {
      const { userId, cookie } = await createUserSession();
      const gameVal = seededGames.find((g) => g.title === 'Valorant')!;

      // 1. First PUT with full optional fields
      const res1 = await supertest(app.getHttpServer())
        .put(`/api/v1/me/game-profiles/${gameVal.id}`)
        .set('Cookie', [cookie])
        .set('Origin', publicOrigin)
        .send({
          inGameName: 'TenZ#123',
          rank: 'Radiant',
          role: 'Duelist',
          playHours: 150.5,
          playStyle: 'Aggressive',
        })
        .expect(200);

      expect(GameProfileSchema.safeParse(res1.body).success).toBe(true);
      expect(res1.body.gameId).toBe(gameVal.id);
      expect(res1.body.gameTitle).toBe('Valorant');
      expect(res1.body.inGameName).toBe('TenZ#123');
      expect(res1.body.rank).toBe('Radiant');
      expect(res1.body.playHours).toBe(150.5);

      // 2. Second PUT omitting rank, inGameName, playHours (PUT replacement clears omitted fields)
      const res2 = await supertest(app.getHttpServer())
        .put(`/api/v1/me/game-profiles/${gameVal.id}`)
        .set('Cookie', [cookie])
        .set('Origin', publicOrigin)
        .send({
          role: 'Controller',
        })
        .expect(200);

      expect(GameProfileSchema.safeParse(res2.body).success).toBe(true);
      expect(res2.body.role).toBe('Controller');
      expect(res2.body.rank).toBeUndefined();
      expect(res2.body.inGameName).toBeUndefined();
      expect(res2.body.playHours).toBeUndefined();

      // Verify DB state directly
      const [gpInDb] = await db
        .select()
        .from(schema.gameProfiles)
        .where(eq(schema.gameProfiles.userId, userId));

      expect(gpInDb.role).toBe('Controller');
      expect(gpInDb.rank).toBeNull();
      expect(gpInDb.inGameName).toBeNull();
      expect(gpInDb.playHours).toBeNull();
    });
  });

  describe('7. PATCH /api/v1/me/profile', () => {
    it('updates user profile and returns PrivateProfileSchema', async () => {
      const { cookie, userImage } = await createUserSession();

      const res = await supertest(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('Cookie', [cookie])
        .set('Origin', publicOrigin)
        .send({
          displayName: 'Updated Name',
          bio: 'Updated Bio',
          customStatus: 'PLAYING',
        })
        .expect(200);

      expect(PrivateProfileSchema.safeParse(res.body).success).toBe(true);
      expect(res.body.displayName).toBe('Updated Name');
      expect(res.body.bio).toBe('Updated Bio');
      expect(res.body.customStatus).toBe('PLAYING');
      expect(res.body.avatarUrl).toBe(userImage);
    });
  });
});
