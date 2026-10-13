"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallsModule = void 0;
const publishing_service_js_1 = require("./publishing.service.js");
const call_moderation_service_js_1 = require("./call-moderation.service.js");
const call_controls_controller_js_1 = require("./call-controls.controller.js");
const common_1 = require("@nestjs/common");
const auth_module_js_1 = require("../auth/auth.module.js");
const rooms_module_js_1 = require("../rooms/rooms.module.js");
const calls_controller_js_1 = require("./calls.controller.js");
const calls_service_js_1 = require("./calls.service.js");
const call_lifecycle_service_js_1 = require("./call-lifecycle.service.js");
const call_webhook_controller_js_1 = require("./call-webhook.controller.js");
let CallsModule = class CallsModule {
};
exports.CallsModule = CallsModule;
exports.CallsModule = CallsModule = __decorate([
    (0, common_1.Module)({ imports: [auth_module_js_1.AuthModule, rooms_module_js_1.RoomsModule], controllers: [calls_controller_js_1.CallsController, call_webhook_controller_js_1.CallWebhookController, call_controls_controller_js_1.CallControlsController], providers: [calls_service_js_1.CallsService, publishing_service_js_1.PublishingService, call_moderation_service_js_1.CallModerationService, call_lifecycle_service_js_1.CallLifecycleService, { provide: 'FG_CALL_LIFECYCLE', useExisting: call_lifecycle_service_js_1.CallLifecycleService }], exports: [calls_service_js_1.CallsService, publishing_service_js_1.PublishingService, call_moderation_service_js_1.CallModerationService, call_lifecycle_service_js_1.CallLifecycleService] })
], CallsModule);
//# sourceMappingURL=calls.module.js.map