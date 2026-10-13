"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecruitmentsModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_js_1 = require("../auth/auth.module.js");
const recruitments_controller_js_1 = require("./recruitments.controller.js");
const recruitments_service_js_1 = require("./recruitments.service.js");
let RecruitmentsModule = class RecruitmentsModule {
};
exports.RecruitmentsModule = RecruitmentsModule;
exports.RecruitmentsModule = RecruitmentsModule = __decorate([
    (0, common_1.Module)({ imports: [auth_module_js_1.AuthModule], controllers: [recruitments_controller_js_1.RecruitmentsController], providers: [recruitments_service_js_1.RecruitmentsService], exports: [recruitments_service_js_1.RecruitmentsService] })
], RecruitmentsModule);
//# sourceMappingURL=recruitments.module.js.map