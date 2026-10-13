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
exports.InvitationsController = void 0;
const common_1 = require("@nestjs/common");
const contracts_1 = require("@fg/contracts");
const session_guard_js_1 = require("../../common/session.guard.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const onboarded_guard_js_1 = require("../auth/onboarded.guard.js");
const rooms_exception_filter_js_1 = require("../rooms/rooms.exception-filter.js");
const rooms_service_js_1 = require("../rooms/rooms.service.js");
const invitations_service_js_1 = require("./invitations.service.js");
let InvitationsController = class InvitationsController {
    service;
    constructor(service) {
        this.service = service;
    }
    mine(req) { return this.service.mine(req.user.id, req.session.id); }
    create(req, body) {
        const parsed = contracts_1.CreateInvitationRequestSchema.safeParse(body);
        if (!parsed.success)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid invitation payload');
        return this.service.create(req.user.id, req.session.id, parsed.data);
    }
    respond(req, id, body) {
        const parsed = contracts_1.RespondInvitationSchema.safeParse(body);
        if (!parsed.success)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid invitation response');
        return this.service.respond(req.user.id, req.session.id, id, parsed.data.action);
    }
    approve(req, id, body) {
        const parsed = contracts_1.ApproveInvitationSchema.safeParse(body);
        if (!parsed.success || parsed.data.invitationId !== id)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid approval identity/action');
        return this.service.approve(req.user.id, req.session.id, id, parsed.data.action);
    }
};
exports.InvitationsController = InvitationsController;
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InvitationsController.prototype, "mine", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], InvitationsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id/respond'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], InvitationsController.prototype, "respond", null);
__decorate([
    (0, common_1.Post)(':id/approve'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], InvitationsController.prototype, "approve", null);
exports.InvitationsController = InvitationsController = __decorate([
    (0, common_1.Controller)('api/v1/invitations'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    (0, common_1.UseFilters)(rooms_exception_filter_js_1.RoomsExceptionFilter),
    __metadata("design:paramtypes", [invitations_service_js_1.InvitationsService])
], InvitationsController);
//# sourceMappingURL=invitations.controller.js.map