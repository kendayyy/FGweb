import { test, expect,type Page } from '@playwright/test';
import { spawn, ChildProcess } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import pg from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { makeSignature } from 'better-auth/crypto';
import * as schema from '@fg/database';
import { eq, and } from 'drizzle-orm';
import { parseEnv } from 'node:util';

const { Pool } = pg;
const viewports=[{width:1440,height:900},{width:1280,height:800},{width:390,height:844},{width:360,height:800}];
async function captureLayout(page:Page,directory:string,stage:string){
  fs.mkdirSync(directory,{recursive:true});
  for(const viewport of viewports){
    await page.setViewportSize(viewport);
    await page.evaluate(()=>{window.scrollTo(0,0);document.body.scrollTop=0;});
    await page.evaluate(()=>document.fonts.ready);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));
    const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
    expect(metrics.scroll,`Overflow at ${viewport.width} ${stage}`).toBeLessThanOrEqual(metrics.client);
    const undersized=await page.locator('button,a,input:not([type="checkbox"]),textarea,select,label:has(input[type="checkbox"])').evaluateAll(elements=>elements.filter(element=>{
      const rect=element.getBoundingClientRect();return rect.width>0&&rect.height>0&&(rect.width<44||rect.height<44);
    }).map(element=>element.textContent?.trim()||element.getAttribute('aria-label')||element.tagName));
    expect(undersized,`Touch controls at ${viewport.width} ${stage}`).toEqual([]);
    await page.screenshot({path:path.join(directory,`${viewport.width}x${viewport.height}-${stage}.png`)});
    if(viewport.width<400){
      const lastControl=page.getByRole('button').last();
      await lastControl.scrollIntoViewIfNeeded();
      await expect(lastControl).toBeVisible();
      await page.screenshot({path:path.join(directory,`${viewport.width}x${viewport.height}-${stage}-bottom.png`)});
    }
  }
}

function getFreePort():Promise<number>{
  return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();if(!address||typeof address==='string')return reject(new Error('Missing port'));server.close(error=>error?reject(error):resolve(address.port));});});
}

function isPortAvailable(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function waitForHttp(url: string, childProc?: ChildProcess | null, timeoutMs = 30000): Promise<number> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      if (childProc && (childProc.exitCode !== null || childProc.signalCode !== null)) {
        return reject(new Error(`Spawned process exited prematurely with code ${childProc.exitCode}`));
      }
      http
        .get(url, (res) => {
          res.resume();
          resolve(res.statusCode || 0);
        })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Timeout waiting for HTTP server at ${url}`));
          } else {
            setTimeout(check, 300);
          }
        });
    }
    check();
  });
}

async function terminateChildProcess(proc: ChildProcess | null): Promise<void> {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const force=setTimeout(()=>proc.kill('SIGKILL'),5000);
    const deadline=setTimeout(()=>reject(new Error(`Owned child ${proc.pid} did not exit`)),10000);
    proc.once('exit',()=>{clearTimeout(force);clearTimeout(deadline);resolve();});
    proc.kill('SIGTERM');
  });
  console.log(`Stopped owned PID: ${proc.pid}`);
}

function loadLocalEnv(): Record<string, string> {
  const envPath = path.resolve('.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('Local .env.local file missing. Refusing execution without real configuration.');
  }
  const content = fs.readFileSync(envPath, 'utf8');
  return parseEnv(content) as unknown as Record<string, string>;
}

export async function createSignedSessionCookie(secret: string, token: string): Promise<string> {
  const signature = await makeSignature(token, secret);
  return `better-auth.session_token=${token}.${signature}`;
}

test.describe('T11 - Real E2E Onboarding & Profile Verification', () => {
  let pool: pg.Pool;
  let client: pg.PoolClient;
  let db: NodePgDatabase<typeof schema>;
  let schemaName: string;
  let apiServer: ChildProcess | null = null;
  let webServer: ChildProcess | null = null;
  let testUser: { id: string; sessionToken: string; email: string; discordId: string; cookieValue: string };
  let seededGames: Array<{ id: string; title: string; lobbyId: string }>;

  let envSecret: string;
  let publicOrigin: string;

  test.beforeAll(async () => {
    test.setTimeout(60000);
    const env = loadLocalEnv();
    const dbUrl = env.DATABASE_URL;
    envSecret = env.BETTER_AUTH_SECRET;
    const apiPort=await getFreePort();
    const webPort=await getFreePort();
    publicOrigin = `http://localhost:${webPort}`;

    if (!dbUrl || !envSecret) {
      throw new Error('DATABASE_URL and BETTER_AUTH_SECRET are required in .env.local');
    }

    // Verify ports 3000 and 5173 are free to refuse collisions
    const port3000Free = await isPortAvailable(apiPort);
    const port5173Free = await isPortAvailable(webPort);

    if (!port3000Free) {
      throw new Error('Port 3000 is already in use by another process. Refusing collision.');
    }
    if (!port5173Free) {
      throw new Error('Port 5173 is already in use by another process. Refusing collision.');
    }

    schemaName = `t11_e2e_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log(`Setting up owned temporary PostgreSQL schema: ${schemaName}`);

    pool = new Pool({ connectionString: dbUrl,max:2,connectionTimeoutMillis:5000,query_timeout:10000 });
    client = await pool.connect();

    await client.query(`CREATE SCHEMA "${schemaName}";`);
    await client.query(`SET search_path TO "${schemaName}";`);

    db = drizzle(client, { schema });
    const migrationsFolder = path.resolve('packages/database/migrations');
    await migrate(db, { migrationsFolder, migrationsSchema: schemaName });
    seededGames = await schema.seedGames(db);

    // Spawn compiled Nest API server using process.execPath with shell: false
    const apiDbUrl = new URL(dbUrl);
    apiDbUrl.searchParams.set('options', `-c search_path=${schemaName}`);
    const apiEnv = {
      ...process.env,
      NODE_ENV:'development',
      DATABASE_URL: apiDbUrl.toString(),
      PGOPTIONS: `-c search_path=${schemaName}`,
      PORT: String(apiPort),
      PUBLIC_ORIGIN: publicOrigin,
      BETTER_AUTH_URL: publicOrigin,
      BETTER_AUTH_SECRET: envSecret,
      DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID,
      DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET,
    };

    apiServer = spawn(process.execPath, ['apps/api/dist/main.js'], {
      env: apiEnv,
      cwd: path.resolve('.'),
      stdio: 'pipe',
      shell: false,
    });
    apiServer.stdout?.resume();
    const privateValues=[envSecret,env.DISCORD_CLIENT_SECRET,decodeURIComponent(new URL(dbUrl).password),dbUrl].filter(value=>value&&value.length>=8);
    const apiLog=path.resolve(`quality/evidence/T11/${schemaName}-api.txt`);
    const recordOutput=(data:Buffer)=>{let value=data.toString();for(const secret of privateValues)value=value.replaceAll(secret,'[REDACTED]');value=value.replace(/e2e_sess_[a-zA-Z0-9_]+/g,'[FIXTURE_TOKEN]');fs.appendFileSync(apiLog,value);};
    apiServer.stdout?.on('data',recordOutput);
    apiServer.stderr?.on('data',recordOutput);
    console.log(`Owned API PID: ${apiServer.pid}`);
    apiServer.stderr?.resume();

    await waitForHttp(`http://127.0.0.1:${apiPort}/api/v1/me`, apiServer);

    // Spawn Vite preview server using process.execPath with shell: false
    webServer = spawn(process.execPath, ['quality/evidence/T11/codex-vite-preview.mjs'], {
      cwd: path.resolve('.'),
      env:{...process.env,FG_T11_WEB_PORT:String(webPort),FG_T11_API_PORT:String(apiPort)},
      stdio: 'pipe',
      shell: false,
    });
    webServer.stdout?.resume();
    console.log(`Owned web PID: ${webServer.pid}`);
    webServer.stderr?.resume();

    await waitForHttp(`http://127.0.0.1:${webPort}/`, webServer);

    // Create test user in DB (initially NOT onboarded)
    const userId = `e2e_user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const sessionToken = `e2e_sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const expiresAt = new Date(Date.now() + 86400000);
    const email = `e2e_${userId}@example.com`;
    const discordId = `discord_${userId}`;

    await db.insert(schema.user).values({
      id: userId,
      name: 'E2E Initial Gamer',
      email,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.account).values({
      id: `acc_${userId}`,
      accountId: discordId,
      accessToken: 'test-e2e-access-token',
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

    const cookieString = await createSignedSessionCookie(envSecret, sessionToken);
    const cookieValue = cookieString.replace('better-auth.session_token=', '');

    testUser = { id: userId, sessionToken, email, discordId, cookieValue };
  });

  test.afterAll(async () => {
    test.setTimeout(60000);
    const errors: Error[] = [];

    try {
      await terminateChildProcess(webServer);
    } catch (err) {
      errors.push(err as Error);
    }

    try {
      await terminateChildProcess(apiServer);
    } catch (err) {
      errors.push(err as Error);
    }

    if (client) {
      try {
        if(!/^t11_e2e_[0-9]+_[a-z0-9]+$/.test(schemaName))throw new Error('Invalid owned schema');
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
        const remaining=await client.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[schemaName]);
        expect(remaining.rowCount).toBe(0);
        console.log('Verified owned schema removed');
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
      throw new Error(`E2E Cleanup failed: ${errors.map((e) => e.message).join('; ')}`);
    }
  });

  test('completes first login onboarding without rank -> Lobby, persists DB interests, refresh stays complete, omits private fields, persists game profile edit', async ({
    context,
    page,
    request,
    browser,
  }) => {
    test.setTimeout(90000);
    // Set authenticated session cookie on browser context
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: testUser.cookieValue,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    // 1. First login navigates to website root
    await page.goto(`${publicOrigin}/`);

    // Page detects authenticated incomplete user and displays Onboarding form
    await expect(page.getByTestId('onboarding-form')).toBeVisible({ timeout: 10000 });
    const screenshotsDir=path.resolve(`quality/evidence/T11/screenshots/${schemaName}`);
    await captureLayout(page,screenshotsDir,'onboarding');

    // Fill in nickname, select games (without selecting/demanding rank)
    const nameInput = page.locator('#onboarding-display-name');
    await nameInput.fill('E2E Gamer Tag');

    const bioInput = page.locator('#onboarding-bio');
    await bioInput.fill('E2E Pro Player Bio');

    // Select "Valorant" and "Liên Minh Huyền Thoại"
    await page.getByLabel('Valorant').check();
    await page.getByLabel('Liên Minh Huyền Thoại').check();

    // Submit onboarding form
    const onboardingResponse=page.waitForResponse(response=>response.url().endsWith('/api/v1/me/onboarding')&&response.request().method()==='POST');
    await page.getByRole('button', { name: 'Hoàn tất' }).click();
    expect((await onboardingResponse).status()).toBe(200);

    // 2. Form completes, onboarding-form disappears, and Lobby shell displays
    await expect(page.getByTestId('onboarding-form')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Lobby · Liên Minh Huyền Thoại — FG')).toBeVisible();
    expect(page.url()).toBe(`${publicOrigin}/`);

    // Assert fresh /me endpoint returns onboardingComplete: true and expected interestedGames
    const meRes = await request.get(`${publicOrigin}/api/v1/me`, {
      headers: { Cookie: `better-auth.session_token=${testUser.cookieValue}` },
    });
    expect(meRes.status()).toBe(200);
    const meJson = await meRes.json();
    expect(meJson.onboardingComplete).toBe(true);
    expect(meJson.interestedGames.slice().sort()).toEqual(['Valorant', 'Liên Minh Huyền Thoại'].sort());

    // Assert direct DB mutations: user's profile exists in schema.profiles and gameInterests exists
    const [profileInDb] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, testUser.id));

    expect(profileInDb).toBeDefined();
    expect(profileInDb.displayName).toBe('E2E Gamer Tag');
    expect(profileInDb.bio).toBe('E2E Pro Player Bio');

    const interestsInDb = await db
      .select()
      .from(schema.gameInterests)
      .where(eq(schema.gameInterests.userId, testUser.id));

    expect(interestsInDb.length).toBe(2);
    expect(interestsInDb.map(interest=>seededGames.find(game=>game.id===interest.gameId)?.title).sort()).toEqual(['Valorant','Liên Minh Huyền Thoại'].sort());

    // 3. Refreshing page does NOT demand onboarding again (stays on Lobby)
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toBe(`${publicOrigin}/`);
    await expect(page.getByTestId('onboarding-form')).not.toBeVisible();

    // 4. Public profile viewer: navigate to /users/:id
    await page.goto(`${publicOrigin}/users/${testUser.id}`);

    await expect(page.getByRole('heading',{name:'E2E Gamer Tag'})).toBeVisible();
    await expect(page.getByText('E2E Pro Player Bio')).toBeVisible();

    // Assert private fields (email, discordId) are NOT present in HTML / DOM
    const bodyText = await page.content();
    expect(bodyText).not.toContain(testUser.email);
    expect(bodyText).not.toContain(testUser.discordId);
    const guest=await browser.newContext();
    try{
      const guestPage=await guest.newPage();
      await guestPage.goto(`${publicOrigin}/users/${testUser.id}`);
      await expect(guestPage.getByRole('heading',{name:'E2E Gamer Tag'})).toBeVisible();
      expect(await guestPage.content()).not.toContain(testUser.email);
      expect(await guestPage.content()).not.toContain(testUser.discordId);
      await expect(guestPage.getByRole('button',{name:/chỉnh sửa/i})).toHaveCount(0);
    }finally{await guest.close();}

    // 5. Owner game profile edit persistence
    const valorantGame = seededGames.find((g) => g.title === 'Valorant')!;

    // Click exact declaration/edit button for Valorant
    await page.getByRole('button', { name: /Chỉnh sửa Valorant|\+ Khai báo Valorant/ }).click();

    await page.locator('#editor-ign').fill('TenZ_E2E#123');
    await page.locator('#editor-rank').fill('Ascendant 2');
    await page.locator('#editor-role').fill('Duelist');
    await page.locator('#editor-hours').fill('120');
    await page.locator('#editor-style').fill('Aggressive');

    await page.getByRole('button', { name: 'Lưu' }).click();

    // Assert direct DB mutation in schema.gameProfiles for specific (userId, gameId)
    await expect(async () => {
      const [gpInDb] = await db
        .select()
        .from(schema.gameProfiles)
        .where(
          and(
            eq(schema.gameProfiles.userId, testUser.id),
            eq(schema.gameProfiles.gameId, valorantGame.id),
          ),
        );

      expect(gpInDb).toBeDefined();
      expect(gpInDb.inGameName).toBe('TenZ_E2E#123');
      expect(gpInDb.rank).toBe('Ascendant 2');
      expect(gpInDb.role).toBe('Duelist');
      expect(Number(gpInDb.playHours)).toBe(120);
      expect(gpInDb.playStyle).toBe('Aggressive');
    }).toPass({ timeout: 10000 });
    await expect(page.locator('#editor-ign')).toHaveCount(0);
    await expect(page.getByText('TenZ_E2E#123',{exact:false})).toBeVisible();
    await page.getByRole('button',{name:'Chỉnh sửa',exact:true}).click();
    await expect(page.locator('#editor-bio')).toHaveValue('E2E Pro Player Bio');
    await page.locator('#editor-display-name').fill('E2E Updated Gamer');
    await page.locator('#editor-bio').fill('');
    await page.locator('#editor-status').selectOption('PLAYING');
    await page.getByLabel('Liên Minh Huyền Thoại',{exact:true}).uncheck();
    await page.getByRole('button',{name:'Lưu',exact:true}).click();
    await expect(page.locator('#editor-display-name')).toHaveCount(0);
    await expect(page.getByRole('heading',{name:'E2E Updated Gamer'})).toBeVisible();
    await expect(page.getByTestId('profile-custom-status')).toContainText('Đang chơi');
    const [updatedProfile]=await db.select().from(schema.profiles).where(eq(schema.profiles.userId,testUser.id));
    expect(updatedProfile.bio).toBeNull();
    expect(updatedProfile.customStatus).toBe('PLAYING');
    expect(updatedProfile.displayName).toBe('E2E Updated Gamer');
    const updatedMe=await request.get(`${publicOrigin}/api/v1/me`,{headers:{Cookie:`better-auth.session_token=${testUser.cookieValue}`}});
    expect(updatedMe.status()).toBe(200);
    expect((await updatedMe.json()).interestedGames).toEqual(['Valorant']);

    // 6. Viewport screenshots & overflow checks for 1440x900, 1280x800, 390x844, 360x800
    await captureLayout(page,screenshotsDir,'profile');
  });
});
