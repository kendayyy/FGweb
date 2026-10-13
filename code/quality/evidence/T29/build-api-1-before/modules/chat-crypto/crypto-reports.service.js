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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CryptoReportsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoReportsService = exports.REPORT_READER = exports.REPORT_CUSTODY = void 0;
const crypto_schema_readiness_js_1 = require("./crypto-schema-readiness.js");
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const node_crypto_1 = require("node:crypto");
const sharpModule = __importStar(require("sharp"));
const contracts_1 = require("@fg/contracts");
const chat_service_js_1 = require("../chat/chat.service.js");
const crypto_relay_service_js_1 = require("./crypto-relay.service.js");
const crypto_object_store_js_1 = require("./crypto-object-store.js");
const auth_admin_js_1 = require("../auth/auth-admin.js");
const auth_service_js_1 = require("../auth/auth.service.js");
const crypto_sweep_loop_js_1 = require("./crypto-sweep-loop.js");
const sharp = sharpModule.default ?? sharpModule;
exports.REPORT_CUSTODY = 'FG_REPORT_CUSTODY';
exports.REPORT_READER = 'FG_REPORT_READER';
let CryptoReportsService = CryptoReportsService_1 = class CryptoReportsService {
    chat;
    auth;
    custody;
    reader;
    relay;
    schemaReady = false;
    pool;
    objects = new crypto_object_store_js_1.CryptoObjectStore(8 * 1024 * 1024);
    logger = new common_1.Logger(CryptoReportsService_1.name);
    sweeps = new crypto_sweep_loop_js_1.CryptoSweepLoop(() => this.cleanup(), () => this.logger.warn('Encrypted report cleanup unavailable; retained for retry'));
    constructor(chat, auth, custody, reader, relay) {
        this.chat = chat;
        this.auth = auth;
        this.custody = custody;
        this.reader = reader;
        this.relay = relay;
    }
    async onModuleInit() {
        this.pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
        this.schemaReady = await (0, crypto_schema_readiness_js_1.cryptoSchemaAvailable)(this.pool);
        if (this.schemaReady) {
            await this.objects.initialize();
            this.sweeps.start();
        }
    }
    async onModuleDestroy() { await this.sweeps.stop(); await this.pool?.end(); }
    async cleanup() {
        if (!this.schemaReady)
            return;
        const db = await this.pool.connect();
        let objectsRemaining = 100;
        try {
            await db.query('BEGIN');
            const evidence = (await db.query(`SELECT id FROM chat_crypto_report_evidence WHERE expires_at<=now() ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED`)).rows;
            for (const row of evidence) {
                const drafts = (await db.query(`SELECT id,object_key FROM chat_crypto_upload_drafts WHERE report_evidence_id=$1 ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`, [row.id, objectsRemaining])).rows;
                for (const draft of drafts) {
                    await this.objects.remove(draft.object_key);
                    await db.query('DELETE FROM chat_crypto_upload_drafts WHERE id=$1', [draft.id]);
                    objectsRemaining--;
                }
                await db.query(`DELETE FROM chat_crypto_report_evidence WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM chat_crypto_upload_drafts WHERE report_evidence_id=$1)`, [row.id]);
            }
            await db.query('COMMIT');
        }
        catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
        finally {
            db.release();
        }
    }
    async verifyObject(draft) {
        let bytes;
        try {
            bytes = await this.objects.read(draft.object_key);
        }
        catch {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Report object unavailable');
        }
        const envelope = contracts_1.LobbyStorageEnvelopeSchema.safeParse(draft.envelope);
        if (!envelope.success || bytes.length !== draft.ciphertext_size || (0, node_crypto_1.createHash)('sha256').update(bytes).digest('base64').replace(/=+$/, '') !== draft.ciphertext_sha256 || bytes.toString() !== JSON.stringify(envelope.data))
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Report object integrity failed');
    }
    async authorizeAdmin(db, actor) {
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        if ((0, auth_admin_js_1.soleAdminUserId)() !== actor.userId)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Admin required');
        if (!(await db.query(`SELECT id FROM "session" WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE`, [actor.sessionId, actor.userId])).rowCount)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Session revoked');
        const action = (await db.query(`SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1`, [actor.userId])).rows[0];
        if (action?.action === 'BAN' || (0, auth_admin_js_1.soleAdminUserId)() !== actor.userId)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Admin access revoked');
        if (!await this.auth.isUserAdmin(actor.userId))
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Admin identity unavailable');
    }
    async reportRoot(db, id) {
        const row = (await db.query(`SELECT r.id,r.reporter_id,m.conversation_id FROM reports r JOIN messages m ON m.id=r.reported_message_id WHERE r.id=$1 AND r.reason='CHAT_CRYPTO_DISCLOSURE'`, [id])).rows[0];
        if (!row)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Report unavailable');
        return row;
    }
    async readReport(actor, id, input) {
        if (!this.schemaReady)
            throw new common_1.ServiceUnavailableException('Chat crypto schema unavailable');
        if (!contracts_1.ReadChatReportSchema.safeParse(input).success)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid report read');
        const db = await this.pool.connect();
        try {
            await db.query('BEGIN');
            await this.authorizeAdmin(db, actor);
            const root = await this.reportRoot(db, id), reader = this.reader?.transit;
            if (!reader)
                throw new common_1.ServiceUnavailableException('Report reader unavailable');
            const evidence = (await db.query(`SELECT * FROM chat_crypto_report_evidence WHERE report_id=$1 ORDER BY id LIMIT 21 FOR SHARE`, [id])).rows;
            if (!evidence.length || evidence.length > 20 || evidence.some(e => e.reporter_id !== root.reporter_id || e.source !== 'USER_DISCLOSED'))
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Report unavailable');
            const selectedMessages = [];
            for (const item of evidence) {
                if (!(await db.query('SELECT id FROM chat_crypto_report_evidence WHERE id=$1 AND expires_at>clock_timestamp()', [item.id])).rowCount)
                    (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Report expired');
                let bytes;
                try {
                    bytes = await reader.decrypt(item.envelope, { kind: 'REPORT_TEXT', conversationId: root.conversation_id, objectId: item.id });
                }
                catch {
                    throw new common_1.ServiceUnavailableException('Report reader unavailable');
                }
                let payload;
                try {
                    payload = contracts_1.ReportDisclosedTextPayloadSchema.parse(JSON.parse(bytes.toString('utf8')));
                }
                catch {
                    throw new common_1.ServiceUnavailableException('Report evidence integrity failed');
                }
                finally {
                    bytes.fill(0);
                }
                if (payload.reportId !== id || payload.reporterId !== root.reporter_id || payload.conversationId !== root.conversation_id)
                    throw new common_1.ServiceUnavailableException('Report evidence integrity failed');
                selectedMessages.push({ evidenceId: item.id, messageId: payload.messageId, conversationId: payload.conversationId, text: payload.text, reason: payload.reason, source: payload.source, authenticity: payload.authenticity, reportAttachmentIds: payload.reportAttachmentIds });
            }
            const response = contracts_1.DisclosedReportSchema.parse({ id, selectedMessages });
            await this.authorizeAdmin(db, actor);
            if ((await db.query('SELECT id FROM chat_crypto_report_evidence WHERE report_id=$1 AND expires_at>clock_timestamp()', [id])).rowCount !== evidence.length)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Report expired');
            await db.query(`INSERT INTO chat_crypto_report_audit(id,actor_id,report_id,action) VALUES($1,$2,$3,'READ_REPORT')`, [(0, node_crypto_1.randomUUID)(), actor.userId, id]);
            await db.query('COMMIT');
            return response;
        }
        catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
        finally {
            db.release();
        }
    }
    async readImage(actor, id, attachmentId) {
        if (!this.schemaReady)
            throw new common_1.ServiceUnavailableException('Chat crypto schema unavailable');
        const db = await this.pool.connect();
        let plaintext;
        try {
            await db.query('BEGIN');
            await this.authorizeAdmin(db, actor);
            const root = await this.reportRoot(db, id), reader = this.reader?.transit;
            if (!reader)
                throw new common_1.ServiceUnavailableException('Report reader unavailable');
            const evidence = (await db.query(`SELECT e.* FROM chat_crypto_report_evidence e JOIN chat_crypto_upload_drafts d ON d.report_evidence_id=e.id WHERE e.report_id=$1 AND d.id=$2 AND e.expires_at>clock_timestamp() FOR SHARE OF e`, [id, attachmentId])).rows[0];
            if (!evidence || evidence.reporter_id !== root.reporter_id || evidence.source !== 'USER_DISCLOSED')
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Report image unavailable');
            const draft = (await db.query(`SELECT d.*,s.source_message_id FROM chat_crypto_upload_drafts d JOIN chat_crypto_report_upload_sources s ON s.upload_id=d.id WHERE d.id=$1 AND d.report_evidence_id=$2 FOR SHARE OF d`, [attachmentId, evidence.id])).rows[0];
            if (!draft || draft.encryption_mode !== 'REPORT_AEAD' || !draft.consumed_at || draft.uploader_id !== root.reporter_id || draft.conversation_id !== root.conversation_id)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Report image unavailable');
            await this.verifyObject(draft);
            let selectedBytes;
            try {
                selectedBytes = await reader.decrypt(evidence.envelope, { kind: 'REPORT_TEXT', conversationId: root.conversation_id, objectId: evidence.id });
            }
            catch {
                throw new common_1.ServiceUnavailableException('Report reader unavailable');
            }
            let selected;
            try {
                selected = contracts_1.ReportDisclosedTextPayloadSchema.parse(JSON.parse(selectedBytes.toString('utf8')));
            }
            catch {
                throw new common_1.ServiceUnavailableException('Report evidence integrity failed');
            }
            finally {
                selectedBytes.fill(0);
            }
            if (selected.reportId !== id || selected.reporterId !== root.reporter_id || selected.conversationId !== root.conversation_id || selected.messageId !== draft.source_message_id || !selected.reportAttachmentIds.includes(attachmentId))
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Report image not selected');
            const objectId = 'rimg1:' + (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(['FG_REPORT_IMAGE', 1, root.reporter_id, root.conversation_id, draft.source_message_id, draft.id])).digest('hex');
            try {
                plaintext = await reader.decrypt(draft.envelope, { kind: 'REPORT_IMAGE', conversationId: root.conversation_id, objectId });
            }
            catch {
                throw new common_1.ServiceUnavailableException('Report reader unavailable');
            }
            if (!plaintext.length || plaintext.length > contracts_1.MAX_IMAGE_SIZE_BYTES || plaintext.toString('ascii', 0, 4) !== 'RIFF' || plaintext.toString('ascii', 8, 12) !== 'WEBP')
                throw new common_1.ServiceUnavailableException('Report image integrity failed');
            await this.authorizeAdmin(db, actor);
            if (!(await db.query('SELECT id FROM chat_crypto_report_evidence WHERE id=$1 AND expires_at>clock_timestamp()', [evidence.id])).rowCount)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Report expired');
            await db.query(`INSERT INTO chat_crypto_report_audit(id,actor_id,report_id,action,attachment_id) VALUES($1,$2,$3,'READ_IMAGE',$4)`, [(0, node_crypto_1.randomUUID)(), actor.userId, id, attachmentId]);
            await db.query('COMMIT');
            const result = plaintext;
            plaintext = undefined;
            return result;
        }
        catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
        finally {
            plaintext?.fill(0);
            db.release();
        }
    }
    async disclose(actor, input) {
        if (!this.schemaReady)
            throw new common_1.ServiceUnavailableException('Chat crypto schema unavailable');
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        const checked = contracts_1.DiscloseChatReportSchema.safeParse(input);
        if (!checked.success)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid disclosure');
        const selected = checked.data;
        const attachmentIds = selected.selectedMessages.flatMap(m => m.reportAttachmentIds ?? []);
        if (new Set(selected.selectedMessages.map(m => m.messageId)).size !== selected.selectedMessages.length || new Set(attachmentIds).size !== attachmentIds.length || selected.selectedMessages.some(m => m.source !== 'USER_DISCLOSED'))
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Unsupported disclosure selection');
        const custody = this.custody;
        if (!custody?.transit || !Number.isSafeInteger(custody.retentionSeconds) || custody.retentionSeconds <= 0 || custody.retentionSeconds > 2147483647)
            throw new common_1.ServiceUnavailableException('Report custody unavailable');
        const db = await this.pool.connect();
        try {
            await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
            await this.chat.authorize(selected.conversationId, actor, db);
            const state = (await db.query(`SELECT mode,migration_state,membership_revision FROM chat_crypto_state WHERE conversation_id=$1 FOR SHARE`, [selected.conversationId])).rows[0];
            if (state?.mode !== 'E2EE' || state.migration_state !== 'RECONCILED')
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Report source unavailable');
            await this.chat.authorize(selected.conversationId, actor, db);
            const ids = selected.selectedMessages.map(m => m.messageId).sort();
            const messages = (await db.query(`SELECT id,crypto_revision,encryption_mode,EXISTS(SELECT 1 FROM chat_crypto_legacy_migrations lm WHERE lm.message_id=m.id) AS legacy FROM messages m WHERE conversation_id=$1 AND id=ANY($2::text[]) ORDER BY id FOR SHARE OF m`, [selected.conversationId, ids])).rows;
            if (messages.length !== ids.length)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Report source unavailable');
            for (const message of messages) {
                await this.reportSource(db, actor, selected.conversationId, message);
            }
            const drafts = attachmentIds.length ? (await db.query(`SELECT d.*,s.source_message_id FROM chat_crypto_upload_drafts d JOIN chat_crypto_report_upload_sources s ON s.upload_id=d.id WHERE d.id=ANY($1::text[]) ORDER BY d.id FOR UPDATE OF d`, [attachmentIds])).rows : [];
            if (drafts.length !== attachmentIds.length || drafts.some(d => d.uploader_id !== actor.userId || d.conversation_id !== selected.conversationId || d.encryption_mode !== 'REPORT_AEAD' || d.consumed_at || d.expires_at.getTime() <= Date.now() || Number(d.membership_revision) !== Number(state.membership_revision) || !selected.selectedMessages.some(m => m.messageId === d.source_message_id && m.reportAttachmentIds?.includes(d.id))))
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Report attachment claim denied');
            for (const draft of drafts)
                await this.verifyObject(draft);
            const reportId = (0, node_crypto_1.randomUUID)(), prepared = [];
            for (const item of selected.selectedMessages) {
                const evidenceId = (0, node_crypto_1.randomUUID)(), source = messages.find(m => m.id === item.messageId);
                const plaintext = Buffer.from(JSON.stringify({ version: 1, conversationId: selected.conversationId, reportId, reporterId: actor.userId, messageId: item.messageId, membershipRevision: Number(source.crypto_revision), reason: selected.reason, text: item.text, reportAttachmentIds: item.reportAttachmentIds ?? [], source: 'USER_DISCLOSED', authenticity: 'USER_SUPPLIED_UNVERIFIED' }), 'utf8');
                try {
                    prepared.push({ id: evidenceId, messageId: item.messageId, envelope: await custody.transit.encrypt('fg-report', plaintext, { kind: 'REPORT_TEXT', conversationId: selected.conversationId, objectId: evidenceId }) });
                }
                catch {
                    throw new common_1.ServiceUnavailableException('Report custody unavailable');
                }
                finally {
                    plaintext.fill(0);
                }
            }
            await db.query(`INSERT INTO reports(id,reporter_id,target_type,target_id,reported_message_id,reason) VALUES($1,$2,'MESSAGE',$3,$3,'CHAT_CRYPTO_DISCLOSURE')`, [reportId, actor.userId, selected.selectedMessages[0].messageId]);
            for (const item of prepared) {
                await db.query(`INSERT INTO chat_crypto_report_evidence(id,report_id,reporter_id,consented_at,envelope,source,expires_at) VALUES($1,$2,$3,now(),$4,'USER_DISCLOSED',now()+$5::int*interval '1 second')`, [item.id, reportId, actor.userId, item.envelope, custody.retentionSeconds]);
                for (const draft of drafts.filter(d => d.source_message_id === item.messageId))
                    await db.query(`UPDATE chat_crypto_upload_drafts SET report_evidence_id=$2,consumed_at=now() WHERE id=$1`, [draft.id, item.id]);
            }
            for (const message of messages)
                await this.reportSource(db, actor, selected.conversationId, message);
            await db.query('COMMIT');
            return { id: reportId };
        }
        catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
        finally {
            db.release();
        }
    }
    async reportSource(db, actor, id, source) {
        await this.chat.authorize(id, actor, db, true);
        if (source.encryption_mode !== 'E2EE')
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Report source unavailable');
        if (source.legacy) {
            if (!this.relay)
                throw new common_1.ServiceUnavailableException('Imported report validation unavailable');
            await this.relay.authorizeImportedReport(db, actor, id, source.id);
        }
        else if (!(await db.query('SELECT 1 FROM chat_crypto_membership_intervals WHERE conversation_id=$1 AND user_id=$2 AND start_revision<=$3 AND (end_revision IS NULL OR $3<end_revision)', [id, actor.userId, source.crypto_revision])).rowCount)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Report source unavailable');
    }
    async uploadImage(actor, input, file) {
        if (!this.schemaReady)
            throw new common_1.ServiceUnavailableException('Chat crypto schema unavailable');
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        const checked = contracts_1.ReportImageDisclosureSchema.safeParse(input);
        if (!checked.success)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid image disclosure');
        const parsed = checked.data;
        if (!file || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.length || file.size !== parsed.plaintextSize || file.size > contracts_1.MAX_IMAGE_SIZE_BYTES)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid disclosure bytes');
        const custody = this.custody, secret = process.env.BETTER_AUTH_SECRET;
        if (!custody?.transit || !Number.isSafeInteger(custody.retentionSeconds) || custody.retentionSeconds <= 0 || custody.retentionSeconds > 2147483647 || !secret || secret.length < 32)
            throw new common_1.ServiceUnavailableException('Report custody unavailable');
        const fingerprint = (0, node_crypto_1.createHmac)('sha256', secret).update(JSON.stringify(['FG_REPORT_RETRY', 1, actor.userId, parsed.conversationId, parsed.messageId, parsed.clientUploadId])).update(Buffer.from([0])).update(file.buffer).digest();
        const db = await this.pool.connect();
        let created;
        try {
            await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
            await this.chat.authorize(parsed.conversationId, actor, db);
            const state = (await db.query(`SELECT mode,migration_state,membership_revision FROM chat_crypto_state WHERE conversation_id=$1 FOR SHARE`, [parsed.conversationId])).rows[0];
            if (state?.mode !== 'E2EE' || state.migration_state !== 'RECONCILED')
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Report source unavailable');
            await this.chat.authorize(parsed.conversationId, actor, db);
            const source = (await db.query(`SELECT m.*,EXISTS(SELECT 1 FROM chat_crypto_legacy_migrations lm WHERE lm.message_id=m.id) AS legacy FROM messages m WHERE m.id=$1 AND m.conversation_id=$2 FOR SHARE OF m`, [parsed.messageId, parsed.conversationId])).rows[0];
            if (!source)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Report source unavailable');
            await this.reportSource(db, actor, parsed.conversationId, source);
            if (source.type !== 'IMAGE' || !(await db.query(`SELECT 1 FROM attachments WHERE message_id=$1 AND encryption_mode='E2EE'`, [source.id])).rowCount)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Image source required');
            let actual;
            if (file.buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
                actual = 'image/jpeg';
            else if (file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
                actual = 'image/png';
            else if (file.buffer.toString('ascii', 0, 4) === 'RIFF' && file.buffer.toString('ascii', 8, 12) === 'WEBP')
                actual = 'image/webp';
            if (!actual || actual !== file.mimetype)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid disclosure image');
            let encoded;
            try {
                const image = sharp(file.buffer, { limitInputPixels: contracts_1.MAX_IMAGE_PIXELS }), meta = await image.metadata();
                if (!meta.width || !meta.height || meta.width * meta.height > contracts_1.MAX_IMAGE_PIXELS || (meta.pages ?? 1) > 1)
                    throw new Error();
                encoded = await image.rotate().webp({ quality: 90 }).toBuffer();
                if (!encoded.length || encoded.length > contracts_1.MAX_IMAGE_SIZE_BYTES)
                    throw new Error();
            }
            catch {
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid disclosure image');
            }
            await db.query(`SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_crypto_upload',$1::text,$2::text)::text,0::bigint))`, [actor.userId, parsed.clientUploadId]);
            const existing = (await db.query(`SELECT d.*,s.source_message_id,s.retry_fingerprint FROM chat_crypto_upload_drafts d LEFT JOIN chat_crypto_report_upload_sources s ON s.upload_id=d.id WHERE d.uploader_id=$1 AND d.client_upload_id=$2 FOR UPDATE OF d`, [actor.userId, parsed.clientUploadId])).rows[0];
            if (existing) {
                const old = Buffer.from(existing.retry_fingerprint ?? '', 'base64');
                if (existing.encryption_mode !== 'REPORT_AEAD' || existing.conversation_id !== parsed.conversationId || existing.source_message_id !== parsed.messageId || Number(existing.membership_revision) !== Number(state.membership_revision) || old.length !== fingerprint.length || !(0, node_crypto_1.timingSafeEqual)(old, fingerprint))
                    throw new common_1.ConflictException('Upload retry conflicts');
                if (existing.consumed_at || existing.expires_at.getTime() <= Date.now())
                    (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Draft no longer available');
                await this.verifyObject(existing);
                await this.reportSource(db, actor, parsed.conversationId, source);
                await db.query('COMMIT');
                return contracts_1.ReportAttachmentReceiptSchema.parse({ id: existing.id, expiresAt: existing.expires_at.toISOString() });
            }
            const id = (0, node_crypto_1.randomUUID)(), objectId = 'rimg1:' + (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(['FG_REPORT_IMAGE', 1, actor.userId, parsed.conversationId, parsed.messageId, id])).digest('hex');
            let envelope;
            try {
                envelope = await custody.transit.encrypt('fg-report', encoded, { kind: 'REPORT_IMAGE', conversationId: parsed.conversationId, objectId });
            }
            catch {
                throw new common_1.ServiceUnavailableException('Report custody unavailable');
            }
            finally {
                encoded.fill(0);
            }
            const bytes = Buffer.from(JSON.stringify(envelope)), key = id + '.bin';
            await (0, crypto_object_store_js_1.lockCryptoObjectWrite)(db, key);
            await this.objects.put(key, bytes);
            created = key;
            const row = (await db.query(`INSERT INTO chat_crypto_upload_drafts(id,uploader_id,conversation_id,client_upload_id,membership_revision,encryption_mode,object_key,ciphertext_size,ciphertext_sha256,envelope,expires_at) VALUES($1,$2,$3,$4,$5,'REPORT_AEAD',$6,$7,$8,$9,now()+$10*interval '1 millisecond') RETURNING expires_at`, [id, actor.userId, parsed.conversationId, parsed.clientUploadId, state.membership_revision, key, bytes.length, (0, node_crypto_1.createHash)('sha256').update(bytes).digest('base64').replace(/=+$/, ''), envelope, contracts_1.IMAGE_DRAFT_TTL_MS])).rows[0];
            await db.query(`INSERT INTO chat_crypto_report_upload_sources(upload_id,source_message_id,retry_fingerprint) VALUES($1,$2,$3)`, [id, parsed.messageId, fingerprint.toString('base64').replace(/=+$/, '')]);
            await this.reportSource(db, actor, parsed.conversationId, source);
            await db.query('COMMIT');
            return contracts_1.ReportAttachmentReceiptSchema.parse({ id, expiresAt: row.expires_at.toISOString() });
        }
        catch (error) {
            await db.query('ROLLBACK');
            if (created)
                await this.objects.remove(created);
            throw error;
        }
        finally {
            db.release();
        }
    }
};
exports.CryptoReportsService = CryptoReportsService;
exports.CryptoReportsService = CryptoReportsService = CryptoReportsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __param(2, (0, common_1.Inject)(exports.REPORT_CUSTODY)),
    __param(3, (0, common_1.Optional)()),
    __param(3, (0, common_1.Inject)(exports.REPORT_READER)),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [chat_service_js_1.ChatService, auth_service_js_1.AuthService, Object, Object, crypto_relay_service_js_1.CryptoRelayService])
], CryptoReportsService);
//# sourceMappingURL=crypto-reports.service.js.map