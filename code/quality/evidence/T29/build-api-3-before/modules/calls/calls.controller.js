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
exports.CallsController = void 0;
const common_1 = require("@nestjs/common");
const contracts_1 = require("@fg/contracts");
const session_guard_js_1 = require("../../common/session.guard.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const onboarded_guard_js_1 = require("../auth/onboarded.guard.js");
const rooms_exception_filter_js_1 = require("../rooms/rooms.exception-filter.js");
const rooms_service_js_1 = require("../rooms/rooms.service.js");
const calls_service_js_1 = require("./calls.service.js");
function empty(body) { if (!contracts_1.CallActionRequestSchema.safeParse(body).success)
    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Body must be empty'); }
let CallsController = class CallsController {
    calls;
    constructor(calls) {
        this.calls = calls;
    }
    create(req, id, body) { empty(body); return this.calls.create(req.user.id, req.session.id, id); }
    list(req, id) { return this.calls.list(req.user.id, req.session.id, id); }
    join(req, id, body) { empty(body); return this.calls.join(req.user.id, req.session.id, id); }
    leave(req, id, body) { empty(body); return this.calls.leave(req.user.id, req.session.id, id); }
    participants(req, id, query) {
        if (Object.keys(query).some(key => key !== 'callId') || (query.callId !== undefined && query.callId !== id) || !contracts_1.ListCallParticipantsQuerySchema.safeParse({ callId: id }).success)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid call participant query');
        return this.calls.participants(req.user.id, req.session.id, id);
    }
    selfMic(req, id, body) { const parsed = contracts_1.ToggleSelfMicRequestSchema.safeParse(body); if (!parsed.success)
        (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid microphone action'); return this.calls.selfMic(req.user.id, req.session.id, id, parsed.data.muted); }
};
exports.CallsController = CallsController;
__decorate([
    (0, common_1.Post)('rooms/:roomId/calls'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('roomId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('rooms/:roomId/calls'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('roomId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('calls/:id/join'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "join", null);
__decorate([
    (0, common_1.Post)('calls/:id/leave'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "leave", null);
__decorate([
    (0, common_1.Get)('calls/:id/participants'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "participants", null);
__decorate([
    (0, common_1.Post)('calls/:id/self-mic'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CallsController.prototype, "selfMic", null);
exports.CallsController = CallsController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    (0, common_1.UseFilters)(rooms_exception_filter_js_1.RoomsExceptionFilter),
    __metadata("design:paramtypes", [calls_service_js_1.CallsService])
], CallsController);
//# sourceMappingURL=calls.controller.js.map