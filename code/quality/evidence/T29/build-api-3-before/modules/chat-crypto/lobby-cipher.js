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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LobbyCipher = exports.LOBBY_CUSTODY = void 0;
const common_1 = require("@nestjs/common");
const contracts_1 = require("@fg/contracts");
const node_crypto_1 = require("node:crypto");
const crypto_object_store_js_1 = require("./crypto-object-store.js");
exports.LOBBY_CUSTODY = 'FG_LOBBY_CUSTODY';
let LobbyCipher = class LobbyCipher {
    custody;
    objects = new crypto_object_store_js_1.CryptoObjectStore(8 * 1024 * 1024);
    constructor(custody) {
        this.custody = custody;
    }
    async onModuleInit() { if (this.custody?.transit)
        await this.objects.initialize(); }
    transit() { if (!this.custody?.transit)
        throw new common_1.ServiceUnavailableException('Lobby custody unavailable'); return this.custody.transit; }
    async encodeMessage(input) {
        const parsed = contracts_1.LobbyStoredMessageSchema.parse(input), bytes = Buffer.from(JSON.stringify(parsed));
        try {
            return await this.transit().encrypt('fg-lobby', bytes, { kind: 'LOBBY_MESSAGE', conversationId: parsed.conversationId, objectId: parsed.messageId });
        }
        catch {
            throw new common_1.ServiceUnavailableException('Lobby custody unavailable');
        }
        finally {
            bytes.fill(0);
        }
    }
    async decodeMessage(row) {
        let bytes;
        try {
            const envelope = contracts_1.LobbyStorageEnvelopeSchema.parse(row.crypto_envelope);
            if (envelope.keyId !== 'fg-lobby')
                throw new Error();
            bytes = await this.transit().decrypt(envelope, { kind: 'LOBBY_MESSAGE', conversationId: row.conversation_id, objectId: row.id });
        }
        catch {
            throw new common_1.ServiceUnavailableException('Lobby ciphertext unavailable');
        }
        try {
            const payload = contracts_1.LobbyStoredMessageSchema.parse(JSON.parse(bytes.toString('utf8')));
            if (payload.messageId !== row.id || payload.conversationId !== row.conversation_id)
                throw new Error();
            return payload;
        }
        catch {
            throw new common_1.ServiceUnavailableException('Lobby ciphertext integrity failed');
        }
        finally {
            bytes.fill(0);
        }
    }
    async encodeImage(bytes, conversationId, id) {
        try {
            return await this.transit().encrypt('fg-lobby', bytes, { kind: 'LOBBY_IMAGE', conversationId, objectId: id });
        }
        catch {
            throw new common_1.ServiceUnavailableException('Lobby custody unavailable');
        }
    }
    async readImage(row) {
        try {
            const envelope = contracts_1.LobbyStorageEnvelopeSchema.parse(row.envelope), bytes = await this.objects.read(row.object_key);
            if (envelope.keyId !== 'fg-lobby' || bytes.length !== row.ciphertext_size || bytes.toString() !== JSON.stringify(envelope) || (0, node_crypto_1.createHash)('sha256').update(bytes).digest('base64').replace(/=+$/, '') !== row.ciphertext_sha256)
                throw new Error();
            const plaintext = await this.transit().decrypt(envelope, { kind: 'LOBBY_IMAGE', conversationId: row.conversation_id, objectId: row.id });
            if (!plaintext.length || plaintext.length > contracts_1.MAX_IMAGE_SIZE_BYTES || plaintext.toString('ascii', 0, 4) !== 'RIFF' || plaintext.toString('ascii', 8, 12) !== 'WEBP') {
                plaintext.fill(0);
                throw new Error();
            }
            return plaintext;
        }
        catch {
            throw new common_1.ServiceUnavailableException('Lobby image unavailable');
        }
    }
};
exports.LobbyCipher = LobbyCipher;
exports.LobbyCipher = LobbyCipher = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(0, (0, common_1.Inject)(exports.LOBBY_CUSTODY)),
    __metadata("design:paramtypes", [Object])
], LobbyCipher);
//# sourceMappingURL=lobby-cipher.js.map