"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cryptoTransportBudget = cryptoTransportBudget;
exports.lockCryptoTransportBudget = lockCryptoTransportBudget;
exports.enforceCryptoTransportBudget = enforceCryptoTransportBudget;
const common_1 = require("@nestjs/common");
const contracts_1 = require("@fg/contracts");
const chat_service_js_1 = require("../chat/chat.service.js");
function cryptoTransportBudget(env = process.env) {
    const value = (name) => { const text = env[name]; if (!text || !/^\d+$/.test(text))
        throw new common_1.ServiceUnavailableException('Crypto transport budget unavailable'); const number = Number(text); if (!Number.isSafeInteger(number) || number < 1)
        throw new common_1.ServiceUnavailableException('Crypto transport budget unavailable'); return number; };
    return { maxRows: value('FG_CRYPTO_TRANSPORT_MAX_ROWS_PER_USER'), maxPayloadBytes: value('FG_CRYPTO_TRANSPORT_MAX_PAYLOAD_BYTES_PER_USER') };
}
async function lockCryptoTransportBudget(db, additions) {
    const isolation = await db.query('SHOW transaction_isolation');
    if (isolation.rows[0]?.transaction_isolation !== 'read committed')
        throw new common_1.ServiceUnavailableException('Crypto transport budget unavailable');
    const dimensions = new Map();
    for (const item of additions)
        for (const kind of ['SENDER', 'RECIPIENT']) {
            const user = kind === 'SENDER' ? item.senderId : item.recipientId;
            dimensions.set(JSON.stringify([kind, user]), { kind, user });
        }
    for (const [, entry] of [...dimensions.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_crypto_transport',current_schema(),$1::text,$2::text)::text,0::bigint))", [entry.kind, entry.user]);
}
async function enforceCryptoTransportBudget(db, additions, budget) {
    if (!Number.isSafeInteger(budget.maxRows) || budget.maxRows < 1 || !Number.isSafeInteger(budget.maxPayloadBytes) || budget.maxPayloadBytes < 1)
        throw new common_1.ServiceUnavailableException('Crypto transport budget unavailable');
    if (!additions.length)
        return;
    await lockCryptoTransportBudget(db, additions);
    const dimensions = new Map();
    for (const addition of additions) {
        const encoded = JSON.stringify(addition.payload);
        if (encoded === undefined)
            throw new common_1.ServiceUnavailableException('Crypto transport budget unavailable');
        const size = await db.query('SELECT octet_length($1::jsonb::text)::text AS bytes', [encoded]), bytes = Number(size.rows[0].bytes);
        if (!Number.isSafeInteger(bytes) || bytes < 1)
            throw new common_1.ServiceUnavailableException('Crypto transport budget unavailable');
        for (const kind of ['SENDER', 'RECIPIENT']) {
            const user = kind === 'SENDER' ? addition.senderId : addition.recipientId, key = JSON.stringify([kind, user]), entry = dimensions.get(key) ?? { kind, user, rows: 0, bytes: 0 };
            entry.rows++;
            entry.bytes += bytes;
            dimensions.set(key, entry);
        }
    }
    const entries = [...dimensions.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    for (const [, entry] of entries)
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_crypto_transport',current_schema(),$1::text,$2::text)::text,0::bigint))", [entry.kind, entry.user]);
    for (const [, entry] of entries) {
        const column = entry.kind === 'SENDER' ? 'sender_user_id' : 'recipient_user_id';
        const result = await db.query(`SELECT sum(n)::text AS rows,sum(b)::text AS bytes FROM (SELECT count(*) AS n,COALESCE(sum(octet_length(content::text)),0) AS b FROM chat_crypto_to_device_events WHERE ${column}=$1 UNION ALL SELECT count(*) AS n,COALESCE(sum(octet_length(event::text)),0) AS b FROM chat_crypto_protocol_events WHERE ${column}=$1) retained`, [entry.user]);
        const rows = Number(result.rows[0].rows), bytes = Number(result.rows[0].bytes);
        if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(bytes) || !Number.isSafeInteger(entry.bytes))
            throw new common_1.ServiceUnavailableException('Crypto transport budget unavailable');
        if (rows > budget.maxRows - entry.rows || bytes > budget.maxPayloadBytes - entry.bytes)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.RATE_LIMITED, 'Crypto transport quota exceeded');
    }
}
//# sourceMappingURL=crypto-transport-budget.js.map