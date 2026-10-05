import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '@fg/database';
import { makeSignature } from 'better-auth/crypto';
import { MeDTOSchema } from '@fg/contracts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadLocalEnv() {
  if (process.env.DATABASE_URL) {
    return process.env;
  }
  const envPath = path.resolve(__dirname, '../../../.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    return parseEnv(content);
  }
  return process.env;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function createSignedSessionCookie(secret, token) {
  const signature = await makeSignature(token, secret);
  return `better-auth.session_token=${token}.${signature}`;
}

async function runSmoke() {
  const env = loadLocalEnv();
  const rawUrl = env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const discordClientId = env.DISCORD_CLIENT_ID;
  const discordClientSecret = env.DISCORD_CLIENT_SECRET;
  if (!discordClientId || !discordClientSecret) {
    throw new Error('DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET environment variables are required');
  }

  const schemaName = `t08_fix1_native_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const port = await getFreePort();
  const secret = env.BETTER_AUTH_SECRET || 'test_secret_key_minimum_32_characters_long_123456';
  const origin = `http://localhost:${port}`;

  console.log(`Setting up owned native smoke schema: ${schemaName} on verified free port ${port}...`);

  const scopedUrlObj = new URL(rawUrl);
  scopedUrlObj.searchParams.set('options', `-c search_path=${schemaName}`);
  const scopedUrl = scopedUrlObj.toString();

  const pool = new pg.Pool({ connectionString: scopedUrl });
  const client = await pool.connect();

  let child;
  let cleanupError;

  try {
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}"`);

    const db = drizzle(client, { schema });
    const rootDir = path.resolve(__dirname, '../../..');
    const migrationsFolder = path.resolve(rootDir, 'packages/database/migrations');

    await migrate(db, { migrationsFolder, migrationsSchema: schemaName });
    const seededGames = await schema.seedGames(db);

    console.log('Database schema migrated and 7 catalog games seeded.');

    // Seed test user session fixture
    const userId = `user_native_${Date.now()}`;
    const sessionToken = `sess_native_${Date.now()}`;
    const now = new Date();
    const expiresAt = new Date(Date.now() + 86400000);
    const userImage = 'https://cdn.discordapp.com/avatars/test/avatar.png';

    await db.insert(schema.user).values({
      id: userId,
      name: 'Native Test User',
      email: 'native-user@example.com',
      emailVerified: true,
      image: userImage,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.account).values({
      id: `acc_${userId}`,
      accountId: 'discord_native_123',
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

    const cookieHeader = await createSignedSessionCookie(secret, sessionToken);

    const distPath = path.resolve(rootDir, 'apps/api/dist/main.js');
    if (!fs.existsSync(distPath)) {
      throw new Error(`Compiled dist file not found at ${distPath}. Run npm run build --workspace @fg/api first.`);
    }

    const serverEnv = {
      ...process.env,
      DATABASE_URL: scopedUrl,
      PORT: String(port),
      PUBLIC_ORIGIN: origin,
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: secret,
      DISCORD_CLIENT_ID: discordClientId,
      DISCORD_CLIENT_SECRET: discordClientSecret,
      NODE_ENV: 'production',
    };

    console.log(`Spawning compiled server process with shell: false...`);
    child = spawn(process.execPath, [distPath], {
      cwd: path.resolve(rootDir, 'apps/api'),
      env: serverEnv,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    console.log(`Child server spawned with owned PID: ${child.pid}`);

    // Quietly consume stdout and stderr streams to prevent process blocking
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});

    // Await native readiness
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Child server process exited prematurely (exitCode: ${child.exitCode}, signalCode: ${child.signalCode})`);
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/v1/games`);
        if (res.status === 200) {
          ready = true;
          console.log(`Server responded ready with status 200 on port ${port}.`);
          break;
        }
      } catch {
        // Retry
      }
    }

    if (!ready) {
      throw new Error('Native compiled HTTP server failed to become ready in 15 seconds');
    }

    // 1. GET /api/v1/games (7 catalog games)
    const gamesRes = await fetch(`http://127.0.0.1:${port}/api/v1/games`);
    const gamesBody = await gamesRes.json();
    if (gamesRes.status !== 200 || !Array.isArray(gamesBody) || gamesBody.length !== 7) {
      throw new Error(`Check 1 FAIL: GET /api/v1/games status=${gamesRes.status}, count=${gamesBody?.length}`);
    }
    console.log('Smoke check 1 PASS: GET /api/v1/games returns 7 catalog games.');

    // 2. GET /api/v1/users/non_existent/profile (404 NOT_FOUND)
    const notFoundRes = await fetch(`http://127.0.0.1:${port}/api/v1/users/non_existent_user_999/profile`);
    const notFoundBody = await notFoundRes.json();
    if (notFoundRes.status !== 404 || notFoundBody.code !== 'NOT_FOUND') {
      throw new Error(`Check 2 FAIL: GET absent profile status=${notFoundRes.status}, code=${notFoundBody?.code}`);
    }
    console.log('Smoke check 2 PASS: GET absent profile returns 404 with code NOT_FOUND.');

    // 3. Guest mutation PATCH /api/v1/me/profile without cookie (401 LOGIN_REQUIRED)
    const guestRes = await fetch(`http://127.0.0.1:${port}/api/v1/me/profile`, {
      method: 'PATCH',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Guest Attempt' }),
    });
    const guestBody = await guestRes.json();
    if (guestRes.status !== 401 || guestBody.code !== 'LOGIN_REQUIRED') {
      throw new Error(`Check 3 FAIL: Guest mutation status=${guestRes.status}, code=${guestBody?.code}`);
    }
    console.log('Smoke check 3 PASS: Guest mutation returns 401 with code LOGIN_REQUIRED.');

    const beforeOnboarding = await fetch(`http://127.0.0.1:${port}/api/v1/me`, { headers: { Cookie: cookieHeader } });
    if (beforeOnboarding.status !== 200) throw new Error('Check 8 FAIL: signed GET me failed');
    const firstMe = MeDTOSchema.parse(await beforeOnboarding.json());
    if (firstMe.onboardingComplete !== false || firstMe.interestedGames?.length !== 0) throw new Error('Check 8 FAIL: first-login state incorrect');
    console.log('Smoke check 8 PASS: signed GET me reports incomplete onboarding and empty stored interests.');

    // 4. Authenticated POST /api/v1/me/onboarding with signed cookie & Origin header
    const onboardRes = await fetch(`http://127.0.0.1:${port}/api/v1/me/onboarding`, {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: 'Native Gamer',
        bio: 'Native smoke bio',
        interestedGames: ['Valorant', 'Dota 2'],
      }),
    });
    const onboardBody = await onboardRes.json();
    if (onboardRes.status !== 200 || onboardBody.displayName !== 'Native Gamer') {
      throw new Error(`Check 4 FAIL: Onboarding status=${onboardRes.status}`);
    }
    console.log('Smoke check 4 PASS: Signed cookie onboarding returns 200 with PrivateProfileSchema.');

    // 5. GET /api/v1/users/:id/profile (Public Profile Privacy Check)
    const pubRes = await fetch(`http://127.0.0.1:${port}/api/v1/users/${userId}/profile`);
    const pubBody = await pubRes.json();
    if (
      pubRes.status !== 200 ||
      pubBody.displayName !== 'Native Gamer' ||
      pubBody.email !== undefined ||
      pubBody.discordId !== undefined
    ) {
      throw new Error(`Check 5 FAIL: Public profile privacy check failed. status=${pubRes.status}`);
    }
    console.log('Smoke check 5 PASS: GET public profile returns 200 stripping email and discordId.');

    // 6. PUT /api/v1/me/interests with invalid interest -> 422 INVALID_INPUT
    const invalidIntRes = await fetch(`http://127.0.0.1:${port}/api/v1/me/interests`, {
      method: 'PUT',
      headers: {
        Cookie: cookieHeader,
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ interestedGames: ['InvalidGameTitle'] }),
    });
    const invalidIntBody = await invalidIntRes.json();
    if (invalidIntRes.status !== 422 || invalidIntBody.code !== 'INVALID_INPUT') {
      throw new Error(`Check 6 FAIL: Invalid interest status=${invalidIntRes.status}, code=${invalidIntBody?.code}`);
    }
    console.log('Smoke check 6 PASS: Invalid interest returns 422 with code INVALID_INPUT.');

    // 7. PUT /api/v1/me/game-profiles/:gameId
    const gameId = seededGames[0].id;
    const gpRes = await fetch(`http://127.0.0.1:${port}/api/v1/me/game-profiles/${gameId}`, {
      method: 'PUT',
      headers: {
        Cookie: cookieHeader,
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'Duelist',
        playHours: 42.5,
      }),
    });
    const gpBody = await gpRes.json();
    if (gpRes.status !== 200 || gpBody.gameId !== gameId || gpBody.playHours !== 42.5) {
      throw new Error(`Check 7 FAIL: Game profile PUT status=${gpRes.status}`);
    }
    console.log('Smoke check 7 PASS: Game profile PUT returns 200 with GameProfileSchema.');

    const afterOnboarding = await fetch(`http://127.0.0.1:${port}/api/v1/me`, { headers: { Cookie: cookieHeader } });
    if (afterOnboarding.status !== 200) throw new Error('Check 9 FAIL: signed GET me failed');
    const completeMe = MeDTOSchema.parse(await afterOnboarding.json());
    if (completeMe.onboardingComplete !== true || JSON.stringify(completeMe.interestedGames?.slice().sort()) !== JSON.stringify(['Dota 2','Valorant'])) throw new Error('Check 9 FAIL: persisted completion/interests incorrect');
    console.log('Smoke check 9 PASS: fresh signed GET me reports persisted completed onboarding and chosen games.');

    const clearAvatar = await fetch(`http://127.0.0.1:${port}/api/v1/me/profile`, { method: 'PATCH', headers: { Cookie: cookieHeader, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ avatarUrl: null }) });
    if (clearAvatar.status !== 200) throw new Error('Check 10 FAIL: clear avatar failed');
    const afterClear = await fetch(`http://127.0.0.1:${port}/api/v1/me`, { headers: { Cookie: cookieHeader } });
    if (afterClear.status !== 200 || MeDTOSchema.parse(await afterClear.json()).avatarUrl !== null) throw new Error('Check 10 FAIL: cleared avatar restored by GET me');
    console.log('Smoke check 10 PASS: GET me preserves cleared avatar with actual provider image present.');

    console.log('\nAll 10 Native Compiled AppModule HTTP Smoke Checks PASSED Cleanly!');
  } catch (err) {
    console.error('Smoke check failure step encountered.');
    cleanupError = err;
  } finally {
    console.log('Executing strict process and DB schema cleanup...');
    if (child && child.exitCode === null && child.signalCode === null) {
      const exitPromise = new Promise((resolve) => child.once('exit', resolve));
      if (!child.kill('SIGTERM')) cleanupError ||= new Error('Owned child stop request failed');
      const timeout = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          try {
            if (!child.kill('SIGKILL')) cleanupError ||= new Error('Owned child force stop request failed');
          } catch {
            cleanupError ||= new Error('Owned child force stop failed');
          }
        }
      }, 3000);
      let waitTimeout;
      try {
        await Promise.race([exitPromise, new Promise((resolve) => {
          waitTimeout = setTimeout(() => {
            cleanupError ||= new Error('Owned child did not exit within six seconds');
            resolve();
          }, 6000);
        })]);
      } finally {
        clearTimeout(timeout);
        clearTimeout(waitTimeout);
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        console.log(`Owned child server PID ${child.pid} successfully terminated.`);
      }
    }

    try {
      if (child && child.exitCode === null && child.signalCode === null) {
        cleanupError ||= new Error('Cannot drop schema while owned server remains alive');
        console.error('Owned server still alive; retaining owned schema for investigation.');
      } else {
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      const checkRes = await client.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
        [schemaName]
      );
      if (checkRes.rows.length > 0) {
        if (!cleanupError) {
          cleanupError = new Error(`Cleanup failed: schema ${schemaName} was not dropped`);
        }
      } else {
        console.log(`Verified owned schema ${schemaName} successfully dropped.`);
      }
      }
    } catch (err) {
      console.error('Schema drop cleanup error.');
      if (!cleanupError) cleanupError = err;
    } finally {
      client.release();
      await pool.end();
    }
  }

  if (cleanupError) {
    console.error('Smoke suite completed with failure.');
    process.exit(1);
  }
}

runSmoke();

