import 'reflect-metadata';
import { jest } from '@jest/globals';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import * as schema from '@fg/database';
import {
  PublicProfileSchema,
  PendingFriendRequestSchema,
  BlockSchema,
  createPageSchema,
  SocketEventNames,
  SocketConversationAckSchema,
} from '@fg/contracts';
import { AppModule } from '../../../apps/api/src/app.module.js';
import { createSignedSessionCookie } from '../../../apps/api/test/test-cookie-helper.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const origin = 'http://localhost:5173';
const secret = 't17-social-test-secret-at-least-32-chars';

jest.setTimeout(60000);

describe('T17-BE Social Integration, Locking & Concurrency', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let base: string;
  const owned = `t17_social_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const savedEnv = { ...process.env };

  let cookieA: string;
  let cookieB: string;
  let cookieC: string;
  let cookieNonOnboarded: string;
  let cookieBanned: string;
  let cookieU1: string;
  let cookieU2: string;

  const sockets: Socket[] = [];

  beforeAll(async () => {
    const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    const connection = new URL(env.DATABASE_URL);
    connection.searchParams.set('options', `-c search_path=${owned}`);

    pool = new pg.Pool({
      connectionString: connection.href,
      max: 20,
      connectionTimeoutMillis: 5000,
    });

    await pool.query(`CREATE SCHEMA "${owned}"`);

    const client = await pool.connect();
    try {
      await migrate(drizzle(client), {
        migrationsFolder: path.join(root, 'packages/database/migrations'),
        migrationsSchema: owned,
      });
    } finally {
      client.release();
    }

    await schema.seedGames(drizzle(pool, { schema }));

    // Insert synthetic test users (including supplementary character non-BMP vs BMP for SQL canonical ordering test)
    await pool.query(`
      INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES
      ('user-a', 'Alice', 'alice@example.com', true, now(), now()),
      ('user-b', 'Bob', 'bob@example.com', true, now(), now()),
      ('user-c', 'Charlie', 'charlie@example.com', true, now(), now()),
      ('user-nononboarded', 'Newbie', 'newbie@example.com', true, now(), now()),
      ('user-banned', 'BannedUser', 'banned@example.com', true, now(), now()),
      ('user-𐀀', 'UnicodeSupplementary', 'supp@example.com', true, now(), now()),
      ('user-', 'UnicodeBMP', 'bmp@example.com', true, now(), now())
    `);

    await pool.query(`
      INSERT INTO profiles(user_id, display_name, custom_status, created_at, updated_at) VALUES
      ('user-a', 'AliceGamer', 'JUST_CHATTING', now(), now()),
      ('user-b', 'BobPro', 'LOOKING_FOR_TEAM', now(), now()),
      ('user-c', 'CharlieCasual', 'PLAYING', now(), now()),
      ('user-𐀀', 'UnicodeSuppGamer', 'JUST_CHATTING', now(), now()),
      ('user-', 'UnicodeBMPGamer', 'JUST_CHATTING', now(), now())
    `);

    const gameRow = (await pool.query('SELECT id FROM games LIMIT 1')).rows[0];
    await pool.query(`
      INSERT INTO game_interests(id, user_id, game_id) VALUES
      ('gi-a', 'user-a', $1),
      ('gi-b', 'user-b', $1),
      ('gi-c', 'user-c', $1),
      ('gi-u1', 'user-𐀀', $1),
      ('gi-u2', 'user-', $1)
    `, [gameRow.id]);

    await pool.query(`
      INSERT INTO admin_actions(id, actor_id, target_user_id, action, reason, created_at) VALUES
      ('action-ban-1', 'user-a', 'user-banned', 'BAN', 'Violation', now())
    `);

    await pool.query(`
      INSERT INTO "session"(id, user_id, token, expires_at, created_at, updated_at) VALUES
      ('session-a', 'user-a', 'token-a', now() + interval '1 day', now(), now()),
      ('session-b', 'user-b', 'token-b', now() + interval '1 day', now(), now()),
      ('session-c', 'user-c', 'token-c', now() + interval '1 day', now(), now()),
      ('session-nononboarded', 'user-nononboarded', 'token-nononboarded', now() + interval '1 day', now(), now()),
      ('session-banned', 'user-banned', 'token-banned', now() + interval '1 day', now(), now()),
      ('session-u1', 'user-𐀀', 'token-u1', now() + interval '1 day', now(), now()),
      ('session-u2', 'user-', 'token-u2', now() + interval '1 day', now(), now())
    `);

    cookieA = await createSignedSessionCookie(secret, 'token-a');
    cookieB = await createSignedSessionCookie(secret, 'token-b');
    cookieC = await createSignedSessionCookie(secret, 'token-c');
    cookieNonOnboarded = await createSignedSessionCookie(secret, 'token-nononboarded');
    cookieBanned = await createSignedSessionCookie(secret, 'token-banned');
    cookieU1 = await createSignedSessionCookie(secret, 'token-u1');
    cookieU2 = await createSignedSessionCookie(secret, 'token-u2');

    Object.assign(process.env, {
      DATABASE_URL: connection.href,
      REDIS_URL: env.REDIS_URL,
      PUBLIC_ORIGIN: origin,
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: secret,
      DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID,
      DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET,
    });

    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    const errors: unknown[] = [];
    try {
      if (app) {
        await app.close();
      }
    } catch (err) {
      errors.push(err);
    }

    if (pool) {
      try {
        if (!/^t17_social_[0-9]+_[a-z0-9]+$/.test(owned)) {
          throw new Error('Invalid owned schema name safety check');
        }
        await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
        const remaining = await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1', [owned]);
        expect(remaining.rowCount).toBe(0);
      } catch (err) {
        errors.push(err);
      } finally {
        try {
          await pool.end();
        } catch (err) {
          errors.push(err);
        }
      }
    }

    process.env = savedEnv;

    if (errors.length) {
      throw new AggregateError(errors, 'Owned integration cleanup failed');
    }
  });

  async function connectSocket(cookie?: string) {
    const socket = io(base, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 2000,
      extraHeaders: {
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  describe('1. 11 Social Endpoints & Payload Contracts', () => {
    it('GET /api/v1/friends returns paginated ProfileDTO and leaks no private fields', async () => {
      const res = await request(base)
        .get('/api/v1/friends')
        .set('Cookie', cookieA);

      expect(res.status).toBe(200);
      const parsed = createPageSchema(PublicProfileSchema).parse(res.body);
      expect(Array.isArray(parsed.items)).toBe(true);

      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('email');
      expect(bodyStr).not.toContain('discordId');
      expect(bodyStr).not.toContain('emailVerified');
    });

    it('GET /api/v1/friends/requests returns incoming/outgoing friend requests', async () => {
      const resIn = await request(base)
        .get('/api/v1/friends/requests?direction=INCOMING')
        .set('Cookie', cookieB);

      expect(resIn.status).toBe(200);
      const parsedIn = createPageSchema(PendingFriendRequestSchema).parse(resIn.body);
      expect(Array.isArray(parsedIn.items)).toBe(true);
    });

    it('POST /api/v1/friends/requests creates pending friend request (HTTP 200)', async () => {
      const res = await request(base)
        .post('/api/v1/friends/requests')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ targetUserId: 'user-b' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('requestId');
      expect(res.body.status).toBe('PENDING');

      const retry = await request(base)
        .post('/api/v1/friends/requests')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ targetUserId: 'user-b' });

      expect(retry.status).toBe(200);
      expect(retry.body.requestId).toBe(res.body.requestId);
    });

    it('Opposite friend request send returns 422 INVALID_INPUT', async () => {
      const opp = await request(base)
        .post('/api/v1/friends/requests')
        .set('Origin', origin)
        .set('Cookie', cookieB)
        .send({ targetUserId: 'user-a' });

      expect(opp.status).toBe(422);
      expect(opp.body.code).toBe('INVALID_INPUT');
    });

    it('PATCH /api/v1/friends/requests/:id/respond receiver accepts request', async () => {
      const list = await request(base)
        .get('/api/v1/friends/requests?direction=INCOMING')
        .set('Cookie', cookieB);

      const reqId = list.body.items[0].requestId;

      const senderFail = await request(base)
        .patch(`/api/v1/friends/requests/${reqId}/respond`)
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ action: 'ACCEPT' });

      expect(senderFail.status).toBe(403);

      const accept = await request(base)
        .patch(`/api/v1/friends/requests/${reqId}/respond`)
        .set('Origin', origin)
        .set('Cookie', cookieB)
        .send({ action: 'ACCEPT' });

      expect(accept.status).toBe(200);
      expect(accept.body).toEqual({ success: true });

      const friendsB = await request(base)
        .get('/api/v1/friends')
        .set('Cookie', cookieB);

      expect(friendsB.body.items.some((f: { id: string }) => f.id === 'user-a')).toBe(true);
    });

    it('DELETE /api/v1/friends/:userId removes friendship', async () => {
      const del = await request(base)
        .delete('/api/v1/friends/user-b')
        .set('Origin', origin)
        .set('Cookie', cookieA);

      expect(del.status).toBe(200);
      expect(del.body).toEqual({ success: true });

      const friendsA = await request(base)
        .get('/api/v1/friends')
        .set('Cookie', cookieA);

      expect(friendsA.body.items.some((f: { id: string }) => f.id === 'user-b')).toBe(false);
    });

    it('DELETE /api/v1/friends/requests/:id/cancel allows sender to cancel pending request', async () => {
      const createReq = await request(base)
        .post('/api/v1/friends/requests')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ targetUserId: 'user-c' });

      const reqId = createReq.body.requestId;

      const receiverCancel = await request(base)
        .delete(`/api/v1/friends/requests/${reqId}/cancel`)
        .set('Origin', origin)
        .set('Cookie', cookieC);

      expect(receiverCancel.status).toBe(403);

      const cancel = await request(base)
        .delete(`/api/v1/friends/requests/${reqId}/cancel`)
        .set('Origin', origin)
        .set('Cookie', cookieA);

      expect(cancel.status).toBe(200);
      expect(cancel.body).toEqual({ success: true });
    });

    it('POST /api/v1/direct-conversations creates or gets DM without friendship (HTTP 200)', async () => {
      const dm = await request(base)
        .post('/api/v1/direct-conversations')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ recipientUserId: 'user-c' });

      expect(dm.status).toBe(200);
      expect(dm.body).toHaveProperty('conversationId');

      const retry = await request(base)
        .post('/api/v1/direct-conversations')
        .set('Origin', origin)
        .set('Cookie', cookieC)
        .send({ recipientUserId: 'user-a' });

      expect(retry.status).toBe(200);
      expect(retry.body.conversationId).toBe(dm.body.conversationId);
    });

    it('GET /api/v1/direct-conversations lists user DMs with peer ProfileDTO', async () => {
      const list = await request(base)
        .get('/api/v1/direct-conversations')
        .set('Cookie', cookieA);

      expect(list.status).toBe(200);
      expect(list.body.items.length).toBeGreaterThan(0);
      expect(list.body.items[0]).toHaveProperty('conversationId');
      expect(list.body.items[0]).toHaveProperty('peer');
      PublicProfileSchema.parse(list.body.items[0].peer);
    });

    it('POST /api/v1/blocks and GET /api/v1/blocks (HTTP 200)', async () => {
      const blockRes = await request(base)
        .post('/api/v1/blocks')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ blockedId: 'user-b' });

      expect(blockRes.status).toBe(200);
      const parsedBlock = BlockSchema.parse(blockRes.body);

      const listA = await request(base)
        .get('/api/v1/blocks')
        .set('Cookie', cookieA);

      expect(listA.status).toBe(200);
      expect(listA.body.some((b: { blockedId: string }) => b.blockedId === 'user-b')).toBe(true);

      const retryBlock = await request(base)
        .post('/api/v1/blocks')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ blockedId: 'user-b' });

      expect(retryBlock.status).toBe(200);
      expect(retryBlock.body.id).toBe(parsedBlock.id);
      expect(retryBlock.body.createdAt).toBe(parsedBlock.createdAt);

      const friendReqBlocked = await request(base)
        .post('/api/v1/friends/requests')
        .set('Origin', origin)
        .set('Cookie', cookieB)
        .send({ targetUserId: 'user-a' });

      expect(friendReqBlocked.status).toBe(403);

      const dmBlocked = await request(base)
        .post('/api/v1/direct-conversations')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ recipientUserId: 'user-b' });

      expect(dmBlocked.status).toBe(403);
    });

    it('DELETE /api/v1/blocks/:userId removes caller block', async () => {
      const unblock = await request(base)
        .delete('/api/v1/blocks/user-b')
        .set('Origin', origin)
        .set('Cookie', cookieA);

      expect(unblock.status).toBe(200);
      expect(unblock.body).toEqual({ success: true });
    });
  });

  describe('2. Defect 1: Consistent Lock Ordering & Lock Barrier', () => {
    it('Consistent lock ordering: holding pair lock queues eager send and eager respond, pg_locks NOT granted = 2', async () => {
      await pool.query(`DELETE FROM friendships WHERE user1_id = LEAST('user-𐀀'::text, 'user-'::text) AND user2_id = GREATEST('user-𐀀'::text, 'user-'::text)`);
      await pool.query(`DELETE FROM friend_requests WHERE (sender_id = 'user-𐀀' AND receiver_id = 'user-') OR (sender_id = 'user-' AND receiver_id = 'user-𐀀')`);

      const initReq = await request(base)
        .post('/api/v1/friends/requests')
        .set('Origin', origin)
        .set('Cookie', cookieU1)
        .send({ targetUserId: 'user-' });

      expect(initReq.status).toBe(200);
      const reqId = initReq.body.requestId;

      const barrierClient = await pool.connect();
      try {
        await barrierClient.query('BEGIN');
        await barrierClient.query(
          `SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_social_pair', LEAST($1::text, $2::text), GREATEST($1::text, $2::text))::text, 0::bigint))`,
          ['user-𐀀', 'user-']
        );

        // Eager Promise 1
        const req1Promise = request(base)
          .post('/api/v1/friends/requests')
          .set('Origin', origin)
          .set('Cookie', cookieU1)
          .send({ targetUserId: 'user-' })
          .then((res) => res);

        let lockCount1 = 0;
        for (let i = 0; i < 30; i++) {
          const locks = await pool.query(
            `SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`
          );
          lockCount1 = locks.rows[0].count;
          if (lockCount1 >= 1) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(lockCount1).toBe(1);

        // Eager Promise 2
        const req2Promise = request(base)
          .patch(`/api/v1/friends/requests/${reqId}/respond`)
          .set('Origin', origin)
          .set('Cookie', cookieU2)
          .send({ action: 'ACCEPT' })
          .then((res) => res);

        let lockCount2 = 0;
        for (let i = 0; i < 30; i++) {
          const locks = await pool.query(
            `SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`
          );
          lockCount2 = locks.rows[0].count;
          if (lockCount2 >= 2) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(lockCount2).toBe(2);

        await barrierClient.query('COMMIT');

        const [res1, res2] = await Promise.all([req1Promise, req2Promise]);

        expect(res1.status).toBe(200);
        expect(res2.status).toBe(200);

        const count = await pool.query(
          `SELECT count(*)::int AS n FROM friendships WHERE user1_id = LEAST('user-𐀀'::text, 'user-'::text) AND user2_id = GREATEST('user-𐀀'::text, 'user-'::text)`
        );
        expect(count.rows[0].n).toBe(1);
      } finally {
        barrierClient.release();
      }
    });
  });

  describe('3. Defect 2: ACCEPT / CANCEL / REJECT Retries, Replay & Ownership', () => {
    it('Idempotent repeated ACCEPT returns success: true without duplicate friendship', async () => {
      await pool.query(`DELETE FROM friendships WHERE user1_id = LEAST('user-𐀀'::text, 'user-'::text) AND user2_id = GREATEST('user-𐀀'::text, 'user-'::text)`);
      await pool.query(`DELETE FROM friend_requests WHERE (sender_id = 'user-𐀀' AND receiver_id = 'user-') OR (sender_id = 'user-' AND receiver_id = 'user-𐀀')`);

      const reqRes = await request(base)
        .post('/api/v1/friends/requests')
        .set('Origin', origin)
        .set('Cookie', cookieU1)
        .send({ targetUserId: 'user-' });

      const reqId = reqRes.body.requestId;

      const acc1 = await request(base)
        .patch(`/api/v1/friends/requests/${reqId}/respond`)
        .set('Origin', origin)
        .set('Cookie', cookieU2)
        .send({ action: 'ACCEPT' });

      expect(acc1.status).toBe(200);
      expect(acc1.body).toEqual({ success: true });

      const acc2 = await request(base)
        .patch(`/api/v1/friends/requests/${reqId}/respond`)
        .set('Origin', origin)
        .set('Cookie', cookieU2)
        .send({ action: 'ACCEPT' });

      expect(acc2.status).toBe(200);
      expect(acc2.body).toEqual({ success: true });

      const count = await pool.query(
        `SELECT count(*)::int AS n FROM friendships WHERE user1_id = LEAST('user-𐀀'::text, 'user-'::text) AND user2_id = GREATEST('user-𐀀'::text, 'user-'::text)`
      );
      expect(count.rows[0].n).toBe(1);
    });

    it('Opposite action (REJECT after ACCEPT) returns 422 INVALID_INPUT', async () => {
      const reqs = await pool.query(`SELECT id FROM friend_requests WHERE sender_id = 'user-𐀀' AND receiver_id = 'user-' AND status = 'ACCEPTED' LIMIT 1`);
      const reqId = reqs.rows[0].id;

      const rej = await request(base)
        .patch(`/api/v1/friends/requests/${reqId}/respond`)
        .set('Origin', origin)
        .set('Cookie', cookieU2)
        .send({ action: 'REJECT' });

      expect(rej.status).toBe(422);
      expect(rej.body.code).toBe('INVALID_INPUT');
    });

    it('Replaying old ACCEPT after friendship removal DOES NOT recreate friendship', async () => {
      const reqs = await pool.query(`SELECT id FROM friend_requests WHERE sender_id = 'user-𐀀' AND receiver_id = 'user-' AND status = 'ACCEPTED' LIMIT 1`);
      const reqId = reqs.rows[0].id;

      await request(base)
        .delete('/api/v1/friends/user-')
        .set('Origin', origin)
        .set('Cookie', cookieU1);

      const replay = await request(base)
        .patch(`/api/v1/friends/requests/${reqId}/respond`)
        .set('Origin', origin)
        .set('Cookie', cookieU2)
        .send({ action: 'ACCEPT' });

      expect(replay.status).toBe(422);

      const count = await pool.query(
        `SELECT count(*)::int AS n FROM friendships WHERE user1_id = LEAST('user-𐀀'::text, 'user-'::text) AND user2_id = GREATEST('user-𐀀'::text, 'user-'::text)`
      );
      expect(count.rows[0].n).toBe(0);
    });
  });

  describe('4. Defect 3: Request State Machine & Fresh Request ID Renewal', () => {
    it('Resending friend request after REJECT/CANCEL creates FRESH requestId', async () => {
      await pool.query(`DELETE FROM friend_requests WHERE (sender_id = 'user-a' AND receiver_id = 'user-c') OR (sender_id = 'user-c' AND receiver_id = 'user-a')`);

      const r1 = await request(base)
        .post('/api/v1/friends/requests')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ targetUserId: 'user-c' });

      expect(r1.status).toBe(200);
      const id1 = r1.body.requestId;

      await request(base)
        .patch(`/api/v1/friends/requests/${id1}/respond`)
        .set('Origin', origin)
        .set('Cookie', cookieC)
        .send({ action: 'REJECT' });

      const r2 = await request(base)
        .post('/api/v1/friends/requests')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ targetUserId: 'user-c' });

      expect(r2.status).toBe(200);
      const id2 = r2.body.requestId;

      expect(id2).not.toBe(id1);
      expect(r2.body.status).toBe('PENDING');

      const staleResp = await request(base)
        .patch(`/api/v1/friends/requests/${id1}/respond`)
        .set('Origin', origin)
        .set('Cookie', cookieC)
        .send({ action: 'ACCEPT' });

      expect([404, 422]).toContain(staleResp.status);

      const validResp = await request(base)
        .patch(`/api/v1/friends/requests/${id2}/respond`)
        .set('Origin', origin)
        .set('Cookie', cookieC)
        .send({ action: 'ACCEPT' });

      expect(validResp.status).toBe(200);

      await request(base)
        .delete('/api/v1/friends/user-c')
        .set('Origin', origin)
        .set('Cookie', cookieA);
    });
  });

  describe('5. Defect 4: Session Revocation & Ban Recheck INSIDE Transaction', () => {
    it('Revoked session or BAN while waiting on advisory lock fails with 401/403 and ZERO mutations', async () => {
      const barrierClient = await pool.connect();
      try {
        await barrierClient.query('BEGIN');
        await barrierClient.query(
          `SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_social_pair', LEAST($1::text, $2::text), GREATEST($1::text, $2::text))::text, 0::bigint))`,
          ['user-a', 'user-c']
        );

        // Eager request promise
        const sendPromise = request(base)
          .post('/api/v1/friends/requests')
          .set('Origin', origin)
          .set('Cookie', cookieA)
          .send({ targetUserId: 'user-c' })
          .then((res) => res);

        let lockWaiter = 0;
        for (let i = 0; i < 30; i++) {
          const locks = await pool.query(
            `SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`
          );
          lockWaiter = locks.rows[0].count;
          if (lockWaiter >= 1) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(lockWaiter).toBe(1);

        // Revoke session in DB after waiter is observed waiting inside transaction
        await pool.query(`UPDATE "session" SET expires_at = clock_timestamp() - interval '1 millisecond' WHERE id = 'session-a'`);

        await barrierClient.query('COMMIT');

        const sendResult = await sendPromise;
        expect(sendResult.status).toBe(401);

        const count = await pool.query(
          `SELECT count(*)::int AS n FROM friend_requests WHERE sender_id = 'user-a' AND receiver_id = 'user-c' AND status = 'PENDING'`
        );
        expect(count.rows[0].n).toBe(0);
      } finally {
        // Restore session-a row robustly via ON CONFLICT DO UPDATE
        await pool.query(`
          INSERT INTO "session"(id, user_id, token, expires_at, created_at, updated_at)
          VALUES('session-a', 'user-a', 'token-a', now() + interval '1 day', now(), now())
          ON CONFLICT (id) DO UPDATE SET user_id = 'user-a', token = 'token-a', expires_at = now() + interval '1 day', updated_at = now()
        `);
        barrierClient.release();
      }
    });
  });

  describe('6. Defect 5: PostgreSQL Canonical Order (LEAST / GREATEST)', () => {
    it('Demonstrates JS UTF-16 comparison differs from SQL LEAST/GREATEST on non-BMP supplementary character pair', async () => {
      const id1 = 'user-𐀀'; // U+10000 non-BMP supplementary character
      const id2 = 'user-'; // U+E000 BMP character

      // Prove JS comparison differs from SQL LEAST
      const jsLeast = id1 < id2 ? id1 : id2;
      const sqlLeastRes = await pool.query(`SELECT (LEAST($1::text, $2::text) = $1::text) AS is_id1_least`, [id1, id2]);
      const sqlIsId1Least = sqlLeastRes.rows[0].is_id1_least;

      // Assert JS order vs SQL order are different
      expect(jsLeast === id1).not.toBe(sqlIsId1Least);

      // Perform DM creation
      const dm = await request(base)
        .post('/api/v1/direct-conversations')
        .set('Origin', origin)
        .set('Cookie', cookieU1)
        .send({ recipientUserId: 'user-' });

      expect(dm.status).toBe(200);

      // Verify canonical DB row uses SQL LEAST/GREATEST order
      const convRow = (await pool.query(`SELECT user1_id, user2_id FROM conversations WHERE id = $1`, [dm.body.conversationId])).rows[0];
      const sqlPair = (await pool.query(`SELECT LEAST($1::text, $2::text) AS l, GREATEST($1::text, $2::text) AS g`, [id1, id2])).rows[0];

      expect(convRow.user1_id).toBe(sqlPair.l);
      expect(convRow.user2_id).toBe(sqlPair.g);
    });
  });

  describe('7. Defect 6: Cursor Parsing & Malformed Input Handling', () => {
    it('Malformed date/cursor returns 422 INVALID_INPUT rather than 500', async () => {
      const badCursor = Buffer.from(JSON.stringify({ createdAt: 'not-a-date', id: '123' })).toString('base64url');

      const res = await request(base)
        .get(`/api/v1/friends?cursor=${badCursor}`)
        .set('Cookie', cookieA);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_INPUT');
    });
  });

  describe('8. Defect 8: Real Eager Advisory Lock Barrier (POST /blocks vs DM POST message)', () => {
    it('Holds pair lock, queues eager POST /blocks and eager DM POST message, verifies pg_locks NOT granted waiters = 2', async () => {
      await pool.query(`DELETE FROM blocks WHERE (blocker_id = 'user-a' AND blocked_id = 'user-c') OR (blocker_id = 'user-c' AND blocked_id = 'user-a')`);

      const dm = await request(base)
        .post('/api/v1/direct-conversations')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ recipientUserId: 'user-c' });

      const conversationId = dm.body.conversationId;

      const barrierClient = await pool.connect();
      try {
        await barrierClient.query('BEGIN');
        await barrierClient.query(
          `SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_social_pair', LEAST($1::text, $2::text), GREATEST($1::text, $2::text))::text, 0::bigint))`,
          ['user-a', 'user-c']
        );

        // Eager Promise 1: POST /blocks (waiter 1)
        const blockPromise = request(base)
          .post('/api/v1/blocks')
          .set('Origin', origin)
          .set('Cookie', cookieA)
          .send({ blockedId: 'user-c' })
          .then((res) => res);

        let lockCount1 = 0;
        for (let i = 0; i < 30; i++) {
          const locks = await pool.query(
            `SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`
          );
          lockCount1 = locks.rows[0].count;
          if (lockCount1 >= 1) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(lockCount1).toBe(1);

        // Eager Promise 2: POST /conversations/:id/messages (waiter 2)
        const msgPromise = request(base)
          .post(`/api/v1/conversations/${conversationId}/messages`)
          .set('Origin', origin)
          .set('Cookie', cookieC)
          .send({ content: 'Hello after block', clientMessageId: 'msg-client-block-race-1' })
          .then((res) => res);

        let lockCount2 = 0;
        for (let i = 0; i < 30; i++) {
          const locks = await pool.query(
            `SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`
          );
          lockCount2 = locks.rows[0].count;
          if (lockCount2 >= 2) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(lockCount2).toBe(2);

        await barrierClient.query('COMMIT');

        const [blockRes, msgRes] = await Promise.all([blockPromise, msgPromise]);

        expect(blockRes.status).toBe(200);
        expect(msgRes.status).toBe(403);

        // Full snapshot verification across tables
        const msgSnapshot = await pool.query(
          `SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1 AND client_message_id = 'msg-client-block-race-1'`,
          [conversationId]
        );
        expect(msgSnapshot.rows[0].n).toBe(0);

        const outboxSnapshot = await pool.query(
          `SELECT count(*)::int AS n FROM realtime_outbox WHERE conversation_id = $1`,
          [conversationId]
        );
        expect(outboxSnapshot.rows[0].n).toBe(0);
      } finally {
        await pool.query(
          `DELETE FROM blocks WHERE (blocker_id = 'user-a' AND blocked_id = 'user-c') OR (blocker_id = 'user-c' AND blocked_id = 'user-a')`
        );
        barrierClient.release();
      }
    });
  });

  describe('9. Defect 9 & Additional Security & ACL Coverage', () => {
    it('Guest REST requests return 401', async () => {
      const res = await request(base).get('/api/v1/friends');
      expect(res.status).toBe(401);
    });

    it('Non-onboarded user mutations return 403 FORBIDDEN', async () => {
      const res = await request(base)
        .post('/api/v1/friends/requests')
        .set('Origin', origin)
        .set('Cookie', cookieNonOnboarded)
        .send({ targetUserId: 'user-a' });

      expect(res.status).toBe(403);
    });

    it('Banned user mutations return 403 FORBIDDEN', async () => {
      const res = await request(base)
        .post('/api/v1/friends/requests')
        .set('Origin', origin)
        .set('Cookie', cookieBanned)
        .send({ targetUserId: 'user-a' });

      expect(res.status).toBe(403);
    });

    it('CSRF missing Origin header returns 403 FORBIDDEN', async () => {
      const res = await request(base)
        .post('/api/v1/friends/requests')
        .set('Cookie', cookieA)
        .send({ targetUserId: 'user-b' });

      expect(res.status).toBe(403);
    });

    it('Guest Socket.IO DM subscribe returns ok: false', async () => {
      await pool.query(
        `DELETE FROM blocks WHERE (blocker_id = 'user-a' AND blocked_id = 'user-c') OR (blocker_id = 'user-c' AND blocked_id = 'user-a')`
      );

      const dm = await request(base)
        .post('/api/v1/direct-conversations')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ recipientUserId: 'user-c' });

      expect(dm.status).toBe(200);
      const conversationId = dm.body.conversationId;

      const guestSocket = await connectSocket();
      const ack = await guestSocket
        .timeout(2000)
        .emitWithAck(SocketEventNames.CONVERSATION_SUBSCRIBE, { conversationId });

      const parsed = SocketConversationAckSchema.parse(ack);
      expect(parsed.ok).toBe(false);
    });

    it('Real Socket.IO DM subscribe ACL: outsider denied, participant allowed', async () => {
      await pool.query(
        `DELETE FROM blocks WHERE (blocker_id = 'user-a' AND blocked_id = 'user-c') OR (blocker_id = 'user-c' AND blocked_id = 'user-a')`
      );

      const dm = await request(base)
        .post('/api/v1/direct-conversations')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ recipientUserId: 'user-c' });

      expect(dm.status).toBe(200);
      const conversationId = dm.body.conversationId;

      const socketOutsider = await connectSocket(cookieB);
      const ackOutsider = await socketOutsider
        .timeout(2000)
        .emitWithAck(SocketEventNames.CONVERSATION_SUBSCRIBE, { conversationId });

      const parsedOutsider = SocketConversationAckSchema.parse(ackOutsider);
      expect(parsedOutsider.ok).toBe(false);

      const socketMember = await connectSocket(cookieA);
      const ackMember = await socketMember
        .timeout(2000)
        .emitWithAck(SocketEventNames.CONVERSATION_SUBSCRIBE, { conversationId });

      const parsedMember = SocketConversationAckSchema.parse(ackMember);
      expect(parsedMember.ok).toBe(true);
    });

    it('DM history remains accessible to participant after block', async () => {
      await pool.query(
        `DELETE FROM blocks WHERE (blocker_id = 'user-a' AND blocked_id = 'user-c') OR (blocker_id = 'user-c' AND blocked_id = 'user-a')`
      );

      const dm = await request(base)
        .post('/api/v1/direct-conversations')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ recipientUserId: 'user-c' });

      expect(dm.status).toBe(200);
      const conversationId = dm.body.conversationId;

      try {
        await request(base)
          .post('/api/v1/blocks')
          .set('Origin', origin)
          .set('Cookie', cookieA)
          .send({ blockedId: 'user-c' });

        const historyRes = await request(base)
          .get(`/api/v1/conversations/${conversationId}/messages`)
          .set('Cookie', cookieC);

        expect(historyRes.status).toBe(200);
      } finally {
        await pool.query(
          `DELETE FROM blocks WHERE (blocker_id = 'user-a' AND blocked_id = 'user-c') OR (blocker_id = 'user-c' AND blocked_id = 'user-a')`
        );
      }
    });

    it('Reverse block delete ownership: unblock removes ONLY caller->target block', async () => {
      await request(base)
        .post('/api/v1/blocks')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ blockedId: 'user-c' });

      await request(base)
        .post('/api/v1/blocks')
        .set('Origin', origin)
        .set('Cookie', cookieC)
        .send({ blockedId: 'user-a' });

      await request(base)
        .delete('/api/v1/blocks/user-c')
        .set('Origin', origin)
        .set('Cookie', cookieA);

      const blockCount = await pool.query(
        `SELECT count(*)::int AS n FROM blocks WHERE blocker_id = 'user-c' AND blocked_id = 'user-a'`
      );
      expect(blockCount.rows[0].n).toBe(1);

      await request(base)
        .delete('/api/v1/blocks/user-a')
        .set('Origin', origin)
        .set('Cookie', cookieC);
    });

    it('Self actions (friend request, DM, block) return 422 INVALID_INPUT', async () => {
      const fSelf = await request(base)
        .post('/api/v1/friends/requests')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ targetUserId: 'user-a' });
      expect(fSelf.status).toBe(422);

      const dmSelf = await request(base)
        .post('/api/v1/direct-conversations')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ recipientUserId: 'user-a' });
      expect(dmSelf.status).toBe(422);

      const bSelf = await request(base)
        .post('/api/v1/blocks')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ blockedId: 'user-a' });
      expect(bSelf.status).toBe(422);
    });

    it('Unknown target user IDs return 404 NOT_FOUND', async () => {
      const fUnknown = await request(base)
        .post('/api/v1/friends/requests')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ targetUserId: 'user-unknown-999' });
      expect(fUnknown.status).toBe(404);

      const dmUnknown = await request(base)
        .post('/api/v1/direct-conversations')
        .set('Origin', origin)
        .set('Cookie', cookieA)
        .send({ recipientUserId: 'user-unknown-999' });
      expect(dmUnknown.status).toBe(404);
    });
  });
});
