"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWellFormedUnicode = exports.matrixRoomId = exports.matrixUserId = void 0;
exports.canonicalSignedPayload = canonicalSignedPayload;
exports.matrixBase64 = matrixBase64;
exports.verifyMatrixSignature = verifyMatrixSignature;
exports.verifyLegacyRoundtripAttestation = verifyLegacyRoundtripAttestation;
exports.verifySignedOneTimeKeys = verifySignedOneTimeKeys;
exports.verifyDeviceRegistration = verifyDeviceRegistration;
exports.verifyCrossSigningIdentity = verifyCrossSigningIdentity;
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("@fg/contracts");
const matrixUserId = (userId) => `@fg_${(0, node_crypto_1.createHash)('sha256').update(userId, 'utf8').digest('hex')}:fg.invalid`;
exports.matrixUserId = matrixUserId;
const matrixRoomId = (conversationId) => `!fg_${(0, node_crypto_1.createHash)('sha256').update(conversationId, 'utf8').digest('hex')}:fg.invalid`;
exports.matrixRoomId = matrixRoomId;
function invalid() { throw new Error('Invalid Matrix public-key authentication'); }
const isWellFormedUnicode = (value) => Array.from(value).every(character => { const code = character.codePointAt(0); return code < 0xd800 || code > 0xdfff; });
exports.isWellFormedUnicode = isWellFormedUnicode;
function codePointOrder(a, b) {
    const first = Array.from(a), second = Array.from(b);
    for (let i = 0; i < Math.min(first.length, second.length); i++) {
        const delta = first[i].codePointAt(0) - second[i].codePointAt(0);
        if (delta)
            return delta;
    }
    return first.length - second.length;
}
function canonical(value) {
    if (value === null || typeof value === 'boolean')
        return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value))
            invalid();
        return JSON.stringify(value);
    }
    if (typeof value === 'string') {
        if (!(0, exports.isWellFormedUnicode)(value))
            invalid();
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    if (typeof value !== 'object' || !value || Object.getPrototypeOf(value) !== Object.prototype)
        invalid();
    const data = value;
    return `{${Object.keys(data).sort(codePointOrder).map(k => `${canonical(k)}:${canonical(data[k])}`).join(',')}}`;
}
function canonicalSignedPayload(value) {
    return canonical(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'unsigned' && key !== 'signatures')));
}
function matrixBase64(value, bytes) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value))
        invalid();
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length !== bytes || decoded.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, ''))
        invalid();
    return decoded;
}
function verifyMatrixSignature(value, userId, keyId, publicKey) {
    const signatures = value.signatures;
    const signature = signatures?.[userId]?.[keyId];
    if (!signature)
        invalid();
    const key = (0, node_crypto_1.createPublicKey)({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), matrixBase64(publicKey, 32)]), format: 'der', type: 'spki' });
    if (!(0, node_crypto_1.verify)(null, Buffer.from(canonicalSignedPayload(value), 'utf8'), key, matrixBase64(signature, 64)))
        invalid();
}
function verifyLegacyRoundtripAttestation(input, device, expected) {
    const receipt = contracts_1.LegacyRoundtripAttestationSchema.parse(input);
    if (receipt.userId !== device.userId || receipt.deviceId !== device.deviceId)
        invalid();
    const binding = { candidateId: receipt.candidateId, messageId: receipt.messageId, conversationId: receipt.conversationId, cohortId: receipt.cohortId, membershipRevision: receipt.membershipRevision, originalSha256: receipt.originalSha256, envelopeSha256: receipt.envelopeSha256, attachmentDigests: receipt.attachmentDigests };
    if (canonicalSignedPayload(binding) !== canonicalSignedPayload(expected))
        invalid();
    verifyMatrixSignature(receipt, (0, exports.matrixUserId)(device.userId), `ed25519:${device.deviceId}`, device.ed25519Key);
    return receipt;
}
function verifySignedOneTimeKeys(userId, deviceId, publicKey, input) {
    const parsed = contracts_1.UploadOneTimeKeysSchema.parse({ oneTimeKeys: input });
    for (const key of Object.values(parsed.oneTimeKeys)) {
        matrixBase64(key.key, 32);
        verifyMatrixSignature(key, (0, exports.matrixUserId)(userId), `ed25519:${deviceId}`, publicKey);
    }
    return parsed.oneTimeKeys;
}
function verifyDeviceRegistration(userId, input) {
    const parsed = contracts_1.RegisterCryptoDeviceSchema.parse(input), device = parsed.deviceKeys;
    if (device.user_id !== (0, exports.matrixUserId)(userId))
        invalid();
    const publicKey = device.keys[`ed25519:${device.device_id}`];
    matrixBase64(publicKey, 32);
    matrixBase64(device.keys[`curve25519:${device.device_id}`], 32);
    verifyMatrixSignature(device, device.user_id, `ed25519:${device.device_id}`, publicKey);
    if (Object.keys(parsed.oneTimeKeys).length)
        verifySignedOneTimeKeys(userId, device.device_id, publicKey, parsed.oneTimeKeys);
    return parsed;
}
function verifyCrossSigningIdentity(userId, input) {
    const parsed = contracts_1.UploadCrossSigningKeysSchema.parse(input), owner = (0, exports.matrixUserId)(userId);
    if (parsed.masterKey.user_id !== owner)
        invalid();
    const [masterId, masterPublicKey] = Object.entries(parsed.masterKey.keys)[0];
    if (masterId !== `ed25519:${masterPublicKey}`)
        invalid();
    matrixBase64(masterPublicKey, 32);
    for (const subordinate of [parsed.selfSigningKey, parsed.userSigningKey]) {
        const [id, key] = Object.entries(subordinate.keys)[0];
        if (id !== `ed25519:${key}`)
            invalid();
        matrixBase64(key, 32);
        verifyMatrixSignature(subordinate, owner, masterId, masterPublicKey);
    }
    return parsed;
}
//# sourceMappingURL=matrix-signatures.js.map