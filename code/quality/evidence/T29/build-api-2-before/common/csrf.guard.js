"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CsrfGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CsrfGuard = void 0;
const common_1 = require("@nestjs/common");
let CsrfGuard = CsrfGuard_1 = class CsrfGuard {
    static validateRequestOrigin(request) {
        const method = request.method.toUpperCase();
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            return;
        }
        const origin = request.headers['origin'];
        if (!origin || origin === 'null') {
            throw new common_1.ForbiddenException('CSRF origin header missing or invalid');
        }
        let requestOrigin;
        try {
            requestOrigin = new URL(origin).origin;
        }
        catch {
            throw new common_1.ForbiddenException('CSRF origin header malformed');
        }
        const canonicalPublicOrigin = process.env.PUBLIC_ORIGIN;
        const canonicalAuthOrigin = process.env.BETTER_AUTH_URL;
        const allowedOrigins = [canonicalPublicOrigin, canonicalAuthOrigin]
            .filter((val) => Boolean(val))
            .map((urlStr) => {
            try {
                return new URL(urlStr).origin;
            }
            catch {
                return '';
            }
        })
            .filter(Boolean);
        if (allowedOrigins.length === 0) {
            throw new common_1.ForbiddenException('Canonical origin not configured on server');
        }
        const isAllowed = allowedOrigins.includes(requestOrigin);
        if (!isAllowed) {
            throw new common_1.ForbiddenException(`CSRF origin validation failed: ${requestOrigin} is not allowed`);
        }
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        CsrfGuard_1.validateRequestOrigin(request);
        return true;
    }
};
exports.CsrfGuard = CsrfGuard;
exports.CsrfGuard = CsrfGuard = CsrfGuard_1 = __decorate([
    (0, common_1.Injectable)()
], CsrfGuard);
//# sourceMappingURL=csrf.guard.js.map