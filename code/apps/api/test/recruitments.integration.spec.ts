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
import { RoomSchema, RecruitmentSchema, PublicRecruitmentSchema, } from '@fg/contracts';
import { AppModule } from '../src/app.module.js';
import { createSignedSessionCookie } from './test-cookie-helper.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const origin = 'http://localhost:5173';
const secret = 't18-rooms-test-secret-at-least-32-chars';
jest.setTimeout(60000);
describe('T20 recruitment integration', () => {
    let app: INestApplication;
    let pool: pg.Pool;
    let base: string;
    const owned = `t20_recruitments_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
        }
        finally {
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
            }
            catch (err) {
                errors.push(err instanceof Error ? err : new Error(String(err)));
            }
        }
        if (pool) {
            try {
                if (/^t20_recruitments_[0-9]+_[a-z0-9]+$/.test(owned)) {
                    await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
                    const checkRes = await pool.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`, [owned]);
                    if ((checkRes.rowCount ?? 0) > 0) {
                        errors.push(new Error(`Owned schema ${owned} was not removed`));
                    }
                }
                else {
                    errors.push(new Error(`Invalid owned schema name: ${owned}`));
                }
            }
            catch (err) {
                errors.push(err instanceof Error ? err : new Error(String(err)));
            }
            finally {
                try {
                    await pool.end();
                }
                catch (err) {
                    errors.push(err instanceof Error ? err : new Error(String(err)));
                }
            }
        }
        process.env = savedEnv;
        if (errors.length > 0) {
            throw new Error(`Cleanup failed with ${errors.length} error(s):\n` + errors.map(e => e.stack || e.message).join('\n'));
        }
    });
    beforeEach(async () => {
        await pool.query('DELETE FROM active_play_slots');
        await pool.query('DELETE FROM join_requests');
        await pool.query('DELETE FROM recruitments');
        await pool.query('DELETE FROM team_members');
        await pool.query('DELETE FROM play_sessions');
        await pool.query('DELETE FROM rooms');
    });
    const payload = (extra: Record<string, unknown> = {}) => ({ gameId, gameTitle, title: 'Đội Valorant', mode: 'ranked', playerCapacity: 5, timingType: 'now', ...extra });
    const post = (data: Record<string, unknown>, cookie = cookieOwner) => request(base).post('/api/v1/recruitments').set('Cookie', cookie).set('Origin', origin).send(data);
    const card = (id: string, action: string, cookie = cookieOwner) => request(base).patch(`/api/v1/recruitments/${id}/${action}`).set('Cookie', cookie).set('Origin', origin).send({});
    async function room(visibility = 'PUBLIC') {
        const r = await request(base).post('/api/v1/rooms').set('Cookie', cookieOwner).set('Origin', origin).send({ name: 'Existing room', gameId, gameTitle, visibility });
        expect(r.status).toBe(200);
        return RoomSchema.parse(r.body);
    }
    it('creates a real room/session with only owner roster and active slot', async () => {
        const r = await post(payload());
        expect(r.status).toBe(201);
        const dto = RecruitmentSchema.parse(r.body);
        expect((await pool.query('SELECT user_id FROM active_play_slots')).rows.map(r => r.user_id)).toEqual(['user-owner']);
        expect((await pool.query('SELECT * FROM team_members')).rowCount).toBe(1);
        expect((await request(base).get(`/api/v1/games/${gameId}/recruitments`)).body.items[0].id).toBe(dto.id);
    });
    it('preserves stored UTC creation instant independent of Node host timezone', async () => {
        const r = await post(payload());
        expect(r.status).toBe(201);
        const row = (await pool.query("SELECT extract(epoch FROM created_at AT TIME ZONE 'UTC')*1000 AS epoch_ms FROM recruitments WHERE id=$1", [r.body.id])).rows[0];
        expect(Math.abs(Date.parse(r.body.createdAt)-Number(row.epoch_ms))).toBeLessThan(1);
    });
    it('preserves old members/chat when creating a fresh session in an existing room', async () => {
        const old = await room();
        await pool.query("INSERT INTO room_members(id,room_id,user_id,role)VALUES('additional',$1,'user-member','MEMBER')", [old.id]);
        const first = await post(payload({ roomId: old.id }));
        expect(first.status).toBe(201);
        const session = (await pool.query('SELECT play_session_id FROM recruitments WHERE id=$1', [first.body.id])).rows[0].play_session_id;
        await pool.query('DELETE FROM active_play_slots');
        await pool.query("UPDATE play_sessions SET state='ENDED' WHERE id=$1", [session]);
        expect((await card(first.body.id, 'reopen')).status).toBe(409);
        const next = await post(payload({ roomId: old.id }));
        expect(next.status).toBe(201);
        const ids = (await pool.query('SELECT play_session_id FROM recruitments ORDER BY id')).rows.map(r => r.play_session_id);
        expect(new Set(ids).size).toBe(2);
        expect(next.body.roomId).toBe(old.id);
        const current = (await request(base).get(`/api/v1/rooms/${old.id}`).set('Cookie', cookieOwner)).body;
        expect(current.conversationId).toBe(old.conversationId);
        expect(current.memberCount).toBe(2);
        expect((await pool.query('SELECT count(*)::int AS n FROM team_members WHERE play_session_id<>$1', [session])).rows[0].n).toBe(1);
    });
    it('close/reopen preserves session and occupied slot, and private rooms cannot publish', async () => {
        const r = await post(payload());
        expect(r.status).toBe(201);
        expect((await card(r.body.id, 'close')).body.state).toBe('CLOSED');
        expect((await pool.query('SELECT * FROM active_play_slots')).rowCount).toBe(1);
        expect((await card(r.body.id, 'reopen')).body.state).toBe('OPEN');
        const privateRoom = await room('PRIVATE');
        expect((await post(payload({ roomId: privateRoom.id, timingType: 'scheduledAt', scheduledAt: new Date(Date.now() + 3600000).toISOString() }))).status).toBe(403);
    });
    it('two concurrent now creations for the same owner produce exactly one committed session', async () => {
        const results = await Promise.all([post(payload()), post(payload({ title: 'Concurrent' }))]);
        expect(results.map(r => r.status).sort()).toEqual([201, 409]);
        expect((await pool.query('SELECT * FROM play_sessions')).rowCount).toBe(1);
        expect((await pool.query('SELECT * FROM rooms')).rowCount).toBe(1);
        expect((await post(payload())).status).toBe(409);
    });
    it('scheduled sessions have no active slot and guests cannot mutate', async () => {
        const r = await post(payload({ timingType: 'scheduledAt', scheduledAt: new Date(Date.now() + 3600000).toISOString() }));
        expect(r.status).toBe(201);
        expect((await pool.query('SELECT * FROM active_play_slots')).rowCount).toBe(0);
        expect((await pool.query('SELECT state FROM play_sessions')).rows[0].state).toBe('SCHEDULED');
        expect((await request(base).post('/api/v1/recruitments').set('Origin', origin).send(payload())).status).toBe(401);
        expect((await post(payload(), cookieBanned)).status).toBe(403);
        expect((await post(payload(), cookieUnonboarded)).status).toBe(403);
    });
    it('suggestions filter full/closed/private/wrong mode and sort missing slots with stable cursor', async () => {
        const schedule = { timingType: 'scheduledAt', scheduledAt: new Date(Date.now() + 3600000).toISOString() };
        const cards = [];
        for (const cap of [4, 2, 3, 1]) {
            const r = await post(payload({ ...schedule, playerCapacity: cap }));
            expect(r.status).toBe(201);
            cards.push(r.body);
        }
        await card(cards[2].id, 'close');
        const other = await post(payload({ ...schedule, mode: 'unranked' }));
        expect(other.status).toBe(201);
        const path = `/api/v1/games/${gameId}/recruitments/suggestions?mode=ranked&limit=1`;
        const first = await request(base).get(path);
        expect(first.status).toBe(200);
        expect(first.body.items.map((r: {
            id: string;
        }) => r.id)).toEqual([cards[1].id]);
        PublicRecruitmentSchema.parse(first.body.items[0]);
        expect(first.body.items[0].conversationId).toBeUndefined();
        const second = await request(base).get(path + '&cursor=' + encodeURIComponent(first.body.nextCursor));
        expect(second.status).toBe(200);
        expect(second.body.items.map((r: {
            id: string;
        }) => r.id)).toEqual([cards[0].id]);
        expect((await request(base).get(path + '&visibility=PRIVATE')).status).toBe(422);
        expect((await request(base).get(path + '&cursor=garbage')).status).toBe(422);
    });
    it('only current owner/helper with recruitment permission can close/reopen', async () => {
        const r = await post(payload());
        expect(r.status).toBe(201);
        expect((await card(r.body.id, 'close', cookieOutsider)).status).toBe(403);
        await pool.query("INSERT INTO room_members(id,room_id,user_id,role)VALUES('helper',$1,'user-member','MEMBER')", [r.body.roomId]);
        expect((await card(r.body.id, 'close', cookieMember)).status).toBe(403);
        const grant = await request(base).patch(`/api/v1/rooms/${r.body.roomId}/helpers/user-member`).set('Cookie', cookieOwner).set('Origin', origin).send({ permissions: ['MANAGE_RECRUITMENT'] });
        expect(grant.status).toBe(200);
        expect((await card(r.body.id, 'close', cookieMember)).status).toBe(200);
        expect((await card(r.body.id, 'reopen', cookieMember)).status).toBe(200);
    });
    it('idempotent create returns the same card and rejects reuse with a different payload', async () => {
        const a = await post(payload({ idempotencyKey: 'retry-key' }));
        expect(a.status).toBe(201);
        const b = await post(payload({ idempotencyKey: 'retry-key' }));
        expect(b.status).toBe(201);
        expect(b.body.id).toBe(a.body.id);
        expect((await pool.query('SELECT * FROM recruitments')).rowCount).toBe(1);
        expect((await post(payload({ idempotencyKey: 'retry-key', title: 'Different' }))).status).toBe(409);
    });
    it('public discovery never returns a private or ended card and ties page deterministically', async () => {
        const schedule = { timingType: 'scheduledAt', scheduledAt: new Date(Date.now() + 3600000).toISOString() };
        const cards = [];
        for (let i = 0; i < 3; i++) {
            const r = await post(payload({ ...schedule, title: `Tie ${i}` }));
            expect(r.status).toBe(201);
            cards.push(r.body);
        }
        await pool.query("UPDATE recruitments SET updated_at='2026-01-01T00:00:00.123456Z'");
        const sorted = cards.map(c => c.id).sort();
        let cursor: string | undefined;
        const seen: string[] = [];
        for (let i = 0; i < 3; i++) {
            const r = await request(base).get('/api/v1/recruitments').query({ limit: 1, ...(cursor ? { cursor } : {}) });
            expect(r.status).toBe(200);
            seen.push(r.body.items[0].id);
            cursor = r.body.nextCursor;
            expect(r.body.hasMore).toBe(i < 2);
        }
        expect(seen).toEqual(sorted);
        const priv = await request(base).patch(`/api/v1/rooms/${cards[0].roomId}/settings`).set('Cookie', cookieOwner).set('Origin', origin).send({ visibility: 'PRIVATE' });
        expect(priv.status).toBe(200);
        expect((await request(base).get(`/api/v1/recruitments/${cards[0].id}`)).status).toBe(404);
        expect((await card(cards[0].id, 'reopen')).status).toBe(409);
        await pool.query("UPDATE play_sessions SET state='ENDED' WHERE id=(SELECT play_session_id FROM recruitments WHERE id=$1)", [cards[1].id]);
        expect((await request(base).get('/api/v1/recruitments')).body.items.map((r: {
            id: string;
        }) => r.id)).toEqual([cards[2].id]);
        expect((await request(base).get(`/api/v1/recruitments/${cards[1].id}`)).status).toBe(404);
    });
    it('validates game identity, path filters, Roblox fields, timestamps and CSRF without writes', async () => {
        const roblox = (await pool.query("SELECT id,title FROM games WHERE title='Roblox'")).rows[0];
        expect((await post(payload({ gameTitle: 'Roblox' }))).status).toBe(422);
        expect((await post(payload({ gameId: roblox.id, gameTitle: roblox.title }))).status).toBe(422);
        expect((await post(payload({ timingType: 'scheduledAt', scheduledAt: new Date(Date.now() - 10000).toISOString() }))).status).toBe(422);
        expect((await request(base).post('/api/v1/recruitments').set('Cookie', cookieOwner).set('Origin', 'https://wrong.example').send(payload())).status).toBe(403);
        expect((await pool.query('SELECT * FROM recruitments')).rowCount).toBe(0);
        expect((await request(base).get(`/api/v1/games/${gameId}/recruitments`).query({ gameId: roblox.id })).status).toBe(422);
        expect((await request(base).get('/api/v1/games/unknown/recruitments')).status).toBe(404);
        const r = await post(payload({ gameId: roblox.id, gameTitle: roblox.title, experienceName: 'Blox Fruits', experienceUrl: 'https://www.roblox.com/games/2753915549/Blox-Fruits' }));
        expect(r.status).toBe(201);
        expect(r.body.experienceName).toBe('Blox Fruits');
        expect((await request(base).get(`/api/v1/games/${gameId}/recruitments`)).body.items).toEqual([]);
        expect((await request(base).get(`/api/v1/games/${roblox.id}/recruitments`)).body.items[0].experienceUrl).toBe(r.body.experienceUrl);
    });
    it('concurrent retries with one key commit a single room and session', async () => {
        const results = await Promise.all([post(payload({ idempotencyKey: 'same' })), post(payload({ idempotencyKey: 'same' }))]);
        expect(results.map(r => r.status)).toEqual([201, 201]);
        expect(results[0].body.id).toBe(results[1].body.id);
        expect((await pool.query('SELECT * FROM play_sessions')).rowCount).toBe(1);
        expect((await pool.query('SELECT * FROM rooms')).rowCount).toBe(1);
    });
    async function waitFor(predicate: () => Promise<boolean>) {
        const until = Date.now() + 5000;
        while (Date.now() < until) {
            if (await predicate())
                return;
            await new Promise(r => setTimeout(r, 20));
        }
        throw new Error('Database condition not reached');
    }
    it('rolls back a mutation when its session expires while waiting for a room lock', async () => {
        const old = await room();
        const lock = await pool.connect();
        let pending: Promise<request.Response> | undefined;
        try {
            await lock.query('BEGIN');
            await lock.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [old.id]);
            pending = post(payload({ roomId: old.id })).then(r => r);
            await waitFor(async () => Boolean((await pool.query("SELECT 1 FROM pg_stat_activity WHERE query LIKE 'SELECT id,owner_id,visibility,game_id FROM rooms%' AND wait_event_type='Lock' AND query<>$1", ['unused'])).rowCount));
            // Better Auth refreshes short sessions during authentication. Expire after
            // witnessing the authenticated request waiting on the actual room lock.
            await pool.query("UPDATE session SET expires_at=clock_timestamp()-interval '1 millisecond' WHERE id='session-owner'");
            await lock.query('COMMIT');
            expect((await pending).status).toBe(401);
            expect((await pool.query('SELECT * FROM play_sessions')).rowCount).toBe(0);
        }
        finally {
            await lock.query('ROLLBACK');
            lock.release();
            await pending;
            await pool.query("UPDATE session SET expires_at=now()+interval '1 day' WHERE id='session-owner'");
        }
    });
    it('rejects a scheduled time which passes while waiting for the room lock', async () => {
        const old = await room();
        const lock = await pool.connect();
        let pending: Promise<request.Response> | undefined;
        const at = new Date(Date.now() + 2000).toISOString();
        try {
            await lock.query('BEGIN');
            await lock.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [old.id]);
            pending = post(payload({ roomId: old.id, timingType: 'scheduledAt', scheduledAt: at })).then(r => r);
            await waitFor(async () => Boolean((await pool.query("SELECT 1 FROM pg_stat_activity WHERE query LIKE 'SELECT id,owner_id,visibility,game_id FROM rooms%' AND wait_event_type='Lock'")).rowCount));
            await waitFor(async () => Boolean((await pool.query('SELECT 1 WHERE $1::timestamptz<=clock_timestamp()', [at])).rowCount));
            await lock.query('COMMIT');
            expect((await pending).status).toBe(422);
            expect((await pool.query('SELECT * FROM play_sessions')).rowCount).toBe(0);
        }
        finally {
            await lock.query('ROLLBACK');
            lock.release();
            await pending;
        }
    });
});
