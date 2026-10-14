import { Injectable, OnModuleInit, OnModuleDestroy, HttpException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { CreateRecruitmentSchema, PublicRecruitmentQuerySchema, RecruitmentSchema, PublicRecruitmentSchema, RecruitmentDTO, PublicRecruitmentDTO, Page, ErrorCode, IsoDateTimeSchema } from '@fg/contracts';
import { roomError } from '../rooms/rooms.service.js';
type Create = z.infer<ReturnType<typeof CreateRecruitmentSchema>>;
type Query = z.infer<typeof PublicRecruitmentQuerySchema>;
type Room = {
    id: string;
    owner_id: string;
    visibility: string;
    game_id: string;
};
type Row = {
    id: string;
    room_id: string;
    game_id: string;
    game_title: string;
    title: string;
    mode: string;
    player_capacity: number;
    current_players: number;
    timing_type: string;
    scheduled_at: Date | null;
    requirement_text: string | null;
    experience_name: string | null;
    experience_url: string | null;
    state: string;
    created_at: Date;
    created_iso: string;
    updated_at: Date;
    updated_iso: string;
    host_user_id: string;
    play_state: string;
    visibility: string;
};
const selection = `SELECT c.*, r.visibility, p.host_user_id, p.state AS play_state,
 to_char(c.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso,
 to_char(c.updated_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_iso
 FROM recruitments c JOIN rooms r ON r.id=c.room_id JOIN play_sessions p ON p.id=c.play_session_id`;
@Injectable()
export class RecruitmentsService implements OnModuleInit, OnModuleDestroy {
    private pool!: Pool;
    onModuleInit() { if (!process.env.DATABASE_URL)
        throw new Error('DATABASE_URL required'); this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 16, connectionTimeoutMillis: 5000, statement_timeout: 10000 }); }
    async onModuleDestroy() { await this.pool?.end(); }
    private dto(r: Row): RecruitmentDTO {
        return RecruitmentSchema.parse({ id: r.id, roomId: r.room_id, gameId: r.game_id, gameTitle: r.game_title, title: r.title, mode: r.mode, playerCapacity: r.player_capacity, currentPlayers: r.current_players, timingType: r.timing_type, scheduledAt: r.scheduled_at?.toISOString(), requirementText: r.requirement_text ?? undefined, experienceName: r.experience_name ?? undefined, experienceUrl: r.experience_url ?? undefined, state: r.state, createdAt: r.created_iso, updatedAt: r.updated_iso });
    }
    private async transaction<T>(run: (db: PoolClient) => Promise<T>): Promise<T> {
        const db = await this.pool.connect();
        try {
            await db.query('BEGIN');
            // Legacy created_at/updated_at columns store UTC without timezone.
            // Keep writes and cursor comparisons independent of host/DB timezone.
            await db.query("SET LOCAL TIME ZONE 'UTC'");
            const value = await run(db);
            await db.query('COMMIT');
            return value;
        }
        catch (e) {
            await db.query('ROLLBACK');
            if (e instanceof HttpException)
                throw e;
            const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
            if (['23505', '40001', '40P01'].includes(code))
                roomError(ErrorCode.ACTIVE_PLAY_CONFLICT, 'Conflicting play session or concurrent action');
            throw e;
        }
        finally {
            db.release();
        }
    }
    private async actor(db: PoolClient, actorId: string, sessionId: string, lock = false) {
        const session = await db.query('SELECT id FROM session WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp()' + (lock ? ' FOR SHARE' : ''), [sessionId, actorId]);
        if (!session.rowCount)
            roomError(ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked');
        const ban = await db.query("SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1", [actorId]);
        if (ban.rows[0]?.action === 'BAN')
            roomError(ErrorCode.FORBIDDEN, 'Account is banned');
    }
    private async manage(db: PoolClient, roomId: string, actorId: string): Promise<Room> {
        const rooms = await db.query<Room>('SELECT id,owner_id,visibility,game_id FROM rooms WHERE id=$1 FOR UPDATE', [roomId]);
        const room = rooms.rows[0];
        if (!room)
            roomError(ErrorCode.NOT_FOUND, 'Room not found');
        const member = await db.query('SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2 FOR SHARE', [roomId, actorId]);
        if (!member.rowCount)
            roomError(ErrorCode.FORBIDDEN, 'Not room member');
        if (room.owner_id !== actorId) {
            const grant = await db.query("SELECT id FROM permission_grants WHERE room_id=$1 AND user_id=$2 AND permission='MANAGE_RECRUITMENT' FOR SHARE", [roomId, actorId]);
            if (member.rows[0].role !== 'HELPER' || !grant.rowCount)
                roomError(ErrorCode.FORBIDDEN, 'Recruitment permission required');
        }
        return room;
    }
    async create(actorId: string, sessionId: string, input: Create): Promise<RecruitmentDTO> {
        return this.transaction(async (db) => {
            await this.actor(db, actorId, sessionId);
            const game = await db.query('SELECT title FROM games WHERE id=$1', [input.gameId]);
            if (game.rows[0]?.title !== input.gameTitle)
                roomError(ErrorCode.INVALID_INPUT, 'Game id/title mismatch');
            if (input.gameTitle === 'Roblox' && (!input.experienceName?.trim() || !input.experienceUrl))
                roomError(ErrorCode.INVALID_INPUT, 'Roblox experience name and URL required');
            const id = input.idempotencyKey ? createHash('sha256').update(JSON.stringify(['fg-recruitment', actorId, input.idempotencyKey])).digest('hex') : randomUUID();
            await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`recruitment:${id}`]);
            const prior = (await db.query<Row>(selection + ' WHERE c.id=$1', [id])).rows[0];
            if (prior) {
                await this.manage(db, prior.room_id, actorId);
                await this.actor(db, actorId, sessionId, true);
                const same = prior.title === input.title && prior.mode === input.mode && prior.game_id === input.gameId && prior.player_capacity === input.playerCapacity && prior.timing_type === input.timingType && (prior.scheduled_at?.toISOString() ?? undefined) === (input.scheduledAt ? new Date(input.scheduledAt).toISOString() : undefined) && (prior.requirement_text ?? undefined) === input.requirementText && (prior.experience_name ?? undefined) === input.experienceName && (prior.experience_url ?? undefined) === input.experienceUrl && (!input.roomId || input.roomId === prior.room_id);
                if (!same)
                    roomError(ErrorCode.ACTIVE_PLAY_CONFLICT, 'Idempotency key reused with different input');
                return this.dto((await db.query<Row>(selection + ' WHERE c.id=$1 FOR SHARE OF c,p', [id])).rows[0]);
            }
            let room: Room;
            if (input.roomId) {
                room = await this.manage(db, input.roomId, actorId);
                if (room.game_id !== input.gameId)
                    roomError(ErrorCode.INVALID_INPUT, 'Room game mismatch');
                if (room.visibility !== 'PUBLIC')
                    roomError(ErrorCode.FORBIDDEN, 'Private room cannot publish recruitment');
            }
            else {
                // Lock before inserting owner FKs to avoid concurrent lock upgrades.
                await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [actorId]);
                const roomId = randomUUID(), conversationId = randomUUID();
                await db.query("INSERT INTO conversations(id,kind)VALUES($1,'ROOM')", [conversationId]);
                await db.query("INSERT INTO rooms(id,name,game_id,owner_id,visibility,player_capacity,conversation_id)VALUES($1,$2,$3,$4,'PUBLIC',$5,$6)", [roomId, input.title, input.gameId, actorId, input.playerCapacity, conversationId]);
                await db.query("INSERT INTO room_members(id,room_id,user_id,role)VALUES($1,$2,$3,'OWNER')", [randomUUID(), roomId, actorId]);
                room = { id: roomId, owner_id: actorId, visibility: 'PUBLIC', game_id: input.gameId };
            }
            await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [room.owner_id]);
            await this.actor(db, actorId, sessionId, true);
            if (input.timingType === 'scheduledAt' && (await db.query('SELECT $1::timestamptz>clock_timestamp() AS future', [input.scheduledAt])).rows[0].future !== true)
                roomError(ErrorCode.INVALID_INPUT, 'Scheduled time has already passed');
            const hostBan = await db.query("SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1", [room.owner_id]);
            if (hostBan.rows[0]?.action === 'BAN')
                roomError(ErrorCode.FORBIDDEN, 'Room owner is banned');
            if (input.timingType === 'now' && (await db.query('SELECT user_id FROM active_play_slots WHERE user_id=$1', [room.owner_id])).rowCount)
                roomError(ErrorCode.ACTIVE_PLAY_CONFLICT, 'Room owner already occupies an active play session');
            const playId = randomUUID(), state = input.timingType === 'now' ? 'ACTIVE' : 'SCHEDULED';
            await db.query('INSERT INTO play_sessions(id,room_id,host_user_id,player_capacity,timing_type,scheduled_at,state)VALUES($1,$2,$3,$4,$5,$6,$7)', [playId, room.id, room.owner_id, input.playerCapacity, input.timingType, input.scheduledAt ?? null, state]);
            await db.query('INSERT INTO team_members(id,play_session_id,user_id,player_capacity,slot_index,is_host)VALUES($1,$2,$3,$4,1,true)', [randomUUID(), playId, room.owner_id, input.playerCapacity]);
            if (state === 'ACTIVE')
                await db.query('INSERT INTO active_play_slots(user_id,play_session_id,slot_index)VALUES($1,$2,1)', [room.owner_id, playId]);
            await db.query('INSERT INTO recruitments(id,room_id,game_id,game_title,play_session_id,title,mode,player_capacity,timing_type,scheduled_at,requirement_text,experience_name,experience_url)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [id, room.id, input.gameId, input.gameTitle, playId, input.title, input.mode, input.playerCapacity, input.timingType, input.scheduledAt ?? null, input.requirementText ?? null, input.experienceName ?? null, input.experienceUrl ?? null]);
            return this.dto((await db.query<Row>(selection + ' WHERE c.id=$1', [id])).rows[0]);
        });
    }
    async setOpen(actorId: string, sessionId: string, id: string, open: boolean): Promise<RecruitmentDTO> {
        return this.transaction(async (db) => {
            await this.actor(db, actorId, sessionId);
            const located = await db.query('SELECT room_id FROM recruitments WHERE id=$1', [id]);
            if (!located.rowCount)
                roomError(ErrorCode.NOT_FOUND, 'Recruitment not found');
            const room = await this.manage(db, located.rows[0].room_id, actorId);
            const row = (await db.query<Row>(selection + ' WHERE c.id=$1 FOR UPDATE OF c,p', [id])).rows[0];
            if (!row)
                roomError(ErrorCode.NOT_FOUND, 'Recruitment not found');
            await this.actor(db, actorId, sessionId, true);
            if (open && (room.visibility !== 'PUBLIC' || row.play_state === 'ENDED'))
                roomError(ErrorCode.ACTIVE_PLAY_CONFLICT, 'Cannot reopen private or ended session');
            await db.query('UPDATE recruitments SET state=$2,updated_at=clock_timestamp() WHERE id=$1', [id, open ? 'OPEN' : 'CLOSED']);
            return this.dto((await db.query<Row>(selection + ' WHERE c.id=$1', [id])).rows[0]);
        });
    }
    async list(query: Query, suggestions = false, pathGameId?: string): Promise<Page<PublicRecruitmentDTO>> {
        return this.transaction(async (db) => {
            const params: unknown[] = [], where = ["c.state='OPEN'", "r.visibility='PUBLIC'", "p.state<>'ENDED'"];
            const add = (condition: (n: number) => string, value: unknown) => { params.push(value); where.push(condition(params.length)); };
            if (pathGameId) {
                const game = await db.query('SELECT title FROM games WHERE id=$1', [pathGameId]);
                if (!game.rowCount)
                    roomError(ErrorCode.NOT_FOUND, 'Game not found');
                if (query.gameId && query.gameId !== pathGameId || query.gameTitle && query.gameTitle !== game.rows[0].title)
                    roomError(ErrorCode.INVALID_INPUT, 'Path/query game mismatch');
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
                let cursor: {
                    id: string;
                    updatedAt: string;
                    missing: number;
                    filter: string;
                };
                const filter = JSON.stringify([gameId ?? null, query.gameTitle ?? null, query.mode ?? null, query.timingType ?? null, suggestions]);
                try {
                    cursor = z.object({ id: z.string().min(1), updatedAt: IsoDateTimeSchema, missing: z.number().int().min(0).max(9), filter: z.literal(filter) }).parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString()));
                }
                catch {
                    roomError(ErrorCode.INVALID_INPUT, 'Invalid or mismatched cursor');
                }
                params.push(cursor.missing, cursor.updatedAt, cursor.id);
                const n = params.length;
                where.push(`((c.player_capacity-c.current_players)>$${n - 2} OR ((c.player_capacity-c.current_players)=$${n - 2} AND (c.updated_at<$${n - 1}::timestamptz OR (c.updated_at=$${n - 1}::timestamptz AND c.id>$${n}))))`);
            }
            params.push(query.limit + 1);
            const rows = (await db.query<Row>(selection + ` WHERE ${where.join(' AND ')} ORDER BY (c.player_capacity-c.current_players) ASC,c.updated_at DESC,c.id ASC LIMIT $${params.length} FOR SHARE OF c,r,p`, params)).rows;
            const hasMore = rows.length > query.limit, items = rows.slice(0, query.limit), last = items.at(-1);
            const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ id: last.id, updatedAt: last.updated_iso, missing: last.player_capacity - last.current_players, filter: JSON.stringify([gameId ?? null, query.gameTitle ?? null, query.mode ?? null, query.timingType ?? null, suggestions]) })).toString('base64url') : undefined;
            return { items: items.map(r => PublicRecruitmentSchema.parse({ ...this.dto(r), visibility: 'PUBLIC' })), hasMore, ...(nextCursor ? { nextCursor } : {}) };
        });
    }
    async publicDetail(id: string) { return this.transaction(async (db) => { const result = (await db.query<Row>(selection + " WHERE c.id=$1 AND c.state='OPEN' AND r.visibility='PUBLIC' AND p.state<>'ENDED' FOR SHARE OF c,r,p", [id])).rows[0]; if (!result)
        roomError(ErrorCode.NOT_FOUND, 'Recruitment not found'); return PublicRecruitmentSchema.parse({ ...this.dto(result), visibility: 'PUBLIC' }); }); }
}
