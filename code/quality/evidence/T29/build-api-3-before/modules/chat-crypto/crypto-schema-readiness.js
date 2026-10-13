"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cryptoSchemaAvailable = cryptoSchemaAvailable;
const common_1 = require("@nestjs/common");
async function cryptoSchemaAvailable(db) {
    const tables = ['chat_crypto_cohort_members', 'chat_crypto_devices', 'chat_crypto_history_cohorts', 'chat_crypto_identity_keys', 'chat_crypto_legacy_attestations', 'chat_crypto_legacy_candidate_images', 'chat_crypto_legacy_candidates', 'chat_crypto_legacy_migrations', 'chat_crypto_legacy_stage_objects', 'chat_crypto_legacy_stage_sources', 'chat_crypto_legacy_stages', 'chat_crypto_membership_intervals', 'chat_crypto_one_time_keys', 'chat_crypto_outbound_sessions', 'chat_crypto_protocol_events', 'chat_crypto_protocol_outbox', 'chat_crypto_recovery_backups', 'chat_crypto_report_audit', 'chat_crypto_report_evidence', 'chat_crypto_report_upload_sources', 'chat_crypto_state', 'chat_crypto_to_device_events', 'chat_crypto_upload_drafts'];
    try {
        return (await db.query('SELECT bool_and(to_regclass(name) IS NOT NULL) AS available FROM unnest($1::text[]) AS names(name)', [tables])).rows[0]?.available === true;
    }
    catch {
        throw new common_1.ServiceUnavailableException('Chat crypto schema unavailable');
    }
}
//# sourceMappingURL=crypto-schema-readiness.js.map