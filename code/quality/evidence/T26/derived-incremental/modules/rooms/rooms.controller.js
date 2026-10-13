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
exports.RoomsController = void 0;
const common_1 = require("@nestjs/common");
const session_guard_js_1 = require("../../common/session.guard.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const onboarded_guard_js_1 = require("../auth/onboarded.guard.js");
const rooms_service_js_1 = require("./rooms.service.js");
const rooms_exception_filter_js_1 = require("./rooms.exception-filter.js");
const contracts_1 = require("@fg/contracts");
const rooms_service_js_2 = require("./rooms.service.js");
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
let RoomsController = class RoomsController {
    roomsService;
    constructor(roomsService) {
        this.roomsService = roomsService;
    }
    async listRooms(req, query) {
        const normalized = normalizeQuery(query);
        const parsed = contracts_1.ListOwnRoomsQuerySchema.safeParse(normalized);
        if (!parsed.success) {
            (0, rooms_service_js_2.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid list rooms query parameters');
        }
        return this.roomsService.listOwnRooms(req.user.id, req.session.id, parsed.data);
    }
    async listOwnRooms(req, query) {
        const normalized = normalizeQuery(query);
        const parsed = contracts_1.ListOwnRoomsQuerySchema.safeParse(normalized);
        if (!parsed.success) {
            (0, rooms_service_js_2.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid list own rooms query parameters');
        }
        return this.roomsService.listOwnRooms(req.user.id, req.session.id, parsed.data);
    }
    async createRoom(req, body) {
        const parsed = contracts_1.CreateRoomRequestSchema.safeParse(body);
        if (!parsed.success) {
            (0, rooms_service_js_2.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid create room payload');
        }
        return this.roomsService.createRoom(req.user.id, req.session.id, parsed.data);
    }
    async getRoomDetail(req, id) {
        return this.roomsService.getRoomDetail(req.user.id, req.session.id, id);
    }
    async listRoomMembers(req, id) {
        return this.roomsService.listRoomMembers(req.user.id, req.session.id, id);
    }
    async updateRoomSettings(req, id, body) {
        const parsed = contracts_1.UpdateRoomSettingsRequestSchema.safeParse(body);
        if (!parsed.success) {
            (0, rooms_service_js_2.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid update room settings payload');
        }
        return this.roomsService.updateSettings(req.user.id, req.session.id, id, parsed.data);
    }
    async updateHelperPermissions(req, id, targetUserId, body) {
        const parsed = contracts_1.UpdateHelperPermissionsRequestSchema.safeParse(body);
        if (!parsed.success) {
            (0, rooms_service_js_2.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid update helper permissions payload');
        }
        return this.roomsService.updateHelperPermissions(req.user.id, req.session.id, id, targetUserId, parsed.data);
    }
    async transferOwner(req, id, body) {
        const parsed = contracts_1.TransferRoomOwnerSchema.safeParse(body);
        if (!parsed.success) {
            (0, rooms_service_js_2.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid transfer room owner payload');
        }
        return this.roomsService.transferOwner(req.user.id, req.session.id, id, parsed.data);
    }
    async leaveOrRemoveMember(req, id, targetUserId) {
        return this.roomsService.leaveOrRemoveMember(req.user.id, req.session.id, id, targetUserId);
    }
    async dissolveRoom(req, id) {
        return this.roomsService.dissolveRoom(req.user.id, req.session.id, id);
    }
};
exports.RoomsController = RoomsController;
__decorate([
    (0, common_1.Get)('rooms'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], RoomsController.prototype, "listRooms", null);
__decorate([
    (0, common_1.Get)('rooms/own'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], RoomsController.prototype, "listOwnRooms", null);
__decorate([
    (0, common_1.Post)('rooms'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], RoomsController.prototype, "createRoom", null);
__decorate([
    (0, common_1.Get)('rooms/:id'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], RoomsController.prototype, "getRoomDetail", null);
__decorate([
    (0, common_1.Get)('rooms/:id/members'),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], RoomsController.prototype, "listRoomMembers", null);
__decorate([
    (0, common_1.Patch)('rooms/:id/settings'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], RoomsController.prototype, "updateRoomSettings", null);
__decorate([
    (0, common_1.Patch)('rooms/:id/helpers/:userId'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('userId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], RoomsController.prototype, "updateHelperPermissions", null);
__decorate([
    (0, common_1.Post)('rooms/:id/transfer-owner'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], RoomsController.prototype, "transferOwner", null);
__decorate([
    (0, common_1.Delete)('rooms/:id/members/:userId'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], RoomsController.prototype, "leaveOrRemoveMember", null);
__decorate([
    (0, common_1.Delete)('rooms/:id'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(session_guard_js_1.SessionGuard, csrf_guard_js_1.CsrfGuard, onboarded_guard_js_1.RequireOnboardedGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], RoomsController.prototype, "dissolveRoom", null);
exports.RoomsController = RoomsController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseFilters)(rooms_exception_filter_js_1.RoomsExceptionFilter),
    __metadata("design:paramtypes", [rooms_service_js_1.RoomsService])
], RoomsController);
//# sourceMappingURL=rooms.controller.js.map