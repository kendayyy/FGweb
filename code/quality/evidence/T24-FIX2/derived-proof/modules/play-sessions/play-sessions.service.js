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
exports.PlaySessionsService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const contracts_1 = require("@fg/contracts");
const teams_service_js_1 = require("../teams/teams.service.js");
const rooms_service_js_1 = require("../rooms/rooms.service.js");
const playSelect = `SELECT p.*,to_char(p.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso,to_char(p.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_iso FROM play_sessions p`;
const joinSelect = `SELECT j.*,to_char(j.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM join_requests j`;
const roomCursor = zod_1.z.object({ roomId: contracts_1.IdSchema, id: contracts_1.IdSchema, createdAt: contracts_1.IsoDateTimeSchema }).strict();
let PlaySessionsService = class PlaySessionsService {
    teams;
    constructor(teams) {
        this.teams = teams;
    }
    dto(p) { return contracts_1.PlaySessionSchema.parse({ id: p.id, roomId: p.room_id, hostUserId: p.host_user_id, playerCapacity: p.player_capacity, timingType: p.timing_type, scheduledAt: p.scheduled_at?.toISOString(), state: p.state, createdAt: p.created_iso, updatedAt: p.updated_iso }); }
    joinDto(j) { return contracts_1.JoinRequestSchema.parse({ id: j.id, recruitmentId: j.recruitment_id, applicantId: j.applicant_id, status: j.status, createdAt: j.created_iso }); }
    async eligible(db, id) {
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
    async member(db, room, id, manage = false) {
        const m = (await db.query('SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2 FOR SHARE', [room.id, id])).rows[0];
        if (!m)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Current room membership required');
        if (manage && room.owner_id !== id) {
            const grant = await db.query("SELECT id FROM permission_grants WHERE room_id=$1 AND user_id=$2 AND permission='MANAGE_RECRUITMENT' FOR SHARE", [room.id, id]);
            if (m.role !== 'HELPER' || !grant.rowCount)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Recruitment management permission required');
        }
    }
    async play(db, id) { const p = (await db.query(playSelect + ' WHERE p.id=$1 FOR UPDATE', [id])).rows[0]; if (!p)
        (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Play session not found'); return p; }
    async context(db, id, user, session, manage = false, requireMember = true, extra = []) {
        const located = (await db.query('SELECT room_id FROM play_sessions WHERE id=$1', [id])).rows[0];
        if (!located)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Play session not found');
        const room = (await db.query('SELECT id,owner_id,visibility,conversation_id FROM rooms WHERE id=$1 FOR UPDATE', [located.room_id])).rows[0];
        if (!room)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Room not found');
        const roster = (await db.query('SELECT user_id,slot_index FROM team_members WHERE play_session_id=$1 ORDER BY slot_index', [id])).rows;
        await db.query('SELECT id FROM "user" WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [[...new Set([user, ...extra, ...roster.map(r => r.user_id)])].sort()]);
        await this.actor(db, user, session);
        if (requireMember)
            await this.member(db, room, user, manage);
        const play = await this.play(db, id);
        await this.actor(db, user, session);
        return { room, play, roster };
    }
    async card(db, id) {
        const c = (await db.query('SELECT id FROM recruitments WHERE play_session_id=$1 ORDER BY created_at,id LIMIT 1', [id])).rows[0];
        if (!c)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Session recruitment not found');
        return c;
    }
    async notification(db, user, j, result) {
        const type = result ? 'JOIN_REQUEST_RESULT' : 'JOIN_REQUEST';
        const data = result ? contracts_1.JoinRequestResultNotificationDataSchema.parse({ requestId: j.id, recruitmentId: j.recruitment_id, result }) : contracts_1.JoinRequestNotificationDataSchema.parse({ requestId: j.id, recruitmentId: j.recruitment_id, applicantId: j.applicant_id });
        const dedup = `join:${j.id}:${result ?? 'pending'}`, id = (0, node_crypto_1.randomUUID)();
        const row = await db.query('INSERT INTO notifications(id,user_id,type,title,body,data,dedup_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,dedup_key) DO NOTHING RETURNING id', [id, user, type, result ? 'Kết quả xin vào đội' : 'Có người xin vào đội', result ? 'Yêu cầu vào đội đã được xét duyệt.' : 'Có yêu cầu mới cần xét duyệt.', JSON.stringify(data), dedup]);
        if (row.rowCount)
            await db.query("INSERT INTO notification_outbox(id,notification_id,user_id,channel,dedup_key) VALUES($1,$2,$3,'IN_APP',$4)", [(0, node_crypto_1.randomUUID)(), id, user, dedup]);
    }
    async listRoom(user, session, id, query) {
        return this.teams.transaction(async (db) => {
            const room = (await db.query('SELECT id,owner_id,visibility,conversation_id FROM rooms WHERE id=$1 FOR SHARE', [id])).rows[0];
            if (!room)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Room not found');
            await this.actor(db, user, session);
            await this.member(db, room, user);
            const parameters = [id];
            let clause = '';
            if (query.cursor) {
                let cursor;
                try {
                    const decoded = Buffer.from(query.cursor, 'base64url');
                    if (!/^[A-Za-z0-9_-]+$/.test(query.cursor) || decoded.toString('base64url') !== query.cursor)
                        throw Error('Invalid cursor encoding');
                    cursor = roomCursor.parse(JSON.parse(decoded.toString('utf8')));
                }
                catch {
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid pagination cursor');
                }
                if (cursor.roomId !== id)
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Cursor belongs to another room');
                parameters.push(cursor.createdAt, cursor.id);
                clause = ' AND (p.created_at,p.id)<($2::timestamp,$3)';
            }
            parameters.push(query.limit + 1);
            const rows = (await db.query(playSelect + ` WHERE p.room_id=$1${clause} ORDER BY p.created_at DESC,p.id DESC LIMIT $${parameters.length}`, parameters)).rows;
            const items = rows.slice(0, query.limit), hasMore = rows.length > query.limit, last = items.at(-1);
            await this.actor(db, user, session);
            await this.member(db, room, user);
            return { items: items.map(p => this.dto(p)), hasMore, ...(hasMore && last ? { nextCursor: Buffer.from(JSON.stringify({ roomId: id, id: last.id, createdAt: last.created_iso })).toString('base64url') } : {}) };
        });
    }
    async join(user, session, id) {
        return this.teams.transaction(async (db) => {
            const { room, play, roster } = await this.context(db, id, user, session);
            if (play.state === 'ENDED')
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Play session ended');
            const card = await this.card(db, id), existing = (await db.query(joinSelect + ' WHERE j.recruitment_id=$1 AND j.applicant_id=$2 FOR UPDATE', [card.id, user])).rows[0];
            if (existing) {
                if (existing.status === 'PENDING' || (existing.status === 'ACCEPTED' && roster.some(r => r.user_id === user)))
                    return this.joinDto(existing);
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Request already finalized');
            }
            if (roster.some(r => r.user_id === user))
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Already in roster');
            if (roster.length >= play.player_capacity)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.CAPACITY_FULL, 'Team is full');
            const requestId = (0, node_crypto_1.randomUUID)();
            await db.query('INSERT INTO join_requests(id,recruitment_id,applicant_id) VALUES($1,$2,$3)', [requestId, card.id, user]);
            const j = (await db.query(joinSelect + ' WHERE j.id=$1', [requestId])).rows[0];
            await this.notification(db, room.owner_id, j);
            await this.actor(db, user, session);
            return this.joinDto(j);
        });
    }
    async requests(user, session, id) {
        return this.teams.transaction(async (db) => {
            await this.context(db, id, user, session, true);
            const rows = (await db.query(joinSelect + ' JOIN recruitments c ON c.id=j.recruitment_id WHERE c.play_session_id=$1 ORDER BY j.created_at,j.id', [id])).rows;
            await this.actor(db, user, session);
            return rows.map(j => this.joinDto(j));
        });
    }
    async respond(user, session, id, requestId, action) {
        return this.teams.transaction(async (db) => {
            const located = (await db.query(joinSelect + ' WHERE j.id=$1', [requestId])).rows[0];
            if (!located)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Request not found');
            const { room, play } = await this.context(db, id, user, session, true, true, [located.applicant_id]);
            const j = (await db.query(joinSelect + ' WHERE j.id=$1 FOR UPDATE', [requestId])).rows[0];
            if (!j)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Request not found');
            if (!(await db.query('SELECT id FROM recruitments WHERE id=$1 AND play_session_id=$2', [j.recruitment_id, id])).rowCount)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Request does not belong to session');
            await this.member(db, room, j.applicant_id);
            const final = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
            if (j.status === final)
                return this.joinDto(j);
            if (j.status !== 'PENDING' || play.state === 'ENDED')
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Request or session finalized');
            if (action === 'ACCEPT')
                await this.teams.admit(db, room, id, j.applicant_id, requestId);
            await db.query('UPDATE join_requests SET status=$2 WHERE id=$1', [requestId, final]);
            await this.notification(db, j.applicant_id, j, final);
            await this.actor(db, user, session);
            return this.joinDto((await db.query(joinSelect + ' WHERE j.id=$1', [requestId])).rows[0]);
        });
    }
    async start(user, session, id) {
        return this.teams.transaction(async (db) => {
            const { room, play, roster } = await this.context(db, id, user, session, true);
            if (play.state === 'ENDED')
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Ended session cannot restart');
            if (play.state === 'ACTIVE')
                return this.dto(play);
            if (!roster.length)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Roster is empty');
            for (const r of roster) {
                await this.eligible(db, r.user_id);
                await this.member(db, room, r.user_id);
            }
            if ((await db.query('SELECT user_id FROM active_play_slots WHERE user_id=ANY($1::text[])', [roster.map(r => r.user_id)])).rowCount)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Reserved player is playing another team');
            await db.query("UPDATE play_sessions SET state='ACTIVE',updated_at=now() WHERE id=$1", [id]);
            for (const r of roster)
                await db.query('INSERT INTO active_play_slots(user_id,play_session_id,slot_index) VALUES($1,$2,$3)', [r.user_id, id, r.slot_index]);
            await db.query("UPDATE join_requests j SET status='CANCELLED' FROM recruitments c WHERE j.recruitment_id=c.id AND j.applicant_id=ANY($1::text[]) AND j.status='PENDING' AND c.timing_type='now'", [roster.map(r => r.user_id)]);
            await this.actor(db, user, session);
            return this.dto(await this.play(db, id));
        });
    }
    async leave(user, session, id) {
        return this.teams.transaction(async (db) => {
            const { play, roster } = await this.context(db, id, user, session, false, false);
            if (play.state === 'ENDED' || !roster.some(r => r.user_id === user))
                return { success: true };
            if (play.host_user_id === user)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Host must explicitly end the play session');
            await db.query('DELETE FROM active_play_slots WHERE play_session_id=$1 AND user_id=$2', [id, user]);
            await db.query('DELETE FROM team_members WHERE play_session_id=$1 AND user_id=$2', [id, user]);
            await db.query('UPDATE recruitments SET current_players=$2,updated_at=now() WHERE play_session_id=$1', [id, roster.length - 1]);
            await db.query('UPDATE play_sessions SET updated_at=now() WHERE id=$1', [id]);
            await this.actor(db, user, session);
            return { success: true };
        });
    }
    async end(user, session, id) {
        return this.teams.transaction(async (db) => {
            const { play } = await this.context(db, id, user, session, true);
            if (play.state === 'ENDED')
                return this.dto(play);
            await db.query('DELETE FROM active_play_slots WHERE play_session_id=$1', [id]);
            await db.query("UPDATE play_sessions SET state='ENDED',updated_at=now() WHERE id=$1", [id]);
            await db.query("UPDATE recruitments SET state='CLOSED',updated_at=now() WHERE play_session_id=$1", [id]);
            await db.query("UPDATE join_requests j SET status='CANCELLED' FROM recruitments c WHERE c.id=j.recruitment_id AND c.play_session_id=$1 AND j.status='PENDING'", [id]);
            await this.actor(db, user, session);
            return this.dto(await this.play(db, id));
        });
    }
};
exports.PlaySessionsService = PlaySessionsService;
exports.PlaySessionsService = PlaySessionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [teams_service_js_1.TeamsService])
], PlaySessionsService);
//# sourceMappingURL=play-sessions.service.js.map