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
exports.PrivateNotificationsController = void 0;
const common_1 = require("@nestjs/common");
const session_guard_js_1 = require("../../common/session.guard.js");
const chat_exception_filter_js_1 = require("../chat/chat.exception-filter.js");
const chat_service_js_1 = require("../chat/chat.service.js");
const private_notifications_service_js_1 = require("./private-notifications.service.js");
let PrivateNotificationsController = class PrivateNotificationsController {
    chat;
    notices;
    constructor(chat, notices) {
        this.chat = chat;
        this.notices = notices;
    }
    async list(req, query) { return this.notices.list(await this.chat.actor(req.headers), query); }
};
exports.PrivateNotificationsController = PrivateNotificationsController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.Header)('Cache-Control', 'no-store'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PrivateNotificationsController.prototype, "list", null);
exports.PrivateNotificationsController = PrivateNotificationsController = __decorate([
    (0, common_1.Controller)('api/v1/notifications'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard),
    (0, common_1.UseFilters)(chat_exception_filter_js_1.ChatExceptionFilter),
    __metadata("design:paramtypes", [chat_service_js_1.ChatService, private_notifications_service_js_1.PrivateNotificationsService])
], PrivateNotificationsController);
//# sourceMappingURL=private-notifications.controller.js.map