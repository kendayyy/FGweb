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
import { TeamsService } from '../src/modules/teams/teams.service.js';
import { PlaySessionsService } from '../src/modules/play-sessions/play-sessions.service.js';

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

async function expectHttpError(
  action: () => Promise<unknown>,
  expectedStatus: number,
  expectedCode: ErrorCode,
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
  }
}

jest.setTimeout(60000);

describe('FG T30 - TeamsService & PlaySessionsService Read-Lock Concurrency & Authority Integration', () => {
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
    const users = ['owner', 'helper', 'helper-nogrant', 'member', 'applicant', 'outsider', 'reader-member'];
    for (const u of users) {
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
    await pool.query('DELETE FROM notification_outbox');
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM active_play_slots');
    await pool.query('DELETE FROM join_requests');
    await pool.query('DELETE FROM recruitments');
    await pool.query('DELETE FROM team_members');
    await pool.query('DELETE FROM play_sessions');
    await pool.query('DELETE FROM permission_grants');
    await pool.query('DELETE FROM room_members');
    await pool.query('DELETE FROM conversation_members');
    await pool.query('DELETE FROM rooms');
    await pool.query("DELETE FROM conversations WHERE kind='ROOM'");
    await pool.query('DELETE FROM admin_actions');

    const freshExpiryIso = new Date(Date.now() + 86400000).toISOString();
    await pool.query('UPDATE session SET expires_at=$1', [freshExpiryIso]);

    const nowIso = new Date().toISOString();
    const conversationId = `conv_${randomUUID()}`;
    await pool.query(
      "INSERT INTO conversations(id, kind, created_at, updated_at) VALUES($1, 'ROOM', $2, $2)",
      [conversationId, nowIso],
    );

    const roomId = `room_${randomUUID()}`;
    await pool.query(
      "INSERT INTO rooms(id, owner_id, name, visibility, conversation_id, created_at, updated_at) VALUES($1, 'owner', 'T30 Room', 'PUBLIC', $2, $3, $3)",
      [roomId, conversationId, nowIso],
    );

    await pool.query(
      "INSERT INTO room_members(id, room_id, user_id, role, created_at, updated_at) VALUES($1, $2, 'owner', 'OWNER', $3, $3)",
      [`rm_owner_${randomUUID()}`, roomId, nowIso],
    );
    await pool.query(
      "INSERT INTO room_members(id, room_id, user_id, role, created_at, updated_at) VALUES($1, $2, 'helper', 'HELPER', $3, $3)",
      [`rm_helper_${randomUUID()}`, roomId, nowIso],
    );
    await pool.query(
      "INSERT INTO room_members(id, room_id, user_id, role, created_at, updated_at) VALUES($1, $2, 'helper-nogrant', 'HELPER', $3, $3)",
      [`rm_helper_ng_${randomUUID()}`, roomId, nowIso],
    );
    await pool.query(
      "INSERT INTO room_members(id, room_id, user_id, role, created_at, updated_at) VALUES($1, $2, 'member', 'MEMBER', $3, $3)",
      [`rm_member_${randomUUID()}`, roomId, nowIso],
    );
    await pool.query(
      "INSERT INTO room_members(id, room_id, user_id, role, created_at, updated_at) VALUES($1, $2, 'reader-member', 'MEMBER', $3, $3)",
      [`rm_reader_m_${randomUUID()}`, roomId, nowIso],
    );

    await pool.query(
      "INSERT INTO permission_grants(id, room_id, user_id, permission, granted_by, created_at) VALUES($1, $2, 'helper', 'MANAGE_RECRUITMENT', 'owner', $3)",
      [`pg_helper_${randomUUID()}`, roomId, nowIso],
    );

    const playSessionId = `play_${randomUUID()}`;
    await pool.query(
      "INSERT INTO play_sessions(id, room_id, host_user_id, state, timing_type, player_capacity, scheduled_at, created_at, updated_at) VALUES($1, $2, 'owner', 'ACTIVE', 'now', 5, null, $3, $3)",
      [playSessionId, roomId, nowIso],
    );

    await pool.query(
      "INSERT INTO team_members(id, play_session_id, user_id, slot_index, player_capacity, is_host, joined_at) VALUES($1, $2, 'owner', 1, 5, true, $3)",
      [`tm_owner_${randomUUID()}`, playSessionId, nowIso],
    );
    await pool.query(
      "INSERT INTO team_members(id, play_session_id, user_id, slot_index, player_capacity, is_host, joined_at) VALUES($1, $2, 'member', 2, 5, false, $3)",
      [`tm_member_${randomUUID()}`, playSessionId, nowIso],
    );

    await pool.query(
      'INSERT INTO active_play_slots(user_id, play_session_id, slot_index, created_at) VALUES($1, $2, 1, $3)',
      ['owner', playSessionId, nowIso],
    );
    await pool.query(
      'INSERT INTO active_play_slots(user_id, play_session_id, slot_index, created_at) VALUES($1, $2, 2, $3)',
      ['member', playSessionId, nowIso],
    );

    const recruitmentId = `rec_${randomUUID()}`;
    await pool.query(
      "INSERT INTO recruitments(id, room_id, play_session_id, game_id, title, mode, state, timing_type, player_capacity, current_players, created_at, updated_at) VALUES($1, $2, $3, $4, 'Recruitment Card', 'ranked', 'OPEN', 'now', 5, 2, $5, $5)",
      [recruitmentId, roomId, playSessionId, valorantGame.id, nowIso],
    );

    const joinRequestId = `join_${randomUUID()}`;
    await pool.query(
      "INSERT INTO join_requests(id, recruitment_id, applicant_id, status, created_at, updated_at) VALUES($1, $2, 'applicant', 'PENDING', $3, $3)",
      [joinRequestId, recruitmentId, nowIso],
    );

    return { roomId, conversationId, playSessionId, recruitmentId, joinRequestId };
  }

  describe('Read-Only Concurrency under held external FOR SHARE locks', () => {
    it('teamsService.snapshot succeeds within 1500ms while external transaction holds room and play FOR SHARE', async () => {
      const fixture = await resetAndSeedFixture();
      const blockerClient = await pool.connect();
      await blockerClient.query('BEGIN');
      await blockerClient.query('SELECT id FROM rooms WHERE id=$1 FOR SHARE', [fixture.roomId]);
      await blockerClient.query('SELECT id FROM play_sessions WHERE id=$1 FOR SHARE', [fixture.playSessionId]);

      let timer: NodeJS.Timeout;
      const deadlinePromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('1500ms deadline exceeded')), 1500);
      });

      const apiPromise = teamsService.snapshot('member', 'sess-member', fixture.playSessionId);
      let snapshotResult: TeamSnapshotDTO;
      try {
        snapshotResult = await Promise.race([apiPromise, deadlinePromise]);
      } finally {
        clearTimeout(timer!);
        await blockerClient.query('ROLLBACK');
        blockerClient.release();
        await apiPromise.catch(() => {});
      }

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
    });

    it('playSessionsService.requests succeeds within 1500ms while external transaction holds room and play FOR SHARE', async () => {
      const fixture = await resetAndSeedFixture();
      const blockerClient = await pool.connect();
      await blockerClient.query('BEGIN');
      await blockerClient.query('SELECT id FROM rooms WHERE id=$1 FOR SHARE', [fixture.roomId]);
      await blockerClient.query('SELECT id FROM play_sessions WHERE id=$1 FOR SHARE', [fixture.playSessionId]);

      let timer: NodeJS.Timeout;
      const deadlinePromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('1500ms deadline exceeded')), 1500);
      });

      const apiPromise = playSessionsService.requests('owner', 'sess-owner', fixture.playSessionId);
      let requestsResult: JoinRequestDTO[];
      try {
        requestsResult = await Promise.race([apiPromise, deadlinePromise]);
      } finally {
        clearTimeout(timer!);
        await blockerClient.query('ROLLBACK');
        blockerClient.release();
        await apiPromise.catch(() => {});
      }

      expect(requestsResult).toHaveLength(1);
      const parsedReq = JoinRequestSchema.parse(requestsResult[0]);
      expect(requestsResult[0]).toEqual(parsedReq);
      expect(requestsResult[0].id).toBe(fixture.joinRequestId);
      expect(requestsResult[0].recruitmentId).toBe(fixture.recruitmentId);
      expect(requestsResult[0].applicantId).toBe('applicant');
      expect(requestsResult[0].status).toBe('PENDING');
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
        if (!intercepted && queryText.includes('FROM team_members WHERE play_session_id')) {
          intercepted = true;
          const res = await (originalClientQuery as unknown as (...a: unknown[]) => Promise<unknown>).apply(this, args);
          const pidRow = await (originalClientQuery as unknown as (...a: unknown[]) => Promise<{ rows: { pid: number }[] }>).call(
            this,
            'SELECT pg_backend_pid() AS pid',
          );
          readerPid = pidRow.rows[0].pid;
          reachedBarrier.resolve();
          await barrier.promise;
          return res;
        }
        return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
      };

      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;

      const writerClient = await pool.connect();
      let writerFinished = false;
      let writerPromise: Promise<unknown> | null = null;
      const apiPromise = teamsService.snapshot('member', 'sess-member', fixture.playSessionId);

      try {
        await reachedBarrier.promise;
        expect(readerPid).toBeTruthy();

        await writerClient.query('BEGIN');
        const writerPidRow = await writerClient.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        const writerPid = writerPidRow.rows[0].pid;

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

        const snapshot = await apiPromise;
        expect(snapshot.playSession.id).toBe(fixture.playSessionId);

        await writerPromise;
        expect(writerFinished).toBe(true);
        await writerClient.query('COMMIT');
      } finally {
        barrier.resolve();
        pg.Client.prototype.query = originalClientQuery;
        if (writerPromise) await writerPromise.catch(() => {});
        await apiPromise.catch(() => {});
        await writerClient.query('ROLLBACK').catch(() => {});
        writerClient.release();
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
        if (!intercepted && queryText.includes('JOIN recruitments c ON c.id=j.recruitment_id')) {
          intercepted = true;
          const res = await (originalClientQuery as unknown as (...a: unknown[]) => Promise<unknown>).apply(this, args);
          const pidRow = await (originalClientQuery as unknown as (...a: unknown[]) => Promise<{ rows: { pid: number }[] }>).call(
            this,
            'SELECT pg_backend_pid() AS pid',
          );
          readerPid = pidRow.rows[0].pid;
          reachedBarrier.resolve();
          await barrier.promise;
          return res;
        }
        return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
      };

      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;

      const writerClient = await pool.connect();
      let writerFinished = false;
      let writerPromise: Promise<unknown> | null = null;
      const apiPromise = playSessionsService.requests('owner', 'sess-owner', fixture.playSessionId);

      try {
        await reachedBarrier.promise;
        expect(readerPid).toBeTruthy();

        await writerClient.query('BEGIN');
        const writerPidRow = await writerClient.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        const writerPid = writerPidRow.rows[0].pid;

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

        const requests = await apiPromise;
        expect(requests).toHaveLength(1);

        await writerPromise;
        expect(writerFinished).toBe(true);
        await writerClient.query('COMMIT');
      } finally {
        barrier.resolve();
        pg.Client.prototype.query = originalClientQuery;
        if (writerPromise) await writerPromise.catch(() => {});
        await apiPromise.catch(() => {});
        await writerClient.query('ROLLBACK').catch(() => {});
        writerClient.release();
      }
    });

    it('teamsService.snapshot reader also holds FOR SHARE on play_sessions, blocking writer on play_sessions row', async () => {
      const fixture = await resetAndSeedFixture();
      const reachedBarrier = createDeferred<void>();
      const barrier = createDeferred<void>();
      let readerPid: number | null = null;
      let intercepted = false;

      const wrappedQuery = async function (this: unknown, ...args: unknown[]) {
        const queryText = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
        if (!intercepted && queryText.includes('FROM team_members WHERE play_session_id')) {
          intercepted = true;
          const res = await (originalClientQuery as unknown as (...a: unknown[]) => Promise<unknown>).apply(this, args);
          const pidRow = await (originalClientQuery as unknown as (...a: unknown[]) => Promise<{ rows: { pid: number }[] }>).call(
            this,
            'SELECT pg_backend_pid() AS pid',
          );
          readerPid = pidRow.rows[0].pid;
          reachedBarrier.resolve();
          await barrier.promise;
          return res;
        }
        return (originalClientQuery as unknown as (...a: unknown[]) => unknown).apply(this, args);
      };

      pg.Client.prototype.query = wrappedQuery as unknown as typeof pg.Client.prototype.query;

      const writerClient = await pool.connect();
      let writerFinished = false;
      let writerPromise: Promise<unknown> | null = null;
      const apiPromise = teamsService.snapshot('member', 'sess-member', fixture.playSessionId);

      try {
        await reachedBarrier.promise;
        expect(readerPid).toBeTruthy();

        await writerClient.query('BEGIN');
        const writerPidRow = await writerClient.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        const writerPid = writerPidRow.rows[0].pid;

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

        const snapshot = await apiPromise;
        expect(snapshot.playSession.id).toBe(fixture.playSessionId);

        await writerPromise;
        expect(writerFinished).toBe(true);
        await writerClient.query('COMMIT');
      } finally {
        barrier.resolve();
        pg.Client.prototype.query = originalClientQuery;
        if (writerPromise) await writerPromise.catch(() => {});
        await apiPromise.catch(() => {});
        await writerClient.query('ROLLBACK').catch(() => {});
        writerClient.release();
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
      );

      await pool.query("UPDATE session SET expires_at=now()-interval '1 minute' WHERE id='sess-member'");
      await expectHttpError(
        () => teamsService.snapshot('member', 'sess-member', fixture.playSessionId),
        401,
        ErrorCode.LOGIN_REQUIRED,
      );
    });

    it('playSessionsService.requests rejects expired or deleted session with exact 401 LOGIN_REQUIRED', async () => {
      const fixture = await resetAndSeedFixture();
      await expectHttpError(
        () => playSessionsService.requests('owner', 'sess-invalid-999', fixture.playSessionId),
        401,
        ErrorCode.LOGIN_REQUIRED,
      );

      await pool.query("UPDATE session SET expires_at=now()-interval '1 minute' WHERE id='sess-owner'");
      await expectHttpError(
        () => playSessionsService.requests('owner', 'sess-owner', fixture.playSessionId),
        401,
        ErrorCode.LOGIN_REQUIRED,
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
      );
    });

    it('teamsService.snapshot rejects user without complete onboarding with exact 403 FORBIDDEN', async () => {
      const fixture = await resetAndSeedFixture();
      await pool.query("DELETE FROM game_interests WHERE user_id='member'");
      await expectHttpError(
        () => teamsService.snapshot('member', 'sess-member', fixture.playSessionId),
        403,
        ErrorCode.FORBIDDEN,
      );
    });

    it('playSessionsService.requests rejects user without complete onboarding with exact 403 FORBIDDEN', async () => {
      const fixture = await resetAndSeedFixture();
      await pool.query("DELETE FROM game_interests WHERE user_id='owner'");
      await expectHttpError(
        () => playSessionsService.requests('owner', 'sess-owner', fixture.playSessionId),
        403,
        ErrorCode.FORBIDDEN,
      );
    });

    it('teamsService.snapshot rejects non-member outsider with exact 403 FORBIDDEN', async () => {
      const fixture = await resetAndSeedFixture();
      await expectHttpError(
        () => teamsService.snapshot('outsider', 'sess-outsider', fixture.playSessionId),
        403,
        ErrorCode.FORBIDDEN,
      );
    });

    it('playSessionsService.requests rejects non-member outsider with exact 403 FORBIDDEN', async () => {
      const fixture = await resetAndSeedFixture();
      await expectHttpError(
        () => playSessionsService.requests('outsider', 'sess-outsider', fixture.playSessionId),
        403,
        ErrorCode.FORBIDDEN,
      );
    });

    it('playSessionsService.requests rejects ordinary room member (non-manager) with exact 403 FORBIDDEN', async () => {
      const fixture = await resetAndSeedFixture();
      await expectHttpError(
        () => playSessionsService.requests('member', 'sess-member', fixture.playSessionId),
        403,
        ErrorCode.FORBIDDEN,
      );
    });

    it('playSessionsService.requests rejects helper without MANAGE_RECRUITMENT grant with exact 403 FORBIDDEN', async () => {
      const fixture = await resetAndSeedFixture();
      await expectHttpError(
        () => playSessionsService.requests('helper-nogrant', 'sess-helper-nogrant', fixture.playSessionId),
        403,
        ErrorCode.FORBIDDEN,
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
      await blockerClient.query('BEGIN');
      await blockerClient.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [fixture.roomId]);

      const readerPromise = teamsService.snapshot('member', 'sess-member', fixture.playSessionId);

      try {
        let readerBlocked = false;
        for (let i = 0; i < 50; i++) {
          const waits = await pool.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FROM rooms WHERE id=$1%'",
          );
          if (Number(waits.rows[0].count) > 0) {
            readerBlocked = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(readerBlocked).toBe(true);

        await pool.query("UPDATE session SET expires_at=now()-interval '10 seconds' WHERE id='sess-member'");

        await blockerClient.query('COMMIT');

        await expectHttpError(
          () => readerPromise,
          401,
          ErrorCode.LOGIN_REQUIRED,
        );
      } finally {
        await blockerClient.query('ROLLBACK').catch(() => {});
        blockerClient.release();
        await readerPromise.catch(() => {});
      }
    });

    it('teamsService.snapshot re-evaluates room membership after acquiring room lock from writer and rejects removed member', async () => {
      const fixture = await resetAndSeedFixture();
      const blockerClient = await pool.connect();
      await blockerClient.query('BEGIN');
      await blockerClient.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [fixture.roomId]);

      const readerPromise = teamsService.snapshot('member', 'sess-member', fixture.playSessionId);

      try {
        let readerBlocked = false;
        for (let i = 0; i < 50; i++) {
          const waits = await pool.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FROM rooms WHERE id=$1%'",
          );
          if (Number(waits.rows[0].count) > 0) {
            readerBlocked = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(readerBlocked).toBe(true);

        await pool.query('DELETE FROM room_members WHERE room_id=$1 AND user_id=$2', [fixture.roomId, 'member']);

        await blockerClient.query('COMMIT');

        await expectHttpError(
          () => readerPromise,
          403,
          ErrorCode.FORBIDDEN,
        );
      } finally {
        await blockerClient.query('ROLLBACK').catch(() => {});
        blockerClient.release();
        await readerPromise.catch(() => {});
      }
    });

    it('playSessionsService.requests re-evaluates recruitment permission after acquiring room lock and rejects revoked grant', async () => {
      const fixture = await resetAndSeedFixture();
      const blockerClient = await pool.connect();
      await blockerClient.query('BEGIN');
      await blockerClient.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [fixture.roomId]);

      const readerPromise = playSessionsService.requests('helper', 'sess-helper', fixture.playSessionId);

      try {
        let readerBlocked = false;
        for (let i = 0; i < 50; i++) {
          const waits = await pool.query<{ count: string }>(
            "SELECT count(*)::text AS count FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FROM rooms WHERE id=$1%'",
          );
          if (Number(waits.rows[0].count) > 0) {
            readerBlocked = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(readerBlocked).toBe(true);

        await pool.query('DELETE FROM permission_grants WHERE room_id=$1 AND user_id=$2', [fixture.roomId, 'helper']);

        await blockerClient.query('COMMIT');

        await expectHttpError(
          () => readerPromise,
          403,
          ErrorCode.FORBIDDEN,
        );
      } finally {
        await blockerClient.query('ROLLBACK').catch(() => {});
        blockerClient.release();
        await readerPromise.catch(() => {});
      }
    });
  });
});
