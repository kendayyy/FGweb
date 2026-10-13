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
exports.SocialController = void 0;
const common_1 = require("@nestjs/common");
const session_guard_js_1 = require("../../common/session.guard.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const onboarded_guard_js_1 = require("../auth/onboarded.guard.js");
const social_service_js_1 = require("./social.service.js");
const social_exception_filter_js_1 = require("./social.exception-filter.js");
const contracts_1 = require("@fg/contracts");
const social_service_js_2 = require("./social.service.js");
function normalizeQuery(raw) {
    if (!raw || typeof raw !== 'object')
        return {};
    const res = { ...raw };
    if (res.limit !== undefined && res.limit !== null && res.limit !== '') {
        const num = Number(res.limit);
        if (!isNaN(num)) {
            res.limit = num;
        }
    }
    return res;
}
let SocialController = class SocialController {
    socialService;
    constructor(socialService) {
        this.socialService = socialService;
    }
    async getFriends(req, query) {
        const normalized = normalizeQuery(query);
        const parsed = contracts_1.ListFriendsQuerySchema.safeParse(normalized);
        if (!parsed.success) {
            (0, social_service_js_2.socialError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid list friends query parameters');
        }
        return this.socialService.getFriends(req.user.id, parsed.data);
    }
    async getFriendRequests(req, query) {
        const normalized = normalizeQuery(query);
        const parsed = contracts_1.ListFriendRequestsQuerySchema.safeParse(normalized);
        if (!parsed.success) {
            (0, social_service_js_2.socialError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid friend requests query parameters');
        }
        return this.socialService.getFriendRequests(req.user.id, parsed.data);
    }
    async sendFriendRequest(req, body) {
        const parsed = contracts_1.SendFriendRequestSchema.safeParse(body);
        if (!parsed.success) {
            (0, social_service_js_2.socialError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid send friend request payload');
        }
        return this.socialService.sendFriendRequest(req.user.id, req.session.id, parsed.data.targetUserId);
    }
    async respondFriendRequest(req, id, body) {
        const parsed = contracts_1.RespondFriendRequestSchema.safeParse(body);
        if (!parsed.success) {
            (0, social_service_js_2.socialError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid respond friend request payload');
        }
        return this.socialService.respondFriendRequest(req.user.id, req.session.id, id, parsed.data.action);
    }
    async removeFriend(req, userId, body) {
        if (body && typeof body === 'object' && Object.keys(body).length > 0) {
            const parsed = contracts_1.RemoveFriendSchema.safeParse(body);
            if (!parsed.success) {
                (0, social_service_js_2.socialError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid remove friend payload');
            }
        }
        return this.socialService.removeFriend(req.user.id, req.session.id, userId);
    }
    async cancelFriendRequest(req, id, body) {
        if (body && typeof body === 'object' && Object.keys(body).length > 0) {
            const parsed = contracts_1.CancelFriendRequestSchema.safeParse(body);
            if (!parsed.success) {
                (0, social_service_js_2.socialError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid cancel friend request payload');
            }
        }
        return this.socialService.cancelFriendRequest(req.user.id, req.session.id, id);
    }
    async getDirectConversations(req, query) {
        const normalized = normalizeQuery(query);
        const parsed = contracts_1.ListDirectConversationsQuerySchema.safeParse(normalized);
        if (!parsed.success) {
            (0, social_service_js_2.socialError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid direct conversations query parameters');
        }
        return this.socialService.getDirectConversations(req.user.id, parsed.data);
    }
    async createDirectConversation(req, body) {
        const parsed = contracts_1.CreateDirectConversationSchema.safeParse(body);
        if (!parsed.success) {
            (0, social_service_js_2.socialError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid create direct conversation payload');
        }
        return this.socialService.createDirectConversation(req.user.id, req.session.id, parsed.data.recipientUserId);
    }
    async getBlocks(req) {
        return this.socialService.getBlocks(req.user.id);
    }
    async createBlock(req, body) {
        const parsed = contracts_1.CreateBlockRequestSchema.safeParse(body);
        if (!parsed.success) {
            (0, social_service_js_2.socialError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid create block payload');
        }
        return this.socialService.createBlock(req.user.id, req.session.id, parsed.data.blockedId);
    }
    async deleteBlock(req, userId) {
        return this.socialService.deleteBlock(req.user.id, req.session.id, userId);
    }
};
exports.SocialController = SocialController;
__decorate([
    (0, common_1.Get)('friends'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "getFriends", null);
__decorate([
    (0, common_1.Get)('friends/requests'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "getFriendRequests", null);
__decorate([
    (0, common_1.Post)('friends/requests'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "sendFriendRequest", null);
__decorate([
    (0, common_1.Patch)('friends/requests/:id/respond'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "respondFriendRequest", null);
__decorate([
    (0, common_1.Delete)('friends/:userId'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "removeFriend", null);
__decorate([
    (0, common_1.Delete)('friends/requests/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "cancelFriendRequest", null);
__decorate([
    (0, common_1.Get)('direct-conversations'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "getDirectConversations", null);
__decorate([
    (0, common_1.Post)('direct-conversations'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "createDirectConversation", null);
__decorate([
    (0, common_1.Get)('blocks'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "getBlocks", null);
__decorate([
    (0, common_1.Post)('blocks'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "createBlock", null);
__decorate([
    (0, common_1.Delete)('blocks/:userId'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "deleteBlock", null);
exports.SocialController = SocialController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseFilters)(social_exception_filter_js_1.SocialExceptionFilter),
    __metadata("design:paramtypes", [social_service_js_1.SocialService])
], SocialController);
//# sourceMappingURL=social.controller.js.map