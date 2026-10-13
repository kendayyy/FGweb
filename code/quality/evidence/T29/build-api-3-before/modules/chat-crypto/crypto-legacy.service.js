"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoLegacyService = void 0;
const crypto_schema_readiness_js_1 = require("./crypto-schema-readiness.js");
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const fs = __importStar(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const contracts_1 = require("@fg/contracts");
const chat_service_js_1 = require("../chat/chat.service.js");
const matrix_signatures_js_1 = require("./matrix-signatures.js");
const crypto_object_store_js_1 = require("./crypto-object-store.js");
const maximum = 5 * 1024 * 1024, uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
let CryptoLegacyService = class CryptoLegacyService {
    chat;
    objects = new crypto_object_store_js_1.CryptoObjectStore();
    objectInitialization;
    schemaReady = false;
    cleanupEnabled = false;
    pool;
    directory;
    runtimeRoot;
    realDirectory;
    constructor(chat) {
        this.chat = chat;
    }
    async onModuleInit() {
        const cwd = process.cwd(), codeRoot = node_path_1.default.basename(cwd) === 'api' && node_path_1.default.basename(node_path_1.default.dirname(cwd)) === 'apps' ? node_path_1.default.resolve(cwd, '../..') : cwd, root = node_path_1.default.join(codeRoot, '.runtime');
        this.directory = node_path_1.default.resolve(process.env.FG_UPLOADS_DIR ?? node_path_1.default.join(root, 'chat-images'));
        if (!this.directory.startsWith(root + node_path_1.default.sep))
            throw new Error('Legacy image storage must remain inside code runtime');
        this.runtimeRoot = root;
        this.cleanupEnabled = process.env.FG_LEGACY_SOURCE_CLEANUP === 'enabled';
        this.pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
        this.schemaReady = await (0, crypto_schema_readiness_js_1.cryptoSchemaAvailable)(this.pool);
    }
    async onModuleDestroy() { await this.pool?.end(); }
    parse(schema, input) { const parsed = schema.safeParse(input); if (!parsed.success)
        (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid legacy migration request'); return parsed.data; }
    publicDigest(value) { try {
        return (0, matrix_signatures_js_1.matrixBase64)(value, 32);
    }
    catch {
        (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid migration public encoding');
    } }
    async device(db, userId, deviceId, cohortId) {
        const eligible = (await db.query(`SELECT d.ed25519_key,d.curve25519_key FROM chat_crypto_devices d JOIN chat_crypto_history_cohorts c ON c.id=$3 WHERE d.user_id=$1 AND d.device_id=$2 AND d.revoked_at IS NULL AND d.created_at<=c.verified_at`, [userId, deviceId, cohortId])).rows[0];
        if (!eligible)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Historical device unavailable');
        return eligible;
    }
    async authorizeCohort(db, actor, id, deviceId, cohortId) {
        const cohort = (await db.query(`SELECT c.id FROM chat_crypto_history_cohorts c JOIN chat_crypto_cohort_members m ON m.cohort_id=c.id AND m.conversation_id=c.conversation_id WHERE c.id=$1 AND c.conversation_id=$2 AND m.user_id=$3 AND c.verified_at<=clock_timestamp() FOR SHARE OF c,m`, [cohortId, id, actor.userId])).rowCount;
        if (!cohort)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Historical cohort access denied');
        await this.device(db, actor.userId, deviceId, cohortId);
    }
    async transaction(actor, id, deviceId, cohortId, action, allowCompleted = false) {
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        if (!this.schemaReady)
            throw new common_1.ServiceUnavailableException('Chat crypto schema unavailable');
        const db = await this.pool.connect();
        try {
            await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
            await this.chat.authorize(id, actor, db, true);
            await db.query('SELECT id FROM conversations WHERE id=$1 FOR UPDATE', [id]);
            const state = (await db.query('SELECT * FROM chat_crypto_state WHERE conversation_id=$1 FOR UPDATE', [id])).rows[0];
            if (!state || state.mode !== 'E2EE' || state.history_status !== 'KNOWN' || !(allowCompleted ? ['LEGACY_PENDING', 'MIGRATING', 'RECONCILED'] : ['LEGACY_PENDING', 'MIGRATING']).includes(state.migration_state))
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Verified historical source unavailable');
            await this.authorizeCohort(db, actor, id, deviceId, cohortId);
            const result = await action(db);
            await this.chat.authorize(id, actor, db, true);
            await this.device(db, actor.userId, deviceId, cohortId);
            await db.query('COMMIT');
            return result;
        }
        catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
        finally {
            db.release();
        }
    }
    async image(id) {
        if (!uuid.test(id))
            throw new common_1.ServiceUnavailableException('Historical image unavailable');
        let handle, bytes;
        try {
            const realRoot = await fs.realpath(this.runtimeRoot);
            if (realRoot !== node_path_1.default.join(await fs.realpath(node_path_1.default.dirname(this.runtimeRoot)), '.runtime'))
                throw new Error();
            const realDirectory = await fs.realpath(this.directory);
            if (!realDirectory.startsWith(realRoot + node_path_1.default.sep))
                throw new Error();
            if (this.realDirectory && realDirectory !== this.realDirectory)
                throw new Error();
            this.realDirectory = realDirectory;
            const file = node_path_1.default.join(this.directory, id + '.webp'), before = await fs.lstat(file);
            if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > maximum || await fs.realpath(file) !== node_path_1.default.join(realDirectory, id + '.webp'))
                throw new Error();
            handle = await fs.open(file, 'r');
            const opened = await handle.stat();
            if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs)
                throw new Error();
            bytes = Buffer.alloc(opened.size + 1);
            let used = 0;
            while (used < bytes.length) {
                const read = await handle.read(bytes, used, bytes.length - used, used);
                if (!read.bytesRead)
                    break;
                used += read.bytesRead;
            }
            const after = await handle.stat();
            if (used !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP')
                throw new Error();
            return bytes.subarray(0, used);
        }
        catch {
            bytes?.fill(0);
            throw new common_1.ServiceUnavailableException('Historical image unavailable');
        }
        finally {
            await handle?.close();
        }
    }
    async source(db, id, conversationId, cohortId) {
        const row = (await db.query(`SELECT m.*,to_char(m.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso,to_char(m.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_iso,lm.original_sha256 FROM messages m JOIN chat_crypto_legacy_migrations lm ON lm.message_id=m.id AND lm.conversation_id=m.conversation_id WHERE m.id=$1 AND m.conversation_id=$2 AND lm.cohort_id=$3 AND lm.state='PREPARED' AND m.encryption_mode='LEGACY_PENDING' FOR SHARE OF m,lm`, [id, conversationId, cohortId])).rows[0];
        if (!row)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Mapped historical source not found');
        const images = (await db.query(`SELECT * FROM attachments WHERE message_id=$1 AND conversation_id=$2 ORDER BY id COLLATE "C" FOR SHARE`, [id, conversationId])).rows;
        const attachments = [];
        for (const image of images) {
            if (image.encryption_mode !== 'LEGACY_PENDING' || image.crypto_envelope || image.mime_type !== 'image/webp')
                throw new common_1.ConflictException('Historical image changed');
            const bytes = await this.image(image.id);
            try {
                if (bytes.length !== image.file_size)
                    throw new common_1.ConflictException('Historical image changed');
                attachments.push({ id: image.id, fileName: image.file_name, fileSize: image.file_size, mimeType: image.mime_type, plaintextSha256: (0, node_crypto_1.createHash)('sha256').update(bytes).digest('base64').replace(/=+$/, '') });
            }
            finally {
                bytes.fill(0);
            }
        }
        const mentioned = (await db.query(`SELECT mentioned_user_id FROM mentions WHERE message_id=$1 ORDER BY mentioned_user_id COLLATE "C" FOR SHARE`, [id])).rows;
        const parsed = contracts_1.LegacySourceManifestSchema.safeParse({ version: 1, conversationId, messageId: row.id, senderId: row.sender_id, clientMessageId: row.client_message_id, type: row.type, content: row.content, replyToId: row.reply_to_id, mentionedUserIds: mentioned.map(item => item.mentioned_user_id), createdAt: row.created_iso, updatedAt: row.updated_iso, attachments });
        if (!parsed.success)
            throw new common_1.ConflictException('Historical source shape changed');
        const digest = (0, node_crypto_1.createHash)('sha256').update((0, matrix_signatures_js_1.canonicalSignedPayload)(parsed.data)).digest();
        let expected;
        try {
            expected = (0, matrix_signatures_js_1.matrixBase64)(String(row.original_sha256), 32);
        }
        catch {
            throw new common_1.ConflictException('Historical source digest unavailable');
        }
        if (!(0, node_crypto_1.timingSafeEqual)(expected, digest))
            throw new common_1.ConflictException('Historical source changed');
        return contracts_1.LegacyMigrationItemSchema.parse({ messageId: row.id, originalSha256: digest.toString('base64').replace(/=+$/, ''), createdAt: row.created_iso, senderId: row.sender_id, content: row.content, attachmentIds: attachments.map(item => item.id), sourceManifest: parsed.data });
    }
    async availableCohort(db, id, cohortId) {
        const rows = (await db.query(`SELECT m.user_id,
   EXISTS(SELECT 1 FROM chat_crypto_devices d JOIN chat_crypto_history_cohorts h ON h.id=m.cohort_id WHERE d.user_id=m.user_id AND d.revoked_at IS NULL AND d.created_at<=h.verified_at) AS device_available,
   EXISTS(SELECT 1 FROM conversations c WHERE c.id=$1 AND (c.user1_id=m.user_id OR c.user2_id=m.user_id OR EXISTS(SELECT 1 FROM rooms r JOIN room_members rm ON rm.room_id=r.id WHERE r.conversation_id=c.id AND rm.user_id=m.user_id) OR (NOT EXISTS(SELECT 1 FROM rooms r WHERE r.conversation_id=c.id) AND EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.user_id=m.user_id)))) AS member_available,
   COALESCE((SELECT a.action='BAN' FROM admin_actions a WHERE a.target_user_id=m.user_id AND a.action IN ('BAN','UNBAN') ORDER BY a.created_at DESC,a.id DESC LIMIT 1),false) AS banned
   FROM chat_crypto_cohort_members m WHERE m.cohort_id=$2 AND m.conversation_id=$1 ORDER BY m.user_id LIMIT 1001 FOR SHARE OF m`, [id, cohortId])).rows;
        if (!rows.length || rows.length > 1000 || rows.some(row => !row.device_available || !row.member_available || row.banned))
            throw new common_1.ConflictException('Historical recipient unavailable');
    }
    async prepare(actor, id, input) {
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        const parsed = this.parse(contracts_1.CommitLegacyCiphertextSchema, input), claimedDigest = this.publicDigest(parsed.originalSha256), sessionId = this.publicDigest(parsed.envelope.event.session_id).toString('base64').replace(/=+$/, '');
        return this.transaction(actor, id, parsed.deviceId, parsed.cohortId, async (db) => {
            const registered = await this.device(db, actor.userId, parsed.deviceId, parsed.cohortId);
            if (parsed.envelope.event.device_id !== undefined && parsed.envelope.event.device_id !== parsed.deviceId)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Migration sender device mismatch');
            if (parsed.envelope.event.sender_key !== undefined && !(0, node_crypto_1.timingSafeEqual)(this.publicDigest(parsed.envelope.event.sender_key), (0, matrix_signatures_js_1.matrixBase64)(registered.curve25519_key, 32)))
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Migration sender key mismatch');
            const state = (await db.query('SELECT membership_revision FROM chat_crypto_state WHERE conversation_id=$1', [id])).rows[0];
            if (Number(state.membership_revision) !== parsed.membershipRevision)
                throw new common_1.ConflictException('Membership revision changed');
            await this.availableCohort(db, id, parsed.cohortId);
            const source = await this.source(db, parsed.messageId, id, parsed.cohortId);
            if (!(0, node_crypto_1.timingSafeEqual)(claimedDigest, (0, matrix_signatures_js_1.matrixBase64)(source.originalSha256, 32)))
                throw new common_1.ConflictException('Historical source changed');
            const mappings = (parsed.attachmentMappings ?? []).map(mapping => ({ ...mapping, plaintextSha256: this.publicDigest(mapping.plaintextSha256).toString('base64').replace(/=+$/, ''), ciphertextSha256: this.publicDigest(mapping.ciphertextSha256).toString('base64').replace(/=+$/, '') }));
            if (JSON.stringify(mappings.map(mapping => mapping.attachmentId)) !== JSON.stringify(source.attachmentIds))
                throw new common_1.ConflictException('Historical image mapping incomplete');
            const envelopeSha256 = (0, node_crypto_1.createHash)('sha256').update((0, matrix_signatures_js_1.canonicalSignedPayload)(parsed.envelope)).digest('base64').replace(/=+$/, '');
            let row = (await db.query('SELECT * FROM chat_crypto_legacy_candidates WHERE message_id=$1 AND membership_revision=$2 FOR UPDATE', [parsed.messageId, parsed.membershipRevision])).rows[0];
            const existingImages = row ? (await db.query('SELECT * FROM chat_crypto_legacy_candidate_images WHERE candidate_id=$1 ORDER BY attachment_id COLLATE "C" FOR SHARE', [row.id])).rows : [];
            if (row && JSON.stringify(existingImages.map(image => ({ attachmentId: image.attachment_id, draftId: image.draft_id, plaintextSha256: image.plaintext_sha256, ciphertextSha256: image.ciphertext_sha256 }))) !== JSON.stringify(mappings))
                throw new common_1.ConflictException('Historical image mapping conflicts');
            for (const mapping of [...mappings].sort((a, b) => a.draftId < b.draftId ? -1 : a.draftId > b.draftId ? 1 : 0)) {
                const original = source.sourceManifest.attachments.find(image => image.id === mapping.attachmentId), draft = (await db.query('SELECT * FROM chat_crypto_upload_drafts WHERE id=$1 FOR UPDATE', [mapping.draftId])).rows[0];
                if (!draft || draft.uploader_id !== actor.userId || draft.device_id !== parsed.deviceId || draft.conversation_id !== id || draft.cohort_id !== parsed.cohortId || Number(draft.membership_revision) !== parsed.membershipRevision || draft.encryption_mode !== 'E2EE' || draft.envelope || draft.consumed_at || draft.message_id || draft.report_evidence_id || (!row && draft.expires_at.getTime() <= Date.now()) || mapping.plaintextSha256 !== original.plaintextSha256 || mapping.ciphertextSha256 !== draft.ciphertext_sha256)
                    throw new common_1.ConflictException('Historical image draft binding denied');
                const bytes = await this.ciphertext(draft);
                bytes.fill(0);
            }
            if (row) {
                if ((parsed.candidateId && parsed.candidateId !== row.id) || row.conversation_id !== id || row.cohort_id !== parsed.cohortId || row.importer_user_id !== actor.userId || row.importer_device_id !== parsed.deviceId || row.original_sha256 !== source.originalSha256 || row.envelope_sha256 !== envelopeSha256 || (0, matrix_signatures_js_1.canonicalSignedPayload)(row.envelope) !== (0, matrix_signatures_js_1.canonicalSignedPayload)(parsed.envelope))
                    throw new common_1.ConflictException('Historical candidate conflicts');
            }
            else {
                const session = (await db.query('SELECT * FROM chat_crypto_outbound_sessions WHERE session_id=$1', [sessionId])).rows[0];
                if (session && (session.conversation_id !== id || session.sender_user_id !== actor.userId || session.sender_device_id !== parsed.deviceId || Number(session.membership_revision) !== parsed.membershipRevision))
                    throw new common_1.ConflictException('Migration session conflicts');
                const incompatible = (await db.query("SELECT 1 FROM chat_crypto_legacy_candidates WHERE rtrim(envelope->'event'->>'session_id','=')=$1 AND cohort_id<>$2 LIMIT 1", [sessionId, parsed.cohortId])).rowCount;
                if (incompatible)
                    throw new common_1.ConflictException('Migration session cohort conflicts');
                if (!session)
                    await db.query('INSERT INTO chat_crypto_outbound_sessions(session_id,conversation_id,sender_user_id,sender_device_id,membership_revision) VALUES($1,$2,$3,$4,$5)', [sessionId, id, actor.userId, parsed.deviceId, parsed.membershipRevision]);
                try {
                    row = (await db.query('INSERT INTO chat_crypto_legacy_candidates(id,message_id,conversation_id,cohort_id,membership_revision,original_sha256,envelope_sha256,importer_user_id,importer_device_id,envelope) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [parsed.candidateId ?? (0, node_crypto_1.randomUUID)(), parsed.messageId, id, parsed.cohortId, parsed.membershipRevision, source.originalSha256, envelopeSha256, actor.userId, parsed.deviceId, parsed.envelope])).rows[0];
                }
                catch (error) {
                    if (error.code === '23505')
                        throw new common_1.ConflictException('Historical candidate conflicts');
                    throw error;
                }
            }
            if (!existingImages.length)
                for (const mapping of mappings) {
                    try {
                        await db.query('INSERT INTO chat_crypto_legacy_candidate_images(candidate_id,attachment_id,draft_id,plaintext_sha256,ciphertext_sha256) VALUES($1,$2,$3,$4,$5)', [row.id, mapping.attachmentId, mapping.draftId, mapping.plaintextSha256, mapping.ciphertextSha256]);
                    }
                    catch (error) {
                        if (error.code === '23505')
                            throw new common_1.ConflictException('Historical image draft already claimed');
                        throw error;
                    }
                }
            const bound = await this.boundCandidate(db, id, parsed.cohortId, row.id);
            await this.availableCohort(db, id, parsed.cohortId);
            return this.candidateDto(row, bound.images.map(image => image.attachment_id));
        });
    }
    candidateDto(row, attachmentIds = []) { return contracts_1.LegacyCandidateSchema.parse({ candidateId: row.id, messageId: row.message_id, conversationId: row.conversation_id, cohortId: row.cohort_id, membershipRevision: Number(row.membership_revision), originalSha256: row.original_sha256, envelopeSha256: row.envelope_sha256, importerUserId: row.importer_user_id, importerDeviceId: row.importer_device_id, envelope: row.envelope, attachmentIds, preparedAt: row.prepared_at.toISOString(), state: 'PREPARED' }); }
    async ciphertext(draft) {
        this.objectInitialization ??= this.objects.initialize();
        await this.objectInitialization;
        let bytes;
        try {
            bytes = await this.objects.read(String(draft.object_key));
            if (bytes.length !== draft.ciphertext_size || !(0, node_crypto_1.timingSafeEqual)((0, node_crypto_1.createHash)('sha256').update(bytes).digest(), (0, matrix_signatures_js_1.matrixBase64)(String(draft.ciphertext_sha256), 32)))
                throw new Error();
            return bytes;
        }
        catch {
            bytes?.fill(0);
            throw new common_1.ConflictException('Historical ciphertext object changed');
        }
    }
    async mappedImages(db, row, source) {
        const images = (await db.query(`SELECT ci.*,d.uploader_id,d.device_id,d.conversation_id,d.cohort_id,d.membership_revision,d.encryption_mode,d.envelope,d.consumed_at,d.message_id,d.report_evidence_id,d.object_key,d.ciphertext_size,d.ciphertext_sha256 AS draft_sha256 FROM chat_crypto_legacy_candidate_images ci JOIN chat_crypto_upload_drafts d ON d.id=ci.draft_id WHERE ci.candidate_id=$1 ORDER BY ci.attachment_id COLLATE "C" FOR SHARE OF ci FOR UPDATE OF d`, [row.id])).rows;
        if (JSON.stringify(images.map(image => image.attachment_id)) !== JSON.stringify(source.attachmentIds))
            throw new common_1.ConflictException('Historical image mapping changed');
        for (const [index, image] of images.entries()) {
            if (image.uploader_id !== row.importer_user_id || image.device_id !== row.importer_device_id || image.conversation_id !== row.conversation_id || image.cohort_id !== row.cohort_id || Number(image.membership_revision) !== Number(row.membership_revision) || image.encryption_mode !== 'E2EE' || image.envelope || image.consumed_at || image.message_id || image.report_evidence_id || image.plaintext_sha256 !== source.sourceManifest.attachments[index].plaintextSha256 || image.ciphertext_sha256 !== image.draft_sha256)
                throw new common_1.ConflictException('Historical image mapping changed');
            const bytes = await this.ciphertext(image);
            bytes.fill(0);
        }
        return images;
    }
    async convertedImages(db, row) {
        const attachments = (await db.query('SELECT * FROM attachments WHERE message_id=$1 AND conversation_id=$2 ORDER BY id COLLATE "C" FOR SHARE', [row.message_id, row.conversation_id])).rows;
        const images = (await db.query(`SELECT ci.*,d.uploader_id,d.device_id,d.conversation_id,d.cohort_id,d.membership_revision,d.encryption_mode,d.envelope,d.consumed_at,d.message_id,d.report_evidence_id,d.object_key,d.ciphertext_size,d.ciphertext_sha256 AS draft_sha256 FROM chat_crypto_legacy_candidate_images ci JOIN chat_crypto_upload_drafts d ON d.id=ci.draft_id WHERE ci.candidate_id=$1 ORDER BY ci.attachment_id COLLATE "C" FOR SHARE OF ci FOR UPDATE OF d`, [row.id])).rows;
        if (images.length !== attachments.length || images.length > 4)
            throw new common_1.ConflictException('Converted image mapping changed');
        for (const [index, image] of images.entries()) {
            const attachment = attachments[index];
            if (image.attachment_id !== attachment.id || attachment.encryption_mode !== 'E2EE' || attachment.crypto_envelope || attachment.file_name !== '' || attachment.mime_type !== 'application/octet-stream' || attachment.file_size !== image.ciphertext_size || attachment.url !== `/api/v1/crypto/conversations/${encodeURIComponent(String(row.conversation_id))}/attachments/${encodeURIComponent(String(image.attachment_id))}` || image.uploader_id !== row.importer_user_id || image.device_id !== row.importer_device_id || image.conversation_id !== row.conversation_id || image.cohort_id !== row.cohort_id || Number(image.membership_revision) !== Number(row.membership_revision) || image.encryption_mode !== 'E2EE' || image.envelope || !image.consumed_at || image.message_id !== row.message_id || image.report_evidence_id || image.ciphertext_sha256 !== image.draft_sha256)
                throw new common_1.ConflictException('Converted image mapping changed');
            const bytes = await this.ciphertext(image);
            bytes.fill(0);
        }
        return images;
    }
    async candidateContent(actor, id, candidateId, attachmentId, input) {
        const parsed = this.parse(contracts_1.LegacyCandidateQuerySchema, input), candidate = this.parse(zod_1.z.string().min(1).max(128), candidateId), attachment = this.parse(zod_1.z.string().min(1).max(128), attachmentId);
        let bytes;
        try {
            return await this.transaction(actor, id, parsed.deviceId, parsed.cohortId, async (db) => { const bound = await this.boundCandidate(db, id, parsed.cohortId, candidate), image = bound.images.find(image => image.attachment_id === attachment); if (!image)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Historical candidate image not found'); bytes = await this.ciphertext(image); await this.boundCandidate(db, id, parsed.cohortId, candidate); await this.availableCohort(db, id, parsed.cohortId); return bytes; });
        }
        catch (error) {
            bytes?.fill(0);
            throw error;
        }
    }
    async boundCandidate(db, id, cohortId, candidateId, converted = false, completed = false) {
        const row = (await db.query('SELECT * FROM chat_crypto_legacy_candidates WHERE id=$1 AND conversation_id=$2 AND cohort_id=$3 FOR UPDATE', [candidateId, id, cohortId])).rows[0];
        if (!row)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Historical candidate not found');
        const state = (await db.query('SELECT membership_revision,migration_state FROM chat_crypto_state WHERE conversation_id=$1', [id])).rows[0];
        if (completed ? (state.migration_state !== 'RECONCILED' || Number(state.membership_revision) < Number(row.membership_revision) + 1) : Number(state.membership_revision) !== Number(row.membership_revision))
            throw new common_1.ConflictException('Membership revision changed');
        if (!completed) {
            await this.availableCohort(db, id, cohortId);
            await this.device(db, row.importer_user_id, row.importer_device_id, cohortId);
        }
        let source;
        if (converted) {
            const message = (await db.query(`SELECT m.*,lm.original_sha256,lm.cohort_id,lm.state,lm.reconciled_at FROM messages m JOIN chat_crypto_legacy_migrations lm ON lm.message_id=m.id AND lm.conversation_id=m.conversation_id WHERE m.id=$1 AND m.conversation_id=$2 FOR SHARE OF m,lm`, [row.message_id, id])).rows[0];
            if (!message || message.encryption_mode !== 'E2EE' || message.content !== '' || message.state !== 'RECONCILED' || !message.reconciled_at || message.cohort_id !== cohortId || message.original_sha256 !== row.original_sha256 || Number(message.crypto_revision) !== Number(row.membership_revision) || (0, matrix_signatures_js_1.canonicalSignedPayload)(message.crypto_envelope) !== (0, matrix_signatures_js_1.canonicalSignedPayload)(row.envelope))
                throw new common_1.ConflictException('Converted source binding changed');
        }
        else {
            source = await this.source(db, row.message_id, id, cohortId);
            if (row.original_sha256 !== source.originalSha256)
                throw new common_1.ConflictException('Historical candidate binding changed');
        }
        if (row.envelope_sha256 !== (0, node_crypto_1.createHash)('sha256').update((0, matrix_signatures_js_1.canonicalSignedPayload)(row.envelope)).digest('base64').replace(/=+$/, ''))
            throw new common_1.ConflictException('Historical candidate binding changed');
        const images = converted ? await this.convertedImages(db, row) : await this.mappedImages(db, row, source);
        const sessionId = this.publicDigest(row.envelope.event.session_id).toString('base64').replace(/=+$/, ''), session = (await db.query('SELECT * FROM chat_crypto_outbound_sessions WHERE session_id=$1 FOR SHARE', [sessionId])).rows[0];
        if (!session || session.conversation_id !== id || session.sender_user_id !== row.importer_user_id || session.sender_device_id !== row.importer_device_id || Number(session.membership_revision) !== Number(row.membership_revision))
            throw new common_1.ConflictException('Migration session binding changed');
        return { row, images, expected: { candidateId: row.id, messageId: row.message_id, conversationId: id, cohortId, membershipRevision: Number(row.membership_revision), originalSha256: row.original_sha256, envelopeSha256: row.envelope_sha256, attachmentDigests: images.map(image => ({ attachmentId: image.attachment_id, plaintextSha256: image.plaintext_sha256, ciphertextSha256: image.ciphertext_sha256 })) } };
    }
    async candidate(actor, id, candidateId, input) { const parsed = this.parse(contracts_1.LegacyCandidateQuerySchema, input), candidate = this.parse(zod_1.z.string().min(1).max(128), candidateId); return this.transaction(actor, id, parsed.deviceId, parsed.cohortId, async (db) => { const { row, images } = await this.boundCandidate(db, id, parsed.cohortId, candidate); await this.availableCohort(db, id, parsed.cohortId); return this.candidateDto(row, images.map(image => image.attachment_id)); }); }
    async attest(actor, id, input) {
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        const parsed = this.parse(contracts_1.LegacyRoundtripAttestationSchema, input);
        if (parsed.userId !== actor.userId || parsed.conversationId !== id)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Historical receipt owner denied');
        return this.transaction(actor, id, parsed.deviceId, parsed.cohortId, async (db) => {
            const { row, expected } = await this.boundCandidate(db, id, parsed.cohortId, parsed.candidateId), device = await this.device(db, actor.userId, parsed.deviceId, parsed.cohortId);
            let receipt;
            try {
                (0, matrix_signatures_js_1.canonicalSignedPayload)(parsed.signatures);
                receipt = (0, matrix_signatures_js_1.verifyLegacyRoundtripAttestation)(parsed, { userId: actor.userId, deviceId: parsed.deviceId, ed25519Key: device.ed25519_key }, expected);
            }
            catch {
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Historical receipt authentication denied');
            }
            const json = JSON.stringify(receipt), size = (await db.query('SELECT octet_length($1::jsonb::text) AS bytes', [json])).rows[0].bytes;
            if (size > 16384)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Historical receipt too large');
            const existing = (await db.query('SELECT attestation FROM chat_crypto_legacy_attestations WHERE candidate_id=$1 AND user_id=$2 AND device_id=$3 FOR UPDATE', [row.id, actor.userId, parsed.deviceId])).rows[0];
            if (existing) {
                if ((0, matrix_signatures_js_1.canonicalSignedPayload)(existing.attestation) !== (0, matrix_signatures_js_1.canonicalSignedPayload)(receipt) || (0, matrix_signatures_js_1.canonicalSignedPayload)(existing.attestation.signatures) !== (0, matrix_signatures_js_1.canonicalSignedPayload)(receipt.signatures))
                    throw new common_1.ConflictException('Historical receipt conflicts');
            }
            else
                await db.query('INSERT INTO chat_crypto_legacy_attestations(candidate_id,cohort_id,user_id,device_id,attestation) VALUES($1,$2,$3,$4,$5)', [row.id, parsed.cohortId, actor.userId, parsed.deviceId, json]);
            await this.boundCandidate(db, id, parsed.cohortId, parsed.candidateId);
            await this.availableCohort(db, id, parsed.cohortId);
            return { success: true };
        });
    }
    async reviewReconciliation(actor, id, input) {
        const parsed = this.parse(contracts_1.LegacyReconcileRequestSchema, input);
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        return this.transaction(actor, id, parsed.deviceId, parsed.cohortId, db => this.cutoffReadiness(db, actor, id, parsed));
    }
    async stageReconciliation(actor, id, input) {
        const parsed = this.parse(contracts_1.LegacyReconcileRequestSchema, input);
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        return this.transaction(actor, id, parsed.deviceId, parsed.cohortId, async (db) => {
            if (parsed.membershipRevision >= Number.MAX_SAFE_INTEGER)
                throw new common_1.ConflictException('Historical next epoch unavailable');
            const ready = await this.cutoffReadiness(db, actor, id, parsed), snapshot = await this.stageSnapshot(db, id, ready), manifestSha256 = (0, node_crypto_1.createHash)('sha256').update((0, matrix_signatures_js_1.canonicalSignedPayload)(snapshot.manifest)).digest('base64').replace(/=+$/, '');
            let stage = (await db.query('SELECT * FROM chat_crypto_legacy_stages WHERE conversation_id=$1 FOR UPDATE', [id])).rows[0];
            if (stage) {
                if (stage.phase !== 'STAGED' || stage.seed_cohort_id !== parsed.cohortId || Number(stage.membership_revision) !== parsed.membershipRevision || Number(stage.next_live_revision) !== parsed.membershipRevision + 1 || Number(stage.source_count) !== ready.sourceCount || Number(stage.attachment_count) !== ready.attachmentCount || Number(stage.required_claims) !== ready.requiredDeviceClaims || stage.manifest_sha256 !== manifestSha256)
                    throw new common_1.ConflictException('Historical stage conflicts');
                await this.validateStageRows(db, stage.id, snapshot);
            }
            else {
                stage = (await db.query(`INSERT INTO chat_crypto_legacy_stages(id,conversation_id,seed_cohort_id,reviewer_user_id,reviewer_device_id,membership_revision,next_live_revision,source_count,attachment_count,required_claims,manifest_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [(0, node_crypto_1.randomUUID)(), id, parsed.cohortId, actor.userId, parsed.deviceId, parsed.membershipRevision, parsed.membershipRevision + 1, ready.sourceCount, ready.attachmentCount, ready.requiredDeviceClaims, manifestSha256])).rows[0];
                for (const source of snapshot.sources)
                    await db.query('INSERT INTO chat_crypto_legacy_stage_sources(stage_id,message_id,candidate_id,cohort_id,conversation_id,membership_revision,original_sha256,envelope_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [stage.id, source.messageId, source.candidateId, source.cohortId, id, parsed.membershipRevision, source.originalSha256, source.envelopeSha256]);
                for (const image of snapshot.objects)
                    await db.query('INSERT INTO chat_crypto_legacy_stage_objects(stage_id,message_id,candidate_id,attachment_id,draft_id,plaintext_sha256,ciphertext_sha256) VALUES($1,$2,$3,$4,$5,$6,$7)', [stage.id, image.messageId, image.candidateId, image.attachmentId, image.draftId, image.plaintextSha256, image.ciphertextSha256]);
                await this.validateStageRows(db, stage.id, snapshot);
            }
            const finalReady = await this.cutoffReadiness(db, actor, id, parsed), finalSnapshot = await this.stageSnapshot(db, id, finalReady);
            if ((0, matrix_signatures_js_1.canonicalSignedPayload)(finalSnapshot.manifest) !== (0, matrix_signatures_js_1.canonicalSignedPayload)(snapshot.manifest))
                throw new common_1.ConflictException('Historical stage changed');
            return { operationId: stage.id, conversationId: id, phase: 'STAGED', membershipRevision: parsed.membershipRevision, nextLiveRevision: parsed.membershipRevision + 1, sourceCount: ready.sourceCount, attachmentCount: ready.attachmentCount, requiredDeviceClaims: ready.requiredDeviceClaims, manifestSha256 };
        });
    }
    async convertStagedReconciliation(actor, id, input) {
        const parsed = this.parse(contracts_1.LegacyReconcileRequestSchema, input);
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        return this.transaction(actor, id, parsed.deviceId, parsed.cohortId, async (db) => {
            const stage = (await db.query('SELECT * FROM chat_crypto_legacy_stages WHERE conversation_id=$1 FOR UPDATE', [id])).rows[0], state = (await db.query('SELECT migration_state FROM chat_crypto_state WHERE conversation_id=$1', [id])).rows[0];
            if (!stage || !['STAGED', 'DB_CONVERTED'].includes(stage.phase) || stage.seed_cohort_id !== parsed.cohortId || Number(stage.membership_revision) !== parsed.membershipRevision || Number(stage.next_live_revision) !== parsed.membershipRevision + 1 || Number(stage.source_count) !== parsed.expectedSourceCount || (stage.phase === 'STAGED' ? state.migration_state !== 'LEGACY_PENDING' : state.migration_state !== 'MIGRATING'))
                throw new common_1.ConflictException('Historical conversion stage conflicts');
            const converted = stage.phase === 'DB_CONVERTED', ready = await this.cutoffReadiness(db, actor, id, parsed, converted), snapshot = await this.stageSnapshot(db, id, ready, converted);
            if (Number(stage.attachment_count) !== ready.attachmentCount || Number(stage.required_claims) !== ready.requiredDeviceClaims || stage.manifest_sha256 !== (0, node_crypto_1.createHash)('sha256').update((0, matrix_signatures_js_1.canonicalSignedPayload)(snapshot.manifest)).digest('base64').replace(/=+$/, ''))
                throw new common_1.ConflictException('Historical conversion manifest changed');
            await this.validateStageRows(db, stage.id, snapshot);
            await this.sourceRootBinding(db, stage, !converted);
            if (!converted) {
                await db.query("UPDATE chat_crypto_state SET migration_state='MIGRATING' WHERE conversation_id=$1", [id]);
                const sourceImages = new Map();
                for (const image of snapshot.objects) {
                    const images = sourceImages.get(image.messageId) ?? [];
                    images.push(image);
                    sourceImages.set(image.messageId, images);
                }
                for (const source of snapshot.sources) {
                    const candidate = (await db.query('SELECT envelope FROM chat_crypto_legacy_candidates WHERE id=$1 AND message_id=$2 AND conversation_id=$3 FOR UPDATE', [source.candidateId, source.messageId, id])).rows[0];
                    const updated = await db.query("UPDATE messages SET content='',encryption_mode='E2EE',crypto_envelope=$3,crypto_revision=$4 WHERE id=$1 AND conversation_id=$2 AND encryption_mode='LEGACY_PENDING'", [source.messageId, id, candidate.envelope, parsed.membershipRevision]);
                    if (updated.rowCount !== 1)
                        throw new common_1.ConflictException('Historical conversion source changed');
                    for (const image of sourceImages.get(source.messageId) ?? []) {
                        const draft = (await db.query('SELECT ciphertext_size FROM chat_crypto_upload_drafts WHERE id=$1 FOR UPDATE', [image.draftId])).rows[0];
                        const claimed = await db.query(`WITH claim_clock AS MATERIALIZED (SELECT clock_timestamp() AS claimed_at) UPDATE chat_crypto_upload_drafts SET message_id=$2,consumed_at=claim_clock.claimed_at,expires_at=GREATEST(expires_at,claim_clock.claimed_at+interval '1 millisecond') FROM claim_clock WHERE id=$1 AND message_id IS NULL AND consumed_at IS NULL`, [image.draftId, source.messageId]);
                        if (claimed.rowCount !== 1)
                            throw new common_1.ConflictException('Historical conversion object changed');
                        const attachment = await db.query("UPDATE attachments SET encryption_mode='E2EE',crypto_envelope=NULL,file_name='',mime_type='application/octet-stream',url=$4,file_size=$5 WHERE id=$1 AND message_id=$2 AND conversation_id=$3 AND encryption_mode='LEGACY_PENDING'", [image.attachmentId, source.messageId, id, `/api/v1/crypto/conversations/${encodeURIComponent(id)}/attachments/${encodeURIComponent(image.attachmentId)}`, draft.ciphertext_size]);
                        if (attachment.rowCount !== 1)
                            throw new common_1.ConflictException('Historical conversion attachment changed');
                    }
                    const reconciled = await db.query("UPDATE chat_crypto_legacy_migrations SET state='RECONCILED',reconciled_at=clock_timestamp() WHERE message_id=$1 AND conversation_id=$2 AND state='PREPARED'", [source.messageId, id]);
                    if (reconciled.rowCount !== 1)
                        throw new common_1.ConflictException('Historical conversion source changed');
                }
                await db.query("UPDATE chat_crypto_legacy_stages SET phase='DB_CONVERTED',converted_at=clock_timestamp() WHERE id=$1", [stage.id]);
            }
            const finalReady = await this.cutoffReadiness(db, actor, id, parsed, true), finalSnapshot = await this.stageSnapshot(db, id, finalReady, true);
            await this.validateStageRows(db, stage.id, finalSnapshot);
            if ((0, matrix_signatures_js_1.canonicalSignedPayload)(finalSnapshot.manifest) !== (0, matrix_signatures_js_1.canonicalSignedPayload)(snapshot.manifest))
                throw new common_1.ConflictException('Historical conversion changed');
            return { operationId: stage.id, conversationId: id, phase: 'DB_CONVERTED', membershipRevision: parsed.membershipRevision, nextLiveRevision: parsed.membershipRevision + 1, sourceCount: ready.sourceCount, attachmentCount: ready.attachmentCount };
        });
    }
    async sourceRootBinding(db, stage, create = false) {
        if (!Number(stage.attachment_count))
            return;
        try {
            const root = await fs.realpath(this.runtimeRoot), directory = await fs.realpath(this.directory), stat = await fs.lstat(this.directory, { bigint: true });
            if (root !== node_path_1.default.join(await fs.realpath(node_path_1.default.dirname(this.runtimeRoot)), '.runtime') || directory !== this.directory || !directory.startsWith(root + node_path_1.default.sep) || !stat.isDirectory() || stat.isSymbolicLink())
                throw new Error();
            const scope = (await db.query('SELECT current_database() AS database,current_schema() AS schema')).rows[0], hash = (value) => (0, node_crypto_1.createHash)('sha256').update((0, matrix_signatures_js_1.canonicalSignedPayload)(value)).digest('hex');
            const scopeSha256 = hash(scope), expected = { version: 1, operationId: stage.id, conversationId: stage.conversation_id, manifestSha256: stage.manifest_sha256, scopeSha256, sourceRootSha256: hash({ directory, dev: String(stat.dev), ino: String(stat.ino) }) };
            const folder = node_path_1.default.join(node_path_1.default.dirname(this.directory), 'legacy-operations');
            if (create)
                await fs.mkdir(folder, { recursive: true });
            if (await fs.realpath(folder) !== folder || !folder.startsWith(root + node_path_1.default.sep))
                throw new Error();
            const file = node_path_1.default.join(folder, hash({ scopeSha256, operationId: stage.id }) + '.json');
            try {
                const info = await fs.lstat(file);
                if (!info.isFile() || info.isSymbolicLink() || info.size > 4096 || (0, matrix_signatures_js_1.canonicalSignedPayload)(JSON.parse(await fs.readFile(file, 'utf8'))) !== (0, matrix_signatures_js_1.canonicalSignedPayload)(expected))
                    throw new Error();
            }
            catch (error) {
                if (!create || error.code !== 'ENOENT')
                    throw error;
                const temp = node_path_1.default.join(folder, (0, node_crypto_1.randomUUID)() + '.tmp');
                let handle;
                try {
                    handle = await fs.open(temp, 'wx');
                    await handle.writeFile(JSON.stringify(expected));
                    await handle.sync();
                    await handle.close();
                    handle = undefined;
                    await fs.rename(temp, file);
                }
                finally {
                    await handle?.close();
                    await fs.unlink(temp).catch(error => { if (error.code !== 'ENOENT')
                        throw error; });
                }
            }
        }
        catch {
            throw new common_1.ServiceUnavailableException('Historical source root binding unavailable');
        }
    }
    async removeSource(attachmentId, plaintextSha256, removed) {
        if (!uuid.test(attachmentId))
            throw new common_1.ServiceUnavailableException('Historical source path unavailable');
        const file = node_path_1.default.join(this.directory, attachmentId + '.webp');
        let before;
        try {
            before = await fs.lstat(file);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return;
            throw new common_1.ServiceUnavailableException('Historical source unavailable');
        }
        if (removed)
            throw new common_1.ConflictException('Removed historical source reappeared');
        if (!before.isFile() || before.isSymbolicLink())
            throw new common_1.ServiceUnavailableException('Historical source unavailable');
        const bytes = await this.image(attachmentId);
        try {
            if (!(0, node_crypto_1.timingSafeEqual)((0, node_crypto_1.createHash)('sha256').update(bytes).digest(), (0, matrix_signatures_js_1.matrixBase64)(plaintextSha256, 32)))
                throw new common_1.ConflictException('Historical source changed');
            const after = await fs.lstat(file);
            if (after.ino !== before.ino || after.dev !== before.dev || after.size !== before.size || after.mtimeMs !== before.mtimeMs || await fs.realpath(file) !== file)
                throw new common_1.ServiceUnavailableException('Historical source changed');
            await fs.unlink(file);
        }
        finally {
            bytes.fill(0);
        }
    }
    async cleanupStagedReconciliation(actor, id, input) {
        if (!this.cleanupEnabled)
            throw new common_1.ServiceUnavailableException('Historical source cleanup disabled');
        const parsed = this.parse(contracts_1.LegacyReconcileRequestSchema, input);
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        const context = async (db) => {
            const stage = (await db.query('SELECT * FROM chat_crypto_legacy_stages WHERE conversation_id=$1 FOR UPDATE', [id])).rows[0], state = (await db.query('SELECT * FROM chat_crypto_state WHERE conversation_id=$1', [id])).rows[0];
            if (!stage || !['DB_CONVERTED', 'CLEANING', 'RECONCILED'].includes(stage.phase) || stage.seed_cohort_id !== parsed.cohortId || Number(stage.membership_revision) !== parsed.membershipRevision || Number(stage.next_live_revision) !== parsed.membershipRevision + 1 || Number(stage.source_count) !== parsed.expectedSourceCount)
                throw new common_1.ConflictException('Historical cleanup stage conflicts');
            const completed = stage.phase === 'RECONCILED';
            if (completed ? (state.migration_state !== 'RECONCILED' || Number(state.membership_revision) < Number(stage.next_live_revision)) : (state.migration_state !== 'MIGRATING' || Number(state.membership_revision) !== parsed.membershipRevision))
                throw new common_1.ConflictException('Historical cleanup epoch changed');
            const ready = completed ? { conversationId: id, cohortId: parsed.cohortId, membershipRevision: parsed.membershipRevision, sourceCount: Number(stage.source_count), attachmentCount: Number(stage.attachment_count), requiredDeviceClaims: Number(stage.required_claims), candidateIds: (await db.query('SELECT candidate_id FROM chat_crypto_legacy_stage_sources WHERE stage_id=$1 ORDER BY message_id COLLATE "C"', [stage.id])).rows.map(row => row.candidate_id) } : await this.cutoffReadiness(db, actor, id, parsed, true);
            const snapshot = await this.stageSnapshot(db, id, ready, true, completed);
            if (stage.manifest_sha256 !== (0, node_crypto_1.createHash)('sha256').update((0, matrix_signatures_js_1.canonicalSignedPayload)(snapshot.manifest)).digest('base64').replace(/=+$/, ''))
                throw new common_1.ConflictException('Historical cleanup manifest changed');
            await this.validateStageRows(db, stage.id, snapshot, true);
            await this.sourceRootBinding(db, stage);
            const objects = (await db.query('SELECT * FROM chat_crypto_legacy_stage_objects WHERE stage_id=$1 ORDER BY message_id COLLATE "C",attachment_id COLLATE "C" FOR UPDATE', [stage.id])).rows;
            for (const object of objects)
                if (object.cleanup_state === 'REMOVED')
                    await this.removeSource(object.attachment_id, object.plaintext_sha256, true);
            if (completed && objects.some(object => object.cleanup_state !== 'REMOVED'))
                throw new common_1.ConflictException('Historical cleanup incomplete');
            return { stage, objects, completed };
        };
        const tx = (action) => this.transaction(actor, id, parsed.deviceId, parsed.cohortId, action, true);
        await tx(async (db) => { const { stage, completed } = await context(db); if (!completed && stage.phase === 'DB_CONVERTED')
            await db.query("UPDATE chat_crypto_legacy_stages SET phase='CLEANING' WHERE id=$1", [stage.id]); });
        for (let index = 0;; index++) {
            const more = await tx(async (db) => { const { stage, objects, completed } = await context(db), pending = objects.find(object => object.cleanup_state === 'PENDING'); if (completed || !pending)
                return false; if (index >= objects.length)
                throw new common_1.ConflictException('Historical cleanup progress changed'); await this.removeSource(pending.attachment_id, pending.plaintext_sha256, false); await db.query("UPDATE chat_crypto_legacy_stage_objects SET cleanup_state='REMOVED',removed_at=clock_timestamp() WHERE stage_id=$1 AND attachment_id=$2 AND cleanup_state='PENDING'", [stage.id, pending.attachment_id]); return true; });
            if (!more)
                break;
        }
        return tx(async (db) => {
            const { stage, objects, completed } = await context(db);
            if (objects.some(object => object.cleanup_state !== 'REMOVED'))
                throw new common_1.ConflictException('Historical cleanup incomplete');
            if (!completed) {
                const members = (await db.query(`SELECT u.id FROM "user" u WHERE EXISTS(SELECT 1 FROM conversations c WHERE c.id=$1 AND (c.user1_id=u.id OR c.user2_id=u.id OR EXISTS(SELECT 1 FROM rooms r JOIN room_members rm ON rm.room_id=r.id WHERE r.conversation_id=c.id AND rm.user_id=u.id) OR (NOT EXISTS(SELECT 1 FROM rooms r WHERE r.conversation_id=c.id) AND EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.user_id=u.id)))) AND NOT COALESCE((SELECT a.action='BAN' FROM admin_actions a WHERE a.target_user_id=u.id AND a.action IN ('BAN','UNBAN') ORDER BY a.created_at DESC,a.id DESC LIMIT 1),false) ORDER BY u.id`, [id])).rows;
                await db.query('UPDATE chat_crypto_membership_intervals SET end_revision=$2,left_at=clock_timestamp() WHERE conversation_id=$1 AND end_revision IS NULL', [id, stage.next_live_revision]);
                for (const member of members)
                    await db.query('INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES($1,$2,$3,$4,clock_timestamp())', [(0, node_crypto_1.randomUUID)(), id, member.id, stage.next_live_revision]);
                await db.query("UPDATE chat_crypto_legacy_stages SET phase='RECONCILED',completed_at=clock_timestamp() WHERE id=$1", [stage.id]);
                await db.query("UPDATE chat_crypto_state SET migration_state='RECONCILED',membership_revision=$2 WHERE conversation_id=$1", [id, stage.next_live_revision]);
            }
            return { operationId: stage.id, conversationId: id, phase: 'RECONCILED', membershipRevision: parsed.membershipRevision, nextLiveRevision: Number(stage.next_live_revision), sourceCount: Number(stage.source_count), attachmentCount: Number(stage.attachment_count) };
        });
    }
    async stageSnapshot(db, id, ready, converted = false, completed = false) {
        const sources = [], objects = [], claims = [];
        for (const candidateId of ready.candidateIds) {
            const candidate = (await db.query('SELECT cohort_id FROM chat_crypto_legacy_candidates WHERE id=$1 AND conversation_id=$2', [candidateId, id])).rows[0];
            if (!candidate)
                throw new common_1.ConflictException('Historical candidate changed');
            const bound = await this.boundCandidate(db, id, candidate.cohort_id, candidateId, converted, completed);
            sources.push({ messageId: bound.row.message_id, candidateId, cohortId: candidate.cohort_id, originalSha256: bound.row.original_sha256, envelopeSha256: bound.row.envelope_sha256 });
            for (const image of bound.images)
                objects.push({ messageId: bound.row.message_id, candidateId, attachmentId: image.attachment_id, draftId: image.draft_id, plaintextSha256: image.plaintext_sha256, ciphertextSha256: image.ciphertext_sha256 });
            const receipts = (await db.query(`SELECT a.user_id,a.device_id,a.attestation,d.ed25519_key FROM chat_crypto_legacy_attestations a JOIN chat_crypto_cohort_members m ON m.cohort_id=a.cohort_id AND m.user_id=a.user_id JOIN chat_crypto_history_cohorts h ON h.id=m.cohort_id AND h.conversation_id=m.conversation_id JOIN chat_crypto_devices d ON d.user_id=a.user_id AND d.device_id=a.device_id AND d.created_at<=h.verified_at AND ($4::boolean OR d.revoked_at IS NULL) WHERE a.candidate_id=$1 AND a.cohort_id=$2 AND m.conversation_id=$3 ORDER BY a.user_id COLLATE "C",a.device_id COLLATE "C" FOR SHARE OF a,d,m,h`, [candidateId, candidate.cohort_id, id, completed])).rows;
            for (const claim of receipts) {
                let receipt;
                try {
                    receipt = (0, matrix_signatures_js_1.verifyLegacyRoundtripAttestation)(claim.attestation, { userId: claim.user_id, deviceId: claim.device_id, ed25519Key: claim.ed25519_key }, bound.expected);
                }
                catch {
                    throw new common_1.ConflictException('Historical stage receipt changed');
                }
                claims.push({ candidateId, userId: claim.user_id, deviceId: claim.device_id, receiptSha256: (0, node_crypto_1.createHash)('sha256').update((0, matrix_signatures_js_1.canonicalSignedPayload)({ receipt })).digest('base64').replace(/=+$/, '') });
            }
        }
        if (sources.length !== ready.sourceCount || objects.length !== ready.attachmentCount || claims.length !== ready.requiredDeviceClaims)
            throw new common_1.ConflictException('Historical stage coverage changed');
        return { sources, objects, manifest: { version: 1, conversationId: id, seedCohortId: ready.cohortId, membershipRevision: ready.membershipRevision, nextLiveRevision: ready.membershipRevision + 1, sourceCount: ready.sourceCount, attachmentCount: ready.attachmentCount, requiredDeviceClaims: ready.requiredDeviceClaims, sources, objects, claims } };
    }
    async validateStageRows(db, stageId, snapshot, allowRemoved = false) {
        const sources = (await db.query(`SELECT message_id AS "messageId",candidate_id AS "candidateId",cohort_id AS "cohortId",original_sha256 AS "originalSha256",envelope_sha256 AS "envelopeSha256" FROM chat_crypto_legacy_stage_sources WHERE stage_id=$1 ORDER BY message_id COLLATE "C" FOR SHARE`, [stageId])).rows;
        const objects = (await db.query(`SELECT message_id AS "messageId",candidate_id AS "candidateId",attachment_id AS "attachmentId",draft_id AS "draftId",plaintext_sha256 AS "plaintextSha256",ciphertext_sha256 AS "ciphertextSha256",cleanup_state,removed_at FROM chat_crypto_legacy_stage_objects WHERE stage_id=$1 ORDER BY message_id COLLATE "C",attachment_id COLLATE "C" FOR SHARE`, [stageId])).rows;
        if (objects.some(row => !(row.cleanup_state === 'PENDING' && row.removed_at === null) && !(allowRemoved && row.cleanup_state === 'REMOVED' && row.removed_at instanceof Date)))
            throw new common_1.ConflictException('Historical stage cleanup changed');
        const publicObjects = objects.map(row => ({ messageId: row.messageId, candidateId: row.candidateId, attachmentId: row.attachmentId, draftId: row.draftId, plaintextSha256: row.plaintextSha256, ciphertextSha256: row.ciphertextSha256 }));
        if ((0, matrix_signatures_js_1.canonicalSignedPayload)({ sources, objects: publicObjects }) !== (0, matrix_signatures_js_1.canonicalSignedPayload)({ sources: snapshot.sources, objects: snapshot.objects }))
            throw new common_1.ConflictException('Historical stage rows changed');
    }
    async cutoffReadiness(db, actor, id, parsed, converted = false) {
        const state = (await db.query('SELECT membership_revision FROM chat_crypto_state WHERE conversation_id=$1', [id])).rows[0];
        if (Number(state.membership_revision) !== parsed.membershipRevision)
            throw new common_1.ConflictException('Membership revision changed');
        await this.availableCohort(db, id, parsed.cohortId);
        const mode = converted ? 'E2EE' : 'LEGACY_PENDING';
        if (converted && (await db.query("SELECT 1 FROM messages WHERE conversation_id=$1 AND encryption_mode<>'E2EE' LIMIT 1", [id])).rowCount)
            throw new common_1.ConflictException('Converted source coverage incomplete');
        const count = async () => Number((await db.query('SELECT count(*) FROM messages WHERE conversation_id=$1 AND encryption_mode=$2', [id, mode])).rows[0].count), sourceCount = await count();
        if (!Number.isSafeInteger(sourceCount) || sourceCount !== parsed.expectedSourceCount)
            throw new common_1.ConflictException('Historical source count changed');
        const eligible = async (cohortId) => {
            const devices = (await db.query(`SELECT d.user_id,d.device_id,d.ed25519_key FROM chat_crypto_cohort_members m JOIN chat_crypto_history_cohorts h ON h.id=m.cohort_id AND h.conversation_id=m.conversation_id JOIN chat_crypto_devices d ON d.user_id=m.user_id AND d.created_at<=h.verified_at AND d.revoked_at IS NULL WHERE m.conversation_id=$1 AND m.cohort_id=$2 ORDER BY d.user_id COLLATE "C",d.device_id COLLATE "C" LIMIT 100001`, [id, cohortId])).rows;
            if (!devices.length || devices.length > 100000)
                throw new common_1.ConflictException('Historical device coverage unavailable');
            return devices;
        }, cohorts = new Map(), candidateCohorts = new Map(), candidateIds = [];
        let after = null, attachmentCount = 0, requiredDeviceClaims = 0;
        for (;;) {
            const rows = (await db.query(`SELECT m.id,lm.cohort_id,lm.state,c.id AS candidate_id FROM messages m LEFT JOIN chat_crypto_legacy_migrations lm ON lm.message_id=m.id AND lm.conversation_id=m.conversation_id LEFT JOIN chat_crypto_legacy_candidates c ON c.message_id=m.id AND c.conversation_id=m.conversation_id AND c.membership_revision=$2 WHERE m.conversation_id=$1 AND m.encryption_mode=$4 AND ($3::text IS NULL OR m.id COLLATE "C">$3::text COLLATE "C") ORDER BY m.id COLLATE "C" LIMIT 25 FOR SHARE OF m`, [id, parsed.membershipRevision, after, mode])).rows;
            if (!rows.length)
                break;
            for (const source of rows) {
                if (!source.cohort_id || source.state !== (converted ? 'RECONCILED' : 'PREPARED') || !source.candidate_id)
                    throw new common_1.ConflictException('Historical source coverage incomplete');
                const cohortId = source.cohort_id;
                if (!cohorts.has(cohortId)) {
                    await this.authorizeCohort(db, actor, id, parsed.deviceId, cohortId);
                    await this.availableCohort(db, id, cohortId);
                    cohorts.set(cohortId, await eligible(cohortId));
                    if ([...cohorts.values()].reduce((sum, devices) => sum + devices.length, 0) > 100000)
                        throw new common_1.ConflictException('Historical device coverage unavailable');
                }
                const devices = cohorts.get(cohortId), bound = await this.boundCandidate(db, id, cohortId, source.candidate_id, converted);
                const receipts = (await db.query('SELECT user_id,device_id,attestation FROM chat_crypto_legacy_attestations WHERE candidate_id=$1 AND cohort_id=$2 FOR SHARE', [source.candidate_id, cohortId])).rows, claims = new Map(receipts.map(row => [JSON.stringify([row.user_id, row.device_id]), row.attestation]));
                for (const device of devices) {
                    const claim = claims.get(JSON.stringify([device.user_id, device.device_id]));
                    if (!claim)
                        throw new common_1.ConflictException('Historical device receipt missing');
                    try {
                        const receipt = contracts_1.LegacyRoundtripAttestationSchema.parse(claim);
                        (0, matrix_signatures_js_1.canonicalSignedPayload)(receipt.signatures);
                        (0, matrix_signatures_js_1.verifyLegacyRoundtripAttestation)(receipt, { userId: device.user_id, deviceId: device.device_id, ed25519Key: device.ed25519_key }, bound.expected);
                    }
                    catch {
                        throw new common_1.ConflictException('Historical device receipt changed');
                    }
                }
                candidateIds.push(source.candidate_id);
                attachmentCount += bound.images.length;
                requiredDeviceClaims += devices.length;
                candidateCohorts.set(source.candidate_id, cohortId);
            }
            after = rows.at(-1).id;
        }
        for (const [candidateId, cohortId] of candidateCohorts)
            await this.boundCandidate(db, id, cohortId, candidateId, converted);
        for (const [cohortId, devices] of cohorts) {
            await this.authorizeCohort(db, actor, id, parsed.deviceId, cohortId);
            await this.availableCohort(db, id, cohortId);
            if (JSON.stringify(await eligible(cohortId)) !== JSON.stringify(devices))
                throw new common_1.ConflictException('Historical coverage changed');
        }
        if (!cohorts.has(parsed.cohortId) || candidateIds.length !== sourceCount || await count() !== sourceCount)
            throw new common_1.ConflictException('Historical coverage changed');
        if (!Number.isSafeInteger(requiredDeviceClaims))
            throw new common_1.ConflictException('Historical device coverage unavailable');
        return { conversationId: id, cohortId: parsed.cohortId, ...(cohorts.size > 1 ? { cohortIds: [...cohorts.keys()].sort() } : {}), membershipRevision: parsed.membershipRevision, sourceCount, attachmentCount, requiredDeviceClaims, candidateIds };
    }
    async batch(actor, id, input) {
        const parsed = this.parse(contracts_1.LegacyBatchQuerySchema, input);
        return this.transaction(actor, id, parsed.deviceId, parsed.cohortId, async (db) => {
            let cursor;
            if (parsed.after) {
                cursor = (await db.query(`SELECT m.id,m.created_at FROM messages m JOIN chat_crypto_legacy_migrations lm ON lm.message_id=m.id WHERE m.id=$1 AND m.conversation_id=$2 AND lm.cohort_id=$3 AND lm.state='PREPARED' AND m.encryption_mode='LEGACY_PENDING'`, [parsed.after, id, parsed.cohortId])).rows[0];
                if (!cursor)
                    (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid historical cursor');
            }
            const rows = (await db.query(`SELECT m.id FROM messages m JOIN chat_crypto_legacy_migrations lm ON lm.message_id=m.id AND lm.conversation_id=m.conversation_id WHERE m.conversation_id=$1 AND lm.cohort_id=$2 AND lm.state='PREPARED' AND m.encryption_mode='LEGACY_PENDING' ${cursor ? 'AND (m.created_at,m.id)>((SELECT created_at FROM messages WHERE id=$4),$4::text)' : ''} ORDER BY m.created_at,m.id LIMIT $3`, cursor ? [id, parsed.cohortId, parsed.limit + 1, parsed.after] : [id, parsed.cohortId, parsed.limit + 1])).rows;
            const selected = rows.slice(0, parsed.limit), items = [];
            for (const row of selected)
                items.push(await this.source(db, row.id, id, parsed.cohortId));
            return { items, hasMore: rows.length > parsed.limit, nextCursor: rows.length > parsed.limit ? String(selected.at(-1).id) : null };
        });
    }
    async content(actor, id, attachmentId, input) {
        const parsed = this.parse(contracts_1.LegacyImageQuerySchema, input);
        let bytes;
        try {
            return await this.transaction(actor, id, parsed.deviceId, parsed.cohortId, async (db) => {
                const source = await this.source(db, parsed.messageId, id, parsed.cohortId), image = source.sourceManifest.attachments.find(item => item.id === attachmentId);
                if (!image)
                    (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Historical image not found');
                bytes = await this.image(attachmentId);
                if (bytes.length !== image.fileSize || !(0, node_crypto_1.timingSafeEqual)((0, node_crypto_1.createHash)('sha256').update(bytes).digest(), (0, matrix_signatures_js_1.matrixBase64)(image.plaintextSha256, 32)))
                    throw new common_1.ConflictException('Historical image changed');
                return bytes;
            });
        }
        catch (error) {
            bytes?.fill(0);
            throw error;
        }
    }
};
exports.CryptoLegacyService = CryptoLegacyService;
exports.CryptoLegacyService = CryptoLegacyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [chat_service_js_1.ChatService])
], CryptoLegacyService);
//# sourceMappingURL=crypto-legacy.service.js.map