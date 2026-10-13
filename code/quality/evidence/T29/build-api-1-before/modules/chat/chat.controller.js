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
exports.ChatController = void 0;
const common_1 = require("@nestjs/common");
const contracts_1 = require("@fg/contracts");
const chat_service_js_1 = require("./chat.service.js");
const chat_exception_filter_js_1 = require("./chat.exception-filter.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const session_guard_js_1 = require("../../common/session.guard.js");
const onboarded_guard_js_1 = require("../auth/onboarded.guard.js");
const normalize = (query) => ({ ...query, ...(query.limit !== undefined ? { limit: Number(query.limit) } : {}) });
let ChatController = class ChatController {
    chat;
    constructor(chat) {
        this.chat = chat;
    }
    async game(id, query, request) {
        const parsed = contracts_1.ListMessagesQuerySchema.strict().safeParse(normalize(query));
        if (!parsed.success)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid history query');
        return this.chat.history(await this.chat.lobby(id), parsed.data, await this.chat.actor(request.headers));
    }
    async title(query, request) {
        const parsed = contracts_1.LobbyMessagesQuerySchema.strict().safeParse(normalize(query));
        if (!parsed.success)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid Lobby query');
        return this.chat.history(await this.chat.lobbyTitle(parsed.data.gameTitle), parsed.data, await this.chat.actor(request.headers));
    }
    async history(id, query, request) {
        const actor = await this.chat.actor(request.headers);
        if (!actor) {
            const conversation = await this.chat.conversation(id);
            if (conversation.kind !== 'LOBBY')
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        }
        const parsed = contracts_1.ListMessagesQuerySchema.strict().safeParse(normalize(query));
        if (!parsed.success)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid history query');
        return this.chat.history(id, parsed.data, actor);
    }
    async create(id, body, request) {
        const actor = await this.chat.actor(request.headers);
        if (!actor)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        const parsed = contracts_1.CreateMessageRequestSchema.safeParse(body);
        if (!parsed.success)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid message');
        return this.chat.create(id, parsed.data, actor);
    }
};
exports.ChatController = ChatController;
__decorate([
    (0, common_1.Get)('games/:gameId/lobby/messages'),
    __param(0, (0, common_1.Param)('gameId')),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "game", null);
__decorate([
    (0, common_1.Get)('lobby/messages'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "title", null);
__decorate([
    (0, common_1.Get)('conversations/:id/messages'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "history", null);
__decorate([
    (0, common_1.Post)('conversations/:id/messages'),
    (0, common_1.UseGuards)(csrf_guard_js_1.CsrfGuard, session_guard_js_1.SessionGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "create", null);
exports.ChatController = ChatController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseFilters)(chat_exception_filter_js_1.ChatExceptionFilter),
    __metadata("design:paramtypes", [chat_service_js_1.ChatService])
], ChatController);
//# sourceMappingURL=chat.controller.js.map