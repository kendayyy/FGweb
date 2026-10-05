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
import sharp from 'sharp';
import * as schema from '@fg/database';
import { AttachmentSchema, MessageSchema, MAX_IMAGE_SIZE_BYTES } from '@fg/contracts';
import { AppModule } from '../src/app.module.js';
import { createSignedSessionCookie } from './test-cookie-helper.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), owned = `t14_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, storage = path.join(root, '.runtime', owned), origin = 'http://localhost:5173', secret = 't14-local-test-secret-at-least-32-characters';
jest.setTimeout(15000);
describe('T14 actual private rich chat and durable image storage', () => {
    let pool: pg.Pool, app: INestApplication, base: string, cookie: string, outsiderCookie: string, png: Buffer, lobby: string;
    const previous = { ...process.env };
    beforeAll(async () => {
        const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
        if (!env.DATABASE_URL)
            throw new Error('DATABASE_URL required');
        const url = new URL(env.DATABASE_URL);
        url.searchParams.set('options', `-c search_path=${owned}`);
        pool = new pg.Pool({ connectionString: url.href, max: 8, connectionTimeoutMillis: 5000 });
        await pool.query(`CREATE SCHEMA "${owned}"`);
        const client = await pool.connect();
        try {
            await migrate(drizzle(client), { migrationsFolder: path.join(root, 'packages/database/migrations'), migrationsSchema: owned });
        }
        finally {
            client.release();
        }
        const games = await schema.seedGames(drizzle(pool, { schema }));
        lobby = games[0].lobbyId;
        await pool.query(`INSERT INTO conversations(id,kind,lobby_id) SELECT id,'LOBBY',id FROM lobbies`);
        await pool.query(`INSERT INTO conversations(id,kind) VALUES('private','ROOM'),('other','ROOM')`);
        await pool.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES('owner','Owner','owner@example.com',true,now(),now()),('outsider','Outsider','outsider@example.com',true,now(),now()),('peer','Peer','peer@example.com',true,now(),now())`);
        await pool.query(`INSERT INTO profiles(user_id,display_name) VALUES('owner','Gamer'),('outsider','Outsider'),('peer','Peer')`);
        await pool.query(`INSERT INTO game_interests(id,user_id,game_id) VALUES('owner-interest','owner',$1),('outsider-interest','outsider',$1)`, [games[0].id]);
        await pool.query(`INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES('owner-session','owner','owner-token',now()+interval '1 day',now(),now()),('out-session','outsider','out-token',now()+interval '1 day',now(),now())`);
        await pool.query(`INSERT INTO conversation_members(id,conversation_id,user_id) VALUES('owner-private','private','owner'),('peer-private','private','peer'),('owner-other','other','owner')`);
        cookie = await createSignedSessionCookie(secret, 'owner-token');
        outsiderCookie = await createSignedSessionCookie(secret, 'out-token');
        png = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();
        Object.assign(process.env, env, { DATABASE_URL: url.href, BETTER_AUTH_SECRET: secret, PUBLIC_ORIGIN: origin, BETTER_AUTH_URL: origin, FG_UPLOADS_DIR: storage });
        app = await NestFactory.create(AppModule, { logger: false });
        await app.listen(0, '127.0.0.1');
        base = await app.getUrl();
    }, 60000);
    afterAll(async () => {
        try {
            if (app)
                await app.close();
            if (pool) {
                expect(/^t14_[0-9]+_[a-z0-9]+$/.test(owned)).toBe(true);
                await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
                expect((await pool.query('SELECT nspname FROM pg_namespace WHERE nspname=$1', [owned])).rowCount).toBe(0);
                await pool.end();
            }
            const resolved = path.resolve(storage);
            expect(resolved.startsWith(path.join(root, '.runtime') + path.sep) && path.basename(resolved) === owned).toBe(true);
            fs.rmSync(resolved, { recursive: true, force: true });
        }
        finally {
            for (const key of Object.keys(process.env))
                if (!(key in previous))
                    delete process.env[key];
            Object.assign(process.env, previous);
        }
    }, 30000);
    const upload = (conversation = 'private', data = png, mime = 'image/png', session = cookie) => request(base).post('/api/v1/uploads/images').set('Origin', origin).set('Cookie', session).field('conversationId', conversation).attach('file', data, { filename: 'photo.png', contentType: mime });
    const post = (conversation: string, body: object, session = cookie) => request(base).post(`/api/v1/conversations/${conversation}/messages`).set('Origin', origin).set('Cookie', session).send({ content: 'Rich message', clientMessageId: randomUUID(), ...body });
    const content = (id: string, session?: string) => { const call = request(base).get(`/api/v1/attachments/${id}/content`); return session ? call.set('Cookie', session) : call; };
    it('rejects fake JPEG, MIME mismatch, disallowed signatures and oversized multipart bytes', async () => { expect((await upload('private', Buffer.from('not a JPEG'), 'image/jpeg')).status).toBe(422); expect((await upload('private', png, 'image/jpeg')).status).toBe(422); expect((await upload('private', Buffer.from('<svg/>'), 'image/svg+xml')).status).toBe(422); const oversized = await upload('private', Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1)); expect(oversized.status).toBe(413); expect(oversized.body.code).toBe('INVALID_INPUT'); expect((await pool.query('SELECT id FROM pending_image_uploads')).rowCount).toBe(0); });
    it('re-encodes real PNG into a private WebP draft with opaque URL and verified ownership', async () => { const response = await upload(); expect(response.status).toBe(201); const draft = AttachmentSchema.parse(response.body); expect(draft.mimeType).toBe('image/webp'); expect(draft.url).toBe(`${origin}/api/v1/attachments/${draft.id}/content`); expect(JSON.stringify(draft)).not.toContain(storage); const binary = await content(draft.id, cookie); expect(binary.status).toBe(200); expect(binary.headers['content-type']).toContain('image/webp'); expect(binary.headers['cache-control']).toBe('private, no-store'); expect((await sharp(binary.body).metadata()).format).toBe('webp'); expect((await content(draft.id)).status).toBe(403); expect((await content(draft.id, outsiderCookie)).status).toBe(403); const pending = (await pool.query('SELECT uploader_id,conversation_id,expires_at>created_at AS valid FROM pending_image_uploads WHERE id=$1', [draft.id])).rows[0]; expect(pending).toEqual({ uploader_id: 'owner', conversation_id: 'private', valid: true }); });
    it('attaches once atomically, retries by clientMessageId and denies outsider metadata/content', async () => {
        const response = await upload();
        expect(response.status).toBe(201);
        const image = AttachmentSchema.parse(response.body), id = randomUUID();
        const body = { content: '', attachmentIds: [image.id], clientMessageId: id };
        const results = await Promise.all([post('private', body), post('private', body)]);
        for (const result of results) {
            expect(result.status).toBe(201);
            expect(MessageSchema.parse(result.body).attachments[0].id).toBe(image.id);
        }
        expect(results[0].body.id).toBe(results[1].body.id);
        expect((await pool.query('SELECT id FROM pending_image_uploads WHERE id=$1', [image.id])).rowCount).toBe(0);
        expect((await pool.query('SELECT id FROM attachments WHERE id=$1', [image.id])).rowCount).toBe(1);
        expect((await content(image.id, cookie)).status).toBe(200);
        expect((await content(image.id, outsiderCookie)).status).toBe(403);
        expect((await request(base).get(`/api/v1/attachments/${image.id}`).set('Cookie', outsiderCookie)).status).toBe(403);
    });
    it('rejects cross-conversation and foreign-owner draft claims without consuming drafts', async () => { const image = AttachmentSchema.parse((await upload()).body); expect((await post('other', { attachmentIds: [image.id] })).status).toBe(422); expect((await post(lobby, { attachmentIds: [image.id] }, outsiderCookie)).status).toBe(422); expect((await pool.query('SELECT id FROM pending_image_uploads WHERE id=$1', [image.id])).rowCount).toBe(1); });
    it('rejects cross-room reply while returning a bounded public sender reply preview in the same room', async () => { const source = await post('other', { content: 'Outside room' }); expect(source.status).toBe(201); expect((await post('private', { replyToId: source.body.id })).status).toBe(422); const original = await post('private', { content: 'Original' }), reply = await post('private', { content: 'Reply', replyToId: original.body.id }); expect(reply.status).toBe(201); const message = MessageSchema.parse(reply.body); expect(message.replyToMessage?.id).toBe(original.body.id); expect(message.replyToMessage?.content).toBe('Original'); expect(message.replyToMessage).not.toHaveProperty('replyToMessage'); expect(JSON.stringify(message)).not.toContain('owner@example.com'); });
    it('rejects outsiders mentioned in private chat and persists/deduplicates eligible mentions only', async () => { expect((await post('private', { mentionedUserIds: ['outsider'] })).status).toBe(422); expect((await pool.query("SELECT id FROM mentions WHERE mentioned_user_id='outsider'")).rowCount).toBe(0); expect((await pool.query("SELECT id FROM notifications WHERE user_id='outsider'")).rowCount).toBe(0); const result = await post('private', { mentionedUserIds: ['peer', 'peer'] }); expect(result.status).toBe(201); const message = MessageSchema.parse(result.body); expect(message.mentionedUserIds).toEqual(['peer']); expect(message.mentions[0].displayName).toBe('Peer'); expect((await pool.query('SELECT id FROM mentions WHERE message_id=$1', [message.id])).rowCount).toBe(1); });
    it('allows guests to read attached Lobby images while keeping unsent drafts uploader-only', async () => { const image = AttachmentSchema.parse((await upload(lobby)).body); expect((await content(image.id)).status).toBe(403); expect((await post(lobby, { attachmentIds: [image.id] })).status).toBe(201); expect((await content(image.id)).status).toBe(200); expect((await upload('private', png, 'image/png', outsiderCookie)).status).toBe(403); });
    it('accepts real JPEG and WebP but rejects images above20MP', async () => {
        for (const format of ['jpeg', 'webp'] as const) {
            const bytes = await sharp(png)[format]().toBuffer(), result = await upload('private', bytes, `image/${format}`);
            expect(result.status).toBe(201);
            const image = AttachmentSchema.parse(result.body);
            expect(image.mimeType).toBe('image/webp');
            expect((await content(image.id, cookie)).status).toBe(200);
        }
        const large = await sharp({ create: { width: 5000, height: 4001, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
        expect(large.length).toBeLessThan(MAX_IMAGE_SIZE_BYTES);
        expect((await upload('private', large)).status).toBe(422);
    });
    it('rechecks image permission after membership and session revocation', async () => {
        const image = AttachmentSchema.parse((await upload()).body);
        expect((await post('private', { attachmentIds: [image.id] })).status).toBe(201);
        await pool.query("DELETE FROM conversation_members WHERE id='owner-private'");
        try {
            expect((await content(image.id, cookie)).status).toBe(403);
            expect((await request(base).get(`/api/v1/attachments/${image.id}`).set('Cookie', cookie)).status).toBe(403);
        }
        finally {
            await pool.query("INSERT INTO conversation_members(id,conversation_id,user_id) VALUES('owner-private','private','owner')");
        }
        await pool.query("DELETE FROM \"session\" WHERE id='owner-session'");
        try {
            expect((await content(image.id, cookie)).status).toBe(401);
        }
        finally {
            await pool.query("INSERT INTO \"session\"(id,user_id,token,expires_at,created_at,updated_at) VALUES('owner-session','owner','owner-token',now()+interval '1 day',now(),now())");
        }
    });
    it('delivers committed rich messages through real Redis/Socket.IO only to eligible subscribers', async () => {
        const sockets: Socket[] = [], received: unknown[] = [];
        const connect = async (session: string) => { const socket = io(base, { transports: ['websocket'], reconnection: false, extraHeaders: { Origin: origin, Cookie: session } }); sockets.push(socket); await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); }); return socket; };
        try {
            const owner = await connect(cookie), outsider = await connect(outsiderCookie);
            expect(await owner.timeout(5000).emitWithAck('conversation.subscribe', { conversationId: 'private' })).toMatchObject({ ok: true });
            expect(await outsider.timeout(5000).emitWithAck('conversation.subscribe', { conversationId: 'private' })).toMatchObject({ ok: false });
            outsider.on('message.created', message => received.push(message));
            const image = AttachmentSchema.parse((await upload()).body);
            const live = new Promise<unknown>((resolve, reject) => { const timer = setTimeout(() => { owner.off('message.created', handler); reject(new Error('Committed rich event absent')); }, 5000); const handler = (message: {
                attachments?: Array<{
                    id: string;
                }>;
            }) => { if (message.attachments?.some(item => item.id === image.id)) {
                clearTimeout(timer);
                owner.off('message.created', handler);
                resolve(message);
            } }; owner.on('message.created', handler); });
            const result = await post('private', { attachmentIds: [image.id], mentionedUserIds: ['peer'] });
            expect(result.status).toBe(201);
            const event = MessageSchema.parse(await live);
            expect(event.id).toBe(result.body.id);
            expect(event.mentionedUserIds).toEqual(['peer']);
            expect(received).toEqual([]);
        }
        finally {
            for (const socket of sockets)
                socket.disconnect();
        }
    });
    it('cleans expired/unreferenced image files and retains linked images', async () => {
        const linked = AttachmentSchema.parse((await upload()).body);
        expect((await post('private', { attachmentIds: [linked.id] })).status).toBe(201);
        const draft = AttachmentSchema.parse((await upload()).body), orphanId = randomUUID();
        fs.writeFileSync(path.join(storage, `${orphanId}.webp`), png);
        const store = app.get<{
            cleanup?: (now?: Date) => Promise<void>;
        }>('FG_IMAGE_STORE');
        expect(typeof store.cleanup).toBe('function');
        await store.cleanup!(new Date(Date.now() + 26 * 60 * 60 * 1000));
        expect((await pool.query('SELECT id FROM pending_image_uploads WHERE id=$1', [draft.id])).rowCount).toBe(0);
        expect(fs.existsSync(path.join(storage, `${draft.id}.webp`))).toBe(false);
        expect(fs.existsSync(path.join(storage, `${orphanId}.webp`))).toBe(false);
        expect((await content(linked.id, cookie)).status).toBe(200);
    });
});
