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
exports.ProfilesController = void 0;
const common_1 = require("@nestjs/common");
const session_guard_js_1 = require("../../common/session.guard.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const profiles_service_js_1 = require("./profiles.service.js");
const profiles_exception_filter_js_1 = require("./profiles.exception-filter.js");
const contracts_1 = require("@fg/contracts");
let ProfilesController = class ProfilesController {
    profilesService;
    constructor(profilesService) {
        this.profilesService = profilesService;
    }
    async getPublicProfile(id) {
        return this.profilesService.getPublicProfile(id);
    }
    async getGames(query) {
        const parsed = contracts_1.ListGamesQuerySchema.safeParse(query);
        if (!parsed.success) {
            throw new common_1.UnprocessableEntityException('Invalid query parameters');
        }
        return this.profilesService.getGames(parsed.data.search);
    }
    async updateProfile(req, body) {
        const parsed = contracts_1.UpdateProfileRequestSchema.strict().safeParse(body);
        if (!parsed.success) {
            throw new common_1.UnprocessableEntityException('Invalid profile payload');
        }
        return this.profilesService.updateProfile(req.user.id, parsed.data, req.user.image);
    }
    async onboarding(req, body) {
        const parsed = contracts_1.OnboardingRequestSchema.strict().safeParse(body);
        if (!parsed.success) {
            throw new common_1.UnprocessableEntityException('Invalid onboarding payload');
        }
        return this.profilesService.onboarding(req.user.id, parsed.data, req.user.image);
    }
    async updateInterests(req, body) {
        const parsed = contracts_1.UpdateInterestsRequestSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.UnprocessableEntityException('Invalid interests payload');
        }
        return this.profilesService.updateInterests(req.user.id, parsed.data);
    }
    async updateGameProfile(req, gameId, body) {
        const parsed = contracts_1.UpdateGameProfileRequestSchema.safeParse(body);
        if (!parsed.success) {
            throw new common_1.UnprocessableEntityException('Invalid game profile payload');
        }
        return this.profilesService.updateGameProfile(req.user.id, gameId, parsed.data);
    }
};
exports.ProfilesController = ProfilesController;
__decorate([
    (0, common_1.Get)('users/:id/profile'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProfilesController.prototype, "getPublicProfile", null);
__decorate([
    (0, common_1.Get)('games'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ProfilesController.prototype, "getGames", null);
__decorate([
    (0, common_1.Patch)('me/profile'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ProfilesController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Post)('me/onboarding'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ProfilesController.prototype, "onboarding", null);
__decorate([
    (0, common_1.Put)('me/interests'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ProfilesController.prototype, "updateInterests", null);
__decorate([
    (0, common_1.Put)('me/game-profiles/:gameId'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('gameId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ProfilesController.prototype, "updateGameProfile", null);
exports.ProfilesController = ProfilesController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseFilters)(profiles_exception_filter_js_1.ProfilesExceptionFilter),
    __metadata("design:paramtypes", [profiles_service_js_1.ProfilesService])
], ProfilesController);
//# sourceMappingURL=profiles.controller.js.map