"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoDevicesService = void 0;
const crypto_schema_readiness_js_1 = require("./crypto-schema-readiness.js");
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const contracts_1 = require("@fg/contracts");
const chat_service_js_1 = require("../chat/chat.service.js");
const matrix_signatures_js_1 = require("./matrix-signatures.js");
let CryptoDevicesService = class CryptoDevicesService {
    schemaReady = false;
    pool;
    async onModuleInit() { this.pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL, max: 8, connectionTimeoutMillis: 5000, statement_timeout: 10000 }); this.schemaReady = await (0, crypto_schema_readiness_js_1.cryptoSchemaAvailable)(this.pool); }
    async onModuleDestroy() { await this.pool?.end(); }
    async transaction(actor, action) {
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        if (!this.schemaReady)
            throw new common_1.ServiceUnavailableException('Chat crypto schema unavailable');
        const db = await this.pool.connect();
        try {
            await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
            const session = await db.query(`SELECT id FROM "session" WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE`, [actor.sessionId, actor.userId]);
            if (!session.rowCount)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked');
            await db.query(`SELECT id FROM "user" WHERE id=$1 FOR NO KEY UPDATE`, [actor.userId]);
            const actionRow = (await db.query(`SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1`, [actor.userId])).rows[0];
            if (actionRow?.action === 'BAN')
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Account is banned');
            const result = await action(db, actor.userId);
            const current = (await db.query(`SELECT s.id,COALESCE((SELECT a.action='BAN' FROM admin_actions a WHERE a.target_user_id=s.user_id AND a.action IN ('BAN','UNBAN') ORDER BY a.created_at DESC,a.id DESC LIMIT 1),false) AS banned FROM "session" s WHERE s.id=$1 AND s.user_id=$2 AND s.expires_at>clock_timestamp() FOR SHARE OF s`, [actor.sessionId, actor.userId])).rows[0];
            if (!current)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked');
            if (current.banned)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Account is banned');
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
    dto(row) { return contracts_1.CryptoDeviceSchema.parse({ deviceId: row.device_id, deviceKeys: row.device_keys, createdAt: row.created_at.toISOString(), revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null }); }
    async bumpRevisions(db, userId) {
        const states = await db.query(`SELECT s.conversation_id FROM chat_crypto_state s JOIN conversations c ON c.id=s.conversation_id WHERE s.mode='E2EE' AND (c.user1_id=$1 OR c.user2_id=$1 OR EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.user_id=$1) OR EXISTS(SELECT 1 FROM rooms r JOIN room_members rm ON rm.room_id=r.id WHERE r.conversation_id=c.id AND rm.user_id=$1)) ORDER BY s.conversation_id FOR UPDATE OF s`, [userId]);
        if (states.rowCount)
            await db.query(`UPDATE chat_crypto_state SET membership_revision=membership_revision+1,updated_at=now() WHERE conversation_id=ANY($1::text[])`, [states.rows.map(s => s.conversation_id)]);
    }
    async storePrekeys(db, userId, deviceId, keys) {
        for (const [id, key] of Object.entries(keys)) {
            const existing = (await db.query(`SELECT signed_key FROM chat_crypto_one_time_keys WHERE user_id=$1 AND device_id=$2 AND key_id=$3`, [userId, deviceId, id])).rows[0];
            if (existing && (0, matrix_signatures_js_1.canonicalSignedPayload)(existing.signed_key) !== (0, matrix_signatures_js_1.canonicalSignedPayload)(key))
                throw new common_1.ConflictException('Prekey ID is immutable');
            await db.query(`INSERT INTO chat_crypto_one_time_keys(user_id,device_id,key_id,signed_key) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [userId, deviceId, id, key]);
        }
        const available = Number((await db.query(`SELECT count(*) FROM chat_crypto_one_time_keys WHERE user_id=$1 AND device_id=$2 AND claimed_at IS NULL`, [userId, deviceId])).rows[0].count);
        if (available > 100)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.RATE_LIMITED, 'Prekey quota exceeded');
    }
    async register(actor, input) {
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        let registration;
        try {
            registration = (0, matrix_signatures_js_1.verifyDeviceRegistration)(actor.userId, input);
        }
        catch {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid signed device keys');
        }
        const { deviceId, deviceKeys, oneTimeKeys } = registration;
        return this.transaction(actor, async (db, userId) => {
            let row = (await db.query(`SELECT * FROM chat_crypto_devices WHERE user_id=$1 AND device_id=$2 FOR UPDATE`, [userId, deviceId])).rows[0];
            if (row?.revoked_at)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Device revoked');
            if (row && (0, matrix_signatures_js_1.canonicalSignedPayload)(row.device_keys) !== (0, matrix_signatures_js_1.canonicalSignedPayload)(deviceKeys))
                throw new common_1.ConflictException('Device ID is immutable');
            if (!row) {
                const count = Number((await db.query(`SELECT count(*) FROM chat_crypto_devices WHERE user_id=$1`, [userId])).rows[0].count);
                if (count >= 100)
                    (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.RATE_LIMITED, 'Device quota exceeded');
                const curve = (0, matrix_signatures_js_1.matrixBase64)(deviceKeys.keys[`curve25519:${deviceId}`], 32).toString('base64').replace(/=+$/, '');
                if ((await db.query(`SELECT 1 FROM chat_crypto_devices WHERE curve25519_key=$1`, [curve])).rowCount)
                    throw new common_1.ConflictException('Device key already registered');
                row = (await db.query(`INSERT INTO chat_crypto_devices(user_id,device_id,device_keys,ed25519_key,curve25519_key) VALUES($1,$2,$3,$4,$5) RETURNING *`, [userId, deviceId, deviceKeys, deviceKeys.keys[`ed25519:${deviceId}`], curve])).rows[0];
                await this.bumpRevisions(db, userId);
            }
            await this.storePrekeys(db, userId, deviceId, oneTimeKeys);
            return this.dto(row);
        });
    }
    async list(actor) { return this.transaction(actor, async (db, userId) => (await db.query(`SELECT * FROM chat_crypto_devices WHERE user_id=$1 ORDER BY created_at,device_id LIMIT 100`, [userId])).rows.map(row => this.dto(row))); }
    async uploadPrekeys(actor, deviceId, input) {
        return this.transaction(actor, async (db, userId) => {
            const row = (await db.query(`SELECT * FROM chat_crypto_devices WHERE user_id=$1 AND device_id=$2 FOR UPDATE`, [userId, deviceId])).rows[0];
            if (!row)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Device not found');
            if (row.revoked_at)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Device revoked');
            let keys;
            try {
                keys = (0, matrix_signatures_js_1.verifySignedOneTimeKeys)(userId, deviceId, row.ed25519_key, input);
            }
            catch {
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid signed prekeys');
            }
            await this.storePrekeys(db, userId, deviceId, keys);
            return { success: true };
        });
    }
    async revoke(actor, deviceId) {
        return this.transaction(actor, async (db, userId) => {
            const row = (await db.query(`SELECT * FROM chat_crypto_devices WHERE user_id=$1 AND device_id=$2 FOR UPDATE`, [userId, deviceId])).rows[0];
            if (!row)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Device not found');
            if (!row.revoked_at) {
                await db.query(`UPDATE chat_crypto_devices SET revoked_at=now() WHERE user_id=$1 AND device_id=$2`, [userId, deviceId]);
                await this.bumpRevisions(db, userId);
            }
            return { success: true };
        });
    }
    async putRecovery(actor, input) {
        const parsed = contracts_1.PutRecoveryBackupSchema.safeParse(input);
        if (!parsed.success)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid encrypted backup');
        return this.transaction(actor, async (db, userId) => {
            const existing = (await db.query(`SELECT * FROM chat_crypto_recovery_backups WHERE user_id=$1 FOR UPDATE`, [userId])).rows[0];
            if (Number(existing?.backup_version ?? 0) !== parsed.data.expectedVersion)
                throw new common_1.ConflictException('Recovery version changed');
            const row = (await db.query(`INSERT INTO chat_crypto_recovery_backups(user_id,backup_version,ciphertext) VALUES($1,1,$2) ON CONFLICT(user_id) DO UPDATE SET backup_version=chat_crypto_recovery_backups.backup_version+1,ciphertext=EXCLUDED.ciphertext,updated_at=now() RETURNING *`, [userId, parsed.data.ciphertext])).rows[0];
            return this.backupDto(row);
        });
    }
    backupDto(row) { return contracts_1.RecoveryBackupSchema.parse({ version: 1, format: 'MATRIX_ENCRYPTED_EXPORT', ciphertext: row.ciphertext, backupVersion: Number(row.backup_version), updatedAt: row.updated_at.toISOString() }); }
    async getRecovery(actor) { return this.transaction(actor, async (db, userId) => { const row = (await db.query(`SELECT * FROM chat_crypto_recovery_backups WHERE user_id=$1`, [userId])).rows[0]; if (!row)
        (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Backup not found'); return this.backupDto(row); }); }
    async deleteRecovery(actor) { return this.transaction(actor, async (db, userId) => { await db.query(`DELETE FROM chat_crypto_recovery_backups WHERE user_id=$1`, [userId]); return { success: true }; }); }
    async putIdentity(actor, input) {
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        let identity;
        try {
            identity = (0, matrix_signatures_js_1.verifyCrossSigningIdentity)(actor.userId, input);
        }
        catch {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid public identity');
        }
        return this.transaction(actor, async (db, userId) => {
            const devices = (await db.query(`SELECT device_id,ed25519_key FROM chat_crypto_devices WHERE user_id=$1 AND revoked_at IS NULL ORDER BY device_id`, [userId])).rows;
            let authenticated = false;
            for (const device of devices) {
                try {
                    (0, matrix_signatures_js_1.verifyMatrixSignature)(identity.masterKey, (0, matrix_signatures_js_1.matrixUserId)(userId), `ed25519:${device.device_id}`, device.ed25519_key);
                    authenticated = true;
                    break;
                }
                catch { }
            }
            if (!authenticated)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Identity requires an active device signature');
            const existing = (await db.query(`SELECT public_keys FROM chat_crypto_identity_keys WHERE user_id=$1 FOR UPDATE`, [userId])).rows[0];
            const canonicalIdentity = (data) => JSON.stringify([(0, matrix_signatures_js_1.canonicalSignedPayload)(data.masterKey), (0, matrix_signatures_js_1.canonicalSignedPayload)(data.selfSigningKey), (0, matrix_signatures_js_1.canonicalSignedPayload)(data.userSigningKey)]);
            if (!existing || canonicalIdentity(existing.public_keys) !== canonicalIdentity(identity)) {
                await db.query(`INSERT INTO chat_crypto_identity_keys(user_id,public_keys,revision) VALUES($1,$2,1) ON CONFLICT(user_id) DO UPDATE SET public_keys=EXCLUDED.public_keys,revision=chat_crypto_identity_keys.revision+1,updated_at=now()`, [userId, identity]);
                await this.bumpRevisions(db, userId);
            }
            return { success: true };
        });
    }
    async uploadSignatures(actor, input) {
        const parsed = contracts_1.UploadCryptoSignaturesSchema.safeParse(input);
        if (!parsed.success)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid signature additions');
        return this.transaction(actor, async (db, userId) => {
            const knownKeys = new Map();
            for (const d of (await db.query(`SELECT device_id,ed25519_key FROM chat_crypto_devices WHERE user_id=$1 AND revoked_at IS NULL`, [userId])).rows)
                knownKeys.set(`ed25519:${d.device_id}`, d.ed25519_key);
            const signingIdentity = (await db.query(`SELECT public_keys FROM chat_crypto_identity_keys WHERE user_id=$1`, [userId])).rows[0]?.public_keys;
            if (signingIdentity)
                for (const part of ['masterKey', 'selfSigningKey', 'userSigningKey'])
                    for (const [id, key] of Object.entries(signingIdentity[part].keys))
                        knownKeys.set(id, key);
            for (const [matrixOwner, objects] of Object.entries(parsed.data.signedKeys)) {
                const owner = (await db.query(`SELECT id FROM "user" WHERE '@fg_'||encode(sha256(convert_to(id,'UTF8')),'hex')||':fg.invalid'=$1`, [matrixOwner])).rows[0]?.id;
                if (!owner)
                    (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Public signing identity not found');
                for (const [objectId, signed] of Object.entries(objects)) {
                    const device = (await db.query(`SELECT device_keys,revoked_at FROM chat_crypto_devices WHERE user_id=$1 AND device_id=$2 FOR UPDATE`, [owner, objectId])).rows[0];
                    const storedIdentity = (await db.query(`SELECT public_keys FROM chat_crypto_identity_keys WHERE user_id=$1 FOR UPDATE`, [owner])).rows[0]?.public_keys;
                    const part = storedIdentity ? ['masterKey', 'selfSigningKey', 'userSigningKey'].find(p => Object.keys(storedIdentity[p].keys).some(key => key.slice('ed25519:'.length) === objectId)) : undefined;
                    const stored = device?.device_keys ?? (part ? storedIdentity[part] : undefined);
                    if (!stored || device?.revoked_at)
                        (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Signing target unavailable');
                    if ((0, matrix_signatures_js_1.canonicalSignedPayload)(stored) !== (0, matrix_signatures_js_1.canonicalSignedPayload)(signed))
                        throw new common_1.ConflictException('Signature cannot replace public keys');
                    const signatures = structuredClone(stored.signatures ?? {});
                    let verified = false;
                    for (const [signer, additions] of Object.entries(signed.signatures ?? {}))
                        for (const [id, signature] of Object.entries(additions)) {
                            if (signatures[signer]?.[id] === signature)
                                continue;
                            const key = signer === (0, matrix_signatures_js_1.matrixUserId)(userId) ? knownKeys.get(id) : undefined;
                            if (!key)
                                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Signature signer is not authorized');
                            try {
                                (0, matrix_signatures_js_1.verifyMatrixSignature)(signed, signer, id, key);
                            }
                            catch {
                                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Signature verification failed');
                            }
                            signatures[signer] ??= {};
                            signatures[signer][id] = signature;
                            verified = true;
                        }
                    if (verified) {
                        const combined = { ...stored, signatures };
                        if (device)
                            await db.query(`UPDATE chat_crypto_devices SET device_keys=$3 WHERE user_id=$1 AND device_id=$2`, [owner, objectId, combined]);
                        else {
                            storedIdentity[part] = combined;
                            await db.query(`UPDATE chat_crypto_identity_keys SET public_keys=$2,updated_at=now() WHERE user_id=$1`, [owner, storedIdentity]);
                        }
                    }
                }
            }
            return { success: true };
        });
    }
};
exports.CryptoDevicesService = CryptoDevicesService;
exports.CryptoDevicesService = CryptoDevicesService = __decorate([
    (0, common_1.Injectable)()
], CryptoDevicesService);
//# sourceMappingURL=crypto-devices.service.js.map