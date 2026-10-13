"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_js_1 = require("../auth/auth.module.js");
const profiles_module_js_1 = require("../profiles/profiles.module.js");
const social_service_js_1 = require("./social.service.js");
const social_controller_js_1 = require("./social.controller.js");
let SocialModule = class SocialModule {
};
exports.SocialModule = SocialModule;
exports.SocialModule = SocialModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_js_1.AuthModule, profiles_module_js_1.ProfilesModule],
        controllers: [social_controller_js_1.SocialController],
        providers: [social_service_js_1.SocialService],
        exports: [social_service_js_1.SocialService],
    })
], SocialModule);
//# sourceMappingURL=social.module.js.map