"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivateNotificationsModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_js_1 = require("../auth/auth.module.js");
const chat_module_js_1 = require("../chat/chat.module.js");
const private_notifications_service_js_1 = require("./private-notifications.service.js");
const private_notifications_controller_js_1 = require("./private-notifications.controller.js");
let PrivateNotificationsModule = class PrivateNotificationsModule {
};
exports.PrivateNotificationsModule = PrivateNotificationsModule;
exports.PrivateNotificationsModule = PrivateNotificationsModule = __decorate([
    (0, common_1.Module)({ imports: [auth_module_js_1.AuthModule, chat_module_js_1.ChatModule], providers: [private_notifications_service_js_1.PrivateNotificationsService], controllers: [private_notifications_controller_js_1.PrivateNotificationsController], exports: [private_notifications_service_js_1.PrivateNotificationsService] })
], PrivateNotificationsModule);
//# sourceMappingURL=private-notifications.module.js.map