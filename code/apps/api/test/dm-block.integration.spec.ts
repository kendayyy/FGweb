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
import { createHash } from 'node:crypto';
import request from 'supertest';
import { Redis } from 'ioredis';
import * as schema from '@fg/database';
import { ApiErrorResponseSchema, MessageSchema, createPageSchema } from '@fg/contracts';
import { AppModule } from '../src/app.module.js';
import * as ChatServiceModule from '../src/modules/chat/chat.service.js';
import { createSignedSessionCookie } from './test-cookie-helper.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const origin = 'http://localhost:5173';
const secret = 't12-fix1-dm-block-test-secret-at-least-32-chars';

jest.setTimeout(25000);

describe('T12-FIX1 DM block policy enforcement and canonical pair lock', () => {
  let app: INestApplication, pool: pg.Pool, base: string, redis: Redis;
  const owned = `t12_fix1_spec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const envBackup = { ...process.env };
  let games: Awaited<ReturnType<typeof schema.seedGames>>;
  let cookieA: string;
  let cookieB: string;
  let cookieOutsider: string;
  let ns: string;

  beforeAll(async () => {
    const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
    if (!env.DATABASE_URL || !env.REDIS_URL) throw new Error('Local DATABASE_URL and REDIS_URL required');

    const connection = new URL(env.DATABASE_URL);
    connection.searchParams.set('options', `-c search_path=${owned}`);
    ns = createHash('sha256')
      .update(JSON.stringify([connection.host, connection.pathname, connection.searchParams.get('options') ?? '']))
      .digest('hex')
      .slice(0, 16);

    pool = new pg.Pool({ connectionString: connection.href, max: 10, connectionTimeoutMillis: 5000 });
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

    games = await schema.seedGames(drizzle(pool, { schema }));
    await pool.query(`INSERT INTO conversations(id,kind,lobby_id) SELECT id,'LOBBY',id FROM lobbies`);

    // Create synthetic users A, B, and Outsider C
    await pool.query(`
      INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at)
      VALUES
        ('user-a','Alice','alice@example.com',true,now(),now()),
        ('user-b','Bob','bob@example.com',true,now(),now()),
        ('user-c','Charlie','charlie@example.com',true,now(),now())
    `);
    await pool.query(`
      INSERT INTO profiles(user_id,display_name)
      VALUES
        ('user-a','Alice'),
        ('user-b','Bob'),
        ('user-c','Charlie')
    `);
    await pool.query(`
      INSERT INTO game_interests(id,user_id,game_id)
      VALUES
        ('int-a','user-a',$1),
        ('int-b','user-b',$1),
        ('int-c','user-c',$1)
    `, [games[0].id]);
    await pool.query(`
      INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at)
      VALUES
        ('sess-a','user-a','tok-a',now()+interval '1 day',now(),now()),
        ('sess-b','user-b','tok-b',now()+interval '1 day',now(),now()),
        ('sess-c','user-c','tok-c',now()+interval '1 day',now(),now())
    `);

    cookieA = await createSignedSessionCookie(secret, 'tok-a');
    cookieB = await createSignedSessionCookie(secret, 'tok-b');
    cookieOutsider = await createSignedSessionCookie(secret, 'tok-c');

    // Create DM conversation between user-a and user-b
    await pool.query(`
      INSERT INTO conversations(id,kind,user1_id,user2_id)
      VALUES('dm-ab','DM','user-a','user-b')
    `);
    await pool.query(`
      INSERT INTO conversation_members(id,conversation_id,user_id)
      VALUES
        ('mem-a','dm-ab','user-a'),
        ('mem-b','dm-ab','user-b')
    `);
    await pool.query(`
      INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id,created_at)
      VALUES('old-msg-1','dm-ab','user-a','Hello Bob before any blocks','old-client-1',now()-interval '1 hour')
    `);

    Object.assign(process.env, {
      DATABASE_URL: connection.href,
      REDIS_URL: env.REDIS_URL,
      PUBLIC_ORIGIN: origin,
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: secret,
      DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID,
      DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET,
      FG_UPLOADS_DIR: path.resolve(root, '.runtime', owned),
    });

    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();

    redis = new Redis(env.REDIS_URL, { lazyConnect: true });
    await redis.connect();
  }, 60000);

  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      if (app) await app.close();
    } catch (err) {
      errors.push(err);
    }
    if (redis) {
      try {
        const keys = await redis.keys(`fg:presence:${ns}:*`);
        if (keys.length) await redis.del(...keys);
      } catch (err) {
        errors.push(err);
      } finally {
        redis.disconnect();
      }
    }
    if (pool) {
      try {
        if (!/^t12_fix1_spec_[0-9]+_[a-z0-9]+$/.test(owned)) throw new Error('Invalid owned schema name');
        await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
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
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, envBackup);

    if (errors.length) throw new AggregateError(errors, 'Integration teardown failed');
  }, 30000);

  const postMsg = (conversationId: string, body: object, session = cookieA) =>
    request(base)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Origin', origin)
      .set('Cookie', session)
      .send(body);

  const getHistory = (conversationId: string, session = cookieA) =>
    request(base)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Cookie', session);

  const countTable = async (table: string) => {
    const res = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${table}"`);
    return res.rows[0].n;
  };

  it('exports lockSocialPair helper on ChatService module', () => {
    expect(typeof ChatServiceModule.lockSocialPair).toBe('function');
  });

  it('rejects DM write when peer blocks actor (User B blocks User A) with FORBIDDEN 403 and zero DB side-effects', async () => {
    await pool.query(`DELETE FROM blocks`);
    await pool.query(`INSERT INTO blocks(id,blocker_id,blocked_id) VALUES('blk-ba','user-b','user-a')`);
    try {
      const msgCountBefore = await countTable('messages');
      const outboxCountBefore = await countTable('realtime_outbox');

      const res = await postMsg('dm-ab', { content: 'Blocked message attempt from A', clientMessageId: 'attempt-a-1' }, cookieA);

      expect(res.status).toBe(403);
      expect(ApiErrorResponseSchema.parse(res.body).code).toBe('FORBIDDEN');

      expect(await countTable('messages')).toBe(msgCountBefore);
      expect(await countTable('realtime_outbox')).toBe(outboxCountBefore);
    } finally {
      await pool.query(`DELETE FROM blocks`);
    }
  });

  it('rejects DM write when actor blocks peer (User A blocks User B) with FORBIDDEN 403', async () => {
    await pool.query(`DELETE FROM blocks`);
    await pool.query(`INSERT INTO blocks(id,blocker_id,blocked_id) VALUES('blk-ab','user-a','user-b')`);
    try {
      const msgCountBefore = await countTable('messages');
      const outboxCountBefore = await countTable('realtime_outbox');

      // Blocking actor (user-a) sends using cookieA to user-b
      const res = await postMsg('dm-ab', { content: 'Blocked message attempt from blocker A', clientMessageId: 'attempt-blocker-a' }, cookieA);

      expect(res.status).toBe(403);
      expect(ApiErrorResponseSchema.parse(res.body).code).toBe('FORBIDDEN');

      expect(await countTable('messages')).toBe(msgCountBefore);
      expect(await countTable('realtime_outbox')).toBe(outboxCountBefore);
    } finally {
      await pool.query(`DELETE FROM blocks`);
    }
  });

  it('blocked retries produce zero writes, attachment claims, or outbox effects', async () => {
    await pool.query(`DELETE FROM blocks`);
    await pool.query(`DELETE FROM pending_image_uploads WHERE id='draft-test-a'`);
    await pool.query(`
      INSERT INTO pending_image_uploads(id,uploader_id,conversation_id,file_name,file_size,mime_type,expires_at)
      VALUES('draft-test-a','user-a','dm-ab','synthetic.webp',8,'image/webp',now()+interval '1 day')
    `);
    await pool.query(`INSERT INTO blocks(id,blocker_id,blocked_id) VALUES('blk-ba-retry','user-b','user-a')`);
    try {
      const draftBefore = await pool.query(`SELECT * FROM pending_image_uploads WHERE id='draft-test-a'`);
      expect(draftBefore.rowCount).toBe(1);
      const attachmentsBefore = await countTable('attachments');
      const messagesBefore = await countTable('messages');
      const outboxBefore = await countTable('realtime_outbox');

      const clientMsgId = 'retry-client-msg-id';
      const body = { content: 'Retry with image', clientMessageId: clientMsgId, attachmentIds: ['draft-test-a'] };
      const res1 = await postMsg('dm-ab', body, cookieA);
      const res2 = await postMsg('dm-ab', body, cookieA);

      expect(res1.status).toBe(403);
      expect(ApiErrorResponseSchema.parse(res1.body).code).toBe('FORBIDDEN');
      expect(res2.status).toBe(403);
      expect(ApiErrorResponseSchema.parse(res2.body).code).toBe('FORBIDDEN');

      expect(await countTable('attachments')).toBe(attachmentsBefore);
      expect(await countTable('messages')).toBe(messagesBefore);
      expect(await countTable('realtime_outbox')).toBe(outboxBefore);

      const draftAfter = await pool.query(`SELECT * FROM pending_image_uploads WHERE id='draft-test-a'`);
      expect(draftAfter.rowCount).toBe(1);
      expect(draftAfter.rows[0]).toEqual(draftBefore.rows[0]);
    } finally {
      await pool.query(`DELETE FROM blocks`);
      await pool.query(`DELETE FROM pending_image_uploads WHERE id='draft-test-a'`);
    }
  });

  it('preserves historical read access and membership while active block exists', async () => {
    await pool.query(`DELETE FROM blocks`);
    await pool.query(`INSERT INTO blocks(id,blocker_id,blocked_id) VALUES('blk-ba-hist','user-b','user-a')`);
    try {
      const resA = await getHistory('dm-ab', cookieA);
      expect(resA.status).toBe(200);
      const pageA = createPageSchema(MessageSchema).parse(resA.body);
      expect(pageA.items.some(m => m.id === 'old-msg-1')).toBe(true);

      const resB = await getHistory('dm-ab', cookieB);
      expect(resB.status).toBe(200);
      const pageB = createPageSchema(MessageSchema).parse(resB.body);
      expect(pageB.items.some(m => m.id === 'old-msg-1')).toBe(true);

      const members = await pool.query(`SELECT user_id FROM conversation_members WHERE conversation_id='dm-ab'`);
      expect(members.rows.map(r => r.user_id).sort()).toEqual(['user-a', 'user-b']);
    } finally {
      await pool.query(`DELETE FROM blocks`);
    }
  });

  it('permits writes after unblocking and deduplicates replay correctly', async () => {
    await pool.query(`DELETE FROM blocks`);

    const clientMsgId = 'unblocked-success-id';
    const res1 = await postMsg('dm-ab', { content: 'Hello after unblock', clientMessageId: clientMsgId }, cookieA);
    expect(res1.status).toBe(201);
    const created = MessageSchema.parse(res1.body);

    const res2 = await postMsg('dm-ab', { content: 'Hello after unblock', clientMessageId: clientMsgId }, cookieA);
    expect(res2.status).toBe(201);
    const replayed = MessageSchema.parse(res2.body);
    expect(replayed.id).toBe(created.id);

    const rows = await pool.query(`SELECT id FROM messages WHERE client_message_id=$1`, [clientMsgId]);
    expect(rows.rowCount).toBe(1);
  });

  it('denies unauthenticated guests (401) and non-participant outsiders (403)', async () => {
    const guestRes = await request(base)
      .post('/api/v1/conversations/dm-ab/messages')
      .set('Origin', origin)
      .send({ content: 'Guest message', clientMessageId: 'guest-1' });
    expect(guestRes.status).toBe(401);

    const outsiderRes = await postMsg('dm-ab', { content: 'Outsider message', clientMessageId: 'outsider-1' }, cookieOutsider);
    expect(outsiderRes.status).toBe(403);
    expect(ApiErrorResponseSchema.parse(outsiderRes.body).code).toBe('FORBIDDEN');
  });

  it('Lobby conversations allow messages even if author is blocked by another user', async () => {
    const lobbyId = games[0].lobbyId;
    await pool.query(`DELETE FROM blocks`);
    await pool.query(`INSERT INTO blocks(id,blocker_id,blocked_id) VALUES('blk-ba-lobby','user-b','user-a')`);
    try {
      const res = await postMsg(lobbyId, { content: 'Lobby text from blocked author', clientMessageId: 'lobby-blocked-author' }, cookieA);
      expect(res.status).toBe(201);
      expect(MessageSchema.parse(res.body).content).toBe('Lobby text from blocked author');
    } finally {
      await pool.query(`DELETE FROM blocks`);
    }
  });

  it('serializes concurrent write behind a pair-lock transaction inserting a block (PostgreSQL locks barrier)', async () => {
    await pool.query(`DELETE FROM blocks`);
    const blockerConn = await pool.connect();
    let writePromise: Promise<Response> | null = null;
    try {
      await blockerConn.query('BEGIN');
      await ChatServiceModule.lockSocialPair(blockerConn, 'user-b', 'user-a');
      await blockerConn.query(`INSERT INTO blocks(id,blocker_id,blocked_id) VALUES('blk-race','user-b','user-a')`);

      const heldLocks = (
        await blockerConn.query<{ classid: string; objid: string; objsubid: number }>(`
          SELECT classid::text, objid::text, objsubid
          FROM pg_locks
          WHERE locktype='advisory' AND pid=pg_backend_pid() AND granted
        `)
      ).rows;
      expect(heldLocks.length).toBe(1);
      const lockKey = heldLocks[0];

      writePromise = fetch(`${base}/api/v1/conversations/dm-ab/messages`, {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: cookieA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: 'Racing message', clientMessageId: 'race-msg-1' }),
      });

      let waiting = 0;
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const waitRes = await pool.query<{ n: number }>(`
          SELECT count(*)::int AS n
          FROM pg_locks
          WHERE locktype='advisory' AND NOT granted AND classid=$1::oid AND objid=$2::oid AND objsubid=$3
            AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
        `, [lockKey.classid, lockKey.objid, lockKey.objsubid]);
        waiting = waitRes.rows[0].n;
        if (waiting > 0) break;
        await new Promise(r => setTimeout(r, 25));
      }

      expect(waiting).toBeGreaterThan(0);

      await blockerConn.query('COMMIT');

      const res = await writePromise;
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(ApiErrorResponseSchema.parse(body).code).toBe('FORBIDDEN');

      const raceMsg = await pool.query(`SELECT id FROM messages WHERE client_message_id='race-msg-1'`);
      expect(raceMsg.rowCount).toBe(0);
    } catch (err) {
      await blockerConn.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      blockerConn.release();
      if (writePromise) await writePromise.catch(() => undefined);
      await pool.query(`DELETE FROM blocks WHERE id='blk-race'`).catch(() => undefined);
    }
  });

  it('fails closed when user session expires or is revoked', async () => {
    await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('sess-rev','user-a','tok-rev',now()+interval '1 day',now(),now())`);
    const revCookie = await createSignedSessionCookie(secret, 'tok-rev');

    await pool.query(`DELETE FROM "session" WHERE id='sess-rev'`);

    const res = await postMsg('dm-ab', { content: 'Revoked session attempt', clientMessageId: 'revoked-1' }, revCookie);
    expect(res.status).toBe(401);
    expect(ApiErrorResponseSchema.parse(res.body).code).toBe('LOGIN_REQUIRED');
  });
});
