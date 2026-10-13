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
  TeamSnapshotSchema,
  JoinRequestSchema,
  type TeamSnapshotDTO,
  type JoinRequestDTO,
} from '@fg/contracts';
import { TeamsService } from '../../../../apps/api/src/modules/teams/teams.service.js';
import { PlaySessionsService } from '../../../../apps/api/src/modules/play-sessions/play-sessions.service.js';

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
const owned = `t30_team_${randomUUID().replaceAll('-', '')}`;

let pool: pg.Pool;
let dbUrl: string;
let originalDbUrl: string | undefined;
let schemaCreated = false;
let teamsService: TeamsService;
let playSessionsService: PlaySessionsService;
let valorantGame: { id: string; title: string };

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
  expectedMessage: string,
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

jest.setTimeout(60000);

describe('FG T30 - TeamsService & PlaySessionsService Read-Lock Concurrency & Authority Integration', () => {
  const baseUsers = ['owner', 'helper', 'helper-nogrant', 'member', 'applicant', 'outsider', 'reader-member'];

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
    const seeded = (await pool.query<{ id: string; title: string }>('SELECT id, title FROM games')).rows;
    const val = seeded.find((g) => g.title === 'Valorant');
    if (!val) throw new Error('Valorant game seed required');
    valorantGame = val;

    const nowIso = new Date().toISOString();
    const expiryIso = new Date(Date.now() + 86400000).toISOString();
    for (const u of baseUsers) {
      await pool.query(
        'INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES($1, $1, $2, true, $3, $3)',
        [u, `${u}@fixture.test`, nowIso],
      );
      await pool.query(
        'INSERT INTO session(id, user_id, token, expires_at, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $5)',
        [`sess-${u}`, u, `tok-${u}`, expiryIso, nowIso],
      );
      await pool.query(
        'INSERT INTO profiles(user_id, display_name, created_at, updated_at) VALUES($1, $1, $2, $2)',
        [u, nowIso],
      );
      await pool.query(
        'INSERT INTO game_interests(id, user_id, game_id, created_at) VALUES($1, $2, $3, $4)',
        [`gi-${u}`, u, valorantGame.id, nowIso],
      );
    }

    process.env.DATABASE_URL = dbUrl;
    teamsService = new TeamsService();
    teamsService.onModuleInit();
    playSessionsService = new PlaySessionsService(teamsService);
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      try {
        await teamsService?.onModuleDestroy();
      } catch (error) {
        errors.push(error);
      }
      try {
        if (schemaCreated) {
          expect(owned).toMatch(/^t30_team_[a-f0-9]{32}$/);
          await pool.query(`DROP SCHEMA "${owned}" CASCADE`);
          expect((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1', [owned])).rowCount).toBe(0);
        }
      } catch (error) {
        errors.push(error);
      }
    } finally {
      if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl;
      else delete process.env.DATABASE_URL;
      pg.Client.prototype.query = originalClientQuery;
      try {
        await pool?.end();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Teardown failure in t30-team-read-lock.integration.spec.ts');
    }
  });

  type FixtureData = {
    roomId: string;
    conversationId: string;
    playSessionId: string;
    recruitmentId: string;
    joinRequestId: string;
  };

  async function resetAndSeedFixture(): Promise<FixtureData> {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SET CONSTRAINTS ALL DEFERRED');

      await db.query('DELETE FROM notification_outbox');
      await db.query('DELETE FROM notifications');
      await db.query('DELETE FROM active_play_slots');
      await db.query('DELETE FROM join_requests');
      await db.query('DELETE FROM recruitments');
      await db.query('DELETE FROM team_members');
      await db.query('DELETE FROM play_sessions');
      await db.query('DELETE FROM permission_grants');
      await db.query('DELETE FROM room_members');
      await db.query('DELETE FROM rooms');
      await db.query('DELETE FROM conversation_members');
      await db.query("DELETE FROM conversations WHERE kind='ROOM'");
      await db.query('DELETE FROM admin_actions');

      const nowIso = new Date().toISOString();
      const freshExpiryIso = new Date(Date.now() + 86400000).toISOString();

      for (const u of baseUsers) {
        await db.query(
          `INSERT INTO session(id, user_id, token, expires_at, created_at, updated_at)
           VALUES($1, $2, $3, $4, $5, $5)
           ON CONFLICT(id) DO UPDATE SET expires_at=EXCLUDED.expires_at, updated_at=EXCLUDED.updated_at`,
          [`sess-${u}`, u, `tok-${u}`, freshExpiryIso, nowIso],
        );
        await db.query(
          `INSERT INTO profiles(user_id, display_name, created_at, updated_at)
           VALUES($1, $1, $2, $2)
           ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name, updated_at=EXCLUDED.updated_at`,
          [u, nowIso],
        );
        await db.query(
          `INSERT INTO game_interests(id, user_id, game_id, created_at)
           VALUES($1, $2, $3, $4)
           ON CONFLICT(user_id, game_id) DO NOTHING`,
          [`gi-${u}`, u, valorantGame.id, nowIso],
        );
      }

      const conversationId = `conv_${randomUUID()}`;
      await db.query(
        "INSERT INTO conversations(id, kind, created_at, updated_at) VALUES($1, 'ROOM', $2, $2)",
        [conversationId, nowIso],
      );

      const roomId = `room_${randomUUID()}`;
      await db.query(
        `INSERT INTO rooms(id, name, game_id, owner_id, owner_role, visibility, invite_policy, player_capacity, conversation_id, conversation_kind, created_at, updated_at)
         VALUES($1, 'T30 Room', $2, 'owner', 'OWNER', 'PUBLIC', 'OWNER_APPROVAL', 5, $3, 'ROOM', $4, $4)`,
        [roomId, valorantGame.id, conversationId, nowIso],
      );

      await db.query(
        "INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, 'owner', 'OWNER', $3)",
        [`rm_owner_${randomUUID()}`, roomId, nowIso],
      );
      await db.query(
        "INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, 'helper', 'HELPER', $3)",
        [`rm_helper_${randomUUID()}`, roomId, nowIso],
      );
      await db.query(
        "INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, 'helper-nogrant', 'HELPER', $3)",
        [`rm_helper_ng_${randomUUID()}`, roomId, nowIso],
      );
      await db.query(
        "INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, 'member', 'MEMBER', $3)",
        [`rm_member_${randomUUID()}`, roomId, nowIso],
      );
      await db.query(
        "INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES($1, $2, 'reader-member', 'MEMBER', $3)",
        [`rm_reader_m_${randomUUID()}`, roomId, nowIso],
      );

      await db.query(
        "INSERT INTO conversation_members(id, conversation_id, user_id, joined_at) VALUES($1, $2, 'owner', $3)",
        [`cm_owner_${randomUUID()}`, conversationId, nowIso],
      );
      await db.query(
        "INSERT INTO conversation_members(id, conversation_id, user_id, joined_at) VALUES($1, $2, 'member', $3)",
        [`cm_member_${randomUUID()}`, conversationId, nowIso],
      );

      await db.query(
        `INSERT INTO permission_grants(id, room_id, user_id, grantee_role, permission, granted_at, granted_by)
         VALUES($1, $2, 'helper', 'HELPER', 'MANAGE_RECRUITMENT', $3, 'owner')`,
        [`pg_helper_${randomUUID()}`, roomId, nowIso],
      );

      const playSessionId = `play_${randomUUID()}`;
      await db.query(
        `INSERT INTO play_sessions(id, room_id, host_user_id, player_capacity, timing_type, scheduled_at, state, created_at, updated_at)
         VALUES($1, $2, 'owner', 5, 'now', null, 'ACTIVE', $3, $3)`,
        [playSessionId, roomId, nowIso],
      );

      await db.query(
        `INSERT INTO team_members(id, play_session_id, user_id, slot_index, player_capacity, is_host, joined_at)
         VALUES($1, $2, 'owner', 1, 5, true, $3)`,
        [`tm_owner_${randomUUID()}`, playSessionId, nowIso],
      );
      await db.query(
        `INSERT INTO team_members(id, play_session_id, user_id, slot_index, player_capacity, is_host, joined_at)
         VALUES($1, $2, 'member', 2, 5, false, $3)`,
        [`tm_member_${randomUUID()}`, playSessionId, nowIso],
      );

      await db.query(
        `INSERT INTO active_play_slots(user_id, play_session_id, session_state, slot_index, created_at)
         VALUES('owner', $1, 'ACTIVE', 1, $2)`,
        [playSessionId, nowIso],
      );
      await db.query(
        `INSERT INTO active_play_slots(user_id, play_session_id, session_state, slot_index, created_at)
         VALUES('member', $1, 'ACTIVE', 2, $2)`,
        [playSessionId, nowIso],
      );

      const recruitmentId = `rec_${randomUUID()}`;
      await db.query(
        `INSERT INTO recruitments(id, room_id, game_id, game_title, play_session_id, title, mode, player_capacity, current_players, timing_type, scheduled_at, state, created_at, updated_at)
         VALUES($1, $2, $3, $4, $5, 'Recruitment Card', 'ranked', 5, 2, 'now', null, 'OPEN', $6, $6)`,
        [recruitmentId, roomId, valorantGame.id, valorantGame.title, playSessionId, nowIso],
      );

      const joinRequestId = `join_${randomUUID()}`;
      await db.query(
        "INSERT INTO join_requests(id, recruitment_id, applicant_id, status, created_at) VALUES($1, $2, 'applicant', 'PENDING', $3)",
        [joinRequestId, recruitmentId, nowIso],
      );

      await db.query('COMMIT');
      return { roomId, conversationId, playSessionId, recruitmentId, joinRequestId };
    } catch (error) {
      try { await db.query('ROLLBACK'); } catch (rollbackError) { throw new AggregateError([error, rollbackError], 'Fixture seed and rollback failed', {cause: rollbackError}); }
      throw error;
    } finally {
      db.release();
    }
  }

  describe('Read-Only Concurrency under held external FOR SHARE locks', () => {
    it('teamsService.snapshot succeeds within 1500ms while external transaction holds room and play FOR SHARE', async () => {
      const fixture = await resetAndSeedFixture();
      const blockerClient = await pool.connect();
      const cleanupErrors: unknown[] = [];
      let apiPromise: Promise<TeamSnapshotDTO> | null = null;

      try {
        await blockerClient.query('BEGIN');
        await blockerClient.query('SELECT id FROM rooms WHERE id=$1 FOR SHARE', [fixture.roomId]);
        await blockerClient.query('SELECT id FROM play_sessions WHERE id=$1 FOR SHARE', [fixture.playSessionId]);

        apiPromise = teamsService.snapshot('member', 'sess-member', fixture.playSessionId);
        const snapshotResult = await awaitWithTimeout(apiPromise, 1500, 'teamsService.snapshot under external FOR SHARE');

        const parsed = TeamSnapshotSchema.parse(snapshotResult);
        expect(snapshotResult).toEqual(parsed);
        expect(snapshotResult.playSession.id).toBe(fixture.playSessionId);
        expect(snapshotResult.playSession.roomId).toBe(fixture.roomId);
        expect(snapshotResult.playSession.hostUserId).toBe('owner');
        expect(snapshotResult.playSession.playerCapacity).toBe(5);
        expect(snapshotResult.playSession.state).toBe('ACTIVE');
        expect(snapshotResult.roster).toHaveLength(2);
        expect(snapshotResult.roster[0].userId).toBe('owner');
        expect(snapshotResult.roster[0].slotIndex).toBe(1);
        expect(snapshotResult.roster[0].isHost).toBe(true);
        expect(snapshotResult.roster[1].userId).toBe('member');
        expect(snapshotResult.roster[1].slotIndex).toBe(2);
        expect(snapshotResult.roster[1].isHost).toBe(false);
      } finally {
        try {
          await blockerClient.query('ROLLBACK');
        } catch (err) {
          cleanupErrors.push(err);
        }
        blockerClient.release();
        if (apiPromise) {
          await apiPromise.catch(() => {});
        }
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, 'Cleanup failure in snapshot concurrency test');
      }
    });

    it('playSessionsService.requests succeeds within 1500ms while external transaction holds room, actor user, and play FOR SHARE', async () => {
      const fixture = await resetAndSeedFixture();
      const blockerClient = await pool.connect();
      const cleanupErrors: unknown[] = [];
      let apiPromise: Promise<JoinRequestDTO[]> | null = null;

      try {
        await blockerClient.query('BEGIN');
        await blockerClient.query('SELECT id FROM rooms WHERE id=$1 FOR SHARE', [fixture.roomId]);
        await blockerClient.query('SELECT id FROM "user" WHERE id=$1 FOR SHARE', ['owner']);
        await blockerClient.query('SELECT id FROM play_sessions WHERE id=$1 FOR SHARE', [fixture.playSessionId]);

        apiPromise = playSessionsService.requests('owner', 'sess-owner', fixture.playSessionId);
        const requestsResult = await awaitWithTimeout(apiPromise, 1500, 'playSessionsService.requests under external FOR SHARE');

        expect(requestsResult).toHaveLength(1);
        const parsedReq = JoinRequestSchema.parse(requestsResult[0]);
        expect(requestsResult[0]).toEqual(parsedReq);
        expect(requestsResult[0].id).toBe(fixture.joinRequestId);
        expect(requestsResult[0].recruitmentId).toBe(fixture.recruitmentId);
        expect(requestsResult[0].applicantId).toBe('applicant');
        expect(requestsResult[0].status).toBe('PENDING');
      } finally {
        try {
          await blockerClient.query('ROLLBACK');
        } catch (err) {
          cleanupErrors.push(err);
        }
        blockerClient.release();
        if (apiPromise) {
          await apiPromise.catch(() => {});
        }
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, 'Cleanup failure in requests concurrency test');
      }
    });
  });

  describe('Writer Exclusion under Canonical Shared Locks', () => {
    it('teamsService.snapshot holds canonical FOR SHARE lock on room, blocking independent writer FOR UPDATE', async () => {
      const fixture = await resetAndSeedFixture();
      const reachedBarrier = createDeferred<void>();
      const barrier = createDeferred<void>();
      let readerPid: number | null = null;
      let intercepted = false;

      const wrappedQuery = async function (this: unknown, ...args: unknown[]) {
        const queryText = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
        if (!intercepted && queryText.includes('FROM team_members WHERE play_session_id=')) {
          intercepted = true;
          const res = await (originalClientQuery as unknown as (...a: unknown[]) => Promise<unknown>).apply(this, args);
          readerPid = (this as { processID?: number }).processID ?? null;
          reachedBarrier.resolve();
          await awaitWithTimeout(barrier.promise, 3000, 'controlled reader barrier release');
          return res;
        }
        return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
      };

      const writerClient = await pool.connect();
      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;
      let writerFinished = false;
      let writerPromise: Promise<unknown> | null = null;
      const cleanupErrors: unknown[] = [];

      const rawApiPromise = teamsService.snapshot('member', 'sess-member', fixture.playSessionId);
      const apiPromise = rawApiPromise.catch((err) => {
        reachedBarrier.reject(err);
        throw err;
      });
      void apiPromise.catch(() => undefined);

      try {
        await awaitWithTimeout(reachedBarrier.promise, 3000, 'reader reached snapshot barrier');
        expect(readerPid).toBeTruthy();

        await writerClient.query('BEGIN');
        const writerPid = (writerClient as { processID: number }).processID;
        expect(writerPid).toBeTruthy();

        writerPromise = writerClient
          .query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [fixture.roomId])
          .then((r) => {
            writerFinished = true;
            return r;
          });

        let foundBlocker = false;
        for (let i = 0; i < 50; i++) {
          const res = await pool.query<{ blockers: number[] }>('SELECT pg_blocking_pids($1) AS blockers', [writerPid]);
          const blockers = res.rows[0]?.blockers ?? [];
          if (blockers.includes(readerPid!)) {
            foundBlocker = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }

        expect(foundBlocker).toBe(true);
        expect(writerFinished).toBe(false);

        barrier.resolve();

        const snapshot = await awaitWithTimeout(apiPromise, 3000, 'snapshot reader completion');
        expect(snapshot.playSession.id).toBe(fixture.playSessionId);

        await awaitWithTimeout(writerPromise, 3000, 'writer completion');
        expect(writerFinished).toBe(true);
        await writerClient.query('COMMIT');
      } finally {
        barrier.resolve();
        pg.Client.prototype.query = originalClientQuery;
        if (writerPromise) {
          await writerPromise.catch(() => {});
        }
        await apiPromise.catch(() => {});
        try {
          await writerClient.query('ROLLBACK');
        } catch (err) {
          cleanupErrors.push(err);
        }
        writerClient.release();
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, 'Cleanup failure in snapshot room writer exclusion test');
      }
    });

    it('playSessionsService.requests holds canonical FOR SHARE lock on room, blocking independent writer FOR UPDATE', async () => {
      const fixture = await resetAndSeedFixture();
      const reachedBarrier = createDeferred<void>();
      const barrier = createDeferred<void>();
      let readerPid: number | null = null;
      let intercepted = false;

      const wrappedQuery = async function (this: unknown, ...args: unknown[]) {
        const queryText = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
        if (!intercepted && queryText.includes('JOIN recruitments c ON c.id=j.recruitment_id WHERE c.play_session_id=')) {
          intercepted = true;
          const res = await (originalClientQuery as unknown as (...a: unknown[]) => Promise<unknown>).apply(this, args);
          readerPid = (this as { processID?: number }).processID ?? null;
          reachedBarrier.resolve();
          await awaitWithTimeout(barrier.promise, 3000, 'controlled reader barrier release');
          return res;
        }
        return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
      };

      const writerClient = await pool.connect();
      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;
      let writerFinished = false;
      let writerPromise: Promise<unknown> | null = null;
      const cleanupErrors: unknown[] = [];

      const rawApiPromise = playSessionsService.requests('owner', 'sess-owner', fixture.playSessionId);
      const apiPromise = rawApiPromise.catch((err) => {
        reachedBarrier.reject(err);
        throw err;
      });
      void apiPromise.catch(() => undefined);

      try {
        await awaitWithTimeout(reachedBarrier.promise, 3000, 'reader reached requests barrier');
        expect(readerPid).toBeTruthy();

        await writerClient.query('BEGIN');
        const writerPid = (writerClient as { processID: number }).processID;
        expect(writerPid).toBeTruthy();

        writerPromise = writerClient
          .query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [fixture.roomId])
          .then((r) => {
            writerFinished = true;
            return r;
          });

        let foundBlocker = false;
        for (let i = 0; i < 50; i++) {
          const res = await pool.query<{ blockers: number[] }>('SELECT pg_blocking_pids($1) AS blockers', [writerPid]);
          const blockers = res.rows[0]?.blockers ?? [];
          if (blockers.includes(readerPid!)) {
            foundBlocker = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }

        expect(foundBlocker).toBe(true);
        expect(writerFinished).toBe(false);

        barrier.resolve();

        const requests = await awaitWithTimeout(apiPromise, 3000, 'requests reader completion');
        expect(requests).toHaveLength(1);

        await awaitWithTimeout(writerPromise, 3000, 'writer completion');
        expect(writerFinished).toBe(true);
        await writerClient.query('COMMIT');
      } finally {
        barrier.resolve();
        pg.Client.prototype.query = originalClientQuery;
        if (writerPromise) {
          await writerPromise.catch(() => {});
        }
        await apiPromise.catch(() => {});
        try {
          await writerClient.query('ROLLBACK');
        } catch (err) {
          cleanupErrors.push(err);
        }
        writerClient.release();
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, 'Cleanup failure in requests room writer exclusion test');
      }
    });

    it('playSessionsService.requests holds canonical FOR SHARE lock on play, blocking independent play writer FOR UPDATE', async () => {
      const fixture = await resetAndSeedFixture();
      const reachedBarrier = createDeferred<void>();
      const barrier = createDeferred<void>();
      let readerPid: number | null = null;
      let intercepted = false;

      const wrappedQuery = async function (this: unknown, ...args: unknown[]) {
        const queryText = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
        if (!intercepted && queryText.includes('JOIN recruitments c ON c.id=j.recruitment_id WHERE c.play_session_id=')) {
          intercepted = true;
          const res = await (originalClientQuery as unknown as (...a: unknown[]) => Promise<unknown>).apply(this, args);
          readerPid = (this as { processID?: number }).processID ?? null;
          reachedBarrier.resolve();
          await awaitWithTimeout(barrier.promise, 3000, 'controlled reader barrier release');
          return res;
        }
        return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
      };

      const writerClient = await pool.connect();
      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;
      let writerFinished = false;
      let writerPromise: Promise<unknown> | null = null;
      const cleanupErrors: unknown[] = [];

      const rawApiPromise = playSessionsService.requests('owner', 'sess-owner', fixture.playSessionId);
      const apiPromise = rawApiPromise.catch((err) => {
        reachedBarrier.reject(err);
        throw err;
      });
      void apiPromise.catch(() => undefined);

      try {
        await awaitWithTimeout(reachedBarrier.promise, 3000, 'reader reached requests barrier');
        expect(readerPid).toBeTruthy();

        await writerClient.query('BEGIN');
        const writerPid = (writerClient as { processID: number }).processID;
        expect(writerPid).toBeTruthy();

        writerPromise = writerClient
          .query('SELECT id FROM play_sessions WHERE id=$1 FOR UPDATE', [fixture.playSessionId])
          .then((r) => {
            writerFinished = true;
            return r;
          });

        let foundBlocker = false;
        for (let i = 0; i < 50; i++) {
          const res = await pool.query<{ blockers: number[] }>('SELECT pg_blocking_pids($1) AS blockers', [writerPid]);
          const blockers = res.rows[0]?.blockers ?? [];
          if (blockers.includes(readerPid!)) {
            foundBlocker = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }

        expect(foundBlocker).toBe(true);
        expect(writerFinished).toBe(false);

        barrier.resolve();

        const requests = await awaitWithTimeout(apiPromise, 3000, 'requests reader completion');
        expect(requests).toHaveLength(1);

        await awaitWithTimeout(writerPromise, 3000, 'writer completion');
        expect(writerFinished).toBe(true);
        await writerClient.query('COMMIT');
      } finally {
        barrier.resolve();
        pg.Client.prototype.query = originalClientQuery;
        if (writerPromise) {
          await writerPromise.catch(() => {});
        }
        await apiPromise.catch(() => {});
        try {
          await writerClient.query('ROLLBACK');
        } catch (err) {
          cleanupErrors.push(err);
        }
        writerClient.release();
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, 'Cleanup failure in requests play writer exclusion test');
      }
    });

    it('teamsService.snapshot reader holds FOR SHARE on play_sessions, blocking independent writer on play_sessions row', async () => {
      const fixture = await resetAndSeedFixture();
      const reachedBarrier = createDeferred<void>();
      const barrier = createDeferred<void>();
      let readerPid: number | null = null;
      let intercepted = false;

      const wrappedQuery = async function (this: unknown, ...args: unknown[]) {
        const queryText = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
        if (!intercepted && queryText.includes('FROM team_members WHERE play_session_id=')) {
          intercepted = true;
          const res = await (originalClientQuery as unknown as (...a: unknown[]) => Promise<unknown>).apply(this, args);
          readerPid = (this as { processID?: number }).processID ?? null;
          reachedBarrier.resolve();
          await awaitWithTimeout(barrier.promise, 3000, 'controlled reader barrier release');
          return res;
        }
        return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
      };

      const writerClient = await pool.connect();
      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;
      let writerFinished = false;
      let writerPromise: Promise<unknown> | null = null;
      const cleanupErrors: unknown[] = [];

      const rawApiPromise = teamsService.snapshot('member', 'sess-member', fixture.playSessionId);
      const apiPromise = rawApiPromise.catch((err) => {
        reachedBarrier.reject(err);
        throw err;
      });
      void apiPromise.catch(() => undefined);

      try {
        await awaitWithTimeout(reachedBarrier.promise, 3000, 'reader reached snapshot barrier');
        expect(readerPid).toBeTruthy();

        await writerClient.query('BEGIN');
        const writerPid = (writerClient as { processID: number }).processID;
        expect(writerPid).toBeTruthy();

        writerPromise = writerClient
          .query('SELECT id FROM play_sessions WHERE id=$1 FOR UPDATE', [fixture.playSessionId])
          .then((r) => {
            writerFinished = true;
            return r;
          });

        let foundBlocker = false;
        for (let i = 0; i < 50; i++) {
          const res = await pool.query<{ blockers: number[] }>('SELECT pg_blocking_pids($1) AS blockers', [writerPid]);
          const blockers = res.rows[0]?.blockers ?? [];
          if (blockers.includes(readerPid!)) {
            foundBlocker = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }

        expect(foundBlocker).toBe(true);
        expect(writerFinished).toBe(false);

        barrier.resolve();

        const snapshot = await awaitWithTimeout(apiPromise, 3000, 'snapshot reader completion');
        expect(snapshot.playSession.id).toBe(fixture.playSessionId);

        await awaitWithTimeout(writerPromise, 3000, 'writer completion');
        expect(writerFinished).toBe(true);
        await writerClient.query('COMMIT');
      } finally {
        barrier.resolve();
        pg.Client.prototype.query = originalClientQuery;
        if (writerPromise) {
          await writerPromise.catch(() => {});
        }
        await apiPromise.catch(() => {});
        try {
          await writerClient.query('ROLLBACK');
        } catch (err) {
          cleanupErrors.push(err);
        }
        writerClient.release();
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, 'Cleanup failure in snapshot play_sessions writer exclusion test');
      }
    });
  });

  describe('Authority Negatives and Role Access Control', () => {
    it('teamsService.snapshot rejects expired or deleted session with exact 401 LOGIN_REQUIRED', async () => {
      const fixture = await resetAndSeedFixture();
      await expectHttpError(
        () => teamsService.snapshot('member', 'sess-invalid-999', fixture.playSessionId),
        401,
        ErrorCode.LOGIN_REQUIRED,
        'Session expired or revoked',
      );

      await pool.query("UPDATE session SET expires_at=now()-interval '1 minute' WHERE id='sess-member'");
      await expectHttpError(
        () => teamsService.snapshot('member', 'sess-member', fixture.playSessionId),
        401,
        ErrorCode.LOGIN_REQUIRED,
        'Session expired or revoked',
      );
      await pool.query("DELETE FROM session WHERE id='sess-member'");
      await expectHttpError(
        () => teamsService.snapshot('member', 'sess-member', fixture.playSessionId),
        401, ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked',
      );
    });

    it('playSessionsService.requests rejects expired or deleted session with exact 401 LOGIN_REQUIRED', async () => {
      const fixture = await resetAndSeedFixture();
      await expectHttpError(
        () => playSessionsService.requests('owner', 'sess-invalid-999', fixture.playSessionId),
        401,
        ErrorCode.LOGIN_REQUIRED,
        'Session expired or revoked',
      );

      await pool.query("UPDATE session SET expires_at=now()-interval '1 minute' WHERE id='sess-owner'");
      await expectHttpError(
        () => playSessionsService.requests('owner', 'sess-owner', fixture.playSessionId),
        401,
        ErrorCode.LOGIN_REQUIRED,
        'Session expired or revoked',
      );
      await pool.query("DELETE FROM session WHERE id='sess-owner'");
      await expectHttpError(
        () => playSessionsService.requests('owner', 'sess-owner', fixture.playSessionId),
        401, ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked',
      );
    });

    it('teamsService.snapshot rejects banned user with exact 403 FORBIDDEN', async () => {
      const fixture = await resetAndSeedFixture();
      await pool.query(
        "INSERT INTO admin_actions(id, target_user_id, action, reason, actor_id) VALUES($1, 'member', 'BAN', 'test ban', 'owner')",
        [`ban_${randomUUID()}`],
      );
      await expectHttpError(
        () => teamsService.snapshot('member', 'sess-member', fixture.playSessionId),
        403,
        ErrorCode.FORBIDDEN,
        'Account is banned',
      );
    });

    it('playSessionsService.requests rejects banned user with exact 403 FORBIDDEN', async () => {
      const fixture = await resetAndSeedFixture();
      await pool.query(
        "INSERT INTO admin_actions(id, target_user_id, action, reason, actor_id) VALUES($1, 'owner', 'BAN', 'test ban', 'owner')",
        [`ban_${randomUUID()}`],
      );
      await expectHttpError(
        () => playSessionsService.requests('owner', 'sess-owner', fixture.playSessionId),
        403,
        ErrorCode.FORBIDDEN,
        'Account is banned',
      );
    });

    it('teamsService.snapshot rejects user without complete onboarding with exact 403 FORBIDDEN', async () => {
      const fixture = await resetAndSeedFixture();
      await pool.query("DELETE FROM game_interests WHERE user_id='member'");
      await expectHttpError(
        () => teamsService.snapshot('member', 'sess-member', fixture.playSessionId),
        403,
        ErrorCode.FORBIDDEN,
        'Onboarding required',
      );
    });

    it('playSessionsService.requests rejects user without complete onboarding with exact 403 FORBIDDEN', async () => {
      const fixture = await resetAndSeedFixture();
      await pool.query("DELETE FROM game_interests WHERE user_id='owner'");
      await expectHttpError(
        () => playSessionsService.requests('owner', 'sess-owner', fixture.playSessionId),
        403,
        ErrorCode.FORBIDDEN,
        'Onboarding required',
      );
    });

    it('teamsService.snapshot rejects non-member outsider with exact 403 FORBIDDEN', async () => {
      const fixture = await resetAndSeedFixture();
      await expectHttpError(
        () => teamsService.snapshot('outsider', 'sess-outsider', fixture.playSessionId),
        403,
        ErrorCode.FORBIDDEN,
        'Room membership required',
      );
    });

    it('playSessionsService.requests rejects non-member outsider with exact 403 FORBIDDEN', async () => {
      const fixture = await resetAndSeedFixture();
      await expectHttpError(
        () => playSessionsService.requests('outsider', 'sess-outsider', fixture.playSessionId),
        403,
        ErrorCode.FORBIDDEN,
        'Current room membership required',
      );
    });

    it('playSessionsService.requests rejects ordinary room member (non-manager) with exact 403 FORBIDDEN', async () => {
      const fixture = await resetAndSeedFixture();
      await expectHttpError(
        () => playSessionsService.requests('member', 'sess-member', fixture.playSessionId),
        403,
        ErrorCode.FORBIDDEN,
        'Recruitment management permission required',
      );
    });

    it('playSessionsService.requests rejects helper without MANAGE_RECRUITMENT grant with exact 403 FORBIDDEN', async () => {
      const fixture = await resetAndSeedFixture();
      await expectHttpError(
        () => playSessionsService.requests('helper-nogrant', 'sess-helper-nogrant', fixture.playSessionId),
        403,
        ErrorCode.FORBIDDEN,
        'Recruitment management permission required',
      );
    });

    it('playSessionsService.requests succeeds for helper with actual MANAGE_RECRUITMENT grant', async () => {
      const fixture = await resetAndSeedFixture();
      const list = await playSessionsService.requests('helper', 'sess-helper', fixture.playSessionId);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(fixture.joinRequestId);
      expect(list[0].status).toBe('PENDING');
    });

    it('teamsService.snapshot succeeds for ordinary room member who is not in roster and not manager', async () => {
      const fixture = await resetAndSeedFixture();
      const snapshot = await teamsService.snapshot('reader-member', 'sess-reader-member', fixture.playSessionId);
      const parsed = TeamSnapshotSchema.parse(snapshot);
      expect(snapshot).toEqual(parsed);
      expect(snapshot.playSession.id).toBe(fixture.playSessionId);
      expect(snapshot.roster.some((r) => r.userId === 'reader-member')).toBe(false);
    });
  });

  describe('Fresh Checks After Waiting on a Held Writer Lock', () => {
    it('teamsService.snapshot re-evaluates session expiry after acquiring room lock from writer and rejects revoked session', async () => {
      const fixture = await resetAndSeedFixture();
      const blockerClient = await pool.connect();
      const blockerPid = (blockerClient as { processID: number }).processID;
      expect(blockerPid).toBeTruthy();

      let readerPid: number | null = null;
      let readerIntercepted = false;
      const wrappedQuery = function (this: unknown, ...args: unknown[]) {
        const queryText = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
        if (!readerIntercepted && this !== blockerClient && queryText.includes('FROM rooms WHERE id=$1')) {
          readerIntercepted = true;
          readerPid = (this as { processID?: number }).processID ?? null;
        }
        return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
      };
      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;

      let readerPromise: Promise<unknown> | null = null;
      const cleanupErrors: unknown[] = [];

      try {
        await blockerClient.query('BEGIN');
        await blockerClient.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [fixture.roomId]);

        readerPromise = teamsService.snapshot('member', 'sess-member', fixture.playSessionId);
        void readerPromise.catch(() => undefined);

        let readerBlocked = false;
        for (let i = 0; i < 50; i++) {
          if (readerPid) {
            const blockersRow = await pool.query<{ blockers: number[] }>('SELECT pg_blocking_pids($1) AS blockers', [readerPid]);
            const blockers = blockersRow.rows[0]?.blockers ?? [];
            if (blockers.includes(blockerPid)) {
              readerBlocked = true;
              break;
            }
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(readerBlocked).toBe(true);

        await blockerClient.query("UPDATE session SET expires_at=now()-interval '10 seconds' WHERE id='sess-member'");

        await blockerClient.query('COMMIT');

        await expectHttpError(
          () => readerPromise!,
          401,
          ErrorCode.LOGIN_REQUIRED,
          'Session expired or revoked',
        );
      } finally {
        pg.Client.prototype.query = originalClientQuery;
        try {
          await blockerClient.query('ROLLBACK');
        } catch (err) {
          cleanupErrors.push(err);
        }
        blockerClient.release();
        if (readerPromise) {
          await readerPromise.catch(() => {});
        }
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, 'Cleanup failure in fresh session check test');
      }
    });

    it('teamsService.snapshot re-evaluates room membership after acquiring room lock from writer and rejects removed member', async () => {
      const fixture = await resetAndSeedFixture();
      const blockerClient = await pool.connect();
      const blockerPid = (blockerClient as { processID: number }).processID;
      expect(blockerPid).toBeTruthy();

      let readerPid: number | null = null;
      let readerIntercepted = false;
      const wrappedQuery = function (this: unknown, ...args: unknown[]) {
        const queryText = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
        if (!readerIntercepted && this !== blockerClient && queryText.includes('FROM rooms WHERE id=$1')) {
          readerIntercepted = true;
          readerPid = (this as { processID?: number }).processID ?? null;
        }
        return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
      };
      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;

      let readerPromise: Promise<unknown> | null = null;
      const cleanupErrors: unknown[] = [];

      try {
        await blockerClient.query('BEGIN');
        await blockerClient.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [fixture.roomId]);

        readerPromise = teamsService.snapshot('member', 'sess-member', fixture.playSessionId);
        void readerPromise.catch(() => undefined);

        let readerBlocked = false;
        for (let i = 0; i < 50; i++) {
          if (readerPid) {
            const blockersRow = await pool.query<{ blockers: number[] }>('SELECT pg_blocking_pids($1) AS blockers', [readerPid]);
            const blockers = blockersRow.rows[0]?.blockers ?? [];
            if (blockers.includes(blockerPid)) {
              readerBlocked = true;
              break;
            }
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(readerBlocked).toBe(true);

        await blockerClient.query('DELETE FROM room_members WHERE room_id=$1 AND user_id=$2', [fixture.roomId, 'member']);

        await blockerClient.query('COMMIT');

        await expectHttpError(
          () => readerPromise!,
          403,
          ErrorCode.FORBIDDEN,
          'Room membership required',
        );
      } finally {
        pg.Client.prototype.query = originalClientQuery;
        try {
          await blockerClient.query('ROLLBACK');
        } catch (err) {
          cleanupErrors.push(err);
        }
        blockerClient.release();
        if (readerPromise) {
          await readerPromise.catch(() => {});
        }
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, 'Cleanup failure in fresh membership check test');
      }
    });

    it('playSessionsService.requests re-evaluates recruitment permission after acquiring room lock and rejects revoked grant', async () => {
      const fixture = await resetAndSeedFixture();
      const blockerClient = await pool.connect();
      const blockerPid = (blockerClient as { processID: number }).processID;
      expect(blockerPid).toBeTruthy();

      let readerPid: number | null = null;
      let readerIntercepted = false;
      const wrappedQuery = function (this: unknown, ...args: unknown[]) {
        const queryText = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
        if (!readerIntercepted && this !== blockerClient && queryText.includes('FROM rooms WHERE id=$1')) {
          readerIntercepted = true;
          readerPid = (this as { processID?: number }).processID ?? null;
        }
        return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
      };
      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;

      let readerPromise: Promise<unknown> | null = null;
      const cleanupErrors: unknown[] = [];

      try {
        await blockerClient.query('BEGIN');
        await blockerClient.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [fixture.roomId]);

        readerPromise = playSessionsService.requests('helper', 'sess-helper', fixture.playSessionId);
        void readerPromise.catch(() => undefined);

        let readerBlocked = false;
        for (let i = 0; i < 50; i++) {
          if (readerPid) {
            const blockersRow = await pool.query<{ blockers: number[] }>('SELECT pg_blocking_pids($1) AS blockers', [readerPid]);
            const blockers = blockersRow.rows[0]?.blockers ?? [];
            if (blockers.includes(blockerPid)) {
              readerBlocked = true;
              break;
            }
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(readerBlocked).toBe(true);

        await blockerClient.query('DELETE FROM permission_grants WHERE room_id=$1 AND user_id=$2', [fixture.roomId, 'helper']);

        await blockerClient.query('COMMIT');

        await expectHttpError(
          () => readerPromise!,
          403,
          ErrorCode.FORBIDDEN,
          'Recruitment management permission required',
        );
      } finally {
        pg.Client.prototype.query = originalClientQuery;
        try {
          await blockerClient.query('ROLLBACK');
        } catch (err) {
          cleanupErrors.push(err);
        }
        blockerClient.release();
        if (readerPromise) {
          await readerPromise.catch(() => {});
        }
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(cleanupErrors, 'Cleanup failure in fresh grant check test');
      }
    });
  });
});
