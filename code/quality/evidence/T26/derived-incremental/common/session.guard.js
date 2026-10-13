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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionGuard = void 0;
const common_1 = require("@nestjs/common");
const node_1 = require("better-auth/node");
const auth_service_js_1 = require("../modules/auth/auth.service.js");
let SessionGuard = class SessionGuard {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const headers = (0, node_1.fromNodeHeaders)(request.headers);
        const sessionData = await this.authService.getAuthInstance().api.getSession({
            headers,
            query: {
                disableCookieCache: true,
            },
        });
        if (!sessionData || !sessionData.user || !sessionData.session) {
            throw new common_1.UnauthorizedException('Session missing or invalid');
        }
        const isBanned = await this.authService.isUserBanned(sessionData.user.id);
        if (isBanned) {
            throw new common_1.ForbiddenException('Account is banned');
        }
        request.user = sessionData.user;
        request.session = sessionData.session;
        return true;
    }
};
exports.SessionGuard = SessionGuard;
exports.SessionGuard = SessionGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_service_js_1.AuthService])
], SessionGuard);
//# sourceMappingURL=session.guard.js.map