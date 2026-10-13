import { Injectable, OnModuleInit, OnModuleDestroy, Logger,ConflictException,ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID,createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as sharpModule from 'sharp';
import { UploadImageRequestSchema, UploadImageMetadataSchema, MAX_IMAGE_PIXELS, MAX_IMAGE_SIZE_BYTES, IMAGE_DRAFT_TTL_MS, ErrorCode } from '@fg/contracts';
import { ChatService, ChatActor, chatError } from '../chat/chat.service.js';
import { attachmentDTO } from '../chat/attachment-dto.js';
import {LobbyCipher} from '../chat-crypto/lobby-cipher.js';
import {lockCryptoObjectWrite} from '../chat-crypto/crypto-object-store.js';
const sharp = (sharpModule as typeof sharpModule & {
    default: typeof sharpModule;
}).default ?? sharpModule;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
@Injectable()
export class UploadsService implements OnModuleInit, OnModuleDestroy {
    private pool!: Pool;
    private directory!: string;
    private timer?: ReturnType<typeof setInterval>;
    private sweeping?: Promise<void>;
    private opening?: Promise<void>;
    private readonly logger = new Logger(UploadsService.name);
    constructor(private readonly chat: ChatService,private readonly lobbyCipher:LobbyCipher) { }
    async onModuleInit() {
        const cwd = process.cwd();
        const codeRoot = path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'apps' ? path.resolve(cwd, '../..') : cwd;
        const root = path.join(codeRoot, '.runtime');
        this.directory = path.resolve(process.env.FG_UPLOADS_DIR ?? path.join(root, 'chat-images'));
        if (!this.directory.startsWith(root + path.sep))
            throw new Error('Image storage must remain inside code/.runtime');
        await fs.mkdir(this.directory, { recursive: true });
        const real = await fs.realpath(this.directory), realRoot = await fs.realpath(root);
        if (!real.startsWith(realRoot + path.sep))
            throw new Error('Image storage cannot escape through a link');
        this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
    }
    private async ready() {
        if (this.opening)
            return this.opening;
        this.opening = (async () => {
            await this.cleanup();
            this.timer = setInterval(() => {
                if (this.sweeping)
                    return;
                this.sweeping = this.cleanup().catch(() => this.logger.warn('Image draft cleanup unavailable; retained for retry')).finally(() => { this.sweeping = undefined; });
            }, 60000);
            this.timer.unref();
        })();
        try {
            await this.opening;
        }
        catch (error) {
            this.opening = undefined;
            throw error;
        }
    }
    async onModuleDestroy() {
        if (this.opening)
            await this.opening.catch(() => undefined);
        if (this.timer)
            clearInterval(this.timer);
        if (this.sweeping)
            await this.sweeping;
        if (this.pool)
            await this.pool.end();
    }
    private file(id: string) {
        if (!uuid.test(id))
            chatError(ErrorCode.NOT_FOUND, 'Image not found');
        return path.join(this.directory, `${id}.webp`);
    }
    async upload(body: unknown, file: Express.Multer.File | undefined, actor: ChatActor) {
        if (!actor)
            chatError(ErrorCode.LOGIN_REQUIRED, 'Login required');
        await this.ready();
        const parsed = UploadImageRequestSchema.safeParse({ ...typeof body === 'object' && body !== null ? body : {}, file: file && { bytes: file.buffer, fileName: file.originalname, mimeType: file.mimetype } });
        if (!parsed.success)
            chatError(ErrorCode.INVALID_INPUT, 'Invalid upload');
        const input = parsed.data, conversation = await this.chat.authorize(input.conversationId, actor, undefined, true);
        const state=await this.chat.assertLegacyRouteAllowed(conversation);
        const bytes = Buffer.from(input.file.bytes);
        let actual: string | null = null;
        if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
            actual = 'image/jpeg';
        else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
            actual = 'image/png';
        else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
            actual = 'image/webp';
        if (actual !== input.file.mimeType)
            chatError(ErrorCode.INVALID_INPUT, 'Image signature mismatch');
        let encoded: Buffer;
        try {
            const image = sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS }), meta = await image.metadata();
            const metadata = UploadImageMetadataSchema.safeParse({ width: meta.width, height: meta.height, mimeType: actual, fileSize: bytes.length });
            if (!metadata.success)
                chatError(ErrorCode.INVALID_INPUT, 'Image dimensions invalid');
            encoded = await image.rotate().webp().toBuffer();
        }
        catch {
            chatError(ErrorCode.INVALID_INPUT, 'Image decode failed');
        }
        if (encoded.length > MAX_IMAGE_SIZE_BYTES)
            chatError(ErrorCode.INVALID_INPUT, 'Encoded image exceeds size limit');
        if(state?.mode==='LOBBY_AEAD')return this.uploadLobby(conversation,encoded,actor);
        const id = randomUUID(), destination = this.file(id), temporary = path.join(this.directory, `${id}.tmp`), now = new Date(), expires = new Date(now.getTime() + IMAGE_DRAFT_TTL_MS);
        const baseName = path.basename(input.file.fileName.replaceAll('\\', '/')).replace(/\.[^.]*$/, '').split('').filter(character => character.charCodeAt(0) >= 32).join('').slice(0, 240) || 'image';
        const row = { id, file_name: `${baseName}.webp`, file_size: encoded.length, mime_type: 'image/webp' };
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await this.chat.authorize(conversation, actor, client, true);
            const lockedState=await this.chat.assertLegacyRouteAllowed(conversation, client, true);
            if(lockedState?.mode==='LOBBY_AEAD')throw new ConflictException('Lobby encryption activated; retry upload');
            await fs.writeFile(temporary, encoded, { flag: 'wx' });
            await fs.rename(temporary, destination);
            await client.query(`INSERT INTO pending_image_uploads(id,uploader_id,conversation_id,file_name,file_size,mime_type,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id, actor.userId, conversation, row.file_name, row.file_size, row.mime_type, now, expires]);
            await client.query('COMMIT');
            return attachmentDTO(row);
        }
        catch (error) {
            await client.query('ROLLBACK');
            await fs.rm(temporary, { force: true });
            await fs.rm(destination, { force: true });
            throw error;
        }
        finally {
            client.release();
        }
    }
    private async uploadLobby(conversation:string,encoded:Buffer,actor:NonNullable<ChatActor>){
        const id=randomUUID(),key=id+'.bin',client=await this.pool.connect();let stored=false;
        try{
            await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');await this.chat.authorize(conversation,actor,client,true);
            const state=await this.chat.assertLegacyRouteAllowed(conversation,client,true);if(state?.mode!=='LOBBY_AEAD')throw new ConflictException('Lobby state changed');
            const envelope=await this.lobbyCipher.encodeImage(encoded,conversation,id),ciphertext=Buffer.from(JSON.stringify(envelope));
            await this.chat.authorize(conversation,actor,client,true);
            await lockCryptoObjectWrite(client,key);await this.lobbyCipher.objects.put(key,ciphertext);stored=true;
            await client.query(`INSERT INTO chat_crypto_upload_drafts(id,uploader_id,conversation_id,client_upload_id,membership_revision,encryption_mode,object_key,ciphertext_size,ciphertext_sha256,envelope,expires_at) VALUES($1,$2,$3,$1,$4,'LOBBY_AEAD',$5,$6,$7,$8,clock_timestamp()+($9::bigint*interval '1 millisecond'))`,[id,actor.userId,conversation,state.membership_revision,key,ciphertext.length,createHash('sha256').update(ciphertext).digest('base64').replace(/=+$/,''),envelope,IMAGE_DRAFT_TTL_MS]);
            await this.chat.authorize(conversation,actor,client,true);await client.query('COMMIT');return attachmentDTO({id,file_name:'image.webp',file_size:encoded.length,mime_type:'image/webp'});
        }catch(error){await client.query('ROLLBACK');if(stored)await this.lobbyCipher.objects.remove(key);throw error;}
        finally{encoded.fill(0);client.release();}
    }
    private async lobbyImage(id:string,actor:ChatActor,attached:{message_id:string;conversation_id:string;crypto_envelope:unknown}|undefined){
        const draft=(await this.pool.query(`SELECT * FROM chat_crypto_upload_drafts WHERE id=$1 AND encryption_mode='LOBBY_AEAD'`,[id])).rows[0];
        if(!draft)chatError(ErrorCode.NOT_FOUND,'Image not found');
        await this.chat.authorize(draft.conversation_id,actor);const state=await this.chat.assertLegacyRouteAllowed(draft.conversation_id);
        if(state?.mode!=='LOBBY_AEAD')throw new ServiceUnavailableException('Lobby ciphertext required');
        if(!attached){if(draft.consumed_at||draft.expires_at.getTime()<=Date.now())chatError(ErrorCode.NOT_FOUND,'Image not found');if(draft.uploader_id!==actor?.userId)chatError(ErrorCode.FORBIDDEN,'Draft belongs to uploader');}
        else{
            const message=(await this.pool.query('SELECT * FROM messages WHERE id=$1',[attached.message_id])).rows[0];
            if(!message||!draft.consumed_at||draft.message_id!==message.id||draft.conversation_id!==message.conversation_id||attached.conversation_id!==message.conversation_id||draft.uploader_id!==message.sender_id||message.encryption_mode!=='LOBBY_AEAD'||JSON.stringify(attached.crypto_envelope)!==JSON.stringify(draft.envelope))throw new ServiceUnavailableException('Lobby attachment integrity failed');
            const payload=await this.lobbyCipher.decodeMessage(message);if(!payload.attachments.some(a=>a.id===id))throw new ServiceUnavailableException('Lobby attachment selection failed');
        }
        await this.chat.authorize(draft.conversation_id,actor);await this.chat.assertLegacyRouteAllowed(draft.conversation_id);return {...draft,lobbyCiphertext:true};
    }
    async image(id: string, actor: ChatActor) {
        const attached = (await this.pool.query('SELECT * FROM attachments WHERE id=$1', [id])).rows[0];
        if(attached?.encryption_mode==='LOBBY_AEAD')return this.lobbyImage(id,actor,attached);
        if(!attached&&(await this.pool.query("SELECT to_regclass('chat_crypto_upload_drafts') IS NOT NULL AS installed")).rows[0]?.installed){const encrypted=(await this.pool.query("SELECT id FROM chat_crypto_upload_drafts WHERE id=$1 AND encryption_mode='LOBBY_AEAD'",[id])).rows[0];if(encrypted)return this.lobbyImage(id,actor,undefined);}
        const draft = attached ? null : (await this.pool.query('SELECT * FROM pending_image_uploads WHERE id=$1 AND expires_at>now()', [id])).rows[0];
        const row = attached ?? draft;
        if (!row)
            chatError(ErrorCode.NOT_FOUND, 'Image not found');
        await this.chat.authorize(row.conversation_id, actor);
        await this.chat.assertLegacyRouteAllowed(row.conversation_id);
        if (row.encryption_mode === 'E2EE') chatError(ErrorCode.FORBIDDEN, 'Use encrypted object transport');
        if (draft && draft.uploader_id !== actor?.userId)
            chatError(ErrorCode.FORBIDDEN, 'Draft belongs to uploader');
        return row;
    }
    async content(id: string, actor: ChatActor) {
        const row=await this.image(id, actor);
        if(row.lobbyCiphertext){const bytes=await this.lobbyCipher.readImage(row);try{await this.image(id,actor);return bytes;}catch(error){bytes.fill(0);throw error;}}
        let bytes: Buffer;
        try {
            bytes = await fs.readFile(this.file(id));
        }
        catch {
            chatError(ErrorCode.NOT_FOUND, 'Image not found');
        }
        await this.image(id, actor);
        return bytes;
    }
    async cleanup(now: Date = new Date()) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const expired = (await client.query('SELECT id FROM pending_image_uploads WHERE expires_at<=$1 ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED', [now])).rows;
            for (const draft of expired) {
                await fs.rm(this.file(draft.id), { force: true });
                await client.query('DELETE FROM pending_image_uploads WHERE id=$1', [draft.id]);
            }
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
        const files = await fs.readdir(this.directory);
        for (const name of files) {
            const id = name.slice(0, 36);
            if (!uuid.test(id) || !['.webp', '.tmp'].includes(name.slice(36)))
                continue;
            const file = path.join(this.directory, name);
            let stat;
            try {
                stat = await fs.lstat(file);
            }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                    continue;
                throw error;
            }
            if (!stat.isFile() || stat.mtimeMs > now.getTime() - IMAGE_DRAFT_TTL_MS)
                continue;
            const tracked = await this.pool.query('SELECT id FROM attachments WHERE id=$1 UNION ALL SELECT id FROM pending_image_uploads WHERE id=$1 LIMIT 1', [id]);
            if (!tracked.rowCount)
                await fs.rm(file, { force: true });
        }
    }
}
