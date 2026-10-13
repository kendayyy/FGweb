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
exports.CryptoReportsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const contracts_1 = require("@fg/contracts");
const session_guard_js_1 = require("../../common/session.guard.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const chat_service_js_1 = require("../chat/chat.service.js");
const chat_exception_filter_js_1 = require("../chat/chat.exception-filter.js");
const crypto_reports_service_js_1 = require("./crypto-reports.service.js");
let CryptoReportsController = class CryptoReportsController {
    chat;
    reports;
    constructor(chat, reports) {
        this.chat = chat;
        this.reports = reports;
    }
    async disclose(req, body) { return this.reports.disclose(await this.chat.actor(req.headers), body); }
    async read(req, id, body) { return this.reports.readReport(await this.chat.actor(req.headers), id, body); }
    async readImage(req, id, attachmentId, res) { const bytes = await this.reports.readImage(await this.chat.actor(req.headers), id, attachmentId); res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff' }); res.send(bytes); }
    async image(req, body, file) {
        let metadata;
        try {
            if (Object.keys(body).length !== 1 || typeof body.metadata !== 'string')
                throw new Error();
            metadata = JSON.parse(body.metadata);
        }
        catch {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid disclosure metadata');
        }
        return this.reports.uploadImage(await this.chat.actor(req.headers), metadata, file);
    }
};
exports.CryptoReportsController = CryptoReportsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoReportsController.prototype, "disclose", null);
__decorate([
    (0, common_1.Post)(':reportId/read'),
    (0, common_1.Header)('Cache-Control', 'no-store'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('reportId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], CryptoReportsController.prototype, "read", null);
__decorate([
    (0, common_1.Get)(':reportId/attachments/:attachmentId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('reportId')),
    __param(2, (0, common_1.Param)('attachmentId')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], CryptoReportsController.prototype, "readImage", null);
__decorate([
    (0, common_1.Post)('attachments'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, parts: 2, fieldSize: 4096 } })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoReportsController.prototype, "image", null);
exports.CryptoReportsController = CryptoReportsController = __decorate([
    (0, common_1.Controller)('api/v1/crypto/reports'),
    (0, common_1.UseGuards)(csrf_guard_js_1.CsrfGuard, session_guard_js_1.SessionGuard),
    (0, common_1.UseFilters)(chat_exception_filter_js_1.ChatExceptionFilter),
    __metadata("design:paramtypes", [chat_service_js_1.ChatService, crypto_reports_service_js_1.CryptoReportsService])
], CryptoReportsController);
//# sourceMappingURL=crypto-reports.controller.js.map