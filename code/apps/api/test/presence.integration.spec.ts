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
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io } from 'socket.io-client';
import { Redis } from 'ioredis';
import * as schema from '@fg/database';
import {
  PublicProfileSchema,
  UpdateCustomStatusResponseSchema,
  SocketScopedPresenceChangedPayloadSchema,
  PRESENCE_TTL_MS,
} from '@fg/contracts';
import { AppModule } from '../src/app.module.js';
import { PresenceService } from '../src/modules/presence/presence.service.js';
import { createSignedSessionCookie } from './test-cookie-helper.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const owned = `t16_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const origin = 'http://localhost:5173';
const secret = 't16-local-test-secret-at-least-32-characters';

jest.setTimeout(30000);

describe('T16 Actual Online Presence & Custom Status Integration Suite', () => {
  let pool: pg.Pool;
  let redisClient: Redis;
  let app: INestApplication;
  let appInstance2: INestApplication;
  let presenceService: PresenceService;
  let presenceService2: PresenceService;
  let base: string;
  let base2: string;
  let cookieUser1: string;
  let cookieUser2: string;
  let cookieOutsider: string;
  let gameAId: string;
  let gameALobby: string;
  let gameBId: string;
  let gameBLobby: string;
  let privateRoomId: string;
  let testNs: string;

  const previous = { ...process.env };

  beforeAll(async () => {
    const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL required');
    if (!env.REDIS_URL) throw new Error('REDIS_URL required');

    const url = new URL(env.DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${owned}`);
    pool = new pg.Pool({ connectionString: url.href, max: 8, connectionTimeoutMillis: 5000 });
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

    redisClient = new Redis(env.REDIS_URL);


    const games = await schema.seedGames(drizzle(pool, { schema }));
    gameAId = games[0].id;
    gameALobby = games[0].lobbyId;
    gameBId = games[1].id;
    gameBLobby = games[1].lobbyId;

    await pool.query(`INSERT INTO conversations(id,kind,lobby_id) SELECT id,'LOBBY',id FROM lobbies ON CONFLICT DO NOTHING`);

    await pool.query(`
      INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES
      ('user1','User One','user1@example.com',true,now(),now()),
      ('user2','User Two','user2@example.com',true,now(),now()),
      ('outsider','Outsider User','outsider@example.com',true,now(),now())
    `);

    await pool.query(`
      INSERT INTO profiles(user_id,display_name,custom_status,created_at,updated_at) VALUES
      ('user1','GamerOne','JUST_CHATTING',now(),now()),
      ('user2','GamerTwo','PLAYING',now(),now()),
      ('outsider','OutsiderGamer','LOOKING_FOR_TEAM',now(),now())
    `);

    await pool.query(`
      INSERT INTO game_interests(id,user_id,game_id) VALUES
      ('u1-gA','user1',$1),
      ('u2-gA','user2',$1),
      ('out-gB','outsider',$2)
    `, [gameAId, gameBId]);

    await pool.query(`
      INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES
      ('sess-1','user1','token-user1',now()+interval '1 day',now(),now()),
      ('sess-2','user2','token-user2',now()+interval '1 day',now(),now()),
      ('sess-out','outsider','token-outsider',now()+interval '1 day',now(),now())
    `);

    privateRoomId = randomUUID();
    await pool.query(`INSERT INTO conversations(id,kind) VALUES($1,'ROOM')`, [privateRoomId]);
    const roomTableId = randomUUID();

    await pool.query('BEGIN');
    await pool.query(`INSERT INTO rooms(id,name,game_id,owner_id,visibility,conversation_id) VALUES($1,'Private Room',$2,'user1','PRIVATE',$3)`, [roomTableId, gameAId, privateRoomId]);
    await pool.query(`
      INSERT INTO room_members(id,room_id,user_id,role,joined_at) VALUES
      ('rm-1',$1,'user1','OWNER',now()),
      ('rm-2',$1,'user2','MEMBER',now())
    `, [roomTableId]);
    await pool.query('COMMIT');

    cookieUser1 = await createSignedSessionCookie(secret, 'token-user1');
    cookieUser2 = await createSignedSessionCookie(secret, 'token-user2');
    cookieOutsider = await createSignedSessionCookie(secret, 'token-outsider');

    Object.assign(process.env, env, {
      DATABASE_URL: url.href,
      BETTER_AUTH_SECRET: secret,
      PUBLIC_ORIGIN: origin,
      BETTER_AUTH_URL: origin,
    });

    // Node 1
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    presenceService = app.get(PresenceService);
    testNs = presenceService.ns;

    // Node 2 (simulating multi-instance API cluster sharing DB schema & Redis)
    appInstance2 = await NestFactory.create(AppModule, { logger: false });
    await appInstance2.listen(0, '127.0.0.1');
    base2 = await appInstance2.getUrl();
    presenceService2 = appInstance2.get(PresenceService);
  }, 60000);

  afterAll(async () => {
    try {
      if (app) await app.close();
      if (appInstance2) await appInstance2.close();
      if (redisClient) redisClient.disconnect();
      if (pool) {
        expect(/^t16_[0-9]+_[a-z0-9]+$/.test(owned)).toBe(true);
        await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
        await pool.end();
      }
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in previous)) delete process.env[key];
      }
      Object.assign(process.env, previous);
    }
  }, 30000);

  beforeEach(async () => {
    presenceService.setClock(undefined);
    presenceService2.setClock(undefined);
    if (redisClient) {
      const keys = await redisClient.keys(`fg:presence:${testNs}:*`);
      if (keys.length) {
        await redisClient.del(...keys);
      }
    }
  });

  const connectPresenceSocket = async (baseUrl: string = base, sessionCookie?: string) => {
    const headers: Record<string, string> = { Origin: origin };
    if (sessionCookie) headers.Cookie = sessionCookie;

    const socket = io(`${baseUrl}/presence`, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: headers,
    });

    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });

    return socket;
  };

  it('safe scoped test cleanup preserves sentinel in other namespaces', async () => {
    const sentinelKey = 'fg:presence:other_sentinel_namespace:sentinel_key';
    await redisClient.set(sentinelKey, 'sentinel_value');

    // Run test cleanup scope logic
    const keys = await redisClient.keys(`fg:presence:${testNs}:*`);
    if (keys.length) {
      await redisClient.del(...keys);
    }

    const sentinelVal = await redisClient.get(sentinelKey);
    expect(sentinelVal).toBe('sentinel_value');
    await redisClient.del(sentinelKey);
  });

  it('two authenticated sockets same user dedup', async () => {
    const s1 = await connectPresenceSocket(base, cookieUser1);
    const s2 = await connectPresenceSocket(base, cookieUser1);

    try {
      const ack1 = await s1.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      expect(ack1).toEqual({ ok: true, conversationId: gameALobby });

      const ack2 = await s2.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      expect(ack2).toEqual({ ok: true, conversationId: gameALobby });

      const res = await request(base).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe('user1');
      expect(PublicProfileSchema.parse(res.body.items[0])).toBeDefined();
    } finally {
      s1.disconnect();
      s2.disconnect();
    }
  });

  it('two API instances concurrent lease renewal and disconnect', async () => {
    // Socket 1 connects to API Node 1, Socket 2 connects to API Node 2
    const s1Node1 = await connectPresenceSocket(base, cookieUser1);
    const s2Node2 = await connectPresenceSocket(base2, cookieUser1);

    try {
      const ack1 = await s1Node1.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      expect(ack1).toEqual({ ok: true, conversationId: gameALobby });

      const ack2 = await s2Node2.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      expect(ack2).toEqual({ ok: true, conversationId: gameALobby });

      // User1 is online
      let res1 = await request(base).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(res1.body.items.some((u: any) => u.id === 'user1')).toBe(true);

      // Disconnect s1 on Node 1
      s1Node1.disconnect();
      await new Promise(r => setTimeout(r, 200));

      // User1 stays online via s2 on Node 2
      let res2 = await request(base2).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(res2.body.items.some((u: any) => u.id === 'user1')).toBe(true);

      // Disconnect s2 on Node 2
      s2Node2.disconnect();
      await new Promise(r => setTimeout(r, 200));

      // User1 is now offline across both nodes
      let res3 = await request(base).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(res3.body.items.some((u: any) => u.id === 'user1')).toBe(false);
    } finally {
      if (s1Node1.connected) s1Node1.disconnect();
      if (s2Node2.connected) s2Node2.disconnect();
    }
  });

  it('closing one tab keeps other online', async () => {
    const s1 = await connectPresenceSocket(base, cookieUser1);
    const s2 = await connectPresenceSocket(base, cookieUser1);

    try {
      await s1.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      await s2.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });

      s1.disconnect();
      await new Promise(r => setTimeout(r, 200));

      let res = await request(base).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(res.status).toBe(200);
      expect(res.body.items.some((u: any) => u.id === 'user1')).toBe(true);

      s2.disconnect();
      await new Promise(r => setTimeout(r, 200));

      res = await request(base).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(res.status).toBe(200);
      expect(res.body.items.some((u: any) => u.id === 'user1')).toBe(false);
    } finally {
      if (s1.connected) s1.disconnect();
      if (s2.connected) s2.disconnect();
    }
  });

  it('stale lease expires exactly 45s with injected server clock (44999ms online, 45000ms offline)', async () => {
    const startMs = Date.now();
    let mockTime = startMs;
    presenceService.setClock(() => mockTime);

    const s = await connectPresenceSocket(base, cookieUser1);

    try {
      const ack = await s.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      expect(ack.ok).toBe(true);

      // At startMs + 44999ms (1ms before 45s TTL boundary): user is ONLINE
      mockTime = startMs + 44999;
      let res = await request(base).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(res.status).toBe(200);
      expect(res.body.items.some((u: any) => u.id === 'user1')).toBe(true);

      // At startMs + 45000ms (exact TTL boundary): user is EXPIRED / OFFLINE
      mockTime = startMs + PRESENCE_TTL_MS;
      res = await request(base).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(res.status).toBe(200);
      expect(res.body.items.some((u: any) => u.id === 'user1')).toBe(false);
    } finally {
      s.disconnect();
    }
  });

  it('heartbeat keeps current lease', async () => {
    const startMs = Date.now();
    let mockTime = startMs;
    presenceService.setClock(() => mockTime);

    const s = await connectPresenceSocket(base, cookieUser1);

    try {
      await s.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });

      // Advance server time to +20s and send heartbeat
      mockTime = startMs + 20000;
      const hbAck = await s.timeout(5000).emitWithAck('presence.heartbeat', { conversationId: gameALobby });
      expect(hbAck).toEqual({ ok: true, conversationId: gameALobby });

      // At mockTime = +50s (which is > 45s from initial, but < 45s from heartbeat at +20s):
      mockTime = startMs + 50000;
      const res = await request(base).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(res.status).toBe(200);
      expect(res.body.items.some((u: any) => u.id === 'user1')).toBe(true);
    } finally {
      s.disconnect();
    }
  });

  it('heartbeat without subscription denied', async () => {
    const s = await connectPresenceSocket(base, cookieUser1);

    try {
      // User1 has NOT subscribed to gameALobby yet
      const hbAck = await s.timeout(5000).emitWithAck('presence.heartbeat', { conversationId: gameALobby });
      expect(hbAck.ok).toBe(false);
      expect(hbAck.error.code).toBe('FORBIDDEN');
    } finally {
      s.disconnect();
    }
  });

  it('rejects client clock overrides in HTTP and socket payloads (strict contracts)', async () => {
    const s = await connectPresenceSocket(base, cookieUser1);

    try {
      const badSubAck = await s.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby, injectedClockMs: 9999999 });
      expect(badSubAck.ok).toBe(false);
      expect(badSubAck.error.code).toBe('INVALID_INPUT');

      const okSubAck = await s.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      expect(okSubAck.ok).toBe(true);

      const badHbAck = await s.timeout(5000).emitWithAck('presence.heartbeat', { conversationId: gameALobby, injectedClockMs: 9999999 });
      expect(badHbAck.ok).toBe(false);
      expect(badHbAck.error.code).toBe('INVALID_INPUT');

      const startMs = Date.now();
      let mockTime = startMs;
      presenceService.setClock(() => mockTime);

      // Advance server clock to +50000 (> 45s TTL)
      mockTime = startMs + 50000;

      // Client attempts to override server clock back to active time (startMs) via HTTP header
      const res = await request(base)
        .get(`/api/v1/games/${gameAId}/online`)
        .set('Origin', origin)
        .set('x-injected-clock-ms', String(startMs));

      expect(res.status).toBe(200);
      expect(res.body.items.some((u: any) => u.id === 'user1')).toBe(false);
    } finally {
      s.disconnect();
    }
  });

  it('custom status persists through reconnect/expiry', async () => {
    const patchRes = await request(base)
      .patch('/api/v1/me/status')
      .set('Origin', origin)
      .set('Cookie', cookieUser1)
      .send({ customStatus: 'LOOKING_FOR_TEAM' });

    expect(patchRes.status).toBe(200);
    const body = UpdateCustomStatusResponseSchema.parse(patchRes.body);
    expect(body.customStatus).toBe('LOOKING_FOR_TEAM');

    const dbRow = (await pool.query('SELECT custom_status FROM profiles WHERE user_id=$1', ['user1'])).rows[0];
    expect(dbRow.custom_status).toBe('LOOKING_FOR_TEAM');

    const s = await connectPresenceSocket(base, cookieUser1);
    try {
      await s.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      const onlineRes = await request(base).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(onlineRes.status).toBe(200);
      const user1Prof = onlineRes.body.items.find((u: any) => u.id === 'user1');
      expect(user1Prof.customStatus).toBe('LOOKING_FOR_TEAM');
    } finally {
      s.disconnect();
    }
  });

  it('PATCH me status publishes presence.changed to Lobby and authorized private members only', async () => {
    const u1Socket = await connectPresenceSocket(base, cookieUser1);
    const u2Socket = await connectPresenceSocket(base, cookieUser2);
    const guestSocket = await connectPresenceSocket(base);

    try {
      await u1Socket.timeout(5000).emitWithAck('presence.subscribe', { conversationId: privateRoomId });
      await u2Socket.timeout(5000).emitWithAck('presence.subscribe', { conversationId: privateRoomId });
      await guestSocket.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });

      const u2Received: any[] = [];
      const statusPromise = new Promise<any>(resolve => {
        u2Socket.on('presence.changed', data => {
          u2Received.push(data);
          if (data.userId === 'user1' && data.customStatus === 'PLAYING') {
            resolve(data);
          }
        });
      });

      const guestReceived: any[] = [];
      guestSocket.on('presence.changed', data => guestReceived.push(data));

      // User 1 updates custom status
      const patchRes = await request(base)
        .patch('/api/v1/me/status')
        .set('Origin', origin)
        .set('Cookie', cookieUser1)
        .send({ customStatus: 'PLAYING' });
      expect(patchRes.status).toBe(200);

      const event = await statusPromise;
      const parsed = SocketScopedPresenceChangedPayloadSchema.parse(event);
      expect(parsed.userId).toBe('user1');
      expect(parsed.customStatus).toBe('PLAYING');

      // Guest subscribed to Lobby did NOT receive private room status change
      expect(guestReceived.filter((e: any) => e.conversationId === privateRoomId)).toEqual([]);
    } finally {
      u1Socket.disconnect();
      u2Socket.disconnect();
      guestSocket.disconnect();
    }
  });

  it('background expiry sweeper publishes offline event on missed heartbeat', async () => {
    const startMs = Date.now();
    let mockTime = startMs;
    presenceService.setClock(() => mockTime);

    const observer = await connectPresenceSocket(base, cookieUser2);
    const client = await connectPresenceSocket(base, cookieUser1);

    try {
      await observer.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      await client.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });

      const offlinePromise = new Promise<any>(resolve => {
        observer.on('presence.changed', data => {
          if (data.userId === 'user1' && data.isOnline === false) {
            resolve(data);
          }
        });
      });

      // Advance server clock past 45s TTL (+45001ms) without client sending heartbeat or disconnecting
      mockTime = startMs + PRESENCE_TTL_MS + 1;

      // Trigger server background sweeper explicitly or wait for interval
      await presenceService.sweepExpiredLeases();

      const offlineEvent = await Promise.race([
        offlinePromise,
        new Promise((_, r) => setTimeout(() => r(new Error('Sweeper offline event timeout')), 3000)),
      ]);

      const parsed = SocketScopedPresenceChangedPayloadSchema.parse(offlineEvent);
      expect(parsed.userId).toBe('user1');
      expect(parsed.isOnline).toBe(false);
    } finally {
      observer.disconnect();
      client.disconnect();
    }
  });

  it('per-game isolation', async () => {
    const s = await connectPresenceSocket(base, cookieUser1);

    try {
      await s.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });

      const resA = await request(base).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(resA.status).toBe(200);
      expect(resA.body.items.some((u: any) => u.id === 'user1')).toBe(true);

      const resB = await request(base).get(`/api/v1/games/${gameBId}/online`).set('Origin', origin);
      expect(resB.status).toBe(200);
      expect(resB.body.items.some((u: any) => u.id === 'user1')).toBe(false);
    } finally {
      s.disconnect();
    }
  });

  it('guest/private outsider denied', async () => {
    const guestSocket = await connectPresenceSocket(base);
    const outsiderSocket = await connectPresenceSocket(base, cookieOutsider);

    try {
      const gAck = await guestSocket.timeout(5000).emitWithAck('presence.heartbeat', { conversationId: gameALobby });
      expect(gAck.ok).toBe(false);
      expect(gAck.error.code).toBe('FORBIDDEN');

      const gSubAck = await guestSocket.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      expect(gSubAck.ok).toBe(true);

      const gPrivAck = await guestSocket.timeout(5000).emitWithAck('presence.subscribe', { conversationId: privateRoomId });
      expect(gPrivAck.ok).toBe(false);
      expect(gPrivAck.error.code).toBe('FORBIDDEN');

      const outAck = await outsiderSocket.timeout(5000).emitWithAck('presence.subscribe', { conversationId: privateRoomId });
      expect(outAck.ok).toBe(false);
      expect(outAck.error.code).toBe('FORBIDDEN');
    } finally {
      guestSocket.disconnect();
      outsiderSocket.disconnect();
    }
  });

  it('private membership revoked/session revoked/ban/origin deny/identity injection', async () => {
    // 1. Origin deny
    await new Promise<void>((resolve, reject) => {
      const badSocket = io(`${base}/presence`, {
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { Origin: 'http://malicious-site.com', Cookie: cookieUser1 },
      });
      badSocket.once('connect', () => {
        badSocket.disconnect();
        reject(new Error('Should not connect with disallowed origin'));
      });
      badSocket.once('connect_error', () => {
        badSocket.disconnect();
        resolve();
      });
    });

    const s = await connectPresenceSocket(base, cookieUser1);
    try {
      const ack = await s.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      expect(ack.ok).toBe(true);
      const onlineRes = await request(base).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(onlineRes.body.items[0].id).toBe('user1');

      // Revoke room membership for member user2
      const sPrivateUser2 = await connectPresenceSocket(base, cookieUser2);
      const subPriv = await sPrivateUser2.timeout(5000).emitWithAck('presence.subscribe', { conversationId: privateRoomId });
      expect(subPriv.ok).toBe(true);

      await pool.query('DELETE FROM room_members WHERE user_id=$1 AND room_id IN (SELECT id FROM rooms WHERE conversation_id=$2)', ['user2', privateRoomId]);
      try {
        const hbAfterRevoke = await sPrivateUser2.timeout(5000).emitWithAck('presence.heartbeat', { conversationId: privateRoomId });
        expect(hbAfterRevoke.ok).toBe(false);
        expect(hbAfterRevoke.error.code).toBe('FORBIDDEN');
      } finally {
        await pool.query(`INSERT INTO room_members(id,room_id,user_id,role,joined_at) SELECT $1,id,'user2','MEMBER',now() FROM rooms WHERE conversation_id=$2`, [randomUUID(), privateRoomId]);
        sPrivateUser2.disconnect();
      }

      // Session revoked
      await pool.query("DELETE FROM \"session\" WHERE user_id='user1'");
      try {
        const hbRevokedSession = await s.timeout(5000).emitWithAck('presence.heartbeat', { conversationId: gameALobby });
        expect(hbRevokedSession.ok).toBe(false);
        expect(hbRevokedSession.error.code).toBe('LOGIN_REQUIRED');
      } finally {
        await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('sess-1','user1','token-user1',now()+interval '1 day',now(),now())`);
      }

      // User banned
      await pool.query(`INSERT INTO admin_actions(id,actor_id,target_user_id,action,created_at) VALUES($1,'user2','user1','BAN',now())`, [randomUUID()]);
      try {
        const hbBanned = await s.timeout(5000).emitWithAck('presence.heartbeat', { conversationId: gameALobby });
        expect(hbBanned.ok).toBe(false);
        expect(hbBanned.error.code).toBe('FORBIDDEN');
      } finally {
        await pool.query(`INSERT INTO admin_actions(id,actor_id,target_user_id,action,created_at) VALUES($1,'user2','user1','UNBAN',now())`, [randomUUID()]);
      }
    } finally {
      s.disconnect();
    }
  });

  it('authorized private deliveries only', async () => {
    const u1Socket = await connectPresenceSocket(base, cookieUser1);
    const u2Socket = await connectPresenceSocket(base, cookieUser2);
    const guestSocket = await connectPresenceSocket(base);

    try {
      await u1Socket.timeout(5000).emitWithAck('presence.subscribe', { conversationId: privateRoomId });
      await guestSocket.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });

      const guestReceived: any[] = [];
      guestSocket.on('presence.changed', data => guestReceived.push(data));

      const u1Received: any[] = [];
      const changedPromise = new Promise<any>(resolve => {
        u1Socket.on('presence.changed', data => {
          u1Received.push(data);
          if (data.userId === 'user2' && data.conversationId === privateRoomId) {
            resolve(data);
          }
        });
      });

      // User 2 subscribes to privateRoomId
      await u2Socket.timeout(5000).emitWithAck('presence.subscribe', { conversationId: privateRoomId });

      const event = await changedPromise;
      const parsed = SocketScopedPresenceChangedPayloadSchema.parse(event);
      expect(parsed.conversationId).toBe(privateRoomId);
      expect(parsed.userId).toBe('user2');
      expect(parsed.isOnline).toBe(true);

      expect(guestReceived.filter((e: any) => e.conversationId === privateRoomId)).toEqual([]);
    } finally {
      u1Socket.disconnect();
      u2Socket.disconnect();
      guestSocket.disconnect();
    }
  });

  it('legacy endpoint and canonical game pagination follow their shared schemas', async () => {
    const s1 = await connectPresenceSocket(base, cookieUser1);
    const s2 = await connectPresenceSocket(base, cookieUser2);

    try {
      await s1.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      await s2.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });

      const resAll = await request(base).get('/api/v1/online-users').set('Origin', origin);
      expect(resAll.status).toBe(200);
      expect(resAll.body.items).toHaveLength(2);
      expect(resAll.body.hasMore).toBe(false);
      expect(JSON.stringify(resAll.body)).not.toContain('email');
      expect(JSON.stringify(resAll.body)).not.toContain('discordId');

      const resLimit1 = await request(base).get('/api/v1/online-users?limit=1').set('Origin', origin);
      expect(resLimit1.status).toBe(200);
      expect(resLimit1.body.items).toHaveLength(1);
      expect(resLimit1.body.hasMore).toBe(true);
      expect(resLimit1.body.nextCursor).toBeTruthy();

      const resPage2 = await request(base).get(`/api/v1/games/${gameAId}/online?limit=1&cursor=${resLimit1.body.nextCursor}`).set('Origin', origin);
      expect(resPage2.status).toBe(200);
      expect(resPage2.body.items).toHaveLength(1);
      expect(resPage2.body.items[0].id).not.toBe(resLimit1.body.items[0].id);

      const resUnknownGame = await request(base).get('/api/v1/games/non-existent-game-id/online').set('Origin', origin);
      expect(resUnknownGame.status).toBe(404);
      expect(resUnknownGame.body.code).toBe('NOT_FOUND');
    } finally {
      s1.disconnect();
      s2.disconnect();
    }
  });

  it('revoked session immediately releases its lease and preserves another valid tab', async () => {
    await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('sess-valid-tab','user1','token-valid-tab',now()+interval '1 day',now(),now())`);
    const validCookie = await createSignedSessionCookie(secret, 'token-valid-tab');
    const expired = await connectPresenceSocket(base, cookieUser1);
    const valid = await connectPresenceSocket(base2, validCookie);
    try {
      expect((await expired.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby })).ok).toBe(true);
      expect((await valid.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby })).ok).toBe(true);
      await pool.query('DELETE FROM "session" WHERE id=$1', ['sess-1']);
      expect((await expired.timeout(5000).emitWithAck('presence.heartbeat', { conversationId: gameALobby })).ok).toBe(false);
      expect(await presenceService.isUserOnlineInConv(gameALobby, 'user1')).toBe(true);
      await valid.timeout(5000).emitWithAck('presence.unsubscribe', { conversationId: gameALobby });
      const res = await request(base).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(res.status).toBe(200);
      expect(res.body.items.some((u: { id: string }) => u.id === 'user1')).toBe(false);
    } finally {
      expired.disconnect(); valid.disconnect();
      await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('sess-1','user1','token-user1',now()+interval '1 day',now(),now()) ON CONFLICT DO NOTHING`);
      await pool.query('DELETE FROM "session" WHERE id=$1', ['sess-valid-tab']);
    }
  });

  it('interleaved unsubscribe and another instance subscribe preserve live online index', async () => {
    const leaving = await connectPresenceSocket(base, cookieUser1);
    const joining = await connectPresenceSocket(base2, cookieUser1);
    let release!: () => void;
    let entered!: () => void;
    const paused = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const lookup = presenceService.getGameIdForLobby.bind(presenceService);
    let restore: (() => void) | undefined;
    try {
      expect((await leaving.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby })).ok).toBe(true);
      const spy = jest.spyOn(presenceService, 'getGameIdForLobby').mockImplementationOnce(async id => {
        const result = await lookup(id); entered(); await gate; return result;
      });
      restore = () => spy.mockRestore();
      const removal = leaving.timeout(10000).emitWithAck('presence.unsubscribe', { conversationId: gameALobby });
      await paused;
      expect((await joining.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby })).ok).toBe(true);
      release();
      expect((await removal).ok).toBe(true);
      const res = await request(base2).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(res.status).toBe(200);
      expect(res.body.items.some((u: { id: string }) => u.id === 'user1')).toBe(true);
    } finally {
      release?.(); restore?.(); leaving.disconnect(); joining.disconnect();
    }
  });

  it('opaque conversation and user IDs cannot share socket lease keys', async () => {
    await pool.query("INSERT INTO conversations(id,kind) VALUES('collision','ROOM'),('collision:part','ROOM')");
    try {
      await presenceService.addOrRenewLease('collision', 'part:user1', 'first-socket');
      await presenceService2.addOrRenewLease('collision:part', 'user1', 'second-socket');
      await presenceService.removeLease('collision', 'part:user1', 'first-socket');
      expect(await presenceService.isUserOnlineInConv('collision', 'part:user1')).toBe(false);
      expect(await presenceService2.isUserOnlineInConv('collision:part', 'user1')).toBe(true);
    } finally {
      await presenceService2.removeLease('collision:part', 'user1', 'second-socket');
      await pool.query("DELETE FROM conversations WHERE id IN ('collision','collision:part')");
    }
  });

  it('delayed Redis notification uses current stored status and current lease state', async () => {
    const observer = await connectPresenceSocket(base);
    const actor = await connectPresenceSocket(base2, cookieUser1);
    try {
      await observer.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      await actor.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      await pool.query("UPDATE profiles SET custom_status='LOOKING_FOR_TEAM' WHERE user_id='user1'");
      await new Promise(resolve => setTimeout(resolve, 100));
      const event = new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Current state event not delivered')), 5000);
        observer.once('presence.changed', body => { clearTimeout(timer); resolve(body); });
      });
      await redisClient.publish(`fg:presence:${testNs}:pubsub`, JSON.stringify({
        conversationId: gameALobby, userId: 'user1', customStatus: 'PLAYING', isOnline: false,
      }));
      expect(await event).toMatchObject({ conversationId: gameALobby, userId: 'user1', customStatus: 'LOOKING_FOR_TEAM', isOnline: true });
    } finally {
      observer.disconnect(); actor.disconnect();
    }
  });

  it('private-only participant remains online without appearing in public Lobby list', async () => {
    const s = await connectPresenceSocket(base, cookieUser1);
    try {
      await s.timeout(5000).emitWithAck('presence.subscribe', { conversationId: privateRoomId });
      const changed = await request(base).patch('/api/v1/me/status').set('Cookie', cookieUser1).set('Origin', origin).send({ customStatus: 'PLAYING' });
      expect(changed.status).toBe(200);
      expect(changed.body.isOnline).toBe(true);
      const publicList = await request(base).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(publicList.body.items.some((u: { id: string }) => u.id === 'user1')).toBe(false);
    } finally { s.disconnect(); }
  });

  it('online read removes a revoked session even without a further heartbeat', async () => {
    const s = await connectPresenceSocket(base, cookieUser1);
    try {
      const subscribedEvent = new Promise<void>(resolve => s.once('presence.changed', () => resolve()));
      await s.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      await subscribedEvent;
      await pool.query("DELETE FROM \"session\" WHERE id='sess-1'");
      const res = await request(base2).get(`/api/v1/games/${gameAId}/online`).set('Origin', origin);
      expect(res.status).toBe(200);
      expect(res.body.items.some((u: { id: string }) => u.id === 'user1')).toBe(false);
    } finally {
      s.disconnect();
      await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('sess-1','user1','token-user1',now()+interval '1 day',now(),now()) ON CONFLICT DO NOTHING`);
    }
  });

  it('application shutdown waits for an in-flight presence sweep', async () => {
    const temporary = await NestFactory.create(AppModule, { logger: false });
    await temporary.listen(0, '127.0.0.1');
    const service = temporary.get(PresenceService);
    const socket = await connectPresenceSocket(await temporary.getUrl(), cookieUser1);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const paused = new Promise<void>(resolve => { entered = resolve; });
    let sweep: Promise<void> | undefined;
    let close: Promise<void> | undefined;
    let restore: (() => void) | undefined;
    try {
      await socket.timeout(5000).emitWithAck('presence.subscribe', { conversationId: gameALobby });
      service.setClock(() => Date.now() + PRESENCE_TTL_MS + 1);
      const lookup = service.getGameIdForLobby.bind(service);
      const spy = jest.spyOn(service, 'getGameIdForLobby').mockImplementationOnce(async id => {
        const result = await lookup(id); entered(); await gate; return result;
      });
      restore = () => spy.mockRestore();
      sweep = service.sweepExpiredLeases();
      await paused;
      let closed = false;
      close = temporary.close().then(() => { closed = true; });
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(closed).toBe(false);
      release();
      await sweep;
      await close;
      expect(closed).toBe(true);
    } finally {
      release?.(); restore?.(); socket.disconnect();
      await sweep?.catch(() => {});
      await (close ?? temporary.close());
    }
  });

  it('status save cannot report success when no profile was persisted', async () => {
    await pool.query("DELETE FROM profiles WHERE user_id='outsider'");
    try {
      const res = await request(base).patch('/api/v1/me/status').set('Cookie', cookieOutsider).set('Origin', origin).send({ customStatus: 'PLAYING' });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    } finally {
      await pool.query("INSERT INTO profiles(user_id,display_name,custom_status) VALUES('outsider','OutsiderGamer','LOOKING_FOR_TEAM')");
    }
  });

  it('real chosen status SQL update', async () => {
    const patchRes = await request(base)
      .patch('/api/v1/me/status')
      .set('Origin', origin)
      .set('Cookie', cookieUser2)
      .send({ customStatus: 'PLAYING' });

    expect(patchRes.status).toBe(200);
    const parsed = UpdateCustomStatusResponseSchema.parse(patchRes.body);
    expect(parsed.customStatus).toBe('PLAYING');

    const dbRow = (await pool.query('SELECT custom_status FROM profiles WHERE user_id=$1', ['user2'])).rows[0];
    expect(dbRow.custom_status).toBe('PLAYING');
  });
});
