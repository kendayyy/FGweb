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
exports.CryptoLegacyController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const contracts_1 = require("@fg/contracts");
const session_guard_js_1 = require("../../common/session.guard.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const chat_exception_filter_js_1 = require("../chat/chat.exception-filter.js");
const chat_service_js_1 = require("../chat/chat.service.js");
const crypto_legacy_service_js_1 = require("./crypto-legacy.service.js");
const crypto_relay_service_js_1 = require("./crypto-relay.service.js");
let CryptoLegacyController = class CryptoLegacyController {
    chat;
    legacy;
    relay;
    constructor(chat, legacy, relay) {
        this.chat = chat;
        this.legacy = legacy;
        this.relay = relay;
    }
    async upload(req, id, body, res, file) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        let metadata;
        try {
            if (Object.keys(body).length !== 1 || typeof body.metadata !== 'string')
                throw new Error();
            metadata = JSON.parse(body.metadata);
        }
        catch {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid upload metadata');
        }
        return this.relay.uploadLegacyAttachment(await this.chat.actor(req.headers), id, metadata, file);
    }
    async prepare(req, id, body, res) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); return this.legacy.prepare(await this.chat.actor(req.headers), id, body); }
    async candidateContent(req, id, candidateId, attachmentId, query, res) { const bytes = await this.legacy.candidateContent(await this.chat.actor(req.headers), id, candidateId, attachmentId, query); res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.send(bytes); }
    async candidate(req, id, candidateId, query, res) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); return this.legacy.candidate(await this.chat.actor(req.headers), id, candidateId, query); }
    async attest(req, id, body, res) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); return this.legacy.attest(await this.chat.actor(req.headers), id, body); }
    async batch(req, id, query, res) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); return this.legacy.batch(await this.chat.actor(req.headers), id, query); }
    async content(req, id, attachmentId, query, res) { const bytes = await this.legacy.content(await this.chat.actor(req.headers), id, attachmentId, query); res.setHeader('Content-Type', 'image/webp'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.send(bytes); }
};
exports.CryptoLegacyController = CryptoLegacyController;
__decorate([
    (0, common_1.Post)('uploads'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, parts: 2, fieldSize: 4096 } })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __param(4, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoLegacyController.prototype, "upload", null);
__decorate([
    (0, common_1.Post)('commit'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoLegacyController.prototype, "prepare", null);
__decorate([
    (0, common_1.Get)('candidates/:candidateId/attachments/:attachmentId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('candidateId')),
    __param(3, (0, common_1.Param)('attachmentId')),
    __param(4, (0, common_1.Query)()),
    __param(5, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoLegacyController.prototype, "candidateContent", null);
__decorate([
    (0, common_1.Get)('candidates/:candidateId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('candidateId')),
    __param(3, (0, common_1.Query)()),
    __param(4, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoLegacyController.prototype, "candidate", null);
__decorate([
    (0, common_1.Post)('attest'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoLegacyController.prototype, "attest", null);
__decorate([
    (0, common_1.Get)('batch'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Query)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoLegacyController.prototype, "batch", null);
__decorate([
    (0, common_1.Get)('attachments/:attachmentId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('attachmentId')),
    __param(3, (0, common_1.Query)()),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoLegacyController.prototype, "content", null);
exports.CryptoLegacyController = CryptoLegacyController = __decorate([
    (0, common_1.Controller)('api/v1/crypto/conversations/:id/legacy'),
    (0, common_1.UseGuards)(csrf_guard_js_1.CsrfGuard, session_guard_js_1.SessionGuard),
    (0, common_1.UseFilters)(chat_exception_filter_js_1.ChatExceptionFilter),
    __metadata("design:paramtypes", [chat_service_js_1.ChatService, crypto_legacy_service_js_1.CryptoLegacyService, crypto_relay_service_js_1.CryptoRelayService])
], CryptoLegacyController);
//# sourceMappingURL=crypto-legacy.controller.js.map