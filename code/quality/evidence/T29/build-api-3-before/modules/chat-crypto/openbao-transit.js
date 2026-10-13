"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenBaoTransit = exports.TransitFailure = void 0;
const node_https_1 = __importDefault(require("node:https"));
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("@fg/contracts");
const matrix_signatures_js_1 = require("./matrix-signatures.js");
class TransitFailure extends Error {
    reason;
    constructor(reason) {
        super(`Chat encryption service failed: ${reason}`);
        this.reason = reason;
        this.name = 'TransitFailure';
    }
}
exports.TransitFailure = TransitFailure;
class OpenBaoTransit {
    options;
    address;
    constructor(options) {
        this.options = options;
        try {
            this.address = new URL(options.address);
        }
        catch {
            throw new TransitFailure('CONFIGURATION');
        }
        if (this.address.protocol !== 'https:' || this.address.username || this.address.password || this.address.search || this.address.hash || this.address.pathname !== '/' || !options.ca.length)
            throw new TransitFailure('CONFIGURATION');
    }
    bindingBytes(key, binding) {
        if (!binding || Object.keys(binding).sort().join(',') !== 'conversationId,kind,objectId' || ![binding.conversationId, binding.objectId].every(id => typeof id === 'string' && id.length > 0 && id.length <= 128 && (0, matrix_signatures_js_1.isWellFormedUnicode)(id)))
            throw new TransitFailure('INVALID_ENVELOPE');
        if (!(key === 'fg-lobby' ? ['LOBBY_MESSAGE', 'LOBBY_IMAGE'] : ['REPORT_TEXT', 'REPORT_IMAGE']).includes(binding.kind))
            throw new TransitFailure('INVALID_ENVELOPE');
        return Buffer.from(JSON.stringify(['FG', 1, key, binding.kind, binding.conversationId, binding.objectId]), 'utf8');
    }
    async request(action, key, body) {
        let token;
        try {
            token = await this.options.token();
        }
        catch {
            throw new TransitFailure('AUTHORIZATION');
        }
        if (!token || token.length > 16384 || /[\r\n]/.test(token))
            throw new TransitFailure('AUTHORIZATION');
        const payload = JSON.stringify(body);
        return new Promise((resolve, reject) => {
            const fail = (reason) => reject(new TransitFailure(reason));
            const req = node_https_1.default.request(new URL(`/v1/transit/${action}/${key}`, this.address), { method: 'POST', ca: this.options.ca, rejectUnauthorized: true, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'X-Vault-Token': token } }, res => {
                const buffers = [];
                let bytes = 0;
                res.on('data', (chunk) => { bytes += chunk.length; if (bytes > 24 * 1024 * 1024) {
                    req.destroy();
                    fail('UNAVAILABLE');
                }
                else
                    buffers.push(chunk); });
                res.on('error', () => fail('UNAVAILABLE'));
                res.on('end', () => {
                    if (res.statusCode === 401 || res.statusCode === 403)
                        return fail('AUTHORIZATION');
                    if (res.statusCode === 400)
                        return fail('INTEGRITY');
                    if (res.statusCode !== 200)
                        return fail('UNAVAILABLE');
                    try {
                        const parsed = JSON.parse(Buffer.concat(buffers).toString('utf8'));
                        if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data))
                            return fail('UNAVAILABLE');
                        resolve(parsed.data);
                    }
                    catch {
                        fail('UNAVAILABLE');
                    }
                });
            });
            const deadline = setTimeout(() => req.destroy(), this.options.timeoutMs ?? 10000);
            req.on('close', () => clearTimeout(deadline));
            req.on('error', () => fail('UNAVAILABLE'));
            req.setTimeout(this.options.timeoutMs ?? 10000, () => req.destroy());
            req.end(payload);
        });
    }
    envelope(key, ciphertext) {
        if (typeof ciphertext !== 'string')
            throw new TransitFailure('INVALID_ENVELOPE');
        const parsed = contracts_1.LobbyStorageEnvelopeSchema.safeParse({ version: 1, protocol: 'OPENBAO_TRANSIT_AES256GCM', keyId: key, keyVersion: Number(ciphertext.split(':')[1]?.slice(1)), ciphertext });
        if (!parsed.success)
            throw new TransitFailure('INVALID_ENVELOPE');
        return parsed.data;
    }
    async encrypt(key, plaintext, binding) {
        if (!plaintext.length || plaintext.length > 5 * 1024 * 1024)
            throw new TransitFailure('INVALID_ENVELOPE');
        const context = this.bindingBytes(key, binding), header = Buffer.alloc(8);
        header.write('FGC1');
        header.writeUInt32BE(context.length, 4);
        const data = await this.request('encrypt', key, { plaintext: Buffer.concat([header, context, Buffer.from(plaintext)]).toString('base64') });
        return this.envelope(key, data.ciphertext);
    }
    async decrypt(input, binding) {
        const parsed = contracts_1.LobbyStorageEnvelopeSchema.safeParse(input);
        if (!parsed.success)
            throw new TransitFailure('INVALID_ENVELOPE');
        const context = this.bindingBytes(parsed.data.keyId, binding);
        const data = await this.request('decrypt', parsed.data.keyId, { ciphertext: parsed.data.ciphertext });
        if (typeof data.plaintext !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.plaintext))
            throw new TransitFailure('INVALID_ENVELOPE');
        const bytes = Buffer.from(data.plaintext, 'base64');
        try {
            if (bytes.length < 9 || bytes.length > 5 * 1024 * 1024 + 2048 || bytes.toString('base64') !== data.plaintext || bytes.subarray(0, 4).toString() !== 'FGC1')
                throw new TransitFailure('INVALID_ENVELOPE');
            const size = bytes.readUInt32BE(4);
            if (size !== context.length || bytes.length <= 8 + size || !(0, node_crypto_1.timingSafeEqual)(bytes.subarray(8, 8 + size), context))
                throw new TransitFailure('INTEGRITY');
            const plaintext = bytes.subarray(8 + size);
            if (plaintext.length > 5 * 1024 * 1024)
                throw new TransitFailure('INVALID_ENVELOPE');
            return plaintext;
        }
        catch (error) {
            bytes.fill(0);
            throw error;
        }
    }
    async rewrap(input, binding) {
        const parsed = contracts_1.LobbyStorageEnvelopeSchema.safeParse(input);
        if (!parsed.success)
            throw new TransitFailure('INVALID_ENVELOPE');
        this.bindingBytes(parsed.data.keyId, binding);
        const data = await this.request('rewrap', parsed.data.keyId, { ciphertext: parsed.data.ciphertext });
        const result = this.envelope(parsed.data.keyId, data.ciphertext);
        if (result.keyVersion < parsed.data.keyVersion)
            throw new TransitFailure('INVALID_ENVELOPE');
        return result;
    }
}
exports.OpenBaoTransit = OpenBaoTransit;
//# sourceMappingURL=openbao-transit.js.map