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
var PresenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PresenceService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const ioredis_1 = require("ioredis");
const node_crypto_1 = require("node:crypto");
const lease_script_js_1 = require("./lease-script.js");
const contracts_1 = require("@fg/contracts");
const chat_service_js_1 = require("../chat/chat.service.js");
let PresenceService = PresenceService_1 = class PresenceService {
    chatService;
    pool;
    redis;
    clockFn = () => Date.now();
    logger = new common_1.Logger(PresenceService_1.name);
    lobbyGameIdCache = new Map();
    sweepTimer;
    sweeping;
    closing = false;
    pubsubCallback;
    constructor(chatService) {
        this.chatService = chatService;
    }
    setClock(fn) {
        this.clockFn = fn ?? (() => Date.now());
    }
    get nowMs() {
        return this.clockFn();
    }
    get ns() { return this.namespace; }
    namespace = '';
    component(id) { return Buffer.from(id).toString('base64url'); }
    setPubsubCallback(cb) {
        this.pubsubCallback = cb;
    }
    onModuleInit() {
        const database = new URL(process.env.DATABASE_URL);
        this.namespace = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify([database.host, database.pathname, database.searchParams.get('options') ?? ''])).digest('hex').slice(0, 16);
        this.pool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL,
            max: 8,
            connectionTimeoutMillis: 5000,
            statement_timeout: 10000,
        });
        const redisUrl = process.env.REDIS_URL;
        if (redisUrl) {
            this.redis = new ioredis_1.Redis(redisUrl, {
                lazyConnect: true,
                maxRetriesPerRequest: 1,
                connectTimeout: 3000,
            });
            this.redis.on('error', () => this.logger.warn('Redis presence unavailable'));
        }
        this.sweepTimer = setInterval(() => {
            void this.sweepExpiredLeases().catch(() => this.logger.warn('Presence sweep unavailable'));
        }, 5000);
        this.sweepTimer.unref();
    }
    async onModuleDestroy() {
        this.closing = true;
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
        }
        await this.sweeping?.catch(() => this.logger.warn('Presence sweep failed during shutdown'));
        if (this.redis) {
            await this.redis.quit().catch(() => { });
        }
        if (this.pool) {
            await this.pool.end().catch(() => { });
        }
    }
    async getRedis() {
        if (!this.redis) {
            throw new Error('Redis URL not configured');
        }
        if (this.redis.status === 'wait' || this.redis.status === 'close') {
            await this.redis.connect();
        }
        return this.redis;
    }
    async getGameIdForLobby(convId) {
        if (this.lobbyGameIdCache.has(convId)) {
            return this.lobbyGameIdCache.get(convId);
        }
        const row = (await this.pool.query(`SELECT g.id as game_id
         FROM conversations c
         JOIN lobbies l ON l.id = c.lobby_id
         JOIN games g ON g.id = l.game_id
         WHERE c.id = $1 AND g.title = ANY($2::text[])`, [convId, [...contracts_1.ALLOWED_GAMES]])).rows[0];
        if (row?.game_id) {
            this.lobbyGameIdCache.set(convId, row.game_id);
            return row.game_id;
        }
        return null;
    }
    async transition(convId, userId, socketId, mode, sessionId = '') {
        const gameId = await this.getGameIdForLobby(convId);
        const redis = await this.getRedis();
        const now = this.nowMs;
        const prefix = 'fg:presence:' + this.ns + ':';
        const result = await redis.eval(lease_script_js_1.LEASE_SCRIPT, 6, prefix + 'leases:' + this.component(convId) + ':' + this.component(userId), prefix + 'active:' + this.component(convId), prefix + 'active_convs', prefix + 'user_convs:' + this.component(userId), prefix + 'game_active:' + this.component(gameId ?? 'private-unused'), prefix + 'actors:' + this.component(convId) + ':' + this.component(userId), now, mode, userId, convId, socketId, now + contracts_1.PRESENCE_TTL_MS, gameId ? '1' : '0', sessionId);
        return { isOnline: result[0] === 1, stateChanged: result[1] === 1 };
    }
    async addOrRenewLease(convId, userId, socketId, actor) {
        return this.transition(convId, userId, socketId, 'renew', actor?.sessionId);
    }
    async removeLease(convId, userId, socketId) {
        return this.transition(convId, userId, socketId, 'remove');
    }
    sweepExpiredLeases() {
        if (this.closing)
            return Promise.resolve();
        if (this.sweeping)
            return this.sweeping;
        const sweep = this.performSweep();
        this.sweeping = sweep;
        void sweep.then(() => { this.sweeping = undefined; }, () => { this.sweeping = undefined; });
        return sweep;
    }
    async pruneAuthorization(convId, userId) {
        const redis = await this.getRedis();
        const actors = await redis.hgetall('fg:presence:' + this.ns + ':actors:' + this.component(convId) + ':' + this.component(userId));
        for (const [socketId, sessionId] of Object.entries(actors)) {
            try {
                await this.chatService.authorize(convId, { userId, sessionId });
            }
            catch (error) {
                if (!(error instanceof common_1.HttpException) || ![401, 403, 404].includes(error.getStatus()))
                    throw error;
                const result = await this.removeLease(convId, userId, socketId);
                if (result.stateChanged && this.pubsubCallback) {
                    await this.pubsubCallback({ conversationId: convId, userId, isOnline: result.isOnline });
                }
            }
        }
    }
    async performSweep() {
        if (!this.redis)
            return;
        const redis = await this.getRedis();
        const prefix = 'fg:presence:' + this.ns + ':';
        const convIds = await redis.smembers(prefix + 'active_convs');
        for (const convId of convIds) {
            const users = await redis.zrange(prefix + 'active:' + this.component(convId), '0', '-1');
            for (const userId of users) {
                await this.pruneAuthorization(convId, userId);
                const result = await this.transition(convId, userId, '', 'expire');
                if (result.stateChanged && this.pubsubCallback) {
                    await this.pubsubCallback({ conversationId: convId, userId, isOnline: result.isOnline });
                }
            }
        }
    }
    async isUserOnlineInConv(convId, userId) {
        await this.pruneAuthorization(convId, userId);
        const redis = await this.getRedis();
        const now = this.nowMs;
        const scoreStr = await redis.zscore(`fg:presence:${this.ns}:active:${this.component(convId)}`, userId);
        return scoreStr !== null && Number(scoreStr) > now;
    }
    async isUserOnlineAnywhere(userId) {
        const conversations = await this.getUserActiveConversations(userId);
        for (const conversationId of conversations) {
            if (await this.isUserOnlineInConv(conversationId, userId))
                return true;
        }
        return false;
    }
    async getUserActiveConversations(userId) {
        const redis = await this.getRedis();
        const key = `fg:presence:${this.ns}:user_convs:${this.component(userId)}`;
        return redis.smembers(key);
    }
    async getOnlineUserIdsForGame(gameId) {
        const conversations = (await this.pool.query("SELECT c.id FROM conversations c JOIN lobbies l ON l.id=c.lobby_id WHERE l.game_id=$1 AND c.kind='LOBBY'", [gameId])).rows;
        const redis = await this.getRedis();
        for (const { id } of conversations) {
            const users = await redis.zrange('fg:presence:' + this.ns + ':active:' + this.component(id), '0', '-1');
            for (const userId of users)
                await this.pruneAuthorization(id, userId);
        }
        const now = this.nowMs;
        const gameKey = `fg:presence:${this.ns}:game_active:${this.component(gameId)}`;
        await redis.zremrangebyscore(gameKey, '-inf', String(now));
        return redis.zrangebyscore(gameKey, String(now + 1), '+inf');
    }
    async getOnlineUsersForGame(gameId, query) {
        const limit = Math.min(Math.max(query.limit ?? 50, 1), 50);
        const cursor = query.cursor;
        const game = (await this.pool.query('SELECT id FROM games WHERE id=$1 AND title=ANY($2::text[])', [gameId, [...contracts_1.ALLOWED_GAMES]])).rows[0];
        if (!game) {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Game not found');
        }
        const onlineUserIds = await this.getOnlineUserIdsForGame(gameId);
        if (!onlineUserIds.length) {
            return { items: [], hasMore: false, nextCursor: null };
        }
        let sql = `
      SELECT p.user_id, p.display_name, p.avatar_url, p.bio, p.custom_status,
             to_char(p.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_iso,
             u.image, u.name
      FROM profiles p
      JOIN "user" u ON u.id = p.user_id
      WHERE p.user_id = ANY($1::text[])
    `;
        const params = [onlineUserIds];
        if (cursor) {
            sql += ` AND p.user_id > $2`;
            params.push(cursor);
        }
        sql += ` ORDER BY p.user_id ASC LIMIT $${params.length + 1}`;
        params.push(limit + 1);
        const rows = (await this.pool.query(sql, params)).rows;
        const hasMore = rows.length > limit;
        const selected = rows.slice(0, limit);
        const last = selected.at(-1);
        const items = await Promise.all(selected.map(async (row) => {
            const gameProfs = (await this.pool.query(`SELECT gp.game_id, g.title as game_title, gp.in_game_name, gp.rank, gp.role, gp.play_hours, gp.play_style
             FROM game_profiles gp
             JOIN games g ON g.id = gp.game_id
             WHERE gp.user_id = $1`, [row.user_id])).rows.map((gp) => ({
                gameId: gp.game_id,
                gameTitle: gp.game_title,
                inGameName: gp.in_game_name ?? undefined,
                rank: gp.rank ?? undefined,
                role: gp.role ?? undefined,
                playHours: gp.play_hours ? Number(gp.play_hours) : undefined,
                playStyle: gp.play_style ?? undefined,
            }));
            return contracts_1.PublicProfileSchema.parse({
                id: row.user_id,
                displayName: row.display_name ?? row.name,
                avatarUrl: row.avatar_url ?? row.image ?? null,
                bio: row.bio ?? null,
                customStatus: row.custom_status ?? 'JUST_CHATTING',
                gameProfiles: gameProfs,
                createdAt: row.created_iso,
            });
        }));
        return {
            items,
            hasMore,
            nextCursor: hasMore && last ? last.user_id : null,
        };
    }
    async getOnlineUsersAll(query) {
        if (query.gameTitle) {
            const game = (await this.pool.query('SELECT id FROM games WHERE title=$1', [query.gameTitle])).rows[0];
            if (!game) {
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'Game title not found');
            }
            return this.getOnlineUsersForGame(game.id, query);
        }
        const limit = Math.min(Math.max(query.limit ?? 50, 1), 50);
        const approvedGames = (await this.pool.query('SELECT id FROM games WHERE title=ANY($1::text[])', [[...contracts_1.ALLOWED_GAMES]])).rows;
        const allUserIdsSet = new Set();
        for (const game of approvedGames) {
            for (const id of await this.getOnlineUserIdsForGame(game.id))
                allUserIdsSet.add(id);
        }
        const onlineUserIds = Array.from(allUserIdsSet);
        if (!onlineUserIds.length) {
            return { items: [], hasMore: false, nextCursor: null };
        }
        let sql = `
      SELECT p.user_id, p.display_name, p.avatar_url, p.bio, p.custom_status,
             to_char(p.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_iso,
             u.image, u.name
      FROM profiles p
      JOIN "user" u ON u.id = p.user_id
      WHERE p.user_id = ANY($1::text[])
    `;
        const params = [onlineUserIds];
        sql += ` ORDER BY p.user_id ASC LIMIT $${params.length + 1}`;
        params.push(limit + 1);
        const rows = (await this.pool.query(sql, params)).rows;
        const hasMore = rows.length > limit;
        const selected = rows.slice(0, limit);
        const last = selected.at(-1);
        const items = await Promise.all(selected.map(async (row) => {
            const gameProfs = (await this.pool.query(`SELECT gp.game_id, g.title as game_title, gp.in_game_name, gp.rank, gp.role, gp.play_hours, gp.play_style
             FROM game_profiles gp
             JOIN games g ON g.id = gp.game_id
             WHERE gp.user_id = $1`, [row.user_id])).rows.map((gp) => ({
                gameId: gp.game_id,
                gameTitle: gp.game_title,
                inGameName: gp.in_game_name ?? undefined,
                rank: gp.rank ?? undefined,
                role: gp.role ?? undefined,
                playHours: gp.play_hours ? Number(gp.play_hours) : undefined,
                playStyle: gp.play_style ?? undefined,
            }));
            return contracts_1.PublicProfileSchema.parse({
                id: row.user_id,
                displayName: row.display_name ?? row.name,
                avatarUrl: row.avatar_url ?? row.image ?? null,
                bio: row.bio ?? null,
                customStatus: row.custom_status ?? 'JUST_CHATTING',
                gameProfiles: gameProfs,
                createdAt: row.created_iso,
            });
        }));
        return {
            items,
            hasMore,
            nextCursor: hasMore && last ? last.user_id : null,
        };
    }
    async getCustomStatus(userId) {
        const row = (await this.pool.query('SELECT custom_status FROM profiles WHERE user_id=$1', [userId])).rows[0];
        if (!row) {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'User profile not found');
        }
        const parsed = contracts_1.CustomStatusSchema.safeParse(row.custom_status);
        if (!parsed.success) {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid stored custom status');
        }
        return parsed.data;
    }
    async updateCustomStatus(actor, customStatusInput) {
        if (!actor) {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.LOGIN_REQUIRED, 'Login required');
        }
        const parsedStatus = contracts_1.CustomStatusSchema.safeParse(customStatusInput);
        if (!parsedStatus.success) {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid custom status');
        }
        const customStatus = parsedStatus.data;
        const saved = await this.pool.query('UPDATE profiles SET custom_status=$1, updated_at=now() WHERE user_id=$2', [customStatus, actor.userId]);
        if (!saved.rowCount)
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.NOT_FOUND, 'User profile not found');
        const isOnline = await this.isUserOnlineAnywhere(actor.userId);
        return { customStatus, isOnline };
    }
};
exports.PresenceService = PresenceService;
exports.PresenceService = PresenceService = PresenceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [chat_service_js_1.ChatService])
], PresenceService);
//# sourceMappingURL=presence.service.js.map