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
import { io, Socket } from 'socket.io-client';
import * as schema from '@fg/database';
import { ALLOWED_GAMES, MessageSchema, createPageSchema, ApiErrorResponseSchema, SocketConversationAckSchema, SocketEventNames } from '@fg/contracts';
import { AppModule } from '../src/app.module.js';
import { createSignedSessionCookie } from './test-cookie-helper.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const origin = 'http://localhost:5173';
const secret = 't12-test-only-secret-key-at-least-32-characters';
// Bound actual PostgreSQL/Nest startup work separately from the later T41 latency gate.
jest.setTimeout(15000);
describe('T12 native HTTP/Socket.IO with actual PostgreSQL', () => {
    let app: INestApplication, pool: pg.Pool, base: string;
    const owned = `t12_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let games: Awaited<ReturnType<typeof schema.seedGames>>;
    let cookie: string;
    const sockets: Socket[] = [];
    beforeAll(async () => {
        const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
        if (!env.DATABASE_URL)
            throw new Error('Local DATABASE_URL required');
        const connection = new URL(env.DATABASE_URL);
        connection.searchParams.set('options', `-c search_path=${owned}`);
        pool = new pg.Pool({ connectionString: connection.href, max: 8, connectionTimeoutMillis: 5000 });
        await pool.query(`CREATE SCHEMA "${owned}"`);
        const client = await pool.connect();
        try {
            await migrate(drizzle(client), { migrationsFolder: path.join(root, 'packages/database/migrations'), migrationsSchema: owned });
        }
        finally {
            client.release();
        }
        games = await schema.seedGames(drizzle(pool, { schema }));
        await pool.query(`INSERT INTO conversations(id,kind,lobby_id) SELECT id,'LOBBY',id FROM lobbies`);
        await pool.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES('member','Member','member@example.com',true,now(),now()),('outsider','Outsider','out@example.com',true,now(),now())`);
        await pool.query(`INSERT INTO profiles(user_id,display_name) VALUES('member','Gamer')`);
        await pool.query(`INSERT INTO game_interests(id,user_id,game_id) VALUES('interest','member',$1)`, [games[0].id]);
        await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('session-member','member','token-member',now()+interval '1 day',now(),now())`);
        cookie = await createSignedSessionCookie(secret, 'token-member');
        await pool.query(`INSERT INTO conversations(id,kind) VALUES('private-conversation','ROOM')`);
        await pool.query(`INSERT INTO conversation_members(id,conversation_id,user_id) VALUES('membership','private-conversation','member')`);
        Object.assign(process.env, { DATABASE_URL: connection.href, REDIS_URL: env.REDIS_URL, PUBLIC_ORIGIN: origin, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: secret, DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET });
        app = await NestFactory.create(AppModule, { logger: false });
        await app.listen(0, '127.0.0.1');
        base = await app.getUrl();
    }, 60000);
    afterAll(async () => {
        for (const socket of sockets)
            socket.disconnect();
        const errors: unknown[] = [];
        try {
            if (app)
                await app.close();
        }
        catch (error) {
            errors.push(error);
        }
        if (pool) {
            try {
                if (!/^t12_[0-9]+_[a-z0-9]+$/.test(owned))
                    throw new Error('Invalid owned schema');
                await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
                expect((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1', [owned])).rowCount).toBe(0);
            }
            catch (error) {
                errors.push(error);
            }
            finally {
                try {
                    await pool.end();
                }
                catch (error) {
                    errors.push(error);
                }
            }
        }
        if (errors.length)
            throw new AggregateError(errors, 'Owned integration cleanup failed');
    }, 30000);
    const history = (conversation: string) => request(base).get(`/api/v1/conversations/${conversation}/messages`);
    const post = (conversation: string, body: object, session = cookie) => request(base).post(`/api/v1/conversations/${conversation}/messages`).set('Origin', origin).set('Cookie', session).send(body);
    async function connect(session?: string, clientOrigin = origin) {
        const socket = io(base, { transports: ['websocket'], reconnection: false, timeout: 1500, extraHeaders: { Origin: clientOrigin, ...(session ? { Cookie: session } : {}) } });
        sockets.push(socket);
        await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
        return socket;
    }
    async function subscribe(socket: Socket, conversationId: string) { return SocketConversationAckSchema.parse(await socket.timeout(1500).emitWithAck(SocketEventNames.CONVERSATION_SUBSCRIBE, { conversationId })); }
    async function insert(conversation: string, id: string, content = id) { await pool.query(`INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id,created_at) VALUES($1,$2,'member',$3,$1,'2026-10-01T00:00:00.000Z')`, [id, conversation, content]); }
    async function committedJob(conversation: string) { const id = randomUUID(); await pool.query(`INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id) VALUES($1,$2,'outsider','Committed fixture',$1)`, [id, conversation]); await pool.query(`INSERT INTO realtime_outbox(id,message_id,conversation_id,event_name) VALUES($1,$2,$3,'message.created')`, [randomUUID(), id, conversation]); return id; }
    it('guest reads200 and sends401 with structured domain errors', async () => {
        const response = await request(base).get(`/api/v1/games/${games[0].id}/lobby/messages`);
        expect(response.status).toBe(200);
        expect(createPageSchema(MessageSchema).parse(response.body).items).toEqual([]);
        const denied = await request(base).post(`/api/v1/conversations/${games[0].lobbyId}/messages`).set('Origin', origin).send({ content: 'hello', clientMessageId: 'guest' });
        expect(denied.status).toBe(401);
        expect(ApiErrorResponseSchema.parse(denied.body).code).toBe('LOGIN_REQUIRED');
    });
    it('keeps seven game lobbies independent and legacy title query uses shared catalog', async () => {
        expect(games).toHaveLength(7);
        for (const [i, game] of games.entries()) {
            await insert(game.lobbyId, `isolation-${i}`);
            const response = await request(base).get(`/api/v1/games/${game.id}/lobby/messages`);
            expect(response.status).toBe(200);
            expect(response.body.items.map((m: {
                id: string;
            }) => m.id)).toEqual([`isolation-${i}`]);
        }
        for (const title of ALLOWED_GAMES)
            expect((await request(base).get('/api/v1/lobby/messages').query({ gameTitle: title })).status).toBe(200);
        expect((await request(base).get('/api/v1/lobby/messages').query({ gameTitle: 'Other' })).status).toBe(422);
    });
    it('recovers a disconnected gap beyond50 with tied timestamps, stable cursors and no duplicate IDs', async () => {
        const conversation = games[1].lobbyId;
        const before = await connect();
        await subscribe(before, conversation);
        before.disconnect();
        for (let i = 0; i < 121; i++)
            await insert(conversation, `gap-${String(i).padStart(3, '0')}`);
        const after = await connect();
        expect((await subscribe(after, conversation)).ok).toBe(true);
        const recovered = new Set<string>();
        let cursor: string | undefined;
        let pages = 0;
        do {
            const response = await history(conversation).query({ limit: 50, ...(cursor ? { cursor } : {}) });
            expect(response.status).toBe(200);
            const page = createPageSchema(MessageSchema).parse(response.body);
            expect(page.items.length).toBeLessThanOrEqual(50);
            for (const item of page.items) {
                expect(recovered.has(item.id)).toBe(false);
                recovered.add(item.id);
            }
            cursor = page.hasMore ? page.nextCursor ?? undefined : undefined;
            expect(++pages).toBeLessThan(6);
        } while (cursor);
        expect(recovered.size).toBe(122);
        expect((await history(conversation).query({ cursor: 'garbage' })).status).toBe(422);
        expect((await history(conversation).query({ limit: 51 })).status).toBe(422);
        after.disconnect();
    });
    it('deduplicates concurrent retries in storage and persists one creation job', async () => {
        const body = { content: 'race', clientMessageId: randomUUID() };
        const results = await Promise.all([post(games[0].lobbyId, body), post(games[0].lobbyId, body)]);
        for (const response of results) {
            expect(response.status).toBe(201);
            MessageSchema.parse(response.body);
        }
        expect(results[0].body.id).toBe(results[1].body.id);
        expect((await pool.query('SELECT id FROM messages WHERE client_message_id=$1', [body.clientMessageId])).rowCount).toBe(1);
        expect((await pool.query('SELECT id FROM realtime_outbox WHERE message_id=$1', [results[0].body.id])).rowCount).toBe(1);
    });
    it('validates blank/oversized/rich input and CSRF origin without inserting messages', async () => {
        for (const body of [{ content: '  ', clientMessageId: 'blank' }, { content: 'x'.repeat(2001), clientMessageId: 'long' }, { content: 'hi', attachmentIds: ['unowned'], clientMessageId: 'rich' }])
            expect((await post(games[0].lobbyId, body)).status).toBe(422);
        expect((await request(base).post(`/api/v1/conversations/${games[0].lobbyId}/messages`).set('Cookie', cookie).set('Origin', 'https://evil.example').send({ content: 'evil', clientMessageId: 'evil' })).status).toBe(403);
    });
    it('requires completed onboarding before an authenticated user can send', async () => {
        await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('session-outsider','outsider','token-outsider',now()+interval '1 day',now(),now())`);
        const incomplete = await createSignedSessionCookie(secret, 'token-outsider');
        expect((await post(games[0].lobbyId, { content: 'not onboarded', clientMessageId: 'incomplete-profile' }, incomplete)).status).toBe(403);
    });
    it('keeps microsecond cursor boundaries independent from the host timezone', async () => {
        const conversation = games[5].lobbyId;
        for (const [id, stamp] of [['precision-a', '2026-10-02 12:00:00.123001'], ['precision-b', '2026-10-02 12:00:00.123002'], ['precision-c', '2026-10-02 12:00:00.123003']])
            await pool.query(`INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id,created_at) VALUES($1,$2,'member',$1,$1,$3::timestamp)`, [id, conversation, stamp]);
        const first = await history(conversation).query({ limit: 1 });
        expect(first.status).toBe(200);
        expect(first.body.items[0].createdAt).toBe('2026-10-02T12:00:00.123003Z');
        const second = await history(conversation).query({ limit: 1, cursor: first.body.nextCursor });
        expect(second.body.items[0].id).toBe('precision-b');
        const third = await history(conversation).query({ limit: 1, cursor: second.body.nextCursor });
        expect(third.body.items[0].id).toBe('precision-a');
    });
    it('rejects guest/private read and subscribe; permits guest public subscribe only', async () => {
        expect((await history('private-conversation')).status).toBe(401);
        const guest = await connect();
        const denied = await subscribe(guest, 'private-conversation');
        expect(denied.ok).toBe(false);
        if (!denied.ok)
            expect(denied.error.code).toBe('FORBIDDEN');
        expect((await subscribe(guest, games[0].lobbyId)).ok).toBe(true);
        guest.disconnect();
    });
    it('rejects unknown channels and untrusted or missing socket origins', async () => {
        const socket = await connect();
        expect((await subscribe(socket, 'not-found')).ok).toBe(false);
        socket.disconnect();
        await expect(connect(undefined, 'https://evil.example')).rejects.toThrow();
        await expect(connect(undefined, '')).rejects.toThrow();
    });
    it('broadcasts committed public DTOs only to the selected Lobby and supports unsubscribe', async () => {
        const one = await connect(), two = await connect();
        await subscribe(one, games[2].lobbyId);
        await subscribe(two, games[3].lobbyId);
        const wrong: unknown[] = [];
        two.on('message.created', value => wrong.push(value));
        const event = new Promise<unknown>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('No creation event')), 2500); one.once('message.created', value => { clearTimeout(timer); resolve(value); }); });
        const response = await post(games[2].lobbyId, { content: 'committed', clientMessageId: randomUUID() });
        expect(response.status).toBe(201);
        const message = MessageSchema.parse(await event);
        expect(message.id).toBe(response.body.id);
        expect((await pool.query('SELECT id FROM messages WHERE id=$1', [message.id])).rowCount).toBe(1);
        expect(JSON.stringify(message)).not.toContain('member@example.com');
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(wrong).toEqual([]);
        const unsub = await one.timeout(1500).emitWithAck('conversation.unsubscribe', { conversationId: games[2].lobbyId });
        expect(SocketConversationAckSchema.parse(unsub).ok).toBe(true);
        one.disconnect();
        two.disconnect();
    });
    it('invalid cookies never downgrade to guest access', async () => { expect((await history(games[0].lobbyId).set('Cookie', 'better-auth.session_token=invalid')).status).toBe(401); await expect(connect('better-auth.session_token=invalid')).rejects.toThrow(); });
    it('rechecks revoked membership on subscription and delivery to an already connected socket', async () => {
        const member = await connect(cookie);
        expect((await history('private-conversation').set('Cookie', cookie)).status).toBe(200);
        expect((await subscribe(member, 'private-conversation')).ok).toBe(true);
        const leaked: unknown[] = [];
        member.on('message.created', value => leaked.push(value));
        await pool.query(`DELETE FROM conversation_members WHERE id='membership'`);
        const msg = 'revoked-' + randomUUID();
        await pool.query(`INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id) VALUES($1,'private-conversation','outsider','Private',$1)`, [msg]);
        await pool.query(`INSERT INTO realtime_outbox(id,message_id,conversation_id,event_name) VALUES($1,$2,'private-conversation','message.created')`, [randomUUID(), msg]);
        await new Promise(resolve => setTimeout(resolve, 600));
        expect(leaked).toEqual([]);
        expect((await subscribe(member, 'private-conversation')).ok).toBe(false);
        expect((await history('private-conversation').set('Cookie', cookie)).status).toBe(403);
        member.disconnect();
    });
    it('PUBLIC room visibility never grants its chat to outsiders and uses current room membership', async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`INSERT INTO conversations(id,kind) VALUES('room-chat','ROOM')`);
            await client.query(`INSERT INTO rooms(id,name,game_id,owner_id,visibility,conversation_id) VALUES('actual-room','Fixture room',$1,'outsider','PUBLIC','room-chat')`, [games[0].id]);
            await client.query(`INSERT INTO room_members(id,room_id,user_id,role) VALUES('actual-owner','actual-room','outsider','OWNER'),('actual-member','actual-room','member','MEMBER')`);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
        expect((await history('room-chat')).status).toBe(401);
        const guest = await connect();
        expect((await subscribe(guest, 'room-chat')).ok).toBe(false);
        guest.disconnect();
        expect((await history('room-chat').set('Cookie', cookie)).status).toBe(200);
        const member = await connect(cookie);
        expect((await subscribe(member, 'room-chat')).ok).toBe(true);
        await pool.query(`DELETE FROM room_members WHERE id='actual-member'`);
        expect((await history('room-chat').set('Cookie', cookie)).status).toBe(403);
        expect((await subscribe(member, 'room-chat')).ok).toBe(false);
        member.disconnect();
    });
    it('expired and revoked sessions cannot send or reuse a connected socket', async () => {
        const member = await connect(cookie);
        await subscribe(member, games[0].lobbyId);
        await pool.query(`UPDATE "session" SET expires_at=now()-interval '1 second' WHERE id='session-member'`);
        expect((await post(games[0].lobbyId, { content: 'expired', clientMessageId: 'expired' })).status).toBe(401);
        expect((await subscribe(member, games[0].lobbyId)).ok).toBe(false);
        member.disconnect();
        await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('session-member','member','token-member',now()+interval '1 day',now(),now()) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at`);
        const replay = await connect(cookie);
        await subscribe(replay, games[0].lobbyId);
        const leaked: unknown[] = [];
        replay.on('message.created', value => leaked.push(value));
        await pool.query(`DELETE FROM "session" WHERE id='session-member'`);
        await committedJob(games[0].lobbyId);
        await new Promise(resolve => setTimeout(resolve, 600));
        expect(leaked).toEqual([]);
        expect((await subscribe(replay, games[0].lobbyId)).ok).toBe(false);
        expect((await post(games[0].lobbyId, { content: 'logout', clientMessageId: 'logout' })).status).toBe(401);
        replay.disconnect();
        await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('session-member','member','token-member',now()+interval '1 day',now(),now())`);
    });
    it('banned sessions cannot send or keep socket access', async () => {
        const member = await connect(cookie);
        await subscribe(member, games[0].lobbyId);
        const leaked: unknown[] = [];
        member.on('message.created', value => leaked.push(value));
        await pool.query(`INSERT INTO admin_actions(id,actor_id,target_user_id,action,reason) VALUES('ban','outsider','member','BAN','test')`);
        await committedJob(games[0].lobbyId);
        await new Promise(resolve => setTimeout(resolve, 600));
        expect(leaked).toEqual([]);
        expect((await post(games[0].lobbyId, { content: 'banned', clientMessageId: 'banned' })).status).toBe(403);
        expect((await subscribe(member, games[0].lobbyId)).ok).toBe(false);
        member.disconnect();
        await pool.query(`DELETE FROM admin_actions WHERE id='ban'`);
    });
    it('failed outbox transaction emits nothing and leaves neither message nor job', async () => {
        const listener = await connect();
        await subscribe(listener, games[4].lobbyId);
        const events: unknown[] = [];
        listener.on('message.created', value => events.push(value));
        await pool.query(`CREATE FUNCTION fail_t12_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'intentional test transaction failure'; END $$`);
        await pool.query(`CREATE TRIGGER fail_job BEFORE INSERT ON realtime_outbox FOR EACH ROW EXECUTE FUNCTION fail_t12_job()`);
        try {
            expect((await post(games[4].lobbyId, { content: 'rollback', clientMessageId: 'failed-outbox' })).status).toBe(500);
            expect((await pool.query(`SELECT id FROM messages WHERE client_message_id='failed-outbox'`)).rowCount).toBe(0);
            await new Promise(resolve => setTimeout(resolve, 400));
            expect(events).toEqual([]);
        }
        finally {
            await pool.query('DROP TRIGGER fail_job ON realtime_outbox');
            await pool.query('DROP FUNCTION fail_t12_job()');
            listener.disconnect();
        }
    });
});
