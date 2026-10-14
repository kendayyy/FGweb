import {enqueueNotification} from '@fg/database';
import { Injectable, OnModuleInit, OnModuleDestroy, HttpException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import {
  ErrorCode,
  ErrorCodeToHttpStatus,
  ListFriendsQuery,
  ListFriendRequestsQuery,
  ListDirectConversationsQuery,
  Page,
  ProfileDTO,
  PendingFriendRequestDTO,
  PendingFriendRequestSchema,
  BlockDTO,
  BlockSchema,
  UserSummarySchema,
  IsoDateTimeSchema,
} from '@fg/contracts';
import { ProfilesService } from '../profiles/profiles.service.js';
import { lockSocialPair } from '../chat/chat.service.js';

export function socialError(code: ErrorCode, message: string): never {
  throw new HttpException(
    { code, message, requestId: randomUUID() },
    ErrorCodeToHttpStatus[code]
  );
}

function encodeCursor(payload: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      socialError(ErrorCode.INVALID_INPUT, 'Invalid pagination cursor format');
    }
    const dateCheck = IsoDateTimeSchema.safeParse(parsed.createdAt);
    if (!dateCheck.success) {
      socialError(ErrorCode.INVALID_INPUT, 'Invalid pagination cursor ISO timestamp');
    }
    return parsed;
  } catch (err) {
    if (err instanceof HttpException) throw err;
    socialError(ErrorCode.INVALID_INPUT, 'Invalid pagination cursor format');
  }
}

@Injectable()
export class SocialService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  constructor(private readonly profilesService: ProfilesService) {}

  onModuleInit() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    this.pool = new Pool({
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

  private async userExists(userId: string, db: Pool | PoolClient = this.pool): Promise<boolean> {
    const res = await db.query('SELECT 1 FROM "user" WHERE id = $1', [userId]);
    return (res.rowCount ?? 0) > 0;
  }

  private async checkActorSessionAndBan(client: PoolClient, actorId: string, sessionId: string): Promise<void> {
    const sessionRes = await client.query(
      `SELECT id FROM "session" WHERE id = $1 AND user_id = $2 AND expires_at > clock_timestamp() FOR SHARE`,
      [sessionId, actorId]
    );
    if ((sessionRes.rowCount ?? 0) === 0) {
      socialError(ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked');
    }

    const banRes = await client.query(
      `SELECT action FROM admin_actions WHERE target_user_id = $1 AND action IN ('BAN', 'UNBAN') ORDER BY created_at DESC, id DESC LIMIT 1`,
      [actorId]
    );
    if (banRes.rows[0]?.action === 'BAN') {
      socialError(ErrorCode.FORBIDDEN, 'Account is banned');
    }
  }

  private async getUserSummary(userId: string) {
    const profile = await this.profilesService.getPublicProfile(userId);
    return UserSummarySchema.parse({
      id: profile.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
      customStatus: profile.customStatus,
    });
  }

  async getFriends(userId: string, query: ListFriendsQuery): Promise<Page<ProfileDTO>> {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 50);
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    let sql = `
      SELECT f.*, to_char(f.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso
      FROM friendships f
      WHERE (f.user1_id = $1 OR f.user2_id = $1)
    `;
    const params: unknown[] = [userId, limit + 1];

    if (cursor) {
      sql += ` AND (f.created_at, f.id) < ($3::timestamp, $4::text)`;
      params.push(cursor.createdAt, cursor.id);
    }

    sql += ` ORDER BY f.created_at DESC, f.id DESC LIMIT $2`;

    const res = await this.pool.query(sql, params);
    const hasMore = res.rows.length > limit;
    const selected = res.rows.slice(0, limit);

    const items = await Promise.all(
      selected.map(async (row) => {
        const peerId = row.user1_id === userId ? row.user2_id : row.user1_id;
        return this.profilesService.getPublicProfile(peerId);
      })
    );

    const last = selected.at(-1);
    const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.created_iso, id: last.id }) : null;

    return { items, hasMore, nextCursor };
  }

  async getFriendRequests(userId: string, query: ListFriendRequestsQuery): Promise<Page<PendingFriendRequestDTO>> {
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
    const params: unknown[] = [userId, limit + 1];

    if (direction === 'INCOMING') {
      sql += ` AND fr.receiver_id = $1`;
    } else {
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

    const items: PendingFriendRequestDTO[] = await Promise.all(
      selected.map(async (row) => {
        const [sender, receiver] = await Promise.all([
          this.getUserSummary(row.sender_id),
          this.getUserSummary(row.receiver_id),
        ]);

        return PendingFriendRequestSchema.parse({
          requestId: row.id,
          sender,
          receiver,
          status: 'PENDING',
          createdAt: row.created_iso,
          updatedAt: row.updated_iso,
        });
      })
    );

    const last = selected.at(-1);
    const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.created_iso, id: last.id }) : null;

    return { items, hasMore, nextCursor };
  }

  async sendFriendRequest(actorId: string, sessionId: string, targetUserId: string): Promise<{ requestId: string; status: 'PENDING' }> {
    if (actorId === targetUserId) {
      socialError(ErrorCode.INVALID_INPUT, 'Cannot send friend request to self');
    }

    if (!(await this.userExists(targetUserId))) {
      socialError(ErrorCode.NOT_FOUND, `User not found: ${targetUserId}`);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockSocialPair(client, actorId, targetUserId);
      await this.checkActorSessionAndBan(client, actorId, sessionId);

      // Check block in either direction
      const blockRes = await client.query(
        `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
        [actorId, targetUserId]
      );
      if ((blockRes.rowCount ?? 0) > 0) {
        socialError(ErrorCode.FORBIDDEN, 'Interaction blocked between users');
      }

      // Check if already friends using SQL LEAST/GREATEST
      const friendRes = await client.query(
        `SELECT 1 FROM friendships WHERE user1_id = LEAST($1::text, $2::text) AND user2_id = GREATEST($1::text, $2::text) LIMIT 1`,
        [actorId, targetUserId]
      );
      if ((friendRes.rowCount ?? 0) > 0) {
        socialError(ErrorCode.INVALID_INPUT, 'Already friends');
      }

      // Query pending opposite request separately
      const oppRes = await client.query(
        `SELECT id FROM friend_requests WHERE sender_id = $2 AND receiver_id = $1 AND status = 'PENDING' FOR UPDATE`,
        [actorId, targetUserId]
      );
      if ((oppRes.rowCount ?? 0) > 0) {
        socialError(ErrorCode.INVALID_INPUT, 'Pending friend request from opposite user exists');
      }

      // Query own directed row separately
      const ownRes = await client.query(
        `SELECT id, status FROM friend_requests WHERE sender_id = $1 AND receiver_id = $2 FOR UPDATE`,
        [actorId, targetUserId]
      );
      const ownRow = ownRes.rows[0];

      if (ownRow) {
        if (ownRow.status === 'PENDING') {
          await enqueueNotification(client,targetUserId,'FRIEND_INVITE',{requestId:ownRow.id,senderId:actorId},'friend:'+ownRow.id);
          await client.query('COMMIT');
          return { requestId: ownRow.id, status: 'PENDING' };
        }
        // Terminal state (ACCEPTED / REJECTED / CANCELLED): renew with FRESH requestId and fresh timestamps
        const freshId = randomUUID();
        await client.query(
          `UPDATE friend_requests SET id = $1, status = 'PENDING', created_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = $2`,
          [freshId, ownRow.id]
        );
        await enqueueNotification(client,targetUserId,'FRIEND_INVITE',{requestId:freshId,senderId:actorId},'friend:'+freshId);
        await client.query('COMMIT');
        return { requestId: freshId, status: 'PENDING' };
      }

      const newId = randomUUID();
      await client.query(
        `INSERT INTO friend_requests(id, sender_id, receiver_id, status, created_at, updated_at) VALUES($1, $2, $3, 'PENDING', clock_timestamp(), clock_timestamp())`,
        [newId, actorId, targetUserId]
      );

      await enqueueNotification(client,targetUserId,'FRIEND_INVITE',{requestId:newId,senderId:actorId},'friend:'+newId);
      await client.query('COMMIT');
      return { requestId: newId, status: 'PENDING' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async respondFriendRequest(actorId: string, sessionId: string, requestId: string, action: 'ACCEPT' | 'REJECT'): Promise<{ success: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Peek request row to get participant IDs
      const peekRow = (
        await client.query(
          `SELECT id, sender_id, receiver_id, status FROM friend_requests WHERE id = $1`,
          [requestId]
        )
      ).rows[0];

      if (!peekRow) {
        socialError(ErrorCode.NOT_FOUND, 'Friend request not found');
      }

      if (peekRow.receiver_id !== actorId) {
        socialError(ErrorCode.FORBIDDEN, 'Only receiver can respond to friend request');
      }

      // Lock pair FIRST
      await lockSocialPair(client, peekRow.sender_id, peekRow.receiver_id);
      await this.checkActorSessionAndBan(client, actorId, sessionId);

      // Re-select request row FOR UPDATE
      const reqRow = (
        await client.query(
          `SELECT id, sender_id, receiver_id, status FROM friend_requests WHERE id = $1 FOR UPDATE`,
          [requestId]
        )
      ).rows[0];

      if (!reqRow) {
        socialError(ErrorCode.NOT_FOUND, 'Friend request not found');
      }

      if (reqRow.receiver_id !== actorId) {
        socialError(ErrorCode.FORBIDDEN, 'Only receiver can respond to friend request');
      }

      if (action === 'ACCEPT') {
        if (reqRow.status === 'ACCEPTED') {
          // Idempotent retry: check if friendship exists
          const friendRes = await client.query(
            `SELECT 1 FROM friendships WHERE user1_id = LEAST($1::text, $2::text) AND user2_id = GREATEST($1::text, $2::text) LIMIT 1`,
            [reqRow.sender_id, reqRow.receiver_id]
          );
          if ((friendRes.rowCount ?? 0) > 0) {
            await client.query('COMMIT');
            return { success: true };
          }
          socialError(ErrorCode.INVALID_INPUT, 'Friend request already processed');
        }

        if (reqRow.status !== 'PENDING') {
          socialError(ErrorCode.INVALID_INPUT, 'Friend request already processed');
        }

        const blockRes = await client.query(
          `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
          [reqRow.sender_id, reqRow.receiver_id]
        );
        if ((blockRes.rowCount ?? 0) > 0) {
          socialError(ErrorCode.FORBIDDEN, 'Interaction blocked between users');
        }

        await client.query(
          `INSERT INTO friendships(id, user1_id, user2_id, created_at) VALUES($1, LEAST($2::text, $3::text), GREATEST($2::text, $3::text), clock_timestamp()) ON CONFLICT DO NOTHING`,
          [randomUUID(), reqRow.sender_id, reqRow.receiver_id]
        );
        await client.query(
          `UPDATE friend_requests SET status = 'ACCEPTED', updated_at = clock_timestamp() WHERE id = $1`,
          [requestId]
        );
      } else {
        if (reqRow.status === 'REJECTED') {
          await client.query('COMMIT');
          return { success: true };
        }
        if (reqRow.status !== 'PENDING') {
          socialError(ErrorCode.INVALID_INPUT, 'Friend request already processed');
        }

        await client.query(
          `UPDATE friend_requests SET status = 'REJECTED', updated_at = clock_timestamp() WHERE id = $1`,
          [requestId]
        );
      }

      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async removeFriend(actorId: string, sessionId: string, targetUserId: string): Promise<{ success: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockSocialPair(client, actorId, targetUserId);
      await this.checkActorSessionAndBan(client, actorId, sessionId);

      await client.query(
        `DELETE FROM friendships WHERE user1_id = LEAST($1::text, $2::text) AND user2_id = GREATEST($1::text, $2::text)`,
        [actorId, targetUserId]
      );

      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async cancelFriendRequest(actorId: string, sessionId: string, requestId: string): Promise<{ success: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const peekRow = (
        await client.query(
          `SELECT id, sender_id, receiver_id, status FROM friend_requests WHERE id = $1`,
          [requestId]
        )
      ).rows[0];

      if (!peekRow) {
        socialError(ErrorCode.NOT_FOUND, 'Friend request not found');
      }

      if (peekRow.sender_id !== actorId) {
        socialError(ErrorCode.FORBIDDEN, 'Only sender can cancel friend request');
      }

      await lockSocialPair(client, peekRow.sender_id, peekRow.receiver_id);
      await this.checkActorSessionAndBan(client, actorId, sessionId);

      const reqRow = (
        await client.query(
          `SELECT id, sender_id, receiver_id, status FROM friend_requests WHERE id = $1 FOR UPDATE`,
          [requestId]
        )
      ).rows[0];

      if (!reqRow) {
        socialError(ErrorCode.NOT_FOUND, 'Friend request not found');
      }

      if (reqRow.sender_id !== actorId) {
        socialError(ErrorCode.FORBIDDEN, 'Only sender can cancel friend request');
      }

      if (reqRow.status === 'CANCELLED') {
        await client.query('COMMIT');
        return { success: true };
      }

      if (reqRow.status !== 'PENDING') {
        socialError(ErrorCode.INVALID_INPUT, 'Friend request already processed');
      }

      await client.query(
        `UPDATE friend_requests SET status = 'CANCELLED', updated_at = clock_timestamp() WHERE id = $1`,
        [requestId]
      );

      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getDirectConversations(actorId: string, query: ListDirectConversationsQuery): Promise<Page<{ conversationId: string; peer: ProfileDTO }>> {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 50);
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    let sql = `
      SELECT c.*, to_char(c.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_iso
      FROM conversations c
      WHERE c.kind = 'DM' AND (c.user1_id = $1 OR c.user2_id = $1)
    `;
    const params: unknown[] = [actorId, limit + 1];

    if (cursor) {
      sql += ` AND (c.updated_at, c.id) < ($3::timestamp, $4::text)`;
      params.push(cursor.createdAt, cursor.id);
    }

    sql += ` ORDER BY c.updated_at DESC, c.id DESC LIMIT $2`;

    const res = await this.pool.query(sql, params);
    const hasMore = res.rows.length > limit;
    const selected = res.rows.slice(0, limit);

    const items = await Promise.all(
      selected.map(async (conv) => {
        const peerId = conv.user1_id === actorId ? conv.user2_id : conv.user1_id;
        const peer = await this.profilesService.getPublicProfile(peerId!);
        return { conversationId: conv.id, peer };
      })
    );

    const last = selected.at(-1);
    const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.updated_iso, id: last.id }) : null;

    return { items, hasMore, nextCursor };
  }

  async createDirectConversation(actorId: string, sessionId: string, recipientUserId: string): Promise<{ conversationId: string }> {
    if (actorId === recipientUserId) {
      socialError(ErrorCode.INVALID_INPUT, 'Cannot create DM with self');
    }

    if (!(await this.userExists(recipientUserId))) {
      socialError(ErrorCode.NOT_FOUND, `User not found: ${recipientUserId}`);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockSocialPair(client, actorId, recipientUserId);
      await this.checkActorSessionAndBan(client, actorId, sessionId);

      // Check block in either direction
      const blockRes = await client.query(
        `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
        [actorId, recipientUserId]
      );
      if ((blockRes.rowCount ?? 0) > 0) {
        socialError(ErrorCode.FORBIDDEN, 'Interaction blocked between users');
      }

      const existingConv = (
        await client.query(
          `SELECT id FROM conversations WHERE kind = 'DM' AND user1_id = LEAST($1::text, $2::text) AND user2_id = GREATEST($1::text, $2::text) FOR SHARE`,
          [actorId, recipientUserId]
        )
      ).rows[0];

      if (existingConv) {
        await client.query('COMMIT');
        return { conversationId: existingConv.id };
      }

      const convId = randomUUID();
      await client.query(
        `INSERT INTO conversations(id, kind, user1_id, user2_id, created_at, updated_at) VALUES($1, 'DM', LEAST($2::text, $3::text), GREATEST($2::text, $3::text), clock_timestamp(), clock_timestamp())`,
        [convId, actorId, recipientUserId]
      );

      await client.query(
        `INSERT INTO conversation_members(id, conversation_id, user_id, joined_at) VALUES ($1, $2, LEAST($3::text, $4::text), clock_timestamp()), ($5, $2, GREATEST($3::text, $4::text), clock_timestamp())`,
        [randomUUID(), convId, actorId, recipientUserId, randomUUID()]
      );

      await client.query('COMMIT');
      return { conversationId: convId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getBlocks(actorId: string): Promise<BlockDTO[]> {
    const res = await this.pool.query(
      `SELECT b.*, to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM blocks b WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
      [actorId]
    );

    const items = await Promise.all(
      res.rows.map(async (row) => {
        const blockedUser = await this.getUserSummary(row.blocked_id);
        return BlockSchema.parse({
          id: row.id,
          blockerId: row.blocker_id,
          blockedId: row.blocked_id,
          blockedUser,
          createdAt: row.created_iso,
        });
      })
    );

    return items;
  }

  async createBlock(actorId: string, sessionId: string, blockedId: string): Promise<BlockDTO> {
    if (actorId === blockedId) {
      socialError(ErrorCode.INVALID_INPUT, 'Cannot block self');
    }

    if (!(await this.userExists(blockedId))) {
      socialError(ErrorCode.NOT_FOUND, `User not found: ${blockedId}`);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockSocialPair(client, actorId, blockedId);
      await this.checkActorSessionAndBan(client, actorId, sessionId);

      const existingBlock = (
        await client.query(
          `SELECT b.id, b.blocker_id, b.blocked_id, to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM blocks b WHERE blocker_id = $1 AND blocked_id = $2 FOR SHARE`,
          [actorId, blockedId]
        )
      ).rows[0];

      if (existingBlock) {
        await client.query('COMMIT');
        const blockedUser = await this.getUserSummary(blockedId);
        return BlockSchema.parse({
          id: existingBlock.id,
          blockerId: actorId,
          blockedId,
          blockedUser,
          createdAt: existingBlock.created_iso,
        });
      }

      const blockId = randomUUID();
      const insertRes = await client.query(
        `INSERT INTO blocks(id, blocker_id, blocked_id, created_at) VALUES($1, $2, $3, clock_timestamp()) RETURNING to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso`,
        [blockId, actorId, blockedId]
      );

      const createdIso = insertRes.rows[0].created_iso;
      await client.query('COMMIT');

      const blockedUser = await this.getUserSummary(blockedId);
      return BlockSchema.parse({
        id: blockId,
        blockerId: actorId,
        blockedId,
        blockedUser,
        createdAt: createdIso,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteBlock(actorId: string, sessionId: string, targetUserId: string): Promise<{ success: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockSocialPair(client, actorId, targetUserId);
      await this.checkActorSessionAndBan(client, actorId, sessionId);

      await client.query(
        `DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`,
        [actorId, targetUserId]
      );

      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
