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
exports.SocialService = void 0;
exports.socialError = socialError;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("@fg/contracts");
const profiles_service_js_1 = require("../profiles/profiles.service.js");
const chat_service_js_1 = require("../chat/chat.service.js");
function socialError(code, message) {
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
            socialError(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid pagination cursor format');
        }
        const dateCheck = contracts_1.IsoDateTimeSchema.safeParse(parsed.createdAt);
        if (!dateCheck.success) {
            socialError(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid pagination cursor ISO timestamp');
        }
        return parsed;
    }
    catch (err) {
        if (err instanceof common_1.HttpException)
            throw err;
        socialError(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid pagination cursor format');
    }
}
let SocialService = class SocialService {
    profilesService;
    pool;
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
    async userExists(userId, db = this.pool) {
        const res = await db.query('SELECT 1 FROM "user" WHERE id = $1', [userId]);
        return (res.rowCount ?? 0) > 0;
    }
    async checkActorSessionAndBan(client, actorId, sessionId) {
        const sessionRes = await client.query(`SELECT id FROM "session" WHERE id = $1 AND user_id = $2 AND expires_at > clock_timestamp() FOR SHARE`, [sessionId, actorId]);
        if ((sessionRes.rowCount ?? 0) === 0) {
            socialError(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked');
        }
        const banRes = await client.query(`SELECT action FROM admin_actions WHERE target_user_id = $1 AND action IN ('BAN', 'UNBAN') ORDER BY created_at DESC, id DESC LIMIT 1`, [actorId]);
        if (banRes.rows[0]?.action === 'BAN') {
            socialError(contracts_1.ErrorCode.FORBIDDEN, 'Account is banned');
        }
    }
    async getUserSummary(userId) {
        const profile = await this.profilesService.getPublicProfile(userId);
        return contracts_1.UserSummarySchema.parse({
            id: profile.id,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl ?? null,
            customStatus: profile.customStatus,
        });
    }
    async getFriends(userId, query) {
        const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 50);
        const cursor = query.cursor ? decodeCursor(query.cursor) : null;
        let sql = `
      SELECT f.*, to_char(f.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso
      FROM friendships f
      WHERE (f.user1_id = $1 OR f.user2_id = $1)
    `;
        const params = [userId, limit + 1];
        if (cursor) {
            sql += ` AND (f.created_at, f.id) < ($3::timestamp, $4::text)`;
            params.push(cursor.createdAt, cursor.id);
        }
        sql += ` ORDER BY f.created_at DESC, f.id DESC LIMIT $2`;
        const res = await this.pool.query(sql, params);
        const hasMore = res.rows.length > limit;
        const selected = res.rows.slice(0, limit);
        const items = await Promise.all(selected.map(async (row) => {
            const peerId = row.user1_id === userId ? row.user2_id : row.user1_id;
            return this.profilesService.getPublicProfile(peerId);
        }));
        const last = selected.at(-1);
        const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.created_iso, id: last.id }) : null;
        return { items, hasMore, nextCursor };
    }
    async getFriendRequests(userId, query) {
        const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 50);
        const direction = query.direction ?? 'INCOMING';
        const cursor = query.cursor ? decodeCursor(query.cursor) : null;
        let sql = `
      SELECT fr.*,
        to_char(fr.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso,
        to_char(fr.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_iso
      FROM friend_requests fr
      WHERE fr.status = 'PENDING'
    `;
        const params = [userId, limit + 1];
        if (direction === 'INCOMING') {
            sql += ` AND fr.receiver_id = $1`;
        }
        else {
            sql += ` AND fr.sender_id = $1`;
        }
        if (cursor) {
            sql += ` AND (fr.created_at, fr.id) < ($3::timestamp, $4::text)`;
            params.push(cursor.createdAt, cursor.id);
        }
        sql += ` ORDER BY fr.created_at DESC, fr.id DESC LIMIT $2`;
        const res = await this.pool.query(sql, params);
        const hasMore = res.rows.length > limit;
        const selected = res.rows.slice(0, limit);
        const items = await Promise.all(selected.map(async (row) => {
            const [sender, receiver] = await Promise.all([
                this.getUserSummary(row.sender_id),
                this.getUserSummary(row.receiver_id),
            ]);
            return contracts_1.PendingFriendRequestSchema.parse({
                requestId: row.id,
                sender,
                receiver,
                status: 'PENDING',
                createdAt: row.created_iso,
                updatedAt: row.updated_iso,
            });
        }));
        const last = selected.at(-1);
        const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.created_iso, id: last.id }) : null;
        return { items, hasMore, nextCursor };
    }
    async sendFriendRequest(actorId, sessionId, targetUserId) {
        if (actorId === targetUserId) {
            socialError(contracts_1.ErrorCode.INVALID_INPUT, 'Cannot send friend request to self');
        }
        if (!(await this.userExists(targetUserId))) {
            socialError(contracts_1.ErrorCode.NOT_FOUND, `User not found: ${targetUserId}`);
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await (0, chat_service_js_1.lockSocialPair)(client, actorId, targetUserId);
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            const blockRes = await client.query(`SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`, [actorId, targetUserId]);
            if ((blockRes.rowCount ?? 0) > 0) {
                socialError(contracts_1.ErrorCode.FORBIDDEN, 'Interaction blocked between users');
            }
            const friendRes = await client.query(`SELECT 1 FROM friendships WHERE user1_id = LEAST($1::text, $2::text) AND user2_id = GREATEST($1::text, $2::text) LIMIT 1`, [actorId, targetUserId]);
            if ((friendRes.rowCount ?? 0) > 0) {
                socialError(contracts_1.ErrorCode.INVALID_INPUT, 'Already friends');
            }
            const oppRes = await client.query(`SELECT id FROM friend_requests WHERE sender_id = $2 AND receiver_id = $1 AND status = 'PENDING' FOR UPDATE`, [actorId, targetUserId]);
            if ((oppRes.rowCount ?? 0) > 0) {
                socialError(contracts_1.ErrorCode.INVALID_INPUT, 'Pending friend request from opposite user exists');
            }
            const ownRes = await client.query(`SELECT id, status FROM friend_requests WHERE sender_id = $1 AND receiver_id = $2 FOR UPDATE`, [actorId, targetUserId]);
            const ownRow = ownRes.rows[0];
            if (ownRow) {
                if (ownRow.status === 'PENDING') {
                    await client.query('COMMIT');
                    return { requestId: ownRow.id, status: 'PENDING' };
                }
                const freshId = (0, node_crypto_1.randomUUID)();
                await client.query(`UPDATE friend_requests SET id = $1, status = 'PENDING', created_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = $2`, [freshId, ownRow.id]);
                await client.query('COMMIT');
                return { requestId: freshId, status: 'PENDING' };
            }
            const newId = (0, node_crypto_1.randomUUID)();
            await client.query(`INSERT INTO friend_requests(id, sender_id, receiver_id, status, created_at, updated_at) VALUES($1, $2, $3, 'PENDING', clock_timestamp(), clock_timestamp())`, [newId, actorId, targetUserId]);
            await client.query('COMMIT');
            return { requestId: newId, status: 'PENDING' };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async respondFriendRequest(actorId, sessionId, requestId, action) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const peekRow = (await client.query(`SELECT id, sender_id, receiver_id, status FROM friend_requests WHERE id = $1`, [requestId])).rows[0];
            if (!peekRow) {
                socialError(contracts_1.ErrorCode.NOT_FOUND, 'Friend request not found');
            }
            if (peekRow.receiver_id !== actorId) {
                socialError(contracts_1.ErrorCode.FORBIDDEN, 'Only receiver can respond to friend request');
            }
            await (0, chat_service_js_1.lockSocialPair)(client, peekRow.sender_id, peekRow.receiver_id);
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            const reqRow = (await client.query(`SELECT id, sender_id, receiver_id, status FROM friend_requests WHERE id = $1 FOR UPDATE`, [requestId])).rows[0];
            if (!reqRow) {
                socialError(contracts_1.ErrorCode.NOT_FOUND, 'Friend request not found');
            }
            if (reqRow.receiver_id !== actorId) {
                socialError(contracts_1.ErrorCode.FORBIDDEN, 'Only receiver can respond to friend request');
            }
            if (action === 'ACCEPT') {
                if (reqRow.status === 'ACCEPTED') {
                    const friendRes = await client.query(`SELECT 1 FROM friendships WHERE user1_id = LEAST($1::text, $2::text) AND user2_id = GREATEST($1::text, $2::text) LIMIT 1`, [reqRow.sender_id, reqRow.receiver_id]);
                    if ((friendRes.rowCount ?? 0) > 0) {
                        await client.query('COMMIT');
                        return { success: true };
                    }
                    socialError(contracts_1.ErrorCode.INVALID_INPUT, 'Friend request already processed');
                }
                if (reqRow.status !== 'PENDING') {
                    socialError(contracts_1.ErrorCode.INVALID_INPUT, 'Friend request already processed');
                }
                const blockRes = await client.query(`SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`, [reqRow.sender_id, reqRow.receiver_id]);
                if ((blockRes.rowCount ?? 0) > 0) {
                    socialError(contracts_1.ErrorCode.FORBIDDEN, 'Interaction blocked between users');
                }
                await client.query(`INSERT INTO friendships(id, user1_id, user2_id, created_at) VALUES($1, LEAST($2::text, $3::text), GREATEST($2::text, $3::text), clock_timestamp()) ON CONFLICT DO NOTHING`, [(0, node_crypto_1.randomUUID)(), reqRow.sender_id, reqRow.receiver_id]);
                await client.query(`UPDATE friend_requests SET status = 'ACCEPTED', updated_at = clock_timestamp() WHERE id = $1`, [requestId]);
            }
            else {
                if (reqRow.status === 'REJECTED') {
                    await client.query('COMMIT');
                    return { success: true };
                }
                if (reqRow.status !== 'PENDING') {
                    socialError(contracts_1.ErrorCode.INVALID_INPUT, 'Friend request already processed');
                }
                await client.query(`UPDATE friend_requests SET status = 'REJECTED', updated_at = clock_timestamp() WHERE id = $1`, [requestId]);
            }
            await client.query('COMMIT');
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
    async removeFriend(actorId, sessionId, targetUserId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await (0, chat_service_js_1.lockSocialPair)(client, actorId, targetUserId);
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            await client.query(`DELETE FROM friendships WHERE user1_id = LEAST($1::text, $2::text) AND user2_id = GREATEST($1::text, $2::text)`, [actorId, targetUserId]);
            await client.query('COMMIT');
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
    async cancelFriendRequest(actorId, sessionId, requestId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const peekRow = (await client.query(`SELECT id, sender_id, receiver_id, status FROM friend_requests WHERE id = $1`, [requestId])).rows[0];
            if (!peekRow) {
                socialError(contracts_1.ErrorCode.NOT_FOUND, 'Friend request not found');
            }
            if (peekRow.sender_id !== actorId) {
                socialError(contracts_1.ErrorCode.FORBIDDEN, 'Only sender can cancel friend request');
            }
            await (0, chat_service_js_1.lockSocialPair)(client, peekRow.sender_id, peekRow.receiver_id);
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            const reqRow = (await client.query(`SELECT id, sender_id, receiver_id, status FROM friend_requests WHERE id = $1 FOR UPDATE`, [requestId])).rows[0];
            if (!reqRow) {
                socialError(contracts_1.ErrorCode.NOT_FOUND, 'Friend request not found');
            }
            if (reqRow.sender_id !== actorId) {
                socialError(contracts_1.ErrorCode.FORBIDDEN, 'Only sender can cancel friend request');
            }
            if (reqRow.status === 'CANCELLED') {
                await client.query('COMMIT');
                return { success: true };
            }
            if (reqRow.status !== 'PENDING') {
                socialError(contracts_1.ErrorCode.INVALID_INPUT, 'Friend request already processed');
            }
            await client.query(`UPDATE friend_requests SET status = 'CANCELLED', updated_at = clock_timestamp() WHERE id = $1`, [requestId]);
            await client.query('COMMIT');
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
    async getDirectConversations(actorId, query) {
        const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 50);
        const cursor = query.cursor ? decodeCursor(query.cursor) : null;
        let sql = `
      SELECT c.*, to_char(c.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_iso
      FROM conversations c
      WHERE c.kind = 'DM' AND (c.user1_id = $1 OR c.user2_id = $1)
    `;
        const params = [actorId, limit + 1];
        if (cursor) {
            sql += ` AND (c.updated_at, c.id) < ($3::timestamp, $4::text)`;
            params.push(cursor.createdAt, cursor.id);
        }
        sql += ` ORDER BY c.updated_at DESC, c.id DESC LIMIT $2`;
        const res = await this.pool.query(sql, params);
        const hasMore = res.rows.length > limit;
        const selected = res.rows.slice(0, limit);
        const items = await Promise.all(selected.map(async (conv) => {
            const peerId = conv.user1_id === actorId ? conv.user2_id : conv.user1_id;
            const peer = await this.profilesService.getPublicProfile(peerId);
            return { conversationId: conv.id, peer };
        }));
        const last = selected.at(-1);
        const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.updated_iso, id: last.id }) : null;
        return { items, hasMore, nextCursor };
    }
    async createDirectConversation(actorId, sessionId, recipientUserId) {
        if (actorId === recipientUserId) {
            socialError(contracts_1.ErrorCode.INVALID_INPUT, 'Cannot create DM with self');
        }
        if (!(await this.userExists(recipientUserId))) {
            socialError(contracts_1.ErrorCode.NOT_FOUND, `User not found: ${recipientUserId}`);
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await (0, chat_service_js_1.lockSocialPair)(client, actorId, recipientUserId);
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            const blockRes = await client.query(`SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`, [actorId, recipientUserId]);
            if ((blockRes.rowCount ?? 0) > 0) {
                socialError(contracts_1.ErrorCode.FORBIDDEN, 'Interaction blocked between users');
            }
            const existingConv = (await client.query(`SELECT id FROM conversations WHERE kind = 'DM' AND user1_id = LEAST($1::text, $2::text) AND user2_id = GREATEST($1::text, $2::text) FOR SHARE`, [actorId, recipientUserId])).rows[0];
            if (existingConv) {
                await client.query('COMMIT');
                return { conversationId: existingConv.id };
            }
            const convId = (0, node_crypto_1.randomUUID)();
            await client.query(`INSERT INTO conversations(id, kind, user1_id, user2_id, created_at, updated_at) VALUES($1, 'DM', LEAST($2::text, $3::text), GREATEST($2::text, $3::text), clock_timestamp(), clock_timestamp())`, [convId, actorId, recipientUserId]);
            await client.query(`INSERT INTO conversation_members(id, conversation_id, user_id, joined_at) VALUES ($1, $2, LEAST($3::text, $4::text), clock_timestamp()), ($5, $2, GREATEST($3::text, $4::text), clock_timestamp())`, [(0, node_crypto_1.randomUUID)(), convId, actorId, recipientUserId, (0, node_crypto_1.randomUUID)()]);
            await client.query('COMMIT');
            return { conversationId: convId };
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async getBlocks(actorId) {
        const res = await this.pool.query(`SELECT b.*, to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM blocks b WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`, [actorId]);
        const items = await Promise.all(res.rows.map(async (row) => {
            const blockedUser = await this.getUserSummary(row.blocked_id);
            return contracts_1.BlockSchema.parse({
                id: row.id,
                blockerId: row.blocker_id,
                blockedId: row.blocked_id,
                blockedUser,
                createdAt: row.created_iso,
            });
        }));
        return items;
    }
    async createBlock(actorId, sessionId, blockedId) {
        if (actorId === blockedId) {
            socialError(contracts_1.ErrorCode.INVALID_INPUT, 'Cannot block self');
        }
        if (!(await this.userExists(blockedId))) {
            socialError(contracts_1.ErrorCode.NOT_FOUND, `User not found: ${blockedId}`);
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await (0, chat_service_js_1.lockSocialPair)(client, actorId, blockedId);
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            const existingBlock = (await client.query(`SELECT b.id, b.blocker_id, b.blocked_id, to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM blocks b WHERE blocker_id = $1 AND blocked_id = $2 FOR SHARE`, [actorId, blockedId])).rows[0];
            if (existingBlock) {
                await client.query('COMMIT');
                const blockedUser = await this.getUserSummary(blockedId);
                return contracts_1.BlockSchema.parse({
                    id: existingBlock.id,
                    blockerId: actorId,
                    blockedId,
                    blockedUser,
                    createdAt: existingBlock.created_iso,
                });
            }
            const blockId = (0, node_crypto_1.randomUUID)();
            const insertRes = await client.query(`INSERT INTO blocks(id, blocker_id, blocked_id, created_at) VALUES($1, $2, $3, clock_timestamp()) RETURNING to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso`, [blockId, actorId, blockedId]);
            const createdIso = insertRes.rows[0].created_iso;
            await client.query('COMMIT');
            const blockedUser = await this.getUserSummary(blockedId);
            return contracts_1.BlockSchema.parse({
                id: blockId,
                blockerId: actorId,
                blockedId,
                blockedUser,
                createdAt: createdIso,
            });
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async deleteBlock(actorId, sessionId, targetUserId) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await (0, chat_service_js_1.lockSocialPair)(client, actorId, targetUserId);
            await this.checkActorSessionAndBan(client, actorId, sessionId);
            await client.query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [actorId, targetUserId]);
            await client.query('COMMIT');
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
exports.SocialService = SocialService;
exports.SocialService = SocialService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [profiles_service_js_1.ProfilesService])
], SocialService);
//# sourceMappingURL=social.service.js.map