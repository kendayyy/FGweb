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
import * as schema from '@fg/database';
import {
  RoomSchema,
  RoomMemberSchema,
  ErrorCode,
  createPageSchema,
} from '@fg/contracts';
import { AppModule } from '../src/app.module.js';
import { createSignedSessionCookie } from './test-cookie-helper.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const origin = 'http://localhost:5173';
const secret = 't18-rooms-test-secret-at-least-32-chars';

jest.setTimeout(60000);

describe('T18 Room Management, Members & Ownership Integration', () => {
  let app: INestApplication;
  let pool: pg.Pool;
  let base: string;
  const owned = `t18_rooms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const savedEnv = { ...process.env };

  let cookieOwner: string;
  let cookieMember: string;
  let cookieOutsider: string;
  let cookieUnonboarded: string;
  let cookieBanned: string;

  let gameId: string;
  let gameTitle: string;

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

    const gameRow = (await pool.query('SELECT id, title FROM games WHERE title = $1 LIMIT 1', ['Valorant'])).rows[0];
    gameId = gameRow.id;
    gameTitle = gameRow.title;

    await pool.query(`
      INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES
      ('user-owner', 'OwnerUser', 'owner@example.com', true, now(), now()),
      ('user-member', 'MemberUser', 'member@example.com', true, now(), now()),
      ('user-outsider', 'OutsiderUser', 'outsider@example.com', true, now(), now()),
      ('user-unonboarded', 'UnonboardedUser', 'unonboarded@example.com', true, now(), now()),
      ('user-banned', 'BannedUser', 'banned@example.com', true, now(), now())
    `);

    await pool.query(`
      INSERT INTO profiles(user_id, display_name, created_at, updated_at) VALUES
      ('user-owner', 'OwnerGamer', now(), now()),
      ('user-member', 'MemberGamer', now(), now()),
      ('user-outsider', 'OutsiderGamer', now(), now()),
      ('user-banned', 'BannedGamer', now(), now())
    `);

    await pool.query(`
      INSERT INTO game_interests(id, user_id, game_id) VALUES
      ('gi-owner', 'user-owner', $1),
      ('gi-member', 'user-member', $1),
      ('gi-outsider', 'user-outsider', $1),
      ('gi-banned', 'user-banned', $1)
    `, [gameId]);

    await pool.query(`
      INSERT INTO admin_actions(id, target_user_id, action, reason, actor_id, created_at) VALUES
      ('ban-action-1', 'user-banned', 'BAN', 'Test ban', 'user-owner', now())
    `);

    await pool.query(`
      INSERT INTO session(id, user_id, token, expires_at, created_at, updated_at) VALUES
      ('session-owner', 'user-owner', 'tok-owner', now() + interval '1 day', now(), now()),
      ('session-member', 'user-member', 'tok-member', now() + interval '1 day', now(), now()),
      ('session-outsider', 'user-outsider', 'tok-outsider', now() + interval '1 day', now(), now()),
      ('session-unonboarded', 'user-unonboarded', 'tok-unonboarded', now() + interval '1 day', now(), now()),
      ('session-banned', 'user-banned', 'tok-banned', now() + interval '1 day', now(), now())
    `);

    Object.assign(process.env, {
      DATABASE_URL: connection.href,
      REDIS_URL: env.REDIS_URL,
      PUBLIC_ORIGIN: origin,
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: secret,
      DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID,
      DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET,
    });

    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'], abortOnError: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();

    cookieOwner = await createSignedSessionCookie(secret, 'tok-owner');
    cookieMember = await createSignedSessionCookie(secret, 'tok-member');
    cookieOutsider = await createSignedSessionCookie(secret, 'tok-outsider');
    cookieUnonboarded = await createSignedSessionCookie(secret, 'tok-unonboarded');
    cookieBanned = await createSignedSessionCookie(secret, 'tok-banned');
  });

  afterAll(async () => {
    const errors: Error[] = [];

    if (app) {
      try {
        await app.close();
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }

    if (pool) {
      try {
        if (/^t18_rooms_[0-9]+_[a-z0-9]+$/.test(owned)) {
          await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
          const checkRes = await pool.query(
            `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
            [owned]
          );
          if ((checkRes.rowCount ?? 0) > 0) {
            errors.push(new Error(`Owned schema ${owned} was not removed`));
          }
        } else {
          errors.push(new Error(`Invalid owned schema name: ${owned}`));
        }
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      } finally {
        try {
          await pool.end();
        } catch (err) {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    process.env = savedEnv;

    if (errors.length > 0) {
      throw new Error(`Cleanup failed with ${errors.length} error(s):\n` + errors.map(e => e.stack || e.message).join('\n'));
    }
  });

  async function createTestRoomSql(options: {
    id?: string;
    name?: string;
    ownerId?: string;
    visibility?: string;
  } = {}) {
    const rId = options.id || `room_${Math.random().toString(36).substring(2, 10)}`;
    const cId = `conv_${Math.random().toString(36).substring(2, 10)}`;
    const ownerId = options.ownerId || 'user-owner';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO conversations(id, kind, created_at, updated_at) VALUES ($1, 'ROOM', now(), now())`,
        [cId]
      );
      await client.query(
        `INSERT INTO rooms(id, name, description, game_id, owner_id, owner_role, visibility, invite_policy, player_capacity, conversation_id, conversation_kind, created_at, updated_at)
         VALUES ($1, $2, 'Test room desc', $3, $4, 'OWNER', $5, 'OWNER_APPROVAL', 5, $6, 'ROOM', now(), now())`,
        [rId, options.name || 'SQL Test Room', gameId, ownerId, options.visibility || 'PUBLIC', cId]
      );
      await client.query(
        `INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES ($1, $2, $3, 'OWNER', now())`,
        [`rm_${rId}_owner`, rId, ownerId]
      );
      await client.query(
        `INSERT INTO conversation_members(id, conversation_id, user_id, joined_at) VALUES ($1, $2, $3, now())`,
        [`cm_${rId}_owner`, cId, ownerId]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return { roomId: rId, conversationId: cId, ownerId };
  }

  describe('POST /api/v1/rooms', () => {
    it('rejects guest with 401 LOGIN_REQUIRED', async () => {
      const res = await request(base)
        .post('/api/v1/rooms')
        .set('Origin', origin)
        .set('x-csrf-token', '1')
        .send({
          name: 'Guest Room',
          gameId,
          gameTitle,
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(ErrorCode.LOGIN_REQUIRED);
    });

    it('rejects unonboarded user with 403 FORBIDDEN', async () => {
      const res = await request(base)
        .post('/api/v1/rooms')
        .set('Origin', origin)
        .set('Cookie', cookieUnonboarded)
        .set('x-csrf-token', '1')
        .send({
          name: 'Unonboarded Room',
          gameId,
          gameTitle,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('rejects banned user with 403 FORBIDDEN', async () => {
      const res = await request(base)
        .post('/api/v1/rooms')
        .set('Origin', origin)
        .set('Cookie', cookieBanned)
        .set('x-csrf-token', '1')
        .send({
          name: 'Banned Room',
          gameId,
          gameTitle,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('rejects invalid gameId with 422 INVALID_INPUT', async () => {
      const res = await request(base)
        .post('/api/v1/rooms')
        .set('Origin', origin)
        .set('Cookie', cookieOwner)
        .set('x-csrf-token', '1')
        .send({
          name: 'Invalid Game Room',
          gameId: 'non-existent-game-id',
          gameTitle: 'Valorant',
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe(ErrorCode.INVALID_INPUT);
    });

    it('creates room successfully and sets owner membership & conversation', async () => {
      const res = await request(base)
        .post('/api/v1/rooms')
        .set('Origin', origin)
        .set('Cookie', cookieOwner)
        .set('x-csrf-token', '1')
        .send({
          name: 'Owner Valorant Squad',
          description: 'Fun competitive matches',
          gameId,
          gameTitle,
          visibility: 'PUBLIC',
          invitePolicy: 'OWNER_APPROVAL',
          playerCapacity: 5,
        });

      expect(res.status).toBe(200);
      const room = RoomSchema.parse(res.body);
      expect(room.name).toBe('Owner Valorant Squad');
      expect(room.description).toBe('Fun competitive matches');
      expect(room.gameId).toBe(gameId);
      expect(room.gameTitle).toBe(gameTitle);
      expect(room.ownerId).toBe('user-owner');
      expect(room.settings.visibility).toBe('PUBLIC');
      expect(room.settings.playerCapacity).toBe(5);
      expect(room.memberCount).toBe(1);

      // Verify database state
      const dbRoom = (await pool.query('SELECT * FROM rooms WHERE id = $1', [room.id])).rows[0];
      expect(dbRoom).toBeDefined();
      expect(room.conversationId).toBe(dbRoom.conversation_id);
      expect(room.conversationId).not.toBe(room.id);

      const dbMembers = (await pool.query('SELECT * FROM room_members WHERE room_id = $1', [room.id])).rows;
      expect(dbMembers).toHaveLength(1);
      expect(dbMembers[0].user_id).toBe('user-owner');
      expect(dbMembers[0].role).toBe('OWNER');

      const dbConvMembers = (await pool.query('SELECT * FROM conversation_members WHERE conversation_id = $1', [dbRoom.conversation_id])).rows;
      expect(dbConvMembers).toHaveLength(1);
      expect(dbConvMembers[0].user_id).toBe('user-owner');

      // Verify authorized room owner can fetch history & send chat message using returned conversationId
      const chatHist = await request(base)
        .get(`/api/v1/conversations/${room.conversationId}/messages`)
        .set('Cookie', cookieOwner);
      expect(chatHist.status).toBe(200);

      const sendMsg = await request(base)
        .post(`/api/v1/conversations/${room.conversationId}/messages`)
        .set('Origin', origin)
        .set('Cookie', cookieOwner)
        .set('x-csrf-token', '1')
        .send({ content: 'Hello room conversation', clientMessageId: 'cmsg-owner-1' });
      expect(sendMsg.status).toBe(201);

      // Outsider cannot use returned conversationId for history or send
      const outsiderHist = await request(base)
        .get(`/api/v1/conversations/${room.conversationId}/messages`)
        .set('Cookie', cookieOutsider);
      expect(outsiderHist.status).toBe(403);

      const outsiderSend = await request(base)
        .post(`/api/v1/conversations/${room.conversationId}/messages`)
        .set('Origin', origin)
        .set('Cookie', cookieOutsider)
        .set('x-csrf-token', '1')
        .send({ content: 'Intruder message', clientMessageId: 'cmsg-outsider-1' });
      expect(outsiderSend.status).toBe(403);
    });
  });

  describe('GET /api/v1/rooms & GET /api/v1/rooms/own', () => {
    let createdRoomId: string;

    beforeAll(async () => {
      const created = await createTestRoomSql({ name: 'Listing Test Room' });
      createdRoomId = created.roomId;
    });

    it('returns own rooms for owner', async () => {
      const res = await request(base)
        .get('/api/v1/rooms/own')
        .set('Cookie', cookieOwner);

      expect(res.status).toBe(200);
      const parsed = createPageSchema(RoomSchema).parse(res.body);
      expect(parsed.items.some(r => r.id === createdRoomId)).toBe(true);
      const ownRoom = parsed.items.find(r => r.id === createdRoomId);
      expect(ownRoom).toBeDefined();
      const dbRoom = (await pool.query('SELECT conversation_id FROM rooms WHERE id = $1', [createdRoomId])).rows[0];
      expect(ownRoom?.conversationId).toBe(dbRoom.conversation_id);
      expect(ownRoom?.conversationId).not.toBe(ownRoom?.id);
    });

    it('returns empty page for user with no room memberships', async () => {
      const res = await request(base)
        .get('/api/v1/rooms')
        .set('Cookie', cookieOutsider);

      expect(res.status).toBe(200);
      const parsed = createPageSchema(RoomSchema).parse(res.body);
      expect(parsed.items.filter(r => r.id === createdRoomId)).toHaveLength(0);
    });

    it('validates malformed pagination cursor with 422 INVALID_INPUT', async () => {
      const res = await request(base)
        .get('/api/v1/rooms/own?cursor=invalid-base64-string')
        .set('Cookie', cookieOwner);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe(ErrorCode.INVALID_INPUT);
    });
  });

  describe('GET /api/v1/rooms/:id & GET /api/v1/rooms/:id/members', () => {
    let roomId: string;
    let conversationId: string;

    beforeAll(async () => {
      const created = await createTestRoomSql({ name: 'Detail Test Room' });
      roomId = created.roomId;
      conversationId = created.conversationId;

      await pool.query(
        `INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES ('rm-mem-1', $1, 'user-member', 'MEMBER', now())`,
        [roomId]
      );
      await pool.query(
        `INSERT INTO conversation_members(id, conversation_id, user_id, joined_at) VALUES ('cm-mem-1', $1, 'user-member', now())`,
        [conversationId]
      );
    });

    it('prevents outsider from viewing room detail with 403 FORBIDDEN', async () => {
      const res = await request(base)
        .get(`/api/v1/rooms/${roomId}`)
        .set('Cookie', cookieOutsider);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('allows room member to view room detail', async () => {
      const res = await request(base)
        .get(`/api/v1/rooms/${roomId}`)
        .set('Cookie', cookieMember);

      expect(res.status).toBe(200);
      const room = RoomSchema.parse(res.body);
      expect(room.id).toBe(roomId);
      expect(room.memberCount).toBe(2);
      const dbRoom = (await pool.query('SELECT conversation_id FROM rooms WHERE id = $1', [roomId])).rows[0];
      expect(room.conversationId).toBe(dbRoom.conversation_id);
      expect(room.conversationId).not.toBe(room.id);

      // Verify room member can fetch history & send chat message using returned conversationId
      const chatHist = await request(base)
        .get(`/api/v1/conversations/${room.conversationId}/messages`)
        .set('Cookie', cookieMember);
      expect(chatHist.status).toBe(200);

      const sendMsg = await request(base)
        .post(`/api/v1/conversations/${room.conversationId}/messages`)
        .set('Origin', origin)
        .set('Cookie', cookieMember)
        .set('x-csrf-token', '1')
        .send({ content: 'Member hello', clientMessageId: 'cmsg-member-1' });
      expect(sendMsg.status).toBe(201);
    });

    it('prevents outsider from viewing room members with 403 FORBIDDEN', async () => {
      const res = await request(base)
        .get(`/api/v1/rooms/${roomId}/members`)
        .set('Cookie', cookieOutsider);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('allows room member to list members', async () => {
      const res = await request(base)
        .get(`/api/v1/rooms/${roomId}/members`)
        .set('Cookie', cookieMember);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      const members = RoomMemberSchema.array().parse(res.body);
      expect(members.some((m) => m.userId === 'user-owner' && m.role === 'OWNER')).toBe(true);
      expect(members.some((m) => m.userId === 'user-member' && m.role === 'MEMBER')).toBe(true);
    });
  });

  describe('PATCH /api/v1/rooms/:id/settings & PRIVATE recruitment closure', () => {
    let roomId: string;
    let recruitmentId: string;

    beforeAll(async () => {
      const created = await createTestRoomSql({ name: 'Public Settings Room', visibility: 'PUBLIC' });
      roomId = created.roomId;

      await pool.query(
        `INSERT INTO play_sessions(id, room_id, host_user_id, timing_type, state, created_at, updated_at) VALUES ('ps-1', $1, 'user-owner', 'now', 'ACTIVE', now(), now())`
      , [roomId]);
      const recRes = await pool.query(
        `INSERT INTO recruitments(id, room_id, game_id, game_title, play_session_id, title, mode, player_capacity, current_players, timing_type, state, created_at, updated_at)
         VALUES ('rec-1', $1, $2, $3, 'ps-1', 'Recruiting now', 'Flex', 5, 1, 'now', 'OPEN', now(), now()) RETURNING id`,
        [roomId, gameId, gameTitle]
      );
      recruitmentId = recRes.rows[0].id;
    });

    it('prevents non-owner from modifying room settings', async () => {
      const res = await request(base)
        .patch(`/api/v1/rooms/${roomId}/settings`)
        .set('Origin', origin)
        .set('Cookie', cookieMember)
        .set('x-csrf-token', '1')
        .send({
          name: 'Hacked Name',
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('updates settings and atomically closes OPEN public recruitments when visibility becomes PRIVATE', async () => {
      const res = await request(base)
        .patch(`/api/v1/rooms/${roomId}/settings`)
        .set('Origin', origin)
        .set('Cookie', cookieOwner)
        .set('x-csrf-token', '1')
        .send({
          visibility: 'PRIVATE',
          playerCapacity: 8,
        });

      expect(res.status).toBe(200);
      const room = RoomSchema.parse(res.body);
      expect(room.settings.visibility).toBe('PRIVATE');
      expect(room.settings.playerCapacity).toBe(8);
      const dbRoom = (await pool.query('SELECT conversation_id FROM rooms WHERE id = $1', [roomId])).rows[0];
      expect(room.conversationId).toBe(dbRoom.conversation_id);
      expect(room.conversationId).not.toBe(room.id);

      // Verify open recruitment was automatically closed in database
      const dbRec = (await pool.query('SELECT state FROM recruitments WHERE id = $1', [recruitmentId])).rows[0];
      expect(dbRec.state).toBe('CLOSED');
    });
  });

  describe('PATCH /api/v1/rooms/:id/helpers/:userId', () => {
    let roomId: string;

    beforeAll(async () => {
      const created = await createTestRoomSql({ name: 'Helper Permissions Room' });
      roomId = created.roomId;

      await pool.query(
        `INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES ('rm-mem-h', $1, 'user-member', 'MEMBER', now())`,
        [roomId]
      );
    });

    it('rejects assigning owner-only permission (OWNER_TRANSFER) to helper with 422 INVALID_INPUT', async () => {
      const res = await request(base)
        .patch(`/api/v1/rooms/${roomId}/helpers/user-member`)
        .set('Origin', origin)
        .set('Cookie', cookieOwner)
        .set('x-csrf-token', '1')
        .send({
          permissions: ['MANAGE_CHAT', 'OWNER_TRANSFER'],
        });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe(ErrorCode.INVALID_INPUT);
    });

    it('assigns valid helper permissions', async () => {
      const res = await request(base)
        .patch(`/api/v1/rooms/${roomId}/helpers/user-member`)
        .set('Origin', origin)
        .set('Cookie', cookieOwner)
        .set('x-csrf-token', '1')
        .send({
          permissions: ['MANAGE_CHAT', 'MANAGE_RECRUITMENT'],
        });

      expect(res.status).toBe(200);
      const member = RoomMemberSchema.parse(res.body);
      expect(member.role).toBe('HELPER');
      expect(member.permissions).toEqual(expect.arrayContaining(['MANAGE_CHAT', 'MANAGE_RECRUITMENT']));

      // Verify DB permission grants
      const dbGrants = (await pool.query('SELECT permission FROM permission_grants WHERE room_id = $1 AND user_id = $2', [roomId, 'user-member'])).rows;
      expect(dbGrants.map(g => g.permission)).toEqual(expect.arrayContaining(['MANAGE_CHAT', 'MANAGE_RECRUITMENT']));
    });

    it('demotes helper back to member when permissions list is empty', async () => {
      const res = await request(base)
        .patch(`/api/v1/rooms/${roomId}/helpers/user-member`)
        .set('Origin', origin)
        .set('Cookie', cookieOwner)
        .set('x-csrf-token', '1')
        .send({
          permissions: [],
        });

      expect(res.status).toBe(200);
      const member = RoomMemberSchema.parse(res.body);
      expect(member.role).toBe('MEMBER');
      expect(member.permissions).toHaveLength(0);

      const dbGrants = (await pool.query('SELECT permission FROM permission_grants WHERE room_id = $1 AND user_id = $2', [roomId, 'user-member'])).rows;
      expect(dbGrants).toHaveLength(0);
    });
  });

  describe('POST /api/v1/rooms/:id/transfer-owner', () => {
    let roomId: string;

    beforeAll(async () => {
      const created = await createTestRoomSql({ name: 'Owner Transfer Room' });
      roomId = created.roomId;

      await pool.query(
        `INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES ('rm-mem-t', $1, 'user-member', 'MEMBER', now())`,
        [roomId]
      );
    });

    it('rejects transferring ownership to an outsider (non-member) with 403 or 422', async () => {
      const res = await request(base)
        .post(`/api/v1/rooms/${roomId}/transfer-owner`)
        .set('Origin', origin)
        .set('Cookie', cookieOwner)
        .set('x-csrf-token', '1')
        .send({
          newOwnerId: 'user-outsider',
        });

      expect([403, 422]).toContain(res.status);
    });

    it('transfers ownership to an existing member', async () => {
      const res = await request(base)
        .post(`/api/v1/rooms/${roomId}/transfer-owner`)
        .set('Origin', origin)
        .set('Cookie', cookieOwner)
        .set('x-csrf-token', '1')
        .send({
          newOwnerId: 'user-member',
        });

      expect(res.status).toBe(200);
      const room = RoomSchema.parse(res.body);
      expect(room.ownerId).toBe('user-member');
      const dbRoom = (await pool.query('SELECT conversation_id, owner_id FROM rooms WHERE id = $1', [roomId])).rows[0];
      expect(dbRoom.owner_id).toBe('user-member');
      expect(room.conversationId).toBe(dbRoom.conversation_id);
      expect(room.conversationId).not.toBe(room.id);

      const memberRows = (await pool.query('SELECT user_id, role FROM room_members WHERE room_id = $1', [roomId])).rows;
      expect(memberRows.find(m => m.user_id === 'user-member')?.role).toBe('OWNER');
      expect(memberRows.find(m => m.user_id === 'user-owner')?.role).toBe('MEMBER');

      // Verify new owner can still chat with conversationId
      const sendMsg = await request(base)
        .post(`/api/v1/conversations/${room.conversationId}/messages`)
        .set('Origin', origin)
        .set('Cookie', cookieMember)
        .set('x-csrf-token', '1')
        .send({ content: 'New owner chat', clientMessageId: 'cmsg-transfer-1' });
      expect(sendMsg.status).toBe(201);
    });
  });

  describe('DELETE /api/v1/rooms/:id/members/:userId & DELETE /api/v1/rooms/:id', () => {
    let roomId: string;
    let conversationId: string;

    beforeEach(async () => {
      const created = await createTestRoomSql({ name: 'Leave & Dissolve Test Room' });
      roomId = created.roomId;
      conversationId = created.conversationId;

      const rmId = `rm_${Math.random().toString(36).substring(2, 10)}`;
      const cmId = `cm_${Math.random().toString(36).substring(2, 10)}`;
      await pool.query(
        `INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES ($1, $2, 'user-member', 'MEMBER', now())`,
        [rmId, roomId]
      );
      await pool.query(
        `INSERT INTO conversation_members(id, conversation_id, user_id, joined_at) VALUES ($1, $2, 'user-member', now())`,
        [cmId, conversationId]
      );
    });

    it('prevents owner from leaving room when other members exist', async () => {
      const res = await request(base)
        .delete(`/api/v1/rooms/${roomId}/members/user-owner`)
        .set('Origin', origin)
        .set('Cookie', cookieOwner)
        .set('x-csrf-token', '1');

      expect([403, 409]).toContain(res.status);
    });

    it('allows non-owner member to leave room and revokes chat access', async () => {
      const res = await request(base)
        .delete(`/api/v1/rooms/${roomId}/members/user-member`)
        .set('Origin', origin)
        .set('Cookie', cookieMember)
        .set('x-csrf-token', '1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbMembers = (await pool.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, 'user-member'])).rows;
      expect(dbMembers).toHaveLength(0);

      const dbConvMembers = (await pool.query('SELECT * FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [conversationId, 'user-member'])).rows;
      expect(dbConvMembers).toHaveLength(0);

      // Verify departed member cannot fetch history or send chat message to room conversationId
      const departedHist = await request(base)
        .get(`/api/v1/conversations/${conversationId}/messages`)
        .set('Cookie', cookieMember);
      expect(departedHist.status).toBe(403);

      const departedSend = await request(base)
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Origin', origin)
        .set('Cookie', cookieMember)
        .set('x-csrf-token', '1')
        .send({ content: 'Departed member attempt', clientMessageId: 'cmsg-departed-1' });
      expect(departedSend.status).toBe(403);
    });

    it('dissolves room when sole owner leaves', async () => {
      // Remove member first so owner is sole member
      await pool.query(`DELETE FROM room_members WHERE room_id = $1 AND user_id = 'user-member'`, [roomId]);

      const res = await request(base)
        .delete(`/api/v1/rooms/${roomId}/members/user-owner`)
        .set('Origin', origin)
        .set('Cookie', cookieOwner)
        .set('x-csrf-token', '1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbRoom = (await pool.query('SELECT * FROM rooms WHERE id = $1', [roomId])).rows;
      expect(dbRoom).toHaveLength(0);
    });

    it('allows owner to dissolve room directly', async () => {
      const res = await request(base)
        .delete(`/api/v1/rooms/${roomId}`)
        .set('Origin', origin)
        .set('Cookie', cookieOwner)
        .set('x-csrf-token', '1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbRoom = (await pool.query('SELECT * FROM rooms WHERE id = $1', [roomId])).rows;
      expect(dbRoom).toHaveLength(0);
    });
  });
});
