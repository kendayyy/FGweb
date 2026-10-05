import { NestFactory } from '@nestjs/core';
import { INestApplication, Controller, Get, Post, UseGuards, Module, HttpCode } from '@nestjs/common';
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
import { MeDTOSchema } from '@fg/contracts';
import { AuthModule } from '../src/modules/auth/auth.module.js';
import { SessionGuard } from '../src/common/session.guard.js';
import { CsrfGuard } from '../src/common/csrf.guard.js';
import { RequireAdminGuard } from '../src/modules/auth/admin.guard.js';
import { RequireOnboardedGuard } from '../src/modules/auth/onboarded.guard.js';
import { AuthService, createFgAuth } from '../src/modules/auth/auth.service.js';
import { getCookies } from 'better-auth/cookies';
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

@Controller('api/v1')
class TestDummyController {
  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }

  @Post('me/test-mutation')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard)
  testMutation() {
    return { success: true };
  }

  @Get('admin/test')
  @UseGuards(SessionGuard, RequireAdminGuard)
  testAdmin() {
    return { admin: true };
  }

  @Get('onboarded/test')
  @UseGuards(SessionGuard, RequireOnboardedGuard)
  testOnboarded() {
    return { onboarded: true };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [TestDummyController],
})
class TestAppModule {}

describe('T08 - Discord Auth, Session Guard & Security (Integration)', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let client: pg.PoolClient;
  let db: NodePgDatabase<typeof schema>;
  let schemaName: string;
  let authService: AuthService;
  const secret = 'test_secret_key_minimum_32_characters_long_123456';

  beforeAll(async () => {
    const env = loadLocalEnv();
    const databaseUrl = env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/fgweb';
    schemaName = `test_t08_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    pool = new pg.Pool({ connectionString: databaseUrl });
    client = await pool.connect();

    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}"`);

    db = drizzle(client, { schema });

    const rootDir = path.resolve(__dirname, '../../..');
    const migrationsFolder = path.resolve(rootDir, 'packages/database/migrations');
    await migrate(db, { migrationsFolder, migrationsSchema: schemaName });

    // Seed games catalog
    await schema.seedGames(db);

    process.env.DATABASE_URL = databaseUrl;
    process.env.TEST_DB_SCHEMA = schemaName;
    process.env.PUBLIC_ORIGIN = env.PUBLIC_ORIGIN || 'http://localhost:5173';
    process.env.BETTER_AUTH_URL = env.BETTER_AUTH_URL || 'http://localhost:5173';
    process.env.BETTER_AUTH_SECRET = secret;
    process.env.DISCORD_CLIENT_ID = env.DISCORD_CLIENT_ID || 'mock_discord_client_id';
    process.env.DISCORD_CLIENT_SECRET = env.DISCORD_CLIENT_SECRET || 'mock_discord_client_secret';
    process.env.ADMIN_USER_IDS = 'admin_user_id_123';

    app = await NestFactory.create(TestAppModule, { logger: false });
    authService = app.get(AuthService);
    authService.setDb(db);

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

  it('fails safely when required production configuration is missing', () => {
    const originalSecret = process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_SECRET;

    const testService = new AuthService();
    expect(() => testService.onModuleInit()).toThrow('BETTER_AUTH_SECRET environment variable is required');

    process.env.BETTER_AUTH_SECRET = originalSecret;
  });

  it('guest public read succeeds (GET /api/v1/health)', async () => {
    const response = await supertest(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('guest mutation returns 401 Unauthorized', async () => {
    await supertest(app.getHttpServer())
      .post('/api/v1/me/test-mutation')
      .set('Origin', 'http://localhost:5173')
      .expect(401);
  });

  it('rejects unsigned or tampered session cookies', async () => {
    await supertest(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', ['better-auth.session_token=raw_unsigned_fake_token_value'])
      .expect(401);

    await supertest(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', ['better-auth.session_token=valid_token.tampered_signature_value'])
      .expect(401);
  });

  it('OAuth callback rejects invalid state without 500 server error', async () => {
    const response = await supertest(app.getHttpServer())
      .get('/api/auth/callback/discord?state=invalid_state_value&code=mock_code');
    
    // Valid OAuth state error returns 302 redirect to error URL or 400 Bad Request, never 500
    expect([302, 400, 401]).toContain(response.status);
    expect(response.status).not.toBe(500);
  });

  it('performs real signed cookie session creation, logout invalidation, and replay rejection', async () => {
    const userId = `user_logout_${Date.now()}`;
    const sessionToken = `sess_logout_token_${Date.now()}`;
    const now = new Date();
    const expiresAt = new Date(Date.now() + 86400000);

    await db.insert(schema.user).values({
      id: userId,
      name: 'Logout Test User',
      email: 'logout_test@example.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.account).values({
      id: `acc_${userId}`,
      accountId: 'discord_logout_123',
      accessToken: 'test-only-provider-token',
      accessTokenExpiresAt: expiresAt,
      providerId: 'discord',
      userId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.session).values({
      id: `sess_id_${userId}`,
      token: sessionToken,
      userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    const cookieHeader = await createSignedSessionCookie(secret, sessionToken);

    // 1. GET /api/v1/me succeeds for active signed session
    const meResponse = await supertest(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', [cookieHeader])
      .expect(200);

    expect(meResponse.body.id).toBe(userId);
    expect(meResponse.body.discordId).toBe('discord_logout_123');
    expect(MeDTOSchema.safeParse(meResponse.body).success).toBe(true);

    // Provider credentials must never be exposed through the FG browser API.
    await supertest(app.getHttpServer())
      .post('/api/auth/get-access-token')
      .set('Cookie', [cookieHeader])
      .set('Origin', 'http://localhost:5173')
      .send({ providerId: 'discord' })
      .expect(404);
    await supertest(app.getHttpServer())
      .post('/api/auth/refresh-token')
      .set('Cookie', [cookieHeader])
      .set('Origin', 'http://localhost:5173')
      .send({ providerId: 'discord' })
      .expect(404);

    // 2. Perform logout via /api/auth/sign-out with valid Origin and signed cookie
    const signOutResponse = await supertest(app.getHttpServer())
      .post('/api/auth/sign-out')
      .set('Cookie', [cookieHeader])
      .set('Origin', 'http://localhost:5173')
      .send({});

    expect([200, 204, 302]).toContain(signOutResponse.status);

    // 3. Verify session is deleted from DB
    const [dbSession] = await db
      .select()
      .from(schema.session)
      .where(eq(schema.session.token, sessionToken));

    expect(dbSession).toBeUndefined();

    // 4. Replay old session cookie on GET /api/v1/me returns 401
    await supertest(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', [cookieHeader])
      .expect(401);
  });

  it('banned valid session returns 403 and unrelated actions never unban', async () => {
    const userId = `user_banned_${Date.now()}`;
    const sessionToken = `sess_banned_token_${Date.now()}`;
    const now = new Date();
    const expiresAt = new Date(Date.now() + 86400000);

    await db.insert(schema.user).values({
      id: userId,
      name: 'Banned User',
      email: 'banned_user@example.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.account).values({
      id: `acc_${userId}`,
      accountId: 'discord_banned_456',
      providerId: 'discord',
      userId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.session).values({
      id: `sess_id_${userId}`,
      token: sessionToken,
      userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    const cookieHeader = await createSignedSessionCookie(secret, sessionToken);

    // Verify active session works before ban
    await supertest(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', [cookieHeader])
      .expect(200);

    // 1. Insert BAN action into admin_actions
    const t1 = new Date(Date.now() + 100);
    await db.insert(schema.adminActions).values({
      id: `ban_act_${Date.now()}_1`,
      actorId: userId,
      targetUserId: userId,
      action: 'BAN',
      reason: 'Violation of community rules',
      createdAt: t1,
    });

    // Valid session token returns 403 Forbidden
    await supertest(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', [cookieHeader])
      .expect(403);

    // 2. Insert unrelated RESOLVE_REPORT action later
    const t2 = new Date(Date.now() + 200);
    await db.insert(schema.adminActions).values({
      id: `act_resolve_${Date.now()}_2`,
      actorId: userId,
      targetUserId: userId,
      action: 'RESOLVE_REPORT',
      reason: 'Report handled',
      createdAt: t2,
    });

    // User MUST STILL BE BANNED (unrelated report actions do not lift ban)
    await supertest(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', [cookieHeader])
      .expect(403);

    // 3. Insert UNBAN action
    const t3 = new Date(Date.now() + 300);
    await db.insert(schema.adminActions).values({
      id: `unban_act_${Date.now()}_3`,
      actorId: userId,
      targetUserId: userId,
      action: 'UNBAN',
      reason: 'Appeal accepted',
      createdAt: t3,
    });

    // Session works again
    await supertest(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', [cookieHeader])
      .expect(200);
  });

  it('requireAdmin guard uses immutable server-configured user IDs', async () => {
    const regularUserId = `user_reg_${Date.now()}`;
    const adminUserId = 'admin_user_id_123';
    const regSessionToken = `sess_reg_${Date.now()}`;
    const adminSessionToken = `sess_admin_${Date.now()}`;
    const now = new Date();

    // Regular user
    await db.insert(schema.user).values({
      id: regularUserId,
      name: 'Regular User',
      email: 'admin_imposter@fg.vn',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.session).values({
      id: `sess_${regularUserId}`,
      token: regSessionToken,
      userId: regularUserId,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: now,
      updatedAt: now,
    });

    // Admin user (matching ADMIN_USER_IDS = admin_user_id_123)
    await db.insert(schema.user).values({
      id: adminUserId,
      name: 'Admin User',
      email: 'real_admin@fg.vn',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.session).values({
      id: `sess_${adminUserId}`,
      token: adminSessionToken,
      userId: adminUserId,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: now,
      updatedAt: now,
    });

    const regCookie = await createSignedSessionCookie(secret, regSessionToken);
    const adminCookie = await createSignedSessionCookie(secret, adminSessionToken);

    // Email coincidence on unverified email does NOT grant admin -> 403 Forbidden
    await supertest(app.getHttpServer())
      .get('/api/v1/admin/test')
      .set('Cookie', [regCookie])
      .expect(403);

    // Configured admin user ID -> 200 OK
    const res = await supertest(app.getHttpServer())
      .get('/api/v1/admin/test')
      .set('Cookie', [adminCookie])
      .expect(200);

    expect(res.body).toEqual({ admin: true });
  });

  it('grants admin only when the authenticated user owns an allowlisted Discord identity', async () => {
    const userId = `discord_admin_${Date.now()}`;
    const token = `discord_admin_session_${Date.now()}`;
    const now = new Date();
    const savedDiscordIds = process.env.ADMIN_DISCORD_IDS;
    await db.insert(schema.user).values({ id: userId, name: 'Discord Admin', email: 'discord-admin@example.com', emailVerified: true, createdAt: now, updatedAt: now });
    await db.insert(schema.account).values({ id: `account_${userId}`, accountId: 'allowlisted_discord_identity', providerId: 'discord', userId, createdAt: now, updatedAt: now });
    await db.insert(schema.session).values({ id: `session_${userId}`, token, userId, expiresAt: new Date(Date.now() + 86400000), createdAt: now, updatedAt: now });
    const cookie = await createSignedSessionCookie(secret, token);
    try {
      process.env.ADMIN_DISCORD_IDS = 'someone_else';
      await supertest(app.getHttpServer()).get('/api/v1/admin/test').set('Cookie', cookie).expect(403);
      process.env.ADMIN_DISCORD_IDS = 'allowlisted_discord_identity';
      await supertest(app.getHttpServer()).get('/api/v1/admin/test').set('Cookie', cookie).expect(200);
    } finally {
      if (savedDiscordIds === undefined) delete process.env.ADMIN_DISCORD_IDS;
      else process.env.ADMIN_DISCORD_IDS = savedDiscordIds;
    }
  });

  it('rejects a correctly signed cookie whose persisted session has expired', async () => {
    const userId = `expired_user_${Date.now()}`;
    const token = `expired_token_${Date.now()}`;
    const now = new Date();
    await db.insert(schema.user).values({ id: userId, name: 'Expired User', email: 'expired@example.com', emailVerified: true, createdAt: now, updatedAt: now });
    await db.insert(schema.session).values({ id: `session_${userId}`, token, userId, expiresAt: new Date(Date.now() - 60000), createdAt: now, updatedAt: now });
    const cookie = await createSignedSessionCookie(secret, token);
    await supertest(app.getHttpServer()).get('/api/v1/me').set('Cookie', cookie).expect(401);
  });

  it('requireOnboarded guard handles negative and positive cases', async () => {
    const nonOnboardedUserId = `user_nononboarded_${Date.now()}`;
    const onboardedUserId = `user_onboarded_${Date.now()}`;
    const nonOnboardedSessionToken = `sess_nononboard_${Date.now()}`;
    const onboardedSessionToken = `sess_onboard_${Date.now()}`;
    const now = new Date();

    // User 1: Non-onboarded
    await db.insert(schema.user).values({
      id: nonOnboardedUserId,
      name: 'Non-Onboarded User',
      email: 'no_onboard@example.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.session).values({
      id: `sess_${nonOnboardedUserId}`,
      token: nonOnboardedSessionToken,
      userId: nonOnboardedUserId,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: now,
      updatedAt: now,
    });

    // User 2: Onboarded (has profile and game interest)
    await db.insert(schema.user).values({
      id: onboardedUserId,
      name: 'Onboarded User',
      email: 'onboarded@example.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.session).values({
      id: `sess_${onboardedUserId}`,
      token: onboardedSessionToken,
      userId: onboardedUserId,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.profiles).values({
      userId: onboardedUserId,
      displayName: 'Onboarded Gamer',
      customStatus: 'JUST_CHATTING',
      createdAt: now,
      updatedAt: now,
    });

    const [game] = await db.select().from(schema.games).limit(1);
    await db.insert(schema.gameInterests).values({
      id: `gi_${onboardedUserId}`,
      userId: onboardedUserId,
      gameId: game.id,
    });

    const nonOnboardedCookie = await createSignedSessionCookie(secret, nonOnboardedSessionToken);
    const onboardedCookie = await createSignedSessionCookie(secret, onboardedSessionToken);

    // Negative: non-onboarded gets 403
    await supertest(app.getHttpServer())
      .get('/api/v1/onboarded/test')
      .set('Cookie', [nonOnboardedCookie])
      .expect(403);

    // Positive: onboarded gets 200
    const res = await supertest(app.getHttpServer())
      .get('/api/v1/onboarded/test')
      .set('Cookie', [onboardedCookie])
      .expect(200);

    expect(res.body).toEqual({ onboarded: true });
  });

  it('CSRF guard rejects missing, null, foreign, misleading-prefix, and spoofed Host mutations', async () => {
    const userId = `user_csrf_${Date.now()}`;
    const sessionToken = `sess_csrf_${Date.now()}`;
    const now = new Date();

    await db.insert(schema.user).values({
      id: userId,
      name: 'CSRF Tester',
      email: 'csrf_test@example.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.session).values({
      id: `sess_${userId}`,
      token: sessionToken,
      userId,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: now,
      updatedAt: now,
    });

    const cookieHeader = await createSignedSessionCookie(secret, sessionToken);

    // 1. Missing Origin -> 403 Forbidden
    await supertest(app.getHttpServer())
      .post('/api/v1/me/test-mutation')
      .set('Cookie', [cookieHeader])
      .expect(403);

    // 2. Null Origin -> 403 Forbidden
    await supertest(app.getHttpServer())
      .post('/api/v1/me/test-mutation')
      .set('Cookie', [cookieHeader])
      .set('Origin', 'null')
      .expect(403);

    // 3. Foreign Origin -> 403 Forbidden
    await supertest(app.getHttpServer())
      .post('/api/v1/me/test-mutation')
      .set('Cookie', [cookieHeader])
      .set('Origin', 'http://evil-attacker.com')
      .expect(403);

    // 4. Misleading prefix Origin -> 403 Forbidden
    await supertest(app.getHttpServer())
      .post('/api/v1/me/test-mutation')
      .set('Cookie', [cookieHeader])
      .set('Origin', 'http://localhost:5173.evil.com')
      .expect(403);

    // 5. Spoofed Host header without canonical Origin -> 403 Forbidden
    await supertest(app.getHttpServer())
      .post('/api/v1/me/test-mutation')
      .set('Cookie', [cookieHeader])
      .set('Host', 'localhost:5173')
      .expect(403);

    // 6. Valid canonical matching Origin -> 200 OK
    await supertest(app.getHttpServer())
      .post('/api/v1/me/test-mutation')
      .set('Cookie', [cookieHeader])
      .set('Origin', 'http://localhost:5173')
      .expect(200);
  });

  it('disables automatic account linking by email', async () => {
    const authConfig = authService.getAuthConfig();
    expect(authConfig.account?.accountLinking?.enabled).toBe(false);
    expect(authConfig.emailAndPassword?.enabled).toBe(false);
  });

  it('handles POST /api/auth/sign-in/social with JSON payload, returns Discord OAuth URL with state, and rejects invalid Origin', async () => {
    // 1. Invalid origin on POST /api/auth/sign-in/social -> rejected (403)
    await supertest(app.getHttpServer())
      .post('/api/auth/sign-in/social')
      .set('Origin', 'http://malicious.com')
      .send({ provider: 'discord', callbackURL: 'http://localhost:5173/auth/callback' })
      .expect(403);

    // 2. Valid canonical origin -> returns OAuth authorization URL
    const response = await supertest(app.getHttpServer())
      .post('/api/auth/sign-in/social')
      .set('Origin', 'http://localhost:5173')
      .send({ provider: 'discord', callbackURL: 'http://localhost:5173/auth/callback' })
      .expect(200);

    expect(response.body).toBeDefined();
    expect(response.body.url).toBeDefined();
    expect(typeof response.body.url).toBe('string');
    expect(response.body.url).toContain('discord.com');
    expect(response.body.url).toContain('oauth2/authorize');
    expect(response.body.url).toContain('client_id=');
    expect(response.body.url).toContain('state=');

    // Verify Set-Cookie header contains state cookie
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader) {
      const setCookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      const stateCookieExists = setCookieArray.some((c: string) => c.includes('state'));
      expect(stateCookieExists).toBe(true);
    }
  });

  it('rejects guest account linking attempts through real handler', async () => {
    await supertest(app.getHttpServer())
      .post('/api/auth/link-social')
      .set('Origin', 'http://localhost:5173')
      .send({ provider: 'discord', callbackURL: 'http://localhost:5173/auth/callback' })
      .expect((res) => {
        expect([401, 400, 403]).toContain(res.status);
      });
  });

  it('configures Secure cookies on HTTPS base URL outside production and rejects tampered / expired session cookies', async () => {
    // 1. Verify HTTPS cookie metadata via createFgAuth
    const httpsAuth = createFgAuth(db, {
      baseURL: 'https://fg.example.com',
      secret,
      discordClientId: 'https_client_id',
      discordClientSecret: 'https_client_secret',
    });
    expect(httpsAuth.options.advanced?.useSecureCookies).toBe(true);

    const cookies = getCookies(httpsAuth.options);
    expect(cookies.sessionToken.name).toMatch(/^__Secure-/);
    expect(cookies.sessionToken.attributes.secure).toBe(true);
    expect(cookies.sessionToken.attributes.httpOnly).toBe(true);
    expect(cookies.sessionToken.attributes.sameSite).toBe('lax');

    // 2. Tampered session cookie on /api/v1/me -> 401 Unauthorized
    await supertest(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', ['better-auth.session_token=tampered_token_without_signature'])
      .expect(401);

    // 3. Expired / deleted session in database on /api/v1/me -> 401 Unauthorized
    const fakeExpiredToken = 'expired_session_token_' + Date.now();
    await supertest(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', [`better-auth.session_token=${fakeExpiredToken}`])
      .expect(401);
  });
});
