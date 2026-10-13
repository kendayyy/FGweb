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
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const auth_controller_js_1 = require("./auth.controller.js");
const auth_service_js_1 = require("./auth.service.js");
const session_guard_js_1 = require("../../common/session.guard.js");
const csrf_guard_js_1 = require("../../common/csrf.guard.js");
const admin_guard_js_1 = require("./admin.guard.js");
const onboarded_guard_js_1 = require("./onboarded.guard.js");
let AuthModule = class AuthModule {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    configure(consumer) {
        consumer
            .apply((req, res) => {
            try {
                csrf_guard_js_1.CsrfGuard.validateRequestOrigin(req);
            }
            catch (err) {
                const errorObj = err;
                const status = errorObj.status || 403;
                res.status(status).json({
                    statusCode: status,
                    message: errorObj.message || 'CSRF origin validation failed',
                });
                return;
            }
            const handler = this.authService.getAuthHandler();
            return handler(req, res);
        })
            .forRoutes({ path: 'api/auth/*', method: common_1.RequestMethod.ALL }, { path: 'api/auth', method: common_1.RequestMethod.ALL });
    }
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        controllers: [auth_controller_js_1.AuthController],
        providers: [
            auth_service_js_1.AuthService,
            session_guard_js_1.SessionGuard,
            csrf_guard_js_1.CsrfGuard,
            admin_guard_js_1.RequireAdminGuard,
            onboarded_guard_js_1.RequireOnboardedGuard,
        ],
        exports: [
            auth_service_js_1.AuthService,
            session_guard_js_1.SessionGuard,
            csrf_guard_js_1.CsrfGuard,
            admin_guard_js_1.RequireAdminGuard,
            onboarded_guard_js_1.RequireOnboardedGuard,
        ],
    }),
    __metadata("design:paramtypes", [auth_service_js_1.AuthService])
], AuthModule);
//# sourceMappingURL=auth.module.js.map