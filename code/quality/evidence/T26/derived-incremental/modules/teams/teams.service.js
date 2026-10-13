"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamsService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("@fg/contracts");
const rooms_service_js_1 = require("../rooms/rooms.service.js");
const joinSelect = `SELECT j.*,to_char(j.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM join_requests j`;
const playSelect = `SELECT p.*,to_char(p.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso,to_char(p.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_iso FROM play_sessions p`;
let TeamsService = class TeamsService {
    pool;
    onModuleInit() { if (!process.env.DATABASE_URL)
        throw Error('DATABASE_URL required'); this.pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL, max: 16, connectionTimeoutMillis: 5000, statement_timeout: 10000 }); }
    async onModuleDestroy() { await this.pool?.end(); }
    async transaction(run) {
        const db = await this.pool.connect();
        try {
            await db.query('BEGIN');
            await db.query("SET LOCAL TIME ZONE 'UTC'");
            const result = await run(db);
            await db.query('COMMIT');
            return result;
        }
        catch (error) {
            await db.query('ROLLBACK');
            if (error instanceof common_1.HttpException)
                throw error;
            const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
            if (['23505', '40001', '40P01'].includes(code))
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Concurrent team operation conflicted');
            throw error;
        }
        finally {
            db.release();
        }
    }
    dto(j) { return contracts_1.JoinRequestSchema.parse({ id: j.id, recruitmentId: j.recruitment_id, applicantId: j.applicant_id, status: j.status, createdAt: j.created_iso }); }
    async lockUsers(db, ids) { await db.query('SELECT id FROM "user" WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [[...new Set(ids)].sort()]); }
    async eligible(db, userId) {
        const ban = (await db.query("SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1", [userId])).rows[0];
        if (ban?.action === 'BAN')
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Account is banned');
        const profile = await db.query('SELECT p.user_id FROM profiles p WHERE p.user_id=$1 AND EXISTS(SELECT 1 FROM game_interests g WHERE g.user_id=p.user_id) FOR SHARE', [userId]);
        if (!profile.rowCount)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Onboarding required');
    }
    async actor(db, userId, sessionId) {
        const session = await db.query('SELECT id FROM session WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE', [sessionId, userId]);
        if (!session.rowCount)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked');
        await this.eligible(db, userId);
    }
    async room(db, id) { const r = (await db.query('SELECT id,owner_id,visibility,conversation_id FROM rooms WHERE id=$1 FOR UPDATE', [id])).rows[0]; if (!r)
        (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Room not found'); return r; }
    async member(db, room, userId, manage = false) {
        const member = (await db.query('SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2 FOR SHARE', [room.id, userId])).rows[0];
        if (!member)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Room membership required');
        if (manage && room.owner_id !== userId) {
            const grant = await db.query("SELECT id FROM permission_grants WHERE room_id=$1 AND user_id=$2 AND permission='MANAGE_RECRUITMENT' FOR SHARE", [room.id, userId]);
            if (member.role !== 'HELPER' || !grant.rowCount)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Recruitment management permission required');
        }
    }
    async card(db, id) { const c = (await db.query('SELECT id,room_id,play_session_id,state,timing_type FROM recruitments WHERE id=$1', [id])).rows[0]; if (!c)
        (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Recruitment not found'); return c; }
    async play(db, id) { const p = (await db.query(playSelect + ' WHERE p.id=$1 FOR UPDATE', [id])).rows[0]; if (!p)
        (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Play session not found'); return p; }
    async notify(db, userId, type, dedup, data) {
        const parsed = type === 'JOIN_REQUEST' ? contracts_1.JoinRequestNotificationDataSchema.parse(data) : contracts_1.JoinRequestResultNotificationDataSchema.parse(data);
        const id = (0, node_crypto_1.randomUUID)();
        const row = await db.query("INSERT INTO notifications(id,user_id,type,title,body,data,dedup_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,dedup_key) DO NOTHING RETURNING id", [id, userId, type, type === 'JOIN_REQUEST' ? 'Có người xin vào đội' : 'Kết quả xin vào đội', type === 'JOIN_REQUEST' ? 'Có yêu cầu mới cần xét duyệt.' : 'Yêu cầu vào đội của bạn đã được xét duyệt.', JSON.stringify(parsed), dedup]);
        if (row.rowCount)
            await db.query("INSERT INTO notification_outbox(id,notification_id,user_id,channel,dedup_key) VALUES($1,$2,$3,'IN_APP',$4)", [(0, node_crypto_1.randomUUID)(), id, userId, dedup]);
    }
    async apply(userId, sessionId, id) {
        return this.transaction(async (db) => {
            const located = await this.card(db, id), room = await this.room(db, located.room_id);
            await this.lockUsers(db, [userId, room.owner_id]);
            await this.actor(db, userId, sessionId);
            const c = await this.card(db, id), p = await this.play(db, c.play_session_id);
            await this.actor(db, userId, sessionId);
            if (room.visibility !== 'PUBLIC')
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Private recruitment is not discoverable');
            if (c.state !== 'OPEN' || p.state === 'ENDED')
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Recruitment is closed');
            const existing = (await db.query(joinSelect + ' WHERE j.recruitment_id=$1 AND j.applicant_id=$2 FOR UPDATE', [id, userId])).rows[0];
            if (existing) {
                if (['PENDING', 'ACCEPTED'].includes(existing.status))
                    return this.dto(existing);
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Request already finalized');
            }
            if ((await db.query('SELECT id FROM team_members WHERE play_session_id=$1 AND user_id=$2', [p.id, userId])).rowCount)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Already in roster');
            if ((await db.query('SELECT count(*)::int AS n FROM team_members WHERE play_session_id=$1', [p.id])).rows[0].n >= p.player_capacity)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.CAPACITY_FULL, 'Team is full');
            const requestId = (0, node_crypto_1.randomUUID)();
            await db.query('INSERT INTO join_requests(id,recruitment_id,applicant_id) VALUES($1,$2,$3)', [requestId, id, userId]);
            await this.notify(db, room.owner_id, 'JOIN_REQUEST', `join:${requestId}:pending`, { requestId, recruitmentId: id, applicantId: userId });
            await this.actor(db, userId, sessionId);
            return this.dto((await db.query(joinSelect + ' WHERE j.id=$1', [requestId])).rows[0]);
        });
    }
    async admit(db, room, playSessionId, userId, excludeJoinRequestId) {
        await this.eligible(db, userId);
        const p = await this.play(db, playSessionId);
        if (p.room_id !== room.id || p.state === 'ENDED')
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Play session ended or changed');
        const existing = await db.query('SELECT slot_index FROM team_members WHERE play_session_id=$1 AND user_id=$2', [p.id, userId]);
        if (existing.rowCount)
            return;
        if (p.state === 'ACTIVE' && (await db.query('SELECT user_id FROM active_play_slots WHERE user_id=$1', [userId])).rowCount)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Already playing another team');
        const slots = (await db.query('SELECT slot_index FROM team_members WHERE play_session_id=$1 ORDER BY slot_index', [p.id])).rows.map(r => r.slot_index);
        const slot = Array.from({ length: p.player_capacity }, (_, i) => i + 1).find(i => !slots.includes(i));
        if (!slot)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.CAPACITY_FULL, 'Team is full');
        await db.query("INSERT INTO room_members(id,room_id,user_id,role) VALUES($1,$2,$3,'MEMBER') ON CONFLICT(room_id,user_id) DO NOTHING", [(0, node_crypto_1.randomUUID)(), room.id, userId]);
        await db.query('INSERT INTO conversation_members(id,conversation_id,user_id) VALUES($1,$2,$3) ON CONFLICT(conversation_id,user_id) DO NOTHING', [(0, node_crypto_1.randomUUID)(), room.conversation_id, userId]);
        await db.query('INSERT INTO team_members(id,play_session_id,user_id,slot_index,player_capacity,is_host) VALUES($1,$2,$3,$4,$5,false)', [(0, node_crypto_1.randomUUID)(), p.id, userId, slot, p.player_capacity]);
        if (p.state === 'ACTIVE')
            await db.query('INSERT INTO active_play_slots(user_id,play_session_id,slot_index) VALUES($1,$2,$3)', [userId, p.id, slot]);
        await db.query('UPDATE recruitments SET current_players=$2,updated_at=now() WHERE play_session_id=$1', [p.id, slots.length + 1]);
        await db.query('UPDATE play_sessions SET updated_at=now() WHERE id=$1', [p.id]);
        if (p.state === 'ACTIVE')
            await db.query("UPDATE join_requests j SET status='CANCELLED' FROM recruitments c WHERE j.recruitment_id=c.id AND j.applicant_id=$1 AND j.status='PENDING' AND ($2::text IS NULL OR j.id<>$2) AND c.timing_type='now'", [userId, excludeJoinRequestId ?? null]);
    }
    async respond(userId, sessionId, id, action) {
        return this.transaction(async (db) => {
            const located = (await db.query(joinSelect + ' WHERE j.id=$1', [id])).rows[0];
            if (!located)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Request not found');
            const c = await this.card(db, located.recruitment_id), room = await this.room(db, c.room_id);
            await this.lockUsers(db, [userId, located.applicant_id]);
            await this.actor(db, userId, sessionId);
            await this.member(db, room, userId, true);
            const p = await this.play(db, c.play_session_id), j = (await db.query(joinSelect + ' WHERE j.id=$1 FOR UPDATE', [id])).rows[0];
            if (!j)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Request not found');
            await this.actor(db, userId, sessionId);
            const final = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
            if (j.status === final)
                return this.dto(j);
            if (j.status !== 'PENDING')
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Request already finalized');
            if (action === 'ACCEPT') {
                const fresh = await this.card(db, c.id);
                if (room.visibility !== 'PUBLIC' || fresh.state !== 'OPEN' || p.state === 'ENDED')
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Recruitment no longer accepting');
                await this.admit(db, room, p.id, j.applicant_id, id);
            }
            await db.query('UPDATE join_requests SET status=$2 WHERE id=$1', [id, final]);
            await this.notify(db, j.applicant_id, 'JOIN_REQUEST_RESULT', `join:${id}:${final}`, { requestId: id, recruitmentId: c.id, result: final });
            await this.actor(db, userId, sessionId);
            return this.dto((await db.query(joinSelect + ' WHERE j.id=$1', [id])).rows[0]);
        });
    }
    async cancel(userId, sessionId, id) {
        return this.transaction(async (db) => {
            await this.lockUsers(db, [userId]);
            await this.actor(db, userId, sessionId);
            const j = (await db.query(joinSelect + ' WHERE j.id=$1 FOR UPDATE', [id])).rows[0];
            if (!j)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Request not found');
            if (j.applicant_id !== userId)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Only applicant may cancel');
            if (j.status === 'CANCELLED')
                return { success: true };
            if (j.status !== 'PENDING')
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Request already finalized');
            await db.query("UPDATE join_requests SET status='CANCELLED' WHERE id=$1", [id]);
            return { success: true };
        });
    }
    async mine(userId, sessionId) { return this.transaction(async (db) => { await this.actor(db, userId, sessionId); return (await db.query(joinSelect + ' WHERE j.applicant_id=$1 ORDER BY j.created_at DESC,j.id', [userId])).rows.map(j => this.dto(j)); }); }
    async requests(userId, sessionId, id) { return this.transaction(async (db) => { const c = await this.card(db, id), room = await this.room(db, c.room_id); await this.actor(db, userId, sessionId); await this.member(db, room, userId, true); return (await db.query(joinSelect + ' WHERE j.recruitment_id=$1 ORDER BY j.created_at,j.id', [id])).rows.map(j => this.dto(j)); }); }
    async snapshot(userId, sessionId, id) {
        return this.transaction(async (db) => {
            const located = (await db.query('SELECT room_id FROM play_sessions WHERE id=$1', [id])).rows[0];
            if (!located)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Play session not found');
            const room = await this.room(db, located.room_id);
            await this.actor(db, userId, sessionId);
            await this.member(db, room, userId);
            const p = await this.play(db, id);
            const roster = (await db.query("SELECT user_id,slot_index,is_host,to_char(joined_at,'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS joined_iso FROM team_members WHERE play_session_id=$1 ORDER BY slot_index", [id])).rows;
            return contracts_1.TeamSnapshotSchema.parse({ playSession: { id: p.id, roomId: p.room_id, hostUserId: p.host_user_id, playerCapacity: p.player_capacity, timingType: p.timing_type, scheduledAt: p.scheduled_at?.toISOString(), state: p.state, createdAt: p.created_iso, updatedAt: p.updated_iso }, roster: roster.map(r => ({ playSessionId: id, userId: r.user_id, slotIndex: r.slot_index, isHost: r.is_host, joinedAt: r.joined_iso })) });
        });
    }
};
exports.TeamsService = TeamsService;
exports.TeamsService = TeamsService = __decorate([
    (0, common_1.Injectable)()
], TeamsService);
//# sourceMappingURL=teams.service.js.map