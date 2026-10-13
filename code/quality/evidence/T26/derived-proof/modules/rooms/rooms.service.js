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
exports.RoomsService = void 0;
exports.roomError = roomError;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("@fg/contracts");
const profiles_service_js_1 = require("../profiles/profiles.service.js");
function roomError(code, message) {
    throw new common_1.HttpException({ code, message, requestId: (0, node_crypto_1.randomUUID)() }, contracts_1.ErrorCodeToHttpStatus[code]);
}
function encodeCursor(payload) {
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
}
function decodeCursor(cursor) {
    try {
        const raw = Buffer.from(cursor, 'base64url').toString('utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
            roomError(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid pagination cursor format');
        }
        const dateCheck = contracts_1.IsoDateTimeSchema.safeParse(parsed.createdAt);
        if (!dateCheck.success) {
            roomError(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid pagination cursor ISO timestamp');
        }
        return parsed;
    }
    catch (err) {
        if (err instanceof common_1.HttpException)
            throw err;
        roomError(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid pagination cursor format');
    }
}
let RoomsService = class RoomsService {
    profilesService;
    pool;
    callRevoker;
    setCallRevoker(revoke) { this.callRevoker = revoke; }
    constructor(profilesService) {
        this.profilesService = profilesService;
    }
    onModuleInit() {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL environment variable is required');
        }
        this.pool = new pg_1.Pool({
            connectionString,
            max: 16,
            connectionTimeoutMillis: 5000,
            statement_timeout: 10000,
        });
    }
    async onModuleDestroy() {
        if (this.pool) {
            await this.pool.end();
        }
    }
    async checkActorSessionAndBan(client, actorId, sessionId) {
        if (sessionId) {
            const sessionRes = await client.query(`SELECT id FROM "session" WHERE id = $1 AND user_id = $2 AND expires_at > clock_timestamp() FOR SHARE`, [sessionId, actorId]);
            if ((sessionRes.rowCount ?? 0) === 0) {
                roomError(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked');
            }
        }
        const banRes = await client.query(`SELECT action FROM admin_actions WHERE target_user_id = $1 AND action IN ('BAN', 'UNBAN') ORDER BY created_at DESC, id DESC LIMIT 1`, [actorId]);
        if (banRes.rows[0]?.action === 'BAN') {
            roomError(contracts_1.ErrorCode.FORBIDDEN, 'Account is banned');
        }
    }
    async buildRoomDto(db, roomId) {
        const roomRes = await db.query(`SELECT r.id, r.name, r.description, r.game_id, r.owner_id, r.visibility, r.invite_policy, r.player_capacity, r.conversation_id,
              to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at_iso,
              to_char(r.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at_iso,
              g.title as game_title,
              (SELECT COUNT(*)::int FROM room_members rm WHERE rm.room_id = r.id) as member_count
       FROM rooms r
       JOIN games g ON r.game_id = g.id
       WHERE r.id = $1`, [roomId]);
        if ((roomRes.rowCount ?? 0) === 0) {
            roomError(contracts_1.ErrorCode.NOT_FOUND, 'Room not found');
        }
        const row = roomRes.rows[0];
        const ownerProfile = await this.profilesService.getPublicProfile(row.owner_id);
        const ownerSummary = {
            id: ownerProfile.id,
            displayName: ownerProfile.displayName,
            avatarUrl: ownerProfile.avatarUrl,
            customStatus: ownerProfile.customStatus,
        };
        return {
            id: row.id,
            conversationId: row.conversation_id,
            name: row.name,
            description: row.description ?? undefined,
            gameId: row.game_id,
            gameTitle: row.game_title,
            ownerId: row.owner_id,
            owner: ownerSummary,
            settings: {
                visibility: row.visibility,
                invitePolicy: row.invite_policy,
                playerCapacity: Number(row.player_capacity),
            },
            memberCount: Number(row.member_count),
            createdAt: row.created_at_iso,
            updatedAt: row.updated_at_iso,
        };
    }
    async createRoom(actorId, sessionId, dto) {
        const gameRes = await this.pool.query(`SELECT id, title FROM games WHERE id = $1 AND title = $2`, [dto.gameId, dto.gameTitle]);
        if ((gameRes.rowCount ?? 0) === 0) {
            roomError(contracts_1.ErrorCode.INVALID_INPUT, 'Game ID and title mismatch or game not found');
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            const roomId = `room_${(0, node_crypto_1.randomUUID)()}`;
            const conversationId = `conv_${(0, node_crypto_1.randomUUID)()}`;
            const roomMemberId = `rm_${(0, node_crypto_1.randomUUID)()}`;
            const conversationMemberId = `cm_${(0, node_crypto_1.randomUUID)()}`;
            await client.query(`INSERT INTO conversations(id, kind, created_at, updated_at) VALUES ($1, 'ROOM', now(), now())`, [conversationId]);
            await client.query(`INSERT INTO rooms(id, name, description, game_id, owner_id, owner_role, visibility, invite_policy, player_capacity, conversation_id, conversation_kind, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'OWNER', $6, $7, $8, $9, 'ROOM', now(), now())`, [
                roomId,
                dto.name,
                dto.description ?? null,
                dto.gameId,
                actorId,
                dto.visibility ?? 'PUBLIC',
                dto.invitePolicy ?? 'OWNER_APPROVAL',
                dto.playerCapacity ?? 5,
                conversationId,
            ]);
            await client.query(`INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES ($1, $2, $3, 'OWNER', now())`, [roomMemberId, roomId, actorId]);
            await client.query(`INSERT INTO conversation_members(id, conversation_id, user_id, joined_at) VALUES ($1, $2, $3, now())`, [conversationMemberId, conversationId, actorId]);
            const roomDto = await this.buildRoomDto(client, roomId);
            await client.query('COMMIT');
            return roomDto;
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async listOwnRooms(actorId, sessionId, query) {
        const limit = query.limit ?? 50;
        let cursorClause = '';
        const params = [actorId];
        if (query.cursor) {
            const decoded = decodeCursor(query.cursor);
            cursorClause = `AND (r.created_at, r.id) < ($2::timestamp, $3)`;
            params.push(decoded.createdAt, decoded.id);
        }
        params.push(limit + 1);
        const limitParamIdx = params.length;
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            const res = await client.query(`SELECT r.id, r.name, r.description, r.game_id, r.owner_id, r.visibility, r.invite_policy, r.player_capacity, r.conversation_id,
                to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at_iso,
                to_char(r.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at_iso,
                g.title as game_title,
                (SELECT COUNT(*)::int FROM room_members rm2 WHERE rm2.room_id = r.id) as member_count
         FROM room_members rm
         JOIN rooms r ON rm.room_id = r.id
         JOIN games g ON r.game_id = g.id
         WHERE rm.user_id = $1 ${cursorClause}
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT $${limitParamIdx}
         FOR SHARE OF rm`, params);
            const hasMore = res.rows.length > limit;
            const rows = hasMore ? res.rows.slice(0, limit) : res.rows;
            const rawItems = await Promise.all(rows.map(async (row) => {
                const ownerProfile = await this.profilesService.getPublicProfile(row.owner_id);
                const ownerSummary = {
                    id: ownerProfile.id,
                    displayName: ownerProfile.displayName,
                    avatarUrl: ownerProfile.avatarUrl,
                    customStatus: ownerProfile.customStatus,
                };
                return {
                    id: row.id,
                    conversationId: row.conversation_id,
                    name: row.name,
                    description: row.description ?? undefined,
                    gameId: row.game_id,
                    gameTitle: row.game_title,
                    ownerId: row.owner_id,
                    owner: ownerSummary,
                    settings: {
                        visibility: row.visibility,
                        invitePolicy: row.invite_policy,
                        playerCapacity: Number(row.player_capacity),
                    },
                    memberCount: Number(row.member_count),
                    createdAt: row.created_at_iso,
                    updatedAt: row.updated_at_iso,
                };
            }));
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            const items = [];
            for (const item of rawItems) {
                const memCheck = await client.query(`SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 FOR SHARE`, [item.id, actorId]);
                if ((memCheck.rowCount ?? 0) > 0) {
                    items.push(item);
                }
            }
            await client.query('COMMIT');
            const nextCursor = hasMore && items.length > 0
                ? encodeCursor({ createdAt: items[items.length - 1].createdAt, id: items[items.length - 1].id })
                : null;
            return {
                items,
                nextCursor,
                hasMore,
            };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async getRoomDetail(actorId, sessionId, roomId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            const roomExists = (await client.query(`SELECT 1 FROM rooms WHERE id = $1 FOR SHARE`, [roomId])).rowCount ?? 0;
            if (roomExists === 0) {
                roomError(contracts_1.ErrorCode.NOT_FOUND, 'Room not found');
            }
            const checkRes = await client.query(`SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 FOR SHARE`, [roomId, actorId]);
            if ((checkRes.rowCount ?? 0) === 0) {
                roomError(contracts_1.ErrorCode.FORBIDDEN, 'User is not a member of this room');
            }
            const dto = await this.buildRoomDto(client, roomId);
            await client.query('COMMIT');
            return dto;
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async listRoomMembers(actorId, sessionId, roomId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            const roomRes = await client.query(`SELECT 1 FROM rooms WHERE id = $1 FOR SHARE`, [roomId]);
            if ((roomRes.rowCount ?? 0) === 0) {
                roomError(contracts_1.ErrorCode.NOT_FOUND, 'Room not found');
            }
            const checkRes = await client.query(`SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 FOR SHARE`, [roomId, actorId]);
            if ((checkRes.rowCount ?? 0) === 0) {
                roomError(contracts_1.ErrorCode.FORBIDDEN, 'User is not a member of this room');
            }
            const membersRes = await client.query(`SELECT rm.room_id, rm.user_id, rm.role,
                to_char(rm.joined_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as joined_at_iso,
                COALESCE(
                  JSON_AGG(pg.permission) FILTER (WHERE pg.permission IS NOT NULL),
                  '[]'
                ) as permissions
         FROM room_members rm
         LEFT JOIN permission_grants pg ON pg.room_id = rm.room_id AND pg.user_id = rm.user_id
         WHERE rm.room_id = $1
         GROUP BY rm.id, rm.room_id, rm.user_id, rm.role, rm.joined_at
         ORDER BY CASE rm.role WHEN 'OWNER' THEN 1 WHEN 'HELPER' THEN 2 ELSE 3 END, rm.joined_at ASC`, [roomId]);
            const result = await Promise.all(membersRes.rows.map(async (row) => {
                const userProfile = await this.profilesService.getPublicProfile(row.user_id);
                const userSummary = {
                    id: userProfile.id,
                    displayName: userProfile.displayName,
                    avatarUrl: userProfile.avatarUrl,
                    customStatus: userProfile.customStatus,
                };
                const perms = Array.isArray(row.permissions) ? row.permissions : [];
                return {
                    roomId: row.room_id,
                    userId: row.user_id,
                    user: userSummary,
                    role: row.role,
                    permissions: perms,
                    joinedAt: row.joined_at_iso,
                };
            }));
            await client.query('COMMIT');
            return result;
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async updateSettings(actorId, sessionId, roomId, dto) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const roomRes = await client.query(`SELECT * FROM rooms WHERE id = $1 FOR UPDATE`, [roomId]);
            if ((roomRes.rowCount ?? 0) === 0) {
                roomError(contracts_1.ErrorCode.NOT_FOUND, 'Room not found');
            }
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            const room = roomRes.rows[0];
            if (room.owner_id !== actorId) {
                roomError(contracts_1.ErrorCode.FORBIDDEN, 'Only room owner can update settings');
            }
            if (dto.visibility === 'PRIVATE' && room.visibility === 'PUBLIC') {
                await client.query(`UPDATE recruitments SET state = 'CLOSED', updated_at = now() WHERE room_id = $1 AND state = 'OPEN'`, [roomId]);
            }
            const newName = dto.name !== undefined ? dto.name : room.name;
            const newDesc = dto.description !== undefined ? dto.description : room.description;
            const newVis = dto.visibility !== undefined ? dto.visibility : room.visibility;
            const newPolicy = dto.invitePolicy !== undefined ? dto.invitePolicy : room.invite_policy;
            const newCap = dto.playerCapacity !== undefined ? dto.playerCapacity : room.player_capacity;
            await client.query(`UPDATE rooms SET name = $1, description = $2, visibility = $3, invite_policy = $4, player_capacity = $5, updated_at = now()
         WHERE id = $6`, [newName, newDesc, newVis, newPolicy, newCap, roomId]);
            const updatedDto = await this.buildRoomDto(client, roomId);
            await client.query('COMMIT');
            return updatedDto;
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async updateHelperPermissions(actorId, sessionId, roomId, targetUserId, dto) {
        const escalated = dto.permissions.filter((p) => p === 'OWNER_TRANSFER' || p === 'ROOM_DISSOLVE');
        if (escalated.length > 0) {
            roomError(contracts_1.ErrorCode.INVALID_INPUT, 'Helper role cannot be assigned owner-only permissions');
        }
        const uniquePermissions = Array.from(new Set(dto.permissions));
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const roomRes = await client.query(`SELECT owner_id FROM rooms WHERE id = $1 FOR UPDATE`, [roomId]);
            if ((roomRes.rowCount ?? 0) === 0) {
                roomError(contracts_1.ErrorCode.NOT_FOUND, 'Room not found');
            }
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            if (roomRes.rows[0].owner_id !== actorId) {
                roomError(contracts_1.ErrorCode.FORBIDDEN, 'Only room owner can update helper permissions');
            }
            const memberRes = await client.query(`SELECT role, to_char(joined_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as joined_at_iso FROM room_members WHERE room_id = $1 AND user_id = $2 FOR UPDATE`, [roomId, targetUserId]);
            if ((memberRes.rowCount ?? 0) === 0) {
                roomError(contracts_1.ErrorCode.NOT_FOUND, 'Target member not found in room');
            }
            const targetRole = memberRes.rows[0].role;
            if (targetUserId === actorId || targetRole === 'OWNER') {
                roomError(contracts_1.ErrorCode.FORBIDDEN, 'Cannot modify owner helper permissions');
            }
            await client.query(`DELETE FROM permission_grants WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
            if (uniquePermissions.length > 0) {
                await client.query(`UPDATE room_members SET role = 'HELPER' WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
                for (const perm of uniquePermissions) {
                    const grantId = `pg_${(0, node_crypto_1.randomUUID)()}`;
                    await client.query(`INSERT INTO permission_grants(id, room_id, user_id, grantee_role, permission, granted_by, granted_at)
             VALUES ($1, $2, $3, 'HELPER', $4, $5, now())`, [grantId, roomId, targetUserId, perm, actorId]);
                }
            }
            else {
                await client.query(`UPDATE room_members SET role = 'MEMBER' WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
            }
            const userProfile = await this.profilesService.getPublicProfile(targetUserId);
            const userSummary = {
                id: userProfile.id,
                displayName: userProfile.displayName,
                avatarUrl: userProfile.avatarUrl,
                customStatus: userProfile.customStatus,
            };
            const updatedRole = uniquePermissions.length > 0 ? 'HELPER' : 'MEMBER';
            const resultDto = {
                roomId,
                userId: targetUserId,
                user: userSummary,
                role: updatedRole,
                permissions: uniquePermissions,
                joinedAt: memberRes.rows[0].joined_at_iso,
            };
            await client.query('COMMIT');
            return resultDto;
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async transferOwner(actorId, sessionId, roomId, dto) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const roomRes = await client.query(`SELECT * FROM rooms WHERE id = $1 FOR UPDATE`, [roomId]);
            if ((roomRes.rowCount ?? 0) === 0) {
                roomError(contracts_1.ErrorCode.NOT_FOUND, 'Room not found');
            }
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            if (roomRes.rows[0].owner_id !== actorId) {
                roomError(contracts_1.ErrorCode.FORBIDDEN, 'Only room owner can transfer ownership');
            }
            if (dto.newOwnerId === actorId) {
                const currentDto = await this.buildRoomDto(client, roomId);
                await client.query('COMMIT');
                return currentDto;
            }
            const targetMemberRes = await client.query(`SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2 FOR UPDATE`, [roomId, dto.newOwnerId]);
            if ((targetMemberRes.rowCount ?? 0) === 0) {
                roomError(contracts_1.ErrorCode.FORBIDDEN, 'Owner cannot transfer ownership to non-member outsider');
            }
            await client.query(`DELETE FROM permission_grants WHERE room_id = $1 AND user_id = $2`, [roomId, actorId]);
            await client.query(`DELETE FROM permission_grants WHERE room_id = $1 AND user_id = $2`, [roomId, dto.newOwnerId]);
            await client.query(`UPDATE room_members SET role = 'MEMBER' WHERE room_id = $1 AND user_id = $2`, [roomId, actorId]);
            await client.query(`UPDATE room_members SET role = 'OWNER' WHERE room_id = $1 AND user_id = $2`, [roomId, dto.newOwnerId]);
            await client.query(`UPDATE rooms SET owner_id = $1, owner_role = 'OWNER', updated_at = now() WHERE id = $2`, [dto.newOwnerId, roomId]);
            const updatedDto = await this.buildRoomDto(client, roomId);
            await client.query('COMMIT');
            return updatedDto;
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async leaveOrRemoveMember(actorId, sessionId, roomId, targetUserId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const roomRes = await client.query(`SELECT conversation_id, owner_id FROM rooms WHERE id = $1 FOR UPDATE`, [roomId]);
            if ((roomRes.rowCount ?? 0) === 0) {
                roomError(contracts_1.ErrorCode.NOT_FOUND, 'Room not found');
            }
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            const room = roomRes.rows[0];
            const targetRes = await client.query(`SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2 FOR UPDATE`, [roomId, targetUserId]);
            if ((targetRes.rowCount ?? 0) === 0) {
                roomError(contracts_1.ErrorCode.NOT_FOUND, 'Target user is not a member of this room');
            }
            const targetRole = targetRes.rows[0].role;
            if (actorId === targetUserId) {
                if (targetRole === 'OWNER') {
                    const countRes = await client.query(`SELECT COUNT(*)::int as count FROM room_members WHERE room_id = $1`, [roomId]);
                    const totalMembers = Number(countRes.rows[0].count);
                    if (totalMembers > 1) {
                        roomError(contracts_1.ErrorCode.FORBIDDEN, 'Owner with other members must transfer or dissolve before leave');
                    }
                    await client.query(`DELETE FROM rooms WHERE id = $1`, [roomId]);
                    await client.query(`DELETE FROM conversations WHERE id = $1`, [room.conversation_id]);
                    await client.query('COMMIT');
                    await this.callRevoker?.();
                    return { success: true };
                }
                await client.query(`DELETE FROM permission_grants WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
                await client.query(`DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
                await client.query(`DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, [room.conversation_id, targetUserId]);
                await client.query('COMMIT');
                await this.callRevoker?.();
                return { success: true };
            }
            if (targetRole === 'OWNER') {
                roomError(contracts_1.ErrorCode.FORBIDDEN, 'Cannot remove room owner');
            }
            const actorRes = await client.query(`SELECT rm.role, COALESCE(JSON_AGG(pg.permission) FILTER (WHERE pg.permission IS NOT NULL), '[]') as permissions
         FROM room_members rm
         LEFT JOIN permission_grants pg ON pg.room_id = rm.room_id AND pg.user_id = rm.user_id
         WHERE rm.room_id = $1 AND rm.user_id = $2
         GROUP BY rm.role`, [roomId, actorId]);
            if ((actorRes.rowCount ?? 0) === 0) {
                roomError(contracts_1.ErrorCode.FORBIDDEN, 'Requesting user is not a member of this room');
            }
            const actorRole = actorRes.rows[0].role;
            const actorPerms = Array.isArray(actorRes.rows[0].permissions) ? actorRes.rows[0].permissions : [];
            if (actorRole === 'MEMBER') {
                roomError(contracts_1.ErrorCode.FORBIDDEN, 'Regular members cannot remove other members');
            }
            if (actorRole === 'HELPER') {
                if (!actorPerms.includes('MANAGE_MEMBERS')) {
                    roomError(contracts_1.ErrorCode.FORBIDDEN, 'Helper lacks MANAGE_MEMBERS permission');
                }
                if (targetRole === 'HELPER' || targetRole === 'OWNER') {
                    roomError(contracts_1.ErrorCode.FORBIDDEN, 'Helper cannot remove another helper or owner');
                }
            }
            await client.query(`DELETE FROM permission_grants WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
            await client.query(`DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
            await client.query(`DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, [room.conversation_id, targetUserId]);
            await client.query('COMMIT');
            await this.callRevoker?.();
            return { success: true };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async dissolveRoom(actorId, sessionId, roomId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const roomRes = await client.query(`SELECT conversation_id, owner_id FROM rooms WHERE id = $1 FOR UPDATE`, [roomId]);
            if ((roomRes.rowCount ?? 0) === 0) {
                roomError(contracts_1.ErrorCode.NOT_FOUND, 'Room not found');
            }
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            const room = roomRes.rows[0];
            if (room.owner_id !== actorId) {
                roomError(contracts_1.ErrorCode.FORBIDDEN, 'Only room owner can dissolve room');
            }
            await client.query(`DELETE FROM rooms WHERE id = $1`, [roomId]);
            await client.query(`DELETE FROM conversations WHERE id = $1`, [room.conversation_id]);
            await client.query('COMMIT');
            await this.callRevoker?.();
            return { success: true };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
};
exports.RoomsService = RoomsService;
exports.RoomsService = RoomsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [profiles_service_js_1.ProfilesService])
], RoomsService);
//# sourceMappingURL=rooms.service.js.map