import { Injectable, OnModuleDestroy, OnModuleInit, Logger, HttpException } from '@nestjs/common';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { LEASE_SCRIPT } from './lease-script.js';
import {
  ErrorCode,
  ListGameOnlineUsersQuery,
  ListOnlineUsersQuery,
  Page,
  PublicProfileSchema,
  ProfileDTO,
  CustomStatus,
  CustomStatusSchema,
  PRESENCE_TTL_MS,
  ALLOWED_GAMES,
} from '@fg/contracts';
import { ChatService, chatError, ChatActor } from '../chat/chat.service.js';

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  private redis!: Redis;
  private clockFn: () => number = () => Date.now();
  private readonly logger = new Logger(PresenceService.name);
  private lobbyGameIdCache = new Map<string, string>();
  private sweepTimer?: ReturnType<typeof setInterval>;
  private sweeping?: Promise<void>;
  private closing = false;
  private pubsubCallback?: (event: { conversationId: string; userId: string; isOnline: boolean }) => Promise<void>;

  constructor(private readonly chatService: ChatService) {}

  setClock(fn?: () => number) {
    this.clockFn = fn ?? (() => Date.now());
  }

  get nowMs(): number {
    return this.clockFn();
  }

  get ns(): string { return this.namespace; }

  private namespace = '';

  private component(id: string): string { return Buffer.from(id).toString('base64url'); }

  setPubsubCallback(cb: (event: { conversationId: string; userId: string; isOnline: boolean }) => Promise<void>) {
    this.pubsubCallback = cb;
  }

  onModuleInit() {
    const database = new URL(process.env.DATABASE_URL!);
    this.namespace = createHash('sha256').update(JSON.stringify([database.host, database.pathname, database.searchParams.get('options') ?? ''])).digest('hex').slice(0, 16);
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
      });
      this.redis.on('error', () => this.logger.warn('Redis presence unavailable'));
    }

    this.sweepTimer = setInterval(() => {
      void this.sweepExpiredLeases().catch(() =>
        this.logger.warn('Presence sweep unavailable')
      );
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
      await this.redis.quit().catch(() => {});
    }
    if (this.pool) {
      await this.pool.end().catch(() => {});
    }
  }

  private async getRedis(): Promise<Redis> {
    if (!this.redis) {
      throw new Error('Redis URL not configured');
    }
    if (this.redis.status === 'wait' || this.redis.status === 'close') {
      await this.redis.connect();
    }
    return this.redis;
  }

  async getGameIdForLobby(convId: string): Promise<string | null> {
    if (this.lobbyGameIdCache.has(convId)) {
      return this.lobbyGameIdCache.get(convId)!;
    }
    const row = (
      await this.pool.query<{ game_id: string }>(
        `SELECT g.id as game_id
         FROM conversations c
         JOIN lobbies l ON l.id = c.lobby_id
         JOIN games g ON g.id = l.game_id
         WHERE c.id = $1 AND g.title = ANY($2::text[])`,
        [convId, [...ALLOWED_GAMES]]
      )
    ).rows[0];
    if (row?.game_id) {
      this.lobbyGameIdCache.set(convId, row.game_id);
      return row.game_id;
    }
    return null;
  }


  private async transition(convId: string, userId: string, socketId: string, mode: 'renew' | 'remove' | 'expire', sessionId = '') {
    // Resolve SQL metadata before entering the atomic Redis transition.
    const gameId = await this.getGameIdForLobby(convId);
    const redis = await this.getRedis();
    const now = this.nowMs;
    const prefix = 'fg:presence:' + this.ns + ':';
    const result = await redis.eval(LEASE_SCRIPT, 6,
      prefix + 'leases:' + this.component(convId) + ':' + this.component(userId),
      prefix + 'active:' + this.component(convId),
      prefix + 'active_convs',
      prefix + 'user_convs:' + this.component(userId),
      prefix + 'game_active:' + this.component(gameId ?? 'private-unused'),
      prefix + 'actors:' + this.component(convId) + ':' + this.component(userId),
      now, mode, userId, convId, socketId, now + PRESENCE_TTL_MS, gameId ? '1' : '0', sessionId
    ) as number[];
    return { isOnline: result[0] === 1, stateChanged: result[1] === 1 };
  }

  async addOrRenewLease(convId: string, userId: string, socketId: string, actor?: ChatActor) {
    return this.transition(convId, userId, socketId, 'renew', actor?.sessionId);
  }

  async removeLease(convId: string, userId: string, socketId: string) {
    return this.transition(convId, userId, socketId, 'remove');
  }

  sweepExpiredLeases(): Promise<void> {
    if (this.closing) return Promise.resolve();
    if (this.sweeping) return this.sweeping;
    const sweep = this.performSweep();
    this.sweeping = sweep;
    void sweep.then(() => { this.sweeping = undefined; }, () => { this.sweeping = undefined; });
    return sweep;
  }

  private async pruneAuthorization(convId: string, userId: string) {
    const redis = await this.getRedis();
    const actors = await redis.hgetall('fg:presence:' + this.ns + ':actors:' + this.component(convId) + ':' + this.component(userId));
    for (const [socketId, sessionId] of Object.entries(actors)) {
      try {
        await this.chatService.authorize(convId, { userId, sessionId });
      } catch (error) {
        if (!(error instanceof HttpException) || ![401, 403, 404].includes(error.getStatus())) throw error;
        const result = await this.removeLease(convId, userId, socketId);
        if (result.stateChanged && this.pubsubCallback) {
          await this.pubsubCallback({ conversationId: convId, userId, isOnline: result.isOnline });
        }
      }
    }
  }

  private async performSweep(): Promise<void> {
    if (!this.redis) return;
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

  async isUserOnlineInConv(convId: string, userId: string): Promise<boolean> {
    await this.pruneAuthorization(convId, userId);
    const redis = await this.getRedis();
    const now = this.nowMs;
    const scoreStr = await redis.zscore(`fg:presence:${this.ns}:active:${this.component(convId)}`, userId);
    return scoreStr !== null && Number(scoreStr) > now;
  }

  async isUserOnlineAnywhere(userId: string): Promise<boolean> {
    const conversations = await this.getUserActiveConversations(userId);
    for (const conversationId of conversations) {
      if (await this.isUserOnlineInConv(conversationId, userId)) return true;
    }
    return false;
  }

  async getUserActiveConversations(userId: string): Promise<string[]> {
    const redis = await this.getRedis();
    const key = `fg:presence:${this.ns}:user_convs:${this.component(userId)}`;
    return redis.smembers(key);
  }

  async getOnlineUserIdsForGame(gameId: string): Promise<string[]> {
    const conversations = (await this.pool.query<{ id: string }>("SELECT c.id FROM conversations c JOIN lobbies l ON l.id=c.lobby_id WHERE l.game_id=$1 AND c.kind='LOBBY'", [gameId])).rows;
    const redis = await this.getRedis();
    for (const { id } of conversations) {
      const users = await redis.zrange('fg:presence:' + this.ns + ':active:' + this.component(id), '0', '-1');
      for (const userId of users) await this.pruneAuthorization(id, userId);
    }
    const now = this.nowMs;
    const gameKey = `fg:presence:${this.ns}:game_active:${this.component(gameId)}`;
    await redis.zremrangebyscore(gameKey, '-inf', String(now));
    return redis.zrangebyscore(gameKey, String(now + 1), '+inf');
  }

  async getOnlineUsersForGame(
    gameId: string,
    query: ListGameOnlineUsersQuery
  ): Promise<Page<ProfileDTO>> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 50);
    const cursor = query.cursor;

    const game = (
      await this.pool.query<{ id: string }>(
        'SELECT id FROM games WHERE id=$1 AND title=ANY($2::text[])',
        [gameId, [...ALLOWED_GAMES]]
      )
    ).rows[0];
    if (!game) {
      chatError(ErrorCode.NOT_FOUND, 'Game not found');
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
    const params: unknown[] = [onlineUserIds];

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

    const items: ProfileDTO[] = await Promise.all(
      selected.map(async (row) => {
        const gameProfs = (
          await this.pool.query(
            `SELECT gp.game_id, g.title as game_title, gp.in_game_name, gp.rank, gp.role, gp.play_hours, gp.play_style
             FROM game_profiles gp
             JOIN games g ON g.id = gp.game_id
             WHERE gp.user_id = $1`,
            [row.user_id]
          )
        ).rows.map((gp) => ({
          gameId: gp.game_id,
          gameTitle: gp.game_title,
          inGameName: gp.in_game_name ?? undefined,
          rank: gp.rank ?? undefined,
          role: gp.role ?? undefined,
          playHours: gp.play_hours ? Number(gp.play_hours) : undefined,
          playStyle: gp.play_style ?? undefined,
        }));

        return PublicProfileSchema.parse({
          id: row.user_id,
          displayName: row.display_name ?? row.name,
          avatarUrl: row.avatar_url ?? row.image ?? null,
          bio: row.bio ?? null,
          customStatus: row.custom_status ?? 'JUST_CHATTING',
          gameProfiles: gameProfs,
          createdAt: row.created_iso,
        });
      })
    );

    return {
      items,
      hasMore,
      nextCursor: hasMore && last ? last.user_id : null,
    };
  }

  async getOnlineUsersAll(query: ListOnlineUsersQuery): Promise<Page<ProfileDTO>> {
    if (query.gameTitle) {
      const game = (
        await this.pool.query<{ id: string }>(
          'SELECT id FROM games WHERE title=$1',
          [query.gameTitle]
        )
      ).rows[0];
      if (!game) {
        chatError(ErrorCode.NOT_FOUND, 'Game title not found');
      }
      return this.getOnlineUsersForGame(game.id, query);
    }

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 50);

    const approvedGames = (await this.pool.query<{ id: string }>('SELECT id FROM games WHERE title=ANY($1::text[])', [[...ALLOWED_GAMES]])).rows;
    const allUserIdsSet = new Set<string>();
    for (const game of approvedGames) {
      for (const id of await this.getOnlineUserIdsForGame(game.id)) allUserIdsSet.add(id);
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
    const params: unknown[] = [onlineUserIds];


    sql += ` ORDER BY p.user_id ASC LIMIT $${params.length + 1}`;
    params.push(limit + 1);

    const rows = (await this.pool.query(sql, params)).rows;
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    const last = selected.at(-1);

    const items: ProfileDTO[] = await Promise.all(
      selected.map(async (row) => {
        const gameProfs = (
          await this.pool.query(
            `SELECT gp.game_id, g.title as game_title, gp.in_game_name, gp.rank, gp.role, gp.play_hours, gp.play_style
             FROM game_profiles gp
             JOIN games g ON g.id = gp.game_id
             WHERE gp.user_id = $1`,
            [row.user_id]
          )
        ).rows.map((gp) => ({
          gameId: gp.game_id,
          gameTitle: gp.game_title,
          inGameName: gp.in_game_name ?? undefined,
          rank: gp.rank ?? undefined,
          role: gp.role ?? undefined,
          playHours: gp.play_hours ? Number(gp.play_hours) : undefined,
          playStyle: gp.play_style ?? undefined,
        }));

        return PublicProfileSchema.parse({
          id: row.user_id,
          displayName: row.display_name ?? row.name,
          avatarUrl: row.avatar_url ?? row.image ?? null,
          bio: row.bio ?? null,
          customStatus: row.custom_status ?? 'JUST_CHATTING',
          gameProfiles: gameProfs,
          createdAt: row.created_iso,
        });
      })
    );

    return {
      items,
      hasMore,
      nextCursor: hasMore && last ? last.user_id : null,
    };
  }

  async getCustomStatus(userId: string): Promise<CustomStatus> {
    const row = (
      await this.pool.query<{ custom_status: string }>(
        'SELECT custom_status FROM profiles WHERE user_id=$1',
        [userId]
      )
    ).rows[0];
    if (!row) {
      chatError(ErrorCode.NOT_FOUND, 'User profile not found');
    }
    const parsed = CustomStatusSchema.safeParse(row.custom_status);
    if (!parsed.success) {
      chatError(ErrorCode.INVALID_INPUT, 'Invalid stored custom status');
    }
    return parsed.data;
  }

  async updateCustomStatus(
    actor: ChatActor,
    customStatusInput: unknown
  ): Promise<{ customStatus: CustomStatus; isOnline?: boolean }> {
    if (!actor) {
      chatError(ErrorCode.LOGIN_REQUIRED, 'Login required');
    }
    const parsedStatus = CustomStatusSchema.safeParse(customStatusInput);
    if (!parsedStatus.success) {
      chatError(ErrorCode.INVALID_INPUT, 'Invalid custom status');
    }

    const customStatus = parsedStatus.data;
    const saved = await this.pool.query(
      'UPDATE profiles SET custom_status=$1, updated_at=now() WHERE user_id=$2',
      [customStatus, actor.userId]
    );
    if (!saved.rowCount) chatError(ErrorCode.NOT_FOUND, 'User profile not found');

    const isOnline = await this.isUserOnlineAnywhere(actor.userId);
    return { customStatus, isOnline };
  }
}
