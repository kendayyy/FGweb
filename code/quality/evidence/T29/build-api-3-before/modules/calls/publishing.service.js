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
exports.PublishingService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const livekit_server_sdk_1 = require("livekit-server-sdk");
const contracts_1 = require("@fg/contracts");
const rooms_service_js_1 = require("../rooms/rooms.service.js");
const calls_service_js_1 = require("./calls.service.js");
const lease_store_js_1 = require("./lease-store.js");
let PublishingService = class PublishingService {
    calls;
    observed = new Map();
    constructor(calls) {
        this.calls = calls;
    }
    async claim(user, session, id) {
        return this.calls.withControlGroup(user, session, id, async (db) => {
            const lease = await this.calls.requireAdmission(db, id, user, session);
            if ((await db.query("SELECT id FROM call_restrictions WHERE call_group_id=$1 AND target_user_id=$2 AND restriction_type='STREAM_BLOCKED'", [id, user])).rowCount)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Moderator screen restriction');
            const existing = (await db.query('SELECT id FROM call_publish_slots WHERE call_group_id=$1 AND user_id=$2', [id, user])).rows[0];
            if (!existing) {
                const occupied = (await db.query('SELECT ordinal FROM call_publish_slots WHERE call_group_id=$1', [id])).rows.map(r => Number(r.ordinal));
                const ordinal = [1, 2, 3].find(n => !occupied.includes(n));
                if (!ordinal)
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.CAPACITY_FULL, 'Screen publisher limit is three');
                await db.query('INSERT INTO call_publish_slots(id,call_group_id,user_id,ordinal) VALUES($1,$2,$3,$4)', [(0, node_crypto_1.randomUUID)(), id, user, ordinal]);
            }
            await this.calls.syncNativePermissions(db, lease);
            return this.calls.grantForAdmission(db, lease);
        });
    }
    async release(user, session, id) {
        return this.calls.withControlGroup(user, session, id, async (db) => {
            const lease = await this.calls.requireAdmission(db, id, user, session);
            await db.query('DELETE FROM call_publish_slots WHERE call_group_id=$1 AND user_id=$2', [id, user]);
            await this.calls.syncNativePermissions(db, lease);
            return { success: true };
        });
    }
    forget(id) { this.observed.delete(id); }
    async reconcileWithin(db, id, people, now, ended) {
        const seen = this.observed.get(id) ?? new Set();
        this.observed.set(id, seen);
        const rows = (await db.query("SELECT p.id,p.user_id,p.created_at AT TIME ZONE 'UTC' AS created_at,a.id AS identity FROM call_publish_slots p LEFT JOIN call_members m ON m.call_group_id=p.call_group_id AND m.user_id=p.user_id AND m.left_at IS NULL LEFT JOIN call_admissions a ON a.call_member_id=m.id AND a.revoked_at IS NULL WHERE p.call_group_id=$1", [id])).rows;
        const current = new Set(rows.map(r => r.id));
        for (const key of seen)
            if (!current.has(key))
                seen.delete(key);
        for (const row of rows) {
            const peer = people.find(p => p.identity === row.identity), screen = peer?.tracks.some(t => t.source === livekit_server_sdk_1.TrackSource.SCREEN_SHARE);
            if (screen) {
                seen.add(row.id);
                continue;
            }
            const lease = row.identity ? await (0, lease_store_js_1.liveLease)(db, row.identity) : undefined;
            const stopped = ended?.identity === row.identity && row.created_at.getTime() <= ended.at;
            if (!lease || seen.has(row.id) || stopped || now.getTime() - row.created_at.getTime() >= 30000) {
                await db.query('DELETE FROM call_publish_slots WHERE id=$1', [row.id]);
                seen.delete(row.id);
            }
        }
        for (const peer of people) {
            const lease = await (0, lease_store_js_1.liveLease)(db, peer.identity);
            if (lease)
                await this.calls.syncNativePermissions(db, lease, peer);
        }
    }
};
exports.PublishingService = PublishingService;
exports.PublishingService = PublishingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [calls_service_js_1.CallsService])
], PublishingService);
//# sourceMappingURL=publishing.service.js.map