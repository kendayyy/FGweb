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
exports.CallModerationService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const livekit_server_sdk_1 = require("livekit-server-sdk");
const contracts_1 = require("@fg/contracts");
const rooms_service_js_1 = require("../rooms/rooms.service.js");
const calls_service_js_1 = require("./calls.service.js");
const lease_store_js_1 = require("./lease-store.js");
let CallModerationService = class CallModerationService {
    calls;
    constructor(calls) {
        this.calls = calls;
    }
    async moderate(user, session, id, request) {
        const result = await this.calls.withControlGroup(user, session, id, async (db, group) => {
            const owner = (await db.query('SELECT owner_id FROM rooms WHERE id=$1', [group.room_id])).rows[0]?.owner_id;
            if (owner !== user) {
                const helper = (await db.query("SELECT p.id FROM permission_grants p JOIN room_members m ON m.room_id=p.room_id AND m.user_id=p.user_id WHERE p.room_id=$1 AND p.user_id=$2 AND m.role='HELPER' AND p.permission='MANAGE_CALLS' FOR SHARE OF p,m", [group.room_id, user])).rowCount;
                if (!helper)
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Current MANAGE_CALLS permission required');
            }
            const member = (await db.query('SELECT id FROM call_members WHERE call_group_id=$1 AND user_id=$2 AND left_at IS NULL FOR UPDATE', [id, request.targetUserId])).rows[0];
            if (!member)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Current call target required');
            const admission = (await db.query('SELECT id FROM call_admissions WHERE call_member_id=$1 AND revoked_at IS NULL FOR UPDATE', [member.id])).rows[0];
            const lease = admission ? await (0, lease_store_js_1.liveLease)(db, admission.id) : undefined;
            if (!lease)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Current call admission required');
            if (request.action === 'KICK') {
                await this.calls.revokeMemberWithin(db, member.id, lease);
                return { success: true };
            }
            const kind = ['MUTE_MIC', 'ALLOW_MIC'].includes(request.action) ? 'MIC_MUTED' : 'STREAM_BLOCKED', restrict = ['MUTE_MIC', 'STOP_SCREEN_SHARE'].includes(request.action);
            if (restrict)
                await db.query('INSERT INTO call_restrictions(id,call_group_id,target_user_id,restriction_type,issued_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(call_group_id,target_user_id,restriction_type) DO UPDATE SET issued_by=EXCLUDED.issued_by', [(0, node_crypto_1.randomUUID)(), id, request.targetUserId, kind, user]);
            else
                await db.query('DELETE FROM call_restrictions WHERE call_group_id=$1 AND target_user_id=$2 AND restriction_type=$3', [id, request.targetUserId, kind]);
            if (request.action === 'MUTE_MIC')
                await db.query('UPDATE call_members SET is_muted=true WHERE id=$1', [member.id]);
            if (request.action === 'STOP_SCREEN_SHARE')
                await db.query('DELETE FROM call_publish_slots WHERE call_group_id=$1 AND user_id=$2', [id, request.targetUserId]);
            const previous = await this.calls.syncNativePermissions(db, lease);
            if (request.action === 'MUTE_MIC')
                for (const track of previous?.tracks ?? [])
                    if (track.source === livekit_server_sdk_1.TrackSource.MICROPHONE)
                        await this.calls.muteNativeTrack(lease, track.sid);
            return { success: true };
        });
        if (request.action === 'KICK')
            await this.calls.finishModeration(id);
        return result;
    }
};
exports.CallModerationService = CallModerationService;
exports.CallModerationService = CallModerationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [calls_service_js_1.CallsService])
], CallModerationService);
//# sourceMappingURL=call-moderation.service.js.map