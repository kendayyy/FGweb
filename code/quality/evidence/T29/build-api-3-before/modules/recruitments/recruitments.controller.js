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
exports.RecruitmentsController = void 0;
const common_1 = require("@nestjs/common");
const contracts_1 = require("@fg/contracts");
const session_guard_js_1 = require("../../common/session.guard.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const onboarded_guard_js_1 = require("../auth/onboarded.guard.js");
const rooms_exception_filter_js_1 = require("../rooms/rooms.exception-filter.js");
const rooms_service_js_1 = require("../rooms/rooms.service.js");
const recruitments_service_js_1 = require("./recruitments.service.js");
let RecruitmentsController = class RecruitmentsController {
    service;
    constructor(service) {
        this.service = service;
    }
    query(raw) {
        const parsed = contracts_1.PublicRecruitmentQuerySchema.safeParse({ ...raw, ...(raw.limit !== undefined ? { limit: Number(raw.limit) } : {}) });
        if (!parsed.success)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid recruitment query');
        return parsed.data;
    }
    list(q) { return this.service.list(this.query(q)); }
    suggestions(id, q) { return this.service.list(this.query(q), true, id); }
    game(id, q) { return this.service.list(this.query(q), false, id); }
    detail(id) { return this.service.publicDetail(id); }
    create(req, body) {
        const parsed = (0, contracts_1.CreateRecruitmentSchema)().safeParse(body);
        if (!parsed.success)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid recruitment input');
        return this.service.create(req.user.id, req.session.id, parsed.data);
    }
    close(req, id) { return this.service.setOpen(req.user.id, req.session.id, id, false); }
    reopen(req, id) { return this.service.setOpen(req.user.id, req.session.id, id, true); }
};
exports.RecruitmentsController = RecruitmentsController;
__decorate([
    (0, common_1.Get)('recruitments'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RecruitmentsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('games/:id/recruitments/suggestions'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], RecruitmentsController.prototype, "suggestions", null);
__decorate([
    (0, common_1.Get)('games/:id/recruitments'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], RecruitmentsController.prototype, "game", null);
__decorate([
    (0, common_1.Get)('recruitments/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RecruitmentsController.prototype, "detail", null);
__decorate([
    (0, common_1.Post)('recruitments'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RecruitmentsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('recruitments/:id/close'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], RecruitmentsController.prototype, "close", null);
__decorate([
    (0, common_1.Patch)('recruitments/:id/reopen'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], RecruitmentsController.prototype, "reopen", null);
exports.RecruitmentsController = RecruitmentsController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseFilters)(rooms_exception_filter_js_1.RoomsExceptionFilter),
    __metadata("design:paramtypes", [recruitments_service_js_1.RecruitmentsService])
], RecruitmentsController);
//# sourceMappingURL=recruitments.controller.js.map