"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var UploadsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadsService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const node_crypto_1 = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharpModule = require("sharp");
const contracts_1 = require("@fg/contracts");
const chat_service_js_1 = require("../chat/chat.service.js");
const attachment_dto_js_1 = require("../chat/attachment-dto.js");
const sharp = sharpModule.default ?? sharpModule;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let UploadsService = UploadsService_1 = class UploadsService {
    chat;
    pool;
    directory;
    timer;
    sweeping;
    opening;
    logger = new common_1.Logger(UploadsService_1.name);
    constructor(chat) {
        this.chat = chat;
    }
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
        this.pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
    }
    async ready() {
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
    file(id) {
        if (!uuid.test(id))
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Image not found');
        return path.join(this.directory, `${id}.webp`);
    }
    async upload(body, file, actor) {
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        await this.ready();
        const parsed = contracts_1.UploadImageRequestSchema.safeParse({ ...typeof body === 'object' && body !== null ? body : {}, file: file && { bytes: file.buffer, fileName: file.originalname, mimeType: file.mimetype } });
        if (!parsed.success)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid upload');
        const input = parsed.data, conversation = await this.chat.authorize(input.conversationId, actor, undefined, true);
        const bytes = Buffer.from(input.file.bytes);
        let actual = null;
        if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
            actual = 'image/jpeg';
        else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
            actual = 'image/png';
        else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
            actual = 'image/webp';
        if (actual !== input.file.mimeType)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Image signature mismatch');
        let encoded;
        try {
            const image = sharp(bytes, { limitInputPixels: contracts_1.MAX_IMAGE_PIXELS }), meta = await image.metadata();
            const metadata = contracts_1.UploadImageMetadataSchema.safeParse({ width: meta.width, height: meta.height, mimeType: actual, fileSize: bytes.length });
            if (!metadata.success)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Image dimensions invalid');
            encoded = await image.rotate().webp().toBuffer();
        }
        catch {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Image decode failed');
        }
        if (encoded.length > contracts_1.MAX_IMAGE_SIZE_BYTES)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Encoded image exceeds size limit');
        const id = (0, node_crypto_1.randomUUID)(), destination = this.file(id), temporary = path.join(this.directory, `${id}.tmp`), now = new Date(), expires = new Date(now.getTime() + contracts_1.IMAGE_DRAFT_TTL_MS);
        const baseName = path.basename(input.file.fileName.replaceAll('\\', '/')).replace(/\.[^.]*$/, '').split('').filter(character => character.charCodeAt(0) >= 32).join('').slice(0, 240) || 'image';
        const row = { id, file_name: `${baseName}.webp`, file_size: encoded.length, mime_type: 'image/webp' };
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await this.chat.authorize(conversation, actor, client, true);
            await fs.writeFile(temporary, encoded, { flag: 'wx' });
            await fs.rename(temporary, destination);
            await client.query(`INSERT INTO pending_image_uploads(id,uploader_id,conversation_id,file_name,file_size,mime_type,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id, actor.userId, conversation, row.file_name, row.file_size, row.mime_type, now, expires]);
            await client.query('COMMIT');
            return (0, attachment_dto_js_1.attachmentDTO)(row);
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
    async image(id, actor) {
        const attached = (await this.pool.query('SELECT * FROM attachments WHERE id=$1', [id])).rows[0];
        const draft = attached ? null : (await this.pool.query('SELECT * FROM pending_image_uploads WHERE id=$1 AND expires_at>now()', [id])).rows[0];
        const row = attached ?? draft;
        if (!row)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Image not found');
        await this.chat.authorize(row.conversation_id, actor);
        if (draft && draft.uploader_id !== actor?.userId)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Draft belongs to uploader');
        return row;
    }
    async content(id, actor) {
        await this.image(id, actor);
        let bytes;
        try {
            bytes = await fs.readFile(this.file(id));
        }
        catch {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Image not found');
        }
        await this.image(id, actor);
        return bytes;
    }
    async cleanup(now = new Date()) {
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
                if (error.code === 'ENOENT')
                    continue;
                throw error;
            }
            if (!stat.isFile() || stat.mtimeMs > now.getTime() - contracts_1.IMAGE_DRAFT_TTL_MS)
                continue;
            const tracked = await this.pool.query('SELECT id FROM attachments WHERE id=$1 UNION ALL SELECT id FROM pending_image_uploads WHERE id=$1 LIMIT 1', [id]);
            if (!tracked.rowCount)
                await fs.rm(file, { force: true });
        }
    }
};
exports.UploadsService = UploadsService;
exports.UploadsService = UploadsService = UploadsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [chat_service_js_1.ChatService])
], UploadsService);
//# sourceMappingURL=uploads.service.js.map