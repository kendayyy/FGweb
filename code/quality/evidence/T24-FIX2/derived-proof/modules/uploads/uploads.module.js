"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadsModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_js_1 = require("../auth/auth.module.js");
const chat_module_js_1 = require("../chat/chat.module.js");
const uploads_service_js_1 = require("./uploads.service.js");
const uploads_controller_js_1 = require("./uploads.controller.js");
let UploadsModule = class UploadsModule {
};
exports.UploadsModule = UploadsModule;
exports.UploadsModule = UploadsModule = __decorate([
    (0, common_1.Module)({ imports: [auth_module_js_1.AuthModule, chat_module_js_1.ChatModule], providers: [uploads_service_js_1.UploadsService, { provide: 'FG_IMAGE_STORE', useExisting: uploads_service_js_1.UploadsService }], controllers: [uploads_controller_js_1.UploadsController] })
], UploadsModule);
//# sourceMappingURL=uploads.module.js.map