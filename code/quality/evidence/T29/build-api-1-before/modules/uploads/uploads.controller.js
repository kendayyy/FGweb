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
exports.UploadsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const contracts_1 = require("@fg/contracts");
const uploads_service_js_1 = require("./uploads.service.js");
const chat_service_js_1 = require("../chat/chat.service.js");
const chat_exception_filter_js_1 = require("../chat/chat.exception-filter.js");
const attachment_dto_js_1 = require("../chat/attachment-dto.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const session_guard_js_1 = require("../../common/session.guard.js");
const onboarded_guard_js_1 = require("../auth/onboarded.guard.js");
let UploadsController = class UploadsController {
    uploads;
    chat;
    constructor(uploads, chat) {
        this.uploads = uploads;
        this.chat = chat;
    }
    async upload(body, file, req) { return this.uploads.upload(body, file, await this.chat.actor(req.headers)); }
    async metadata(id, req, response) { await this.uploads.image(id, await this.chat.actor(req.headers)); response.setHeader('Cache-Control', 'private, no-store'); return contracts_1.AttachmentUrlSchema.parse({ url: (0, attachment_dto_js_1.attachmentUrl)(id) }); }
    async content(id, req, response) { const bytes = await this.uploads.content(id, await this.chat.actor(req.headers)); response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.type('image/webp').send(bytes); }
};
exports.UploadsController = UploadsController;
__decorate([
    (0, common_1.Post)('uploads/images'),
    (0, common_1.UseGuards)(csrf_guard_js_1.CsrfGuard, session_guard_js_1.SessionGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', { limits: { fileSize: contracts_1.MAX_IMAGE_SIZE_BYTES, files: 1, fields: 1, parts: 2 } })),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], UploadsController.prototype, "upload", null);
__decorate([
    (0, common_1.Get)('attachments/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], UploadsController.prototype, "metadata", null);
__decorate([
    (0, common_1.Get)('attachments/:id/content'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], UploadsController.prototype, "content", null);
exports.UploadsController = UploadsController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseFilters)(chat_exception_filter_js_1.ChatExceptionFilter),
    __metadata("design:paramtypes", [uploads_service_js_1.UploadsService, chat_service_js_1.ChatService])
], UploadsController);
//# sourceMappingURL=uploads.controller.js.map