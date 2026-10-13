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
exports.PlaySessionsController = void 0;
const common_1 = require("@nestjs/common");
const contracts_1 = require("@fg/contracts");
const session_guard_js_1 = require("../../common/session.guard.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const onboarded_guard_js_1 = require("../auth/onboarded.guard.js");
const rooms_exception_filter_js_1 = require("../rooms/rooms.exception-filter.js");
const rooms_service_js_1 = require("../rooms/rooms.service.js");
const play_sessions_service_js_1 = require("./play-sessions.service.js");
function empty(body) { if (!contracts_1.PlaySessionActionRequestSchema.safeParse(body).success)
    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Body must be empty'); }
let PlaySessionsController = class PlaySessionsController {
    service;
    constructor(service) {
        this.service = service;
    }
    listRoom(req, id, raw) {
        const parsed = contracts_1.ListRoomPlaySessionsQuerySchema.safeParse({ ...raw, ...(typeof raw.limit === 'string' && /^[0-9]+$/.test(raw.limit) ? { limit: Number(raw.limit) } : {}) });
        if (!parsed.success)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid room session query');
        return this.service.listRoom(req.user.id, req.session.id, id, parsed.data);
    }
    join(req, id, body) { empty(body); return this.service.join(req.user.id, req.session.id, id); }
    requests(req, id) { return this.service.requests(req.user.id, req.session.id, id); }
    respond(req, id, requestId, body) { const parsed = contracts_1.PlaySessionRequestDecisionSchema.safeParse(body); if (!parsed.success)
        (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid decision body'); return this.service.respond(req.user.id, req.session.id, id, requestId, parsed.data.action); }
    start(req, id, body) { empty(body); return this.service.start(req.user.id, req.session.id, id); }
    leave(req, id, body) { empty(body); return this.service.leave(req.user.id, req.session.id, id); }
    end(req, id, body) { empty(body); return this.service.end(req.user.id, req.session.id, id); }
};
exports.PlaySessionsController = PlaySessionsController;
__decorate([
    (0, common_1.Get)('rooms/:id/play-sessions'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PlaySessionsController.prototype, "listRoom", null);
__decorate([
    (0, common_1.Post)('play-sessions/:id/join'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PlaySessionsController.prototype, "join", null);
__decorate([
    (0, common_1.Get)('play-sessions/:id/requests'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PlaySessionsController.prototype, "requests", null);
__decorate([
    (0, common_1.Post)('play-sessions/:id/requests/:requestId/respond'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('requestId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], PlaySessionsController.prototype, "respond", null);
__decorate([
    (0, common_1.Post)('play-sessions/:id/start'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PlaySessionsController.prototype, "start", null);
__decorate([
    (0, common_1.Post)('play-sessions/:id/leave'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PlaySessionsController.prototype, "leave", null);
__decorate([
    (0, common_1.Post)('play-sessions/:id/end'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PlaySessionsController.prototype, "end", null);
exports.PlaySessionsController = PlaySessionsController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    (0, common_1.UseFilters)(rooms_exception_filter_js_1.RoomsExceptionFilter),
    __metadata("design:paramtypes", [play_sessions_service_js_1.PlaySessionsService])
], PlaySessionsController);
//# sourceMappingURL=play-sessions.controller.js.map