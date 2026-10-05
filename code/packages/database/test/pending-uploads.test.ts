import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
const root = path.resolve(import.meta.dirname, '../../..'), migrations = path.join(root, 'packages/database/migrations'), env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8')), owned = `t05_fix1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl)
    throw new Error('DATABASE_URL required for native database tests');
describe('durable unsent image uploads on actual PostgreSQL', () => {
    let client: pg.Client;
    beforeAll(async () => {
        client = new pg.Client({ connectionString: databaseUrl, query_timeout: 10000, connectionTimeoutMillis: 5000 });
        await client.connect();
        const baseline = path.join(root, 'quality/evidence/T05-FIX1/baseline-migrations');
        fs.mkdirSync(path.join(baseline, 'meta'), { recursive: true });
        const journal = JSON.parse(fs.readFileSync(path.join(migrations, 'meta/_journal.json'), 'utf8'));
        journal.entries = journal.entries.slice(0, 5);
        fs.writeFileSync(path.join(baseline, 'meta/_journal.json'), JSON.stringify(journal, null, 2) + '\n');
        for (const entry of journal.entries)
            fs.copyFileSync(path.join(migrations, `${entry.tag}.sql`), path.join(baseline, `${entry.tag}.sql`));
        await client.query(`CREATE SCHEMA "${owned}"`);
        await client.query(`SET search_path TO "${owned}"`);
        await migrate(drizzle(client), { migrationsFolder: baseline, migrationsSchema: owned });
        await client.query(`INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES('u','Draft owner','draft@example.com',true,now(),now())`);
        await client.query(`INSERT INTO conversations(id,kind) VALUES('c','ROOM')`);
        await client.query(`INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id) VALUES('legacy','c','u','Keep existing message','legacy')`);
        await client.query(`INSERT INTO attachments(id,message_id,conversation_id,url,file_name,file_size,mime_type) VALUES('legacy-image','legacy','c','https://fg.example/api/v1/attachments/legacy-image/content','legacy.webp',50,'image/webp')`);
    });
    afterAll(async () => {
        if (!client)
            return;
        try {
            for (const schema of [owned, `${owned}_empty`]) {
                if (!/^t05_fix1_[0-9]+_[a-z0-9]+(?:_empty)?$/.test(schema))
                    throw new Error('Unsafe schema');
                await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            }
            expect((await client.query('SELECT nspname FROM pg_namespace WHERE nspname LIKE $1', [`${owned}%`])).rowCount).toBe(0);
        }
        finally {
            await client.end();
        }
    });
    const insert = (id: string, overrides: Record<string, unknown> = {}) => { const row = { id, uploader_id: 'u', conversation_id: 'c', file_name: 'photo.webp', file_size: 50, mime_type: 'image/webp', created_at: '2026-10-01T00:00:00Z', expires_at: '2026-10-02T00:00:00Z', ...overrides }; return client.query(`INSERT INTO pending_image_uploads(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row)); };
    it('forward migration preserves linked images/messages and adds durable drafts', async () => { await migrate(drizzle(client), { migrationsFolder: migrations, migrationsSchema: owned }); expect((await client.query(`SELECT file_name FROM attachments WHERE id='legacy-image'`)).rows[0].file_name).toBe('legacy.webp'); expect((await client.query(`SELECT content FROM messages WHERE id='legacy'`)).rows[0].content).toBe('Keep existing message'); expect((await client.query('SELECT to_regclass($1) AS name', [`${owned}.pending_image_uploads`])).rows[0].name).not.toBeNull(); });
    it('migrates an empty schema without relaxing linked image constraints', async () => {
        const empty = `${owned}_empty`;
        await client.query(`CREATE SCHEMA "${empty}"`);
        await client.query(`SET search_path TO "${empty}"`);
        try {
            await migrate(drizzle(client), { migrationsFolder: migrations, migrationsSchema: empty });
            expect((await client.query('SELECT to_regclass($1) AS name', [`${empty}.pending_image_uploads`])).rows[0].name).not.toBeNull();
            expect((await client.query(`SELECT is_nullable FROM information_schema.columns WHERE table_schema=$1 AND table_name='attachments' AND column_name='message_id'`, [empty])).rows[0].is_nullable).toBe('NO');
        }
        finally {
            await client.query(`SET search_path TO "${owned}"`);
        }
    });
    it('enforces ownership/context references, WebP size and expiry boundaries', async () => {
        await insert('draft');
        await expect(insert('bad-owner', { uploader_id: 'outsider' })).rejects.toMatchObject({ code: '23503' });
        await expect(insert('bad-conversation', { conversation_id: 'other' })).rejects.toMatchObject({ code: '23503' });
        for (const overrides of [{ file_size: 0 }, { file_size: 5242881 }, { mime_type: 'image/svg+xml' }, { expires_at: '2026-09-30T00:00:00Z' }, { file_name: '../photo.webp' }])
            await expect(insert(`bad-${Math.random()}`, overrides)).rejects.toMatchObject({ code: '23514' });
        await insert('max-size', { file_size: 5242880 });
    });
    it('rollback restores the pending image after a failed message/attachment claim', async () => {
        await client.query('BEGIN');
        try {
            await client.query(`INSERT INTO messages(id,conversation_id,sender_id,content,client_message_id) VALUES('claim','c','u','','claim')`);
            await client.query(`INSERT INTO attachments(id,message_id,conversation_id,url,file_name,file_size,mime_type) SELECT id,'claim',conversation_id,'https://fg.example/api/v1/attachments/draft/content',file_name,file_size,mime_type FROM pending_image_uploads WHERE id='draft' FOR UPDATE`);
            await client.query(`DELETE FROM pending_image_uploads WHERE id='draft'`);
        }
        finally {
            await client.query('ROLLBACK');
        }
        expect((await client.query(`SELECT id FROM pending_image_uploads WHERE id='draft'`)).rowCount).toBe(1);
        expect((await client.query(`SELECT id FROM messages WHERE id='claim'`)).rowCount).toBe(0);
        expect((await client.query(`SELECT id FROM attachments WHERE id='draft'`)).rowCount).toBe(0);
    });
    it('two concurrent consumers cannot both claim the same draft', async () => {
        const url = new URL(databaseUrl);
        url.searchParams.set('options', `-c search_path=${owned}`);
        const peers = [new pg.Client({ connectionString: url.href }), new pg.Client({ connectionString: url.href })];
        try {
            await Promise.all(peers.map(peer => peer.connect()));
            const claims = await Promise.all(peers.map(peer => peer.query(`DELETE FROM pending_image_uploads WHERE id='draft' RETURNING id`)));
            expect(claims.map(result => result.rowCount).sort()).toEqual([0, 1]);
        }
        finally {
            await Promise.all(peers.map(peer => peer.end()));
        }
    });
    it('indexes expiry selection and removes expired drafts without removing linked images', async () => { await insert('expired', { created_at: '2000-01-01T00:00:00Z', expires_at: '2000-01-02T00:00:00Z' }); await insert('fresh', { created_at: '2099-01-01T00:00:00Z', expires_at: '2099-01-02T00:00:00Z' }); expect((await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND tablename='pending_image_uploads' AND indexname='pending_image_uploads_expiry_idx'`, [owned])).rowCount).toBe(1); await client.query(`DELETE FROM pending_image_uploads WHERE expires_at<now()`); expect((await client.query(`SELECT id FROM pending_image_uploads WHERE id='expired'`)).rowCount).toBe(0); expect((await client.query(`SELECT id FROM pending_image_uploads WHERE id='fresh'`)).rowCount).toBe(1); expect((await client.query(`SELECT id FROM attachments WHERE id='legacy-image'`)).rowCount).toBe(1); });
});
