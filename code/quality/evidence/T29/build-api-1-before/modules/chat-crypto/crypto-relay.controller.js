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
exports.CryptoRelayController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const contracts_1 = require("@fg/contracts");
const session_guard_js_1 = require("../../common/session.guard.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const chat_service_js_1 = require("../chat/chat.service.js");
const chat_exception_filter_js_1 = require("../chat/chat.exception-filter.js");
const crypto_relay_service_js_1 = require("./crypto-relay.service.js");
let CryptoRelayController = class CryptoRelayController {
    chat;
    relay;
    constructor(chat, relay) {
        this.chat = chat;
        this.relay = relay;
    }
    async state(req, id) { return this.relay.state(await this.chat.actor(req.headers), id); }
    async keys(req, body) { return this.relay.queryKeys(await this.chat.actor(req.headers), body); }
    async claim(req, body) { return this.relay.claimKeys(await this.chat.actor(req.headers), body); }
    async verification(req, body) { return this.relay.verification(await this.chat.actor(req.headers), body); }
    async toDevice(req, body) { return this.relay.toDevice(await this.chat.actor(req.headers), body); }
    async sync(req, query) { return this.relay.sync(await this.chat.actor(req.headers), query); }
    async ack(req, body) { return this.relay.acknowledge(await this.chat.actor(req.headers), body); }
    async message(req, id, body) { return this.relay.sendMessage(await this.chat.actor(req.headers), id, body); }
    async history(req, id, query) { return this.relay.messageHistory(await this.chat.actor(req.headers), id, query); }
    async upload(req, id, body, file) {
        let metadata;
        try {
            if (Object.keys(body).length !== 1 || typeof body.metadata !== 'string')
                throw new Error();
            metadata = JSON.parse(body.metadata);
        }
        catch {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid upload metadata');
        }
        return this.relay.uploadAttachment(await this.chat.actor(req.headers), id, metadata, file);
    }
    async object(req, id, attachmentId, res) { const bytes = await this.relay.readAttachment(await this.chat.actor(req.headers), id, attachmentId); res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.send(bytes); }
};
exports.CryptoRelayController = CryptoRelayController;
__decorate([
    (0, common_1.Get)('conversations/:id/state'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CryptoRelayController.prototype, "state", null);
__decorate([
    (0, common_1.Post)('keys/query'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoRelayController.prototype, "keys", null);
__decorate([
    (0, common_1.Post)('keys/claim'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoRelayController.prototype, "claim", null);
__decorate([
    (0, common_1.Post)('verification'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoRelayController.prototype, "verification", null);
__decorate([
    (0, common_1.Post)('to-device'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoRelayController.prototype, "toDevice", null);
__decorate([
    (0, common_1.Get)('sync'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoRelayController.prototype, "sync", null);
__decorate([
    (0, common_1.Post)('sync/ack'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoRelayController.prototype, "ack", null);
__decorate([
    (0, common_1.Post)('conversations/:id/messages'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], CryptoRelayController.prototype, "message", null);
__decorate([
    (0, common_1.Get)('conversations/:id/messages'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], CryptoRelayController.prototype, "history", null);
__decorate([
    (0, common_1.Post)('conversations/:id/attachments'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, parts: 2, fieldSize: 4096 } })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoRelayController.prototype, "upload", null);
__decorate([
    (0, common_1.Get)('conversations/:id/attachments/:attachmentId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('attachmentId')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], CryptoRelayController.prototype, "object", null);
exports.CryptoRelayController = CryptoRelayController = __decorate([
    (0, common_1.Controller)('api/v1/crypto'),
    (0, common_1.UseGuards)(csrf_guard_js_1.CsrfGuard, session_guard_js_1.SessionGuard),
    (0, common_1.UseFilters)(chat_exception_filter_js_1.ChatExceptionFilter),
    __metadata("design:paramtypes", [chat_service_js_1.ChatService, crypto_relay_service_js_1.CryptoRelayService])
], CryptoRelayController);
//# sourceMappingURL=crypto-relay.controller.js.map