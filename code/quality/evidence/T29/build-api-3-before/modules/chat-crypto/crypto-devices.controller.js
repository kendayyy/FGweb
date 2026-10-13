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
exports.CryptoDevicesController = void 0;
const common_1 = require("@nestjs/common");
const contracts_1 = require("@fg/contracts");
const session_guard_js_1 = require("../../common/session.guard.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const chat_service_js_1 = require("../chat/chat.service.js");
const chat_exception_filter_js_1 = require("../chat/chat.exception-filter.js");
const crypto_devices_service_js_1 = require("./crypto-devices.service.js");
let CryptoDevicesController = class CryptoDevicesController {
    chat;
    devices;
    constructor(chat, devices) {
        this.chat = chat;
        this.devices = devices;
    }
    async register(req, body) { return this.devices.register(await this.chat.actor(req.headers), body); }
    async list(req) { return this.devices.list(await this.chat.actor(req.headers)); }
    async revoke(req, deviceId) { return this.devices.revoke(await this.chat.actor(req.headers), deviceId); }
    async prekeys(req, deviceId, body) {
        const parsed = contracts_1.UploadOneTimeKeysSchema.safeParse(body);
        if (!parsed.success)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid prekeys');
        return this.devices.uploadPrekeys(await this.chat.actor(req.headers), deviceId, parsed.data.oneTimeKeys);
    }
    async putRecovery(req, body) { return this.devices.putRecovery(await this.chat.actor(req.headers), body); }
    async getRecovery(req) { return this.devices.getRecovery(await this.chat.actor(req.headers)); }
    async deleteRecovery(req) { return this.devices.deleteRecovery(await this.chat.actor(req.headers)); }
    async identity(req, body) { return this.devices.putIdentity(await this.chat.actor(req.headers), body); }
    async signatures(req, body) { return this.devices.uploadSignatures(await this.chat.actor(req.headers), body); }
};
exports.CryptoDevicesController = CryptoDevicesController;
__decorate([
    (0, common_1.Post)('devices'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoDevicesController.prototype, "register", null);
__decorate([
    (0, common_1.Get)('devices'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CryptoDevicesController.prototype, "list", null);
__decorate([
    (0, common_1.Delete)('devices/:deviceId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('deviceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CryptoDevicesController.prototype, "revoke", null);
__decorate([
    (0, common_1.Post)('devices/:deviceId/one-time-keys'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('deviceId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], CryptoDevicesController.prototype, "prekeys", null);
__decorate([
    (0, common_1.Put)('recovery'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoDevicesController.prototype, "putRecovery", null);
__decorate([
    (0, common_1.Get)('recovery'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CryptoDevicesController.prototype, "getRecovery", null);
__decorate([
    (0, common_1.Delete)('recovery'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CryptoDevicesController.prototype, "deleteRecovery", null);
__decorate([
    (0, common_1.Put)('identity'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoDevicesController.prototype, "identity", null);
__decorate([
    (0, common_1.Post)('signatures'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CryptoDevicesController.prototype, "signatures", null);
exports.CryptoDevicesController = CryptoDevicesController = __decorate([
    (0, common_1.Controller)('api/v1/crypto'),
    (0, common_1.UseGuards)(csrf_guard_js_1.CsrfGuard, session_guard_js_1.SessionGuard),
    (0, common_1.UseFilters)(chat_exception_filter_js_1.ChatExceptionFilter),
    __metadata("design:paramtypes", [chat_service_js_1.ChatService, crypto_devices_service_js_1.CryptoDevicesService])
], CryptoDevicesController);
//# sourceMappingURL=crypto-devices.controller.js.map