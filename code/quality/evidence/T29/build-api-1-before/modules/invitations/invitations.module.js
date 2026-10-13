"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvitationsModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_js_1 = require("../auth/auth.module.js");
const teams_module_js_1 = require("../teams/teams.module.js");
const permissions_module_js_1 = require("../permissions/permissions.module.js");
const invitations_service_js_1 = require("./invitations.service.js");
const invitations_controller_js_1 = require("./invitations.controller.js");
let InvitationsModule = class InvitationsModule {
};
exports.InvitationsModule = InvitationsModule;
exports.InvitationsModule = InvitationsModule = __decorate([
    (0, common_1.Module)({ imports: [auth_module_js_1.AuthModule, teams_module_js_1.TeamsModule, permissions_module_js_1.PermissionsModule], providers: [invitations_service_js_1.InvitationsService], controllers: [invitations_controller_js_1.InvitationsController] })
], InvitationsModule);
//# sourceMappingURL=invitations.module.js.map