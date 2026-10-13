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
exports.PresenceController = void 0;
const common_1 = require("@nestjs/common");
const contracts_1 = require("@fg/contracts");
const presence_service_js_1 = require("./presence.service.js");
const chat_service_js_1 = require("../chat/chat.service.js");
const presence_gateway_js_1 = require("./presence.gateway.js");
function originAllowed(origin) {
    if (typeof origin !== 'string')
        return false;
    return [process.env.PUBLIC_ORIGIN, process.env.BETTER_AUTH_URL]
        .filter(Boolean)
        .some((value) => {
        try {
            return new URL(value).origin === origin;
        }
        catch {
            return false;
        }
    });
}
let PresenceController = class PresenceController {
    presenceService;
    chatService;
    presenceGateway;
    constructor(presenceService, chatService, presenceGateway) {
        this.presenceService = presenceService;
        this.chatService = chatService;
        this.presenceGateway = presenceGateway;
    }
    async getGameOnlineUsers(id, query) {
        const rawLimit = query.limit !== undefined ? Number(query.limit) : 50;
        const parsed = contracts_1.ListGameOnlineUsersQuerySchema.safeParse({
            limit: rawLimit,
            cursor: query.cursor !== undefined ? String(query.cursor) : undefined,
        });
        if (!parsed.success) {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid query parameters');
        }
        return this.presenceService.getOnlineUsersForGame(id, parsed.data);
    }
    async getOnlineUsers(query) {
        const rawLimit = query.limit !== undefined ? Number(query.limit) : 50;
        const parsed = contracts_1.ListOnlineUsersQuerySchema.safeParse({
            gameTitle: query.gameTitle !== undefined ? String(query.gameTitle) : undefined,
            limit: rawLimit,
        });
        if (!parsed.success) {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid query parameters');
        }
        return this.presenceService.getOnlineUsersAll(parsed.data);
    }
    async updateCustomStatus(body, req) {
        if (!originAllowed(req.headers.origin)) {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Origin denied');
        }
        const actor = await this.chatService.actor(req.headers);
        if (!actor) {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        }
        const parsed = contracts_1.UpdateCustomStatusRequestSchema.safeParse(body);
        if (!parsed.success) {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid status request');
        }
        const res = await this.presenceService.updateCustomStatus(actor, parsed.data.customStatus);
        await this.presenceGateway.broadcastStatusChange(actor.userId, res.customStatus);
        return contracts_1.UpdateCustomStatusResponseSchema.parse(res);
    }
};
exports.PresenceController = PresenceController;
__decorate([
    (0, common_1.Get)('games/:id/online'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PresenceController.prototype, "getGameOnlineUsers", null);
__decorate([
    (0, common_1.Get)('online-users'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PresenceController.prototype, "getOnlineUsers", null);
__decorate([
    (0, common_1.Patch)('me/status'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PresenceController.prototype, "updateCustomStatus", null);
exports.PresenceController = PresenceController = __decorate([
    (0, common_1.Controller)('api/v1'),
    __metadata("design:paramtypes", [presence_service_js_1.PresenceService,
        chat_service_js_1.ChatService,
        presence_gateway_js_1.PresenceGateway])
], PresenceController);
//# sourceMappingURL=presence.controller.js.map