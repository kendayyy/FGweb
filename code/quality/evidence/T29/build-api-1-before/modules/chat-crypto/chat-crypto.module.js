"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatCryptoModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_js_1 = require("../auth/auth.module.js");
const chat_module_js_1 = require("../chat/chat.module.js");
const crypto_devices_controller_js_1 = require("./crypto-devices.controller.js");
const crypto_devices_service_js_1 = require("./crypto-devices.service.js");
const crypto_relay_controller_js_1 = require("./crypto-relay.controller.js");
const crypto_relay_service_js_1 = require("./crypto-relay.service.js");
const crypto_reports_controller_js_1 = require("./crypto-reports.controller.js");
const crypto_reports_service_js_1 = require("./crypto-reports.service.js");
const crypto_legacy_service_js_1 = require("./crypto-legacy.service.js");
const crypto_legacy_controller_js_1 = require("./crypto-legacy.controller.js");
let ChatCryptoModule = class ChatCryptoModule {
};
exports.ChatCryptoModule = ChatCryptoModule;
exports.ChatCryptoModule = ChatCryptoModule = __decorate([
    (0, common_1.Module)({ imports: [auth_module_js_1.AuthModule, chat_module_js_1.ChatModule], controllers: [crypto_devices_controller_js_1.CryptoDevicesController, crypto_relay_controller_js_1.CryptoRelayController, crypto_reports_controller_js_1.CryptoReportsController, crypto_legacy_controller_js_1.CryptoLegacyController], providers: [crypto_devices_service_js_1.CryptoDevicesService, crypto_relay_service_js_1.CryptoRelayService, crypto_reports_service_js_1.CryptoReportsService, crypto_legacy_service_js_1.CryptoLegacyService], exports: [crypto_devices_service_js_1.CryptoDevicesService, crypto_relay_service_js_1.CryptoRelayService] })
], ChatCryptoModule);
//# sourceMappingURL=chat-crypto.module.js.map