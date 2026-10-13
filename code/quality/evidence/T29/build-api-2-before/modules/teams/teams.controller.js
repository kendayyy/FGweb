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
exports.TeamsController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const contracts_1 = require("@fg/contracts");
const session_guard_js_1 = require("../../common/session.guard.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const onboarded_guard_js_1 = require("../auth/onboarded.guard.js");
const rooms_exception_filter_js_1 = require("../rooms/rooms.exception-filter.js");
const rooms_service_js_1 = require("../rooms/rooms.service.js");
const teams_service_js_1 = require("./teams.service.js");
const empty = zod_1.z.object({}).strict();
function noOverride(body) { if (!empty.safeParse(body ?? {}).success)
    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Body must be empty; actor/action comes from session/path'); }
let TeamsController = class TeamsController {
    service;
    constructor(service) {
        this.service = service;
    }
    mine(req) { return this.service.mine(req.user.id, req.session.id); }
    apply(req, id, body) { noOverride(body); return this.service.apply(req.user.id, req.session.id, id); }
    list(req, id) { return this.service.requests(req.user.id, req.session.id, id); }
    approve(req, id, body) { noOverride(body); return this.service.respond(req.user.id, req.session.id, id, 'ACCEPT'); }
    reject(req, id, body) { noOverride(body); return this.service.respond(req.user.id, req.session.id, id, 'REJECT'); }
    respond(req, id, body) { const parsed = contracts_1.RespondJoinRequestSchema.strict().safeParse(body); if (!parsed.success)
        (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid response action'); return this.service.respond(req.user.id, req.session.id, id, parsed.data.action); }
    cancel(req, id, body) { const parsed = contracts_1.CancelJoinRequestSchema.strict().safeParse(body); if (!parsed.success || parsed.data.requestId !== id)
        (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Request id must match path'); return this.service.cancel(req.user.id, req.session.id, id); }
    snapshot(req, id) { return this.service.snapshot(req.user.id, req.session.id, id); }
};
exports.TeamsController = TeamsController;
__decorate([
    (0, common_1.Get)('recruitments/me/joins'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TeamsController.prototype, "mine", null);
__decorate([
    (0, common_1.Post)(['recruitments/:id/requests', 'recruitments/:id/join-requests']),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], TeamsController.prototype, "apply", null);
__decorate([
    (0, common_1.Get)('recruitments/:id/join-requests'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TeamsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('join-requests/:id/approve'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], TeamsController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)('join-requests/:id/reject'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], TeamsController.prototype, "reject", null);
__decorate([
    (0, common_1.Patch)('join-requests/:id/respond'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], TeamsController.prototype, "respond", null);
__decorate([
    (0, common_1.Delete)('join-requests/:id/cancel'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], TeamsController.prototype, "cancel", null);
__decorate([
    (0, common_1.Get)('play-sessions/:id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TeamsController.prototype, "snapshot", null);
exports.TeamsController = TeamsController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    (0, common_1.UseFilters)(rooms_exception_filter_js_1.RoomsExceptionFilter),
    __metadata("design:paramtypes", [teams_service_js_1.TeamsService])
], TeamsController);
//# sourceMappingURL=teams.controller.js.map