"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecruitmentsService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const contracts_1 = require("@fg/contracts");
const rooms_service_js_1 = require("../rooms/rooms.service.js");
const selection = `SELECT c.*, r.visibility, p.host_user_id, p.state AS play_state,
 to_char(c.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso,
 to_char(c.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_iso
 FROM recruitments c JOIN rooms r ON r.id=c.room_id JOIN play_sessions p ON p.id=c.play_session_id`;
let RecruitmentsService = class RecruitmentsService {
    pool;
    onModuleInit() {
        if (!process.env.DATABASE_URL)
            throw new Error('DATABASE_URL required');
        this.pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL, max: 16, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
    }
    async onModuleDestroy() { await this.pool?.end(); }
    dto(r) {
        return contracts_1.RecruitmentSchema.parse({ id: r.id, roomId: r.room_id, gameId: r.game_id, gameTitle: r.game_title, title: r.title, mode: r.mode, playerCapacity: r.player_capacity, currentPlayers: r.current_players, timingType: r.timing_type, scheduledAt: r.scheduled_at?.toISOString(), requirementText: r.requirement_text ?? undefined, experienceName: r.experience_name ?? undefined, experienceUrl: r.experience_url ?? undefined, state: r.state, createdAt: r.created_iso, updatedAt: r.updated_iso });
    }
    async transaction(run) {
        const db = await this.pool.connect();
        try {
            await db.query('BEGIN');
            await db.query("SET LOCAL TIME ZONE 'UTC'");
            const value = await run(db);
            await db.query('COMMIT');
            return value;
        }
        catch (e) {
            await db.query('ROLLBACK');
            if (e instanceof common_1.HttpException)
                throw e;
            const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
            if (['23505', '40001', '40P01'].includes(code))
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Conflicting play session or concurrent action');
            throw e;
        }
        finally {
            db.release();
        }
    }
    async actor(db, actorId, sessionId, lock = false) {
        const session = await db.query('SELECT id FROM session WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp()' + (lock ? ' FOR SHARE' : ''), [sessionId, actorId]);
        if (!session.rowCount)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked');
        const ban = await db.query("SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1", [actorId]);
        if (ban.rows[0]?.action === 'BAN')
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Account is banned');
    }
    async manage(db, roomId, actorId) {
        const rooms = await db.query('SELECT id,owner_id,visibility,game_id FROM rooms WHERE id=$1 FOR UPDATE', [roomId]);
        const room = rooms.rows[0];
        if (!room)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Room not found');
        const member = await db.query('SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2 FOR SHARE', [roomId, actorId]);
        if (!member.rowCount)
            (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Not room member');
        if (room.owner_id !== actorId) {
            const grant = await db.query("SELECT id FROM permission_grants WHERE room_id=$1 AND user_id=$2 AND permission='MANAGE_RECRUITMENT' FOR SHARE", [roomId, actorId]);
            if (member.rows[0].role !== 'HELPER' || !grant.rowCount)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Recruitment permission required');
        }
        return room;
    }
    async create(actorId, sessionId, input) {
        return this.transaction(async (db) => {
            await this.actor(db, actorId, sessionId);
            const game = await db.query('SELECT title FROM games WHERE id=$1', [input.gameId]);
            if (game.rows[0]?.title !== input.gameTitle)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Game id/title mismatch');
            if (input.gameTitle === 'Roblox' && (!input.experienceName?.trim() || !input.experienceUrl))
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Roblox experience name and URL required');
            const id = input.idempotencyKey ? (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(['fg-recruitment', actorId, input.idempotencyKey])).digest('hex') : (0, node_crypto_1.randomUUID)();
            await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`recruitment:${id}`]);
            const prior = (await db.query(selection + ' WHERE c.id=$1', [id])).rows[0];
            if (prior) {
                await this.manage(db, prior.room_id, actorId);
                await this.actor(db, actorId, sessionId, true);
                const same = prior.title === input.title && prior.mode === input.mode && prior.game_id === input.gameId && prior.player_capacity === input.playerCapacity && prior.timing_type === input.timingType && (prior.scheduled_at?.toISOString() ?? undefined) === (input.scheduledAt ? new Date(input.scheduledAt).toISOString() : undefined) && (prior.requirement_text ?? undefined) === input.requirementText && (prior.experience_name ?? undefined) === input.experienceName && (prior.experience_url ?? undefined) === input.experienceUrl && (!input.roomId || input.roomId === prior.room_id);
                if (!same)
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Idempotency key reused with different input');
                return this.dto((await db.query(selection + ' WHERE c.id=$1 FOR SHARE OF c,p', [id])).rows[0]);
            }
            let room;
            if (input.roomId) {
                room = await this.manage(db, input.roomId, actorId);
                if (room.game_id !== input.gameId)
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Room game mismatch');
                if (room.visibility !== 'PUBLIC')
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Private room cannot publish recruitment');
            }
            else {
                await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [actorId]);
                const roomId = (0, node_crypto_1.randomUUID)(), conversationId = (0, node_crypto_1.randomUUID)();
                await db.query("INSERT INTO conversations(id,kind)VALUES($1,'ROOM')", [conversationId]);
                await db.query("INSERT INTO rooms(id,name,game_id,owner_id,visibility,player_capacity,conversation_id)VALUES($1,$2,$3,$4,'PUBLIC',$5,$6)", [roomId, input.title, input.gameId, actorId, input.playerCapacity, conversationId]);
                await db.query("INSERT INTO room_members(id,room_id,user_id,role)VALUES($1,$2,$3,'OWNER')", [(0, node_crypto_1.randomUUID)(), roomId, actorId]);
                room = { id: roomId, owner_id: actorId, visibility: 'PUBLIC', game_id: input.gameId };
            }
            await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [room.owner_id]);
            await this.actor(db, actorId, sessionId, true);
            if (input.timingType === 'scheduledAt' && (await db.query('SELECT $1::timestamptz>clock_timestamp() AS future', [input.scheduledAt])).rows[0].future !== true)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Scheduled time has already passed');
            const hostBan = await db.query("SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1", [room.owner_id]);
            if (hostBan.rows[0]?.action === 'BAN')
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.FORBIDDEN, 'Room owner is banned');
            if (input.timingType === 'now' && (await db.query('SELECT user_id FROM active_play_slots WHERE user_id=$1', [room.owner_id])).rowCount)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Room owner already occupies an active play session');
            const playId = (0, node_crypto_1.randomUUID)(), state = input.timingType === 'now' ? 'ACTIVE' : 'SCHEDULED';
            await db.query('INSERT INTO play_sessions(id,room_id,host_user_id,player_capacity,timing_type,scheduled_at,state)VALUES($1,$2,$3,$4,$5,$6,$7)', [playId, room.id, room.owner_id, input.playerCapacity, input.timingType, input.scheduledAt ?? null, state]);
            await db.query('INSERT INTO team_members(id,play_session_id,user_id,player_capacity,slot_index,is_host)VALUES($1,$2,$3,$4,1,true)', [(0, node_crypto_1.randomUUID)(), playId, room.owner_id, input.playerCapacity]);
            if (state === 'ACTIVE')
                await db.query('INSERT INTO active_play_slots(user_id,play_session_id,slot_index)VALUES($1,$2,1)', [room.owner_id, playId]);
            await db.query('INSERT INTO recruitments(id,room_id,game_id,game_title,play_session_id,title,mode,player_capacity,timing_type,scheduled_at,requirement_text,experience_name,experience_url)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [id, room.id, input.gameId, input.gameTitle, playId, input.title, input.mode, input.playerCapacity, input.timingType, input.scheduledAt ?? null, input.requirementText ?? null, input.experienceName ?? null, input.experienceUrl ?? null]);
            return this.dto((await db.query(selection + ' WHERE c.id=$1', [id])).rows[0]);
        });
    }
    async setOpen(actorId, sessionId, id, open) {
        return this.transaction(async (db) => {
            await this.actor(db, actorId, sessionId);
            const located = await db.query('SELECT room_id FROM recruitments WHERE id=$1', [id]);
            if (!located.rowCount)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Recruitment not found');
            const room = await this.manage(db, located.rows[0].room_id, actorId);
            const row = (await db.query(selection + ' WHERE c.id=$1 FOR UPDATE OF c,p', [id])).rows[0];
            if (!row)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Recruitment not found');
            await this.actor(db, actorId, sessionId, true);
            if (open && (room.visibility !== 'PUBLIC' || row.play_state === 'ENDED'))
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.ACTIVE_PLAY_CONFLICT, 'Cannot reopen private or ended session');
            await db.query('UPDATE recruitments SET state=$2,updated_at=clock_timestamp() WHERE id=$1', [id, open ? 'OPEN' : 'CLOSED']);
            return this.dto((await db.query(selection + ' WHERE c.id=$1', [id])).rows[0]);
        });
    }
    async list(query, suggestions = false, pathGameId) {
        return this.transaction(async (db) => {
            const params = [], where = ["c.state='OPEN'", "r.visibility='PUBLIC'", "p.state<>'ENDED'"];
            const add = (condition, value) => { params.push(value); where.push(condition(params.length)); };
            if (pathGameId) {
                const game = await db.query('SELECT title FROM games WHERE id=$1', [pathGameId]);
                if (!game.rowCount)
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Game not found');
                if (query.gameId && query.gameId !== pathGameId || query.gameTitle && query.gameTitle !== game.rows[0].title)
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Path/query game mismatch');
            }
            const gameId = pathGameId ?? query.gameId;
            if (gameId)
                add(n => `c.game_id=$${n}`, gameId);
            if (query.gameTitle)
                add(n => `c.game_title=$${n}`, query.gameTitle);
            if (query.mode)
                add(n => `c.mode=$${n}`, query.mode);
            if (query.timingType)
                add(n => `c.timing_type=$${n}`, query.timingType);
            if (suggestions)
                where.push('c.current_players<c.player_capacity');
            if (query.cursor) {
                let cursor;
                const filter = JSON.stringify([gameId ?? null, query.gameTitle ?? null, query.mode ?? null, query.timingType ?? null, suggestions]);
                try {
                    cursor = zod_1.z.object({ id: zod_1.z.string().min(1), updatedAt: contracts_1.IsoDateTimeSchema, missing: zod_1.z.number().int().min(0).max(9), filter: zod_1.z.literal(filter) }).parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString()));
                }
                catch {
                    (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid or mismatched cursor');
                }
                params.push(cursor.missing, cursor.updatedAt, cursor.id);
                const n = params.length;
                where.push(`((c.player_capacity-c.current_players)>$${n - 2} OR ((c.player_capacity-c.current_players)=$${n - 2} AND (c.updated_at<$${n - 1}::timestamptz OR (c.updated_at=$${n - 1}::timestamptz AND c.id>$${n}))))`);
            }
            params.push(query.limit + 1);
            const rows = (await db.query(selection + ` WHERE ${where.join(' AND ')} ORDER BY (c.player_capacity-c.current_players) ASC,c.updated_at DESC,c.id ASC LIMIT $${params.length} FOR SHARE OF c,r,p`, params)).rows;
            const hasMore = rows.length > query.limit, items = rows.slice(0, query.limit), last = items.at(-1);
            const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ id: last.id, updatedAt: last.updated_iso, missing: last.player_capacity - last.current_players, filter: JSON.stringify([gameId ?? null, query.gameTitle ?? null, query.mode ?? null, query.timingType ?? null, suggestions]) })).toString('base64url') : undefined;
            return { items: items.map(r => contracts_1.PublicRecruitmentSchema.parse({ ...this.dto(r), visibility: 'PUBLIC' })), hasMore, ...(nextCursor ? { nextCursor } : {}) };
        });
    }
    async publicDetail(id) {
        return this.transaction(async (db) => {
            const result = (await db.query(selection + " WHERE c.id=$1 AND c.state='OPEN' AND r.visibility='PUBLIC' AND p.state<>'ENDED' FOR SHARE OF c,r,p", [id])).rows[0];
            if (!result)
                (0, rooms_service_js_1.roomError)(contracts_1.ErrorCode.NOT_FOUND, 'Recruitment not found');
            return contracts_1.PublicRecruitmentSchema.parse({ ...this.dto(result), visibility: 'PUBLIC' });
        });
    }
};
exports.RecruitmentsService = RecruitmentsService;
exports.RecruitmentsService = RecruitmentsService = __decorate([
    (0, common_1.Injectable)()
], RecruitmentsService);
//# sourceMappingURL=recruitments.service.js.map