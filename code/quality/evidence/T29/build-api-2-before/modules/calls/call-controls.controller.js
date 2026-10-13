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
exports.CallControlsController = void 0;
const common_1 = require("@nestjs/common");
const contracts_1 = require("@fg/contracts");
const session_guard_js_1 = require("../../common/session.guard.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const onboarded_guard_js_1 = require("../auth/onboarded.guard.js");
const rooms_exception_filter_js_1 = require("../rooms/rooms.exception-filter.js");
const rooms_service_js_1 = require("../rooms/rooms.service.js");
const calls_service_js_1 = require("./calls.service.js");
const publishing_service_js_1 = require("./publishing.service.js");
const call_moderation_service_js_1 = require("./call-moderation.service.js");
function empty(body) { if (!contracts_1.CallActionRequestSchema.safeParse(body ?? {}).success)
    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Body must be empty'); }
let CallControlsController = class CallControlsController {
    publishing;
    moderation;
    calls;
    constructor(publishing, moderation, calls) {
        this.publishing = publishing;
        this.moderation = moderation;
        this.calls = calls;
    }
    claim(req, id, body) { empty(body); return this.publishing.claim(req.user.id, req.session.id, id); }
    release(req, id, body) { empty(body); return this.publishing.release(req.user.id, req.session.id, id); }
    moderate(req, id, body) { const parsed = contracts_1.CallModerationRequestSchema.safeParse(body); if (!parsed.success)
        (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid moderation action'); return this.moderation.moderate(req.user.id, req.session.id, id, parsed.data); }
    publishToken(req, id, body) { const parsed = contracts_1.RefreshPublishTokenSchema.safeParse(body); if (!parsed.success || parsed.data.callId !== id)
        (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Call path/body mismatch'); return this.publishing.claim(req.user.id, req.session.id, id); }
    async participant(req, id, target) { const people = await this.calls.participants(req.user.id, req.session.id, id); const person = people.find(p => p.userId === target); if (!person)
        (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Current call target required'); return person; }
    async mute(req, id, target, body) { const parsed = contracts_1.MuteParticipantRequestSchema.safeParse(body); if (!parsed.success)
        (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid microphone action'); await this.moderation.moderate(req.user.id, req.session.id, id, { action: parsed.data.muted ? 'MUTE_MIC' : 'ALLOW_MIC', targetUserId: target }); return this.participant(req, id, target); }
    kick(req, id, target, body) { const parsed = contracts_1.KickCallParticipantSchema.safeParse(body); if (!parsed.success || parsed.data.targetUserId !== target)
        (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Target path/body mismatch'); return this.moderation.moderate(req.user.id, req.session.id, id, { action: 'KICK', targetUserId: target }); }
    async stop(req, id, target, body) { empty(body); await this.moderation.moderate(req.user.id, req.session.id, id, { action: 'STOP_SCREEN_SHARE', targetUserId: target }); return this.participant(req, id, target); }
};
exports.CallControlsController = CallControlsController;
__decorate([
    (0, common_1.Post)('calls/:id/screen-share/claim'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CallControlsController.prototype, "claim", null);
__decorate([
    (0, common_1.Post)('calls/:id/screen-share/release'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CallControlsController.prototype, "release", null);
__decorate([
    (0, common_1.Post)('calls/:id/moderation'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CallControlsController.prototype, "moderate", null);
__decorate([
    (0, common_1.Post)('calls/:id/publish-token'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CallControlsController.prototype, "publishToken", null);
__decorate([
    (0, common_1.Patch)('calls/:id/participants/:userId/mute'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('userId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], CallControlsController.prototype, "mute", null);
__decorate([
    (0, common_1.Post)('calls/:id/participants/:userId/kick'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('userId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], CallControlsController.prototype, "kick", null);
__decorate([
    (0, common_1.Post)('calls/:id/participants/:userId/stop-publish'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('userId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], CallControlsController.prototype, "stop", null);
exports.CallControlsController = CallControlsController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    (0, common_1.UseFilters)(rooms_exception_filter_js_1.RoomsExceptionFilter),
    __metadata("design:paramtypes", [publishing_service_js_1.PublishingService, call_moderation_service_js_1.CallModerationService, calls_service_js_1.CallsService])
], CallControlsController);
//# sourceMappingURL=call-controls.controller.js.map