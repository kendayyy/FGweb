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
exports.InvitationsService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("@fg/contracts");
const teams_service_js_1 = require("../teams/teams.service.js");
const rooms_service_js_1 = require("../rooms/rooms.service.js");
const chat_service_js_1 = require("../chat/chat.service.js");
const crypto_membership_js_1 = require("../chat-crypto/crypto-membership.js");
const select = `SELECT i.*, to_char(i.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM invitations i`;
let InvitationsService = class InvitationsService {
    teams;
    constructor(teams) {
        this.teams = teams;
    }
    dto(i) {
        return contracts_1.InvitationSchema.parse({
            id: i.id, targetType: i.target_type, senderId: i.sender_id, receiverId: i.receiver_id,
            roomId: i.room_id, ...(i.play_session_id ? { playSessionId: i.play_session_id } : {}),
            status: i.status, createdAt: i.created_iso,
            ...(i.recipient_accepted_at ? { recipientAcceptedAt: i.recipient_accepted_at.toISOString() } : {}),
        });
    }
    async eligible(db, id) {
        if (!(await db.query('SELECT id FROM "user" WHERE id=$1', [id])).rowCount)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'User not found');
        const ban = (await db.query("SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1", [id])).rows[0];
        if (ban?.action === 'BAN')
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Account is banned');
        if (!(await db.query('SELECT p.user_id FROM profiles p WHERE p.user_id=$1 AND EXISTS(SELECT 1 FROM game_interests g WHERE g.user_id=p.user_id) FOR SHARE', [id])).rowCount)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Onboarding required');
    }
    async actor(db, id, sessionId) {
        if (!(await db.query('SELECT id FROM session WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE', [sessionId, id])).rowCount)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked');
        await this.eligible(db, id);
    }
    async room(db, id) {
        const row = (await db.query('SELECT id,owner_id,conversation_id,visibility,invite_policy FROM rooms WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!row)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Room not found');
        return row;
    }
    async member(db, room, id) {
        const m = (await db.query('SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2 FOR SHARE', [room.id, id])).rows[0];
        if (!m)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Current room membership required');
        return m;
    }
    async manager(db, room, id, target) {
        const member = await this.member(db, room, id);
        if (room.owner_id === id)
            return;
        const grant = await db.query('SELECT id FROM permission_grants WHERE room_id=$1 AND user_id=$2 AND permission=$3 FOR SHARE', [room.id, id, contracts_1.InvitationApprovalPermissionByTarget[target]]);
        if (member.role !== 'HELPER' || !grant.rowCount)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Matching delegated permission required');
    }
    async pair(db, sender, receiver) {
        await (0, chat_service_js_1.lockSocialPair)(db, sender, receiver);
        if ((await db.query('SELECT id FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1', [sender, receiver])).rowCount)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Invitations blocked');
    }
    async lockUsers(db, ids) {
        await db.query('SELECT id FROM "user" WHERE id=ANY($1::text[]) ORDER BY id FOR NO KEY UPDATE', [[...new Set(ids)].sort()]);
    }
    async invite(db, id, lock = false) {
        const i = (await db.query(select + ' WHERE i.id=$1' + (lock ? ' FOR UPDATE' : ''), [id])).rows[0];
        if (!i)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Invitation not found');
        return i;
    }
    async notify(db, i, user, phase) {
        const type = i.target_type === 'ROOM' ? 'ROOM_INVITE' : 'TEAM_INVITE';
        const data = i.target_type === 'ROOM'
            ? contracts_1.RoomInviteNotificationDataSchema.parse({ invitationId: i.id, roomId: i.room_id, senderId: i.sender_id })
            : contracts_1.TeamInviteNotificationDataSchema.parse({ invitationId: i.id, roomId: i.room_id, playSessionId: i.play_session_id, senderId: i.sender_id });
        const dedup = `invitation:${i.id}:${phase}`, id = (0, node_crypto_1.randomUUID)();
        const row = await db.query('INSERT INTO notifications(id,user_id,type,title,body,data,dedup_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,dedup_key) DO NOTHING RETURNING id', [
            id, user, type, phase === 'created' ? 'Lời mời mới' : phase === 'consented' ? 'Lời mời cần xét duyệt' : 'Kết quả lời mời',
            phase === 'created' ? 'Bạn được mời tham gia nhóm.' : phase === 'consented' ? 'Người được mời đã đồng ý, cần xét duyệt.' : phase === 'ACCEPTED' ? 'Lời mời đã được chấp nhận.' : 'Lời mời đã bị từ chối.', JSON.stringify(data), dedup,
        ]);
        if (row.rowCount)
            await db.query("INSERT INTO notification_outbox(id,notification_id,user_id,channel,dedup_key) VALUES($1,$2,$3,'IN_APP',$4)", [(0, node_crypto_1.randomUUID)(), id, user, dedup]);
    }
    async admit(db, room, i) {
        await this.eligible(db, i.receiver_id);
        const existing = await db.query('SELECT id FROM room_members WHERE room_id=$1 AND user_id=$2', [room.id, i.receiver_id]);
        const count = (await db.query('SELECT count(*)::int AS n FROM room_members WHERE room_id=$1', [room.id])).rows[0].n;
        if (!existing.rowCount && count >= 50)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.CAPACITY_FULL, 'Room is full');
        if (i.target_type === 'PLAY_SESSION') {
            await this.teams.admit(db, room, i.play_session_id, i.receiver_id);
        }
        else {
            const added = await db.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,'MEMBER') ON CONFLICT(room_id,user_id) DO NOTHING", [(0, node_crypto_1.randomUUID)(), room.id, i.receiver_id]);
            await db.query('INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3) ON CONFLICT(conversation_id,user_id) DO NOTHING', [(0, node_crypto_1.randomUUID)(), room.conversation_id, i.receiver_id]);
            if (added.rowCount)
                await (0, crypto_membership_js_1.cryptoMemberJoined)(db, room.conversation_id, i.receiver_id);
        }
        await this.eligible(db, i.sender_id);
        await this.eligible(db, i.receiver_id);
    }
    async finalize(db, i, final) {
        await db.query('UPDATE invitations SET status=$2 WHERE id=$1', [i.id, final]);
        await this.notify(db, i, i.sender_id, final);
        await this.notify(db, i, i.receiver_id, final);
    }
    async create(actor, session, body) {
        return this.teams.transaction(async (db) => {
            const room = await this.room(db, body.roomId);
            if (actor === body.receiverId)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Cannot invite yourself');
            await this.pair(db, actor, body.receiverId);
            await this.lockUsers(db, [actor, body.receiverId]);
            await this.actor(db, actor, session);
            await this.member(db, room, actor);
            await this.eligible(db, body.receiverId);
            if (body.targetType === 'PLAY_SESSION') {
                const play = (await db.query('SELECT room_id,state FROM play_sessions WHERE id=$1', [body.playSessionId])).rows[0];
                if (!play || play.room_id !== room.id)
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Session must belong to the invitation room');
                if (play.state === 'ENDED')
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Session ended');
            }
            const id = (0, node_crypto_1.randomUUID)();
            await db.query('INSERT INTO invitations(id,target_type,sender_id,receiver_id,room_id,play_session_id) VALUES($1,$2,$3,$4,$5,$6)', [id, body.targetType, actor, body.receiverId, room.id, body.targetType === 'PLAY_SESSION' ? body.playSessionId : null]);
            const i = await this.invite(db, id);
            await this.notify(db, i, body.receiverId, 'created');
            await this.actor(db, actor, session);
            return this.dto(i);
        });
    }
    async respond(actor, session, id, action) {
        return this.teams.transaction(async (db) => {
            const located = await this.invite(db, id), room = await this.room(db, located.room_id);
            if (located.receiver_id !== actor)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Only recipient may respond');
            await this.pair(db, located.sender_id, actor);
            await this.lockUsers(db, [actor, located.sender_id]);
            await this.actor(db, actor, session);
            const i = await this.invite(db, id, true);
            const final = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
            if (i.status === final)
                return this.dto(i);
            if (i.status !== 'PENDING')
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Invitation finalized');
            if (action === 'REJECT') {
                await this.finalize(db, i, final);
            }
            else {
                await this.eligible(db, i.sender_id);
                await this.member(db, room, i.sender_id);
                await db.query('UPDATE invitations SET recipient_accepted_at=COALESCE(recipient_accepted_at,clock_timestamp()) WHERE id=$1', [id]);
                if (room.invite_policy === 'DIRECT_MEMBER' || room.owner_id === i.sender_id) {
                    await this.admit(db, room, i);
                    await this.finalize(db, i, 'ACCEPTED');
                }
                else {
                    const managers = (await db.query("SELECT m.user_id FROM room_members m WHERE m.room_id=$1 AND (m.user_id=$2 OR (m.role='HELPER' AND EXISTS(SELECT 1 FROM permission_grants g WHERE g.room_id=m.room_id AND g.user_id=m.user_id AND g.permission=$3)))", [room.id, room.owner_id, contracts_1.InvitationApprovalPermissionByTarget[i.target_type]])).rows;
                    for (const manager of managers)
                        await this.notify(db, i, manager.user_id, 'consented');
                }
            }
            await this.actor(db, actor, session);
            if (action === 'ACCEPT')
                await this.eligible(db, i.sender_id);
            return this.dto(await this.invite(db, id));
        });
    }
    async approve(actor, session, id, action) {
        return this.teams.transaction(async (db) => {
            const located = await this.invite(db, id), room = await this.room(db, located.room_id);
            await this.pair(db, located.sender_id, located.receiver_id);
            await this.lockUsers(db, [actor, located.sender_id, located.receiver_id]);
            await this.actor(db, actor, session);
            await this.manager(db, room, actor, located.target_type);
            const i = await this.invite(db, id, true), final = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
            if (!i.recipient_accepted_at)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Recipient consent required before approval');
            if (i.status === final)
                return this.dto(i);
            if (i.status !== 'PENDING')
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Invitation finalized');
            if (action === 'ACCEPT') {
                await this.eligible(db, i.sender_id);
                await this.member(db, room, i.sender_id);
                await this.admit(db, room, i);
            }
            await this.finalize(db, i, final);
            await this.actor(db, actor, session);
            if (action === 'ACCEPT') {
                await this.eligible(db, i.sender_id);
                await this.eligible(db, i.receiver_id);
            }
            return this.dto(await this.invite(db, id));
        });
    }
    async mine(actor, session) {
        return this.teams.transaction(async (db) => {
            await this.actor(db, actor, session);
            const rows = (await db.query(select + ` WHERE i.sender_id=$1 OR i.receiver_id=$1 OR
        (i.status='PENDING' AND i.recipient_accepted_at IS NOT NULL AND EXISTS(
          SELECT 1 FROM rooms r JOIN room_members m ON m.room_id=r.id AND m.user_id=$1 WHERE r.id=i.room_id AND
          (r.owner_id=$1 OR (m.role='HELPER' AND EXISTS(SELECT 1 FROM permission_grants g WHERE g.room_id=r.id AND g.user_id=$1 AND g.permission=CASE i.target_type WHEN 'ROOM' THEN $2 ELSE $3 END)))))
        ORDER BY i.created_at DESC,i.id`, [actor, contracts_1.InvitationApprovalPermissionByTarget.ROOM, contracts_1.InvitationApprovalPermissionByTarget.PLAY_SESSION])).rows;
            await this.actor(db, actor, session);
            return rows.map(i => this.dto(i));
        });
    }
};
exports.InvitationsService = InvitationsService;
exports.InvitationsService = InvitationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [teams_service_js_1.TeamsService])
], InvitationsService);
//# sourceMappingURL=invitations.service.js.map