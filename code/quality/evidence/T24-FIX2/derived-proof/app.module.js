"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const uploads_module_js_1 = require("./modules/uploads/uploads.module.js");
const common_1 = require("@nestjs/common");
const auth_module_js_1 = require("./modules/auth/auth.module.js");
const profiles_module_js_1 = require("./modules/profiles/profiles.module.js");
const chat_module_js_1 = require("./modules/chat/chat.module.js");
const realtime_module_js_1 = require("./modules/realtime/realtime.module.js");
const presence_module_js_1 = require("./modules/presence/presence.module.js");
const social_module_js_1 = require("./modules/social/social.module.js");
const rooms_module_js_1 = require("./modules/rooms/rooms.module.js");
const recruitments_module_js_1 = require("./modules/recruitments/recruitments.module.js");
const teams_module_js_1 = require("./modules/teams/teams.module.js");
const invitations_module_js_1 = require("./modules/invitations/invitations.module.js");
const play_sessions_module_js_1 = require("./modules/play-sessions/play-sessions.module.js");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_js_1.AuthModule, profiles_module_js_1.ProfilesModule, chat_module_js_1.ChatModule, realtime_module_js_1.RealtimeModule, uploads_module_js_1.UploadsModule, presence_module_js_1.PresenceModule, social_module_js_1.SocialModule, rooms_module_js_1.RoomsModule, recruitments_module_js_1.RecruitmentsModule, teams_module_js_1.TeamsModule, invitations_module_js_1.InvitationsModule, play_sessions_module_js_1.PlaySessionsModule],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map