import { Injectable, OnModuleInit, OnModuleDestroy, HttpException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import {
  ErrorCode,
  ErrorCodeToHttpStatus,
  CreateRoomRequest,
  UpdateRoomSettingsRequest,
  UpdateHelperPermissionsRequest,
  TransferRoomOwnerRequest,
  ListOwnRoomsQuery,
  RoomDTO,
  RoomMemberDTO,
  Page,
  IsoDateTimeSchema,
  UserSummary,
} from '@fg/contracts';
import { ProfilesService } from '../profiles/profiles.service.js';
import {cryptoMemberLeft,retirePrivateCryptoConversation} from '../chat-crypto/crypto-membership.js';

export function roomError(code: ErrorCode, message: string): never {
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
      roomError(ErrorCode.INVALID_INPUT, 'Invalid pagination cursor format');
    }
    const dateCheck = IsoDateTimeSchema.safeParse(parsed.createdAt);
    if (!dateCheck.success) {
      roomError(ErrorCode.INVALID_INPUT, 'Invalid pagination cursor ISO timestamp');
    }
    return parsed;
  } catch (err) {
    if (err instanceof HttpException) throw err;
    roomError(ErrorCode.INVALID_INPUT, 'Invalid pagination cursor format');
  }
}

@Injectable()
export class RoomsService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  private callRevoker?:()=>Promise<void>;
  public setCallRevoker(revoke:(()=>Promise<void>)|undefined){this.callRevoker=revoke;}

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

  private async checkActorSessionAndBan(client: PoolClient, actorId: string, sessionId?: string): Promise<void> {
    if (sessionId) {
      const sessionRes = await client.query(
        `SELECT id FROM "session" WHERE id = $1 AND user_id = $2 AND expires_at > clock_timestamp() FOR SHARE`,
        [sessionId, actorId]
      );
      if ((sessionRes.rowCount ?? 0) === 0) {
        roomError(ErrorCode.LOGIN_REQUIRED, 'Session expired or revoked');
      }
    }

    const banRes = await client.query(
      `SELECT action FROM admin_actions WHERE target_user_id = $1 AND action IN ('BAN', 'UNBAN') ORDER BY created_at DESC, id DESC LIMIT 1`,
      [actorId]
    );
    if (banRes.rows[0]?.action === 'BAN') {
      roomError(ErrorCode.FORBIDDEN, 'Account is banned');
    }
  }

  private async buildRoomDto(db: Pool | PoolClient, roomId: string): Promise<RoomDTO> {
    const roomRes = await db.query(
      `SELECT r.id, r.name, r.description, r.game_id, r.owner_id, r.visibility, r.invite_policy, r.player_capacity, r.conversation_id,
              to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at_iso,
              to_char(r.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at_iso,
              g.title as game_title,
              (SELECT COUNT(*)::int FROM room_members rm WHERE rm.room_id = r.id) as member_count
       FROM rooms r
       JOIN games g ON r.game_id = g.id
       WHERE r.id = $1`,
      [roomId]
    );

    if ((roomRes.rowCount ?? 0) === 0) {
      roomError(ErrorCode.NOT_FOUND, 'Room not found');
    }

    const row = roomRes.rows[0];
    const ownerProfile = await this.profilesService.getPublicProfile(row.owner_id);
    const ownerSummary: UserSummary = {
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
        visibility: row.visibility as 'PUBLIC' | 'PRIVATE',
        invitePolicy: row.invite_policy as 'OWNER_APPROVAL' | 'DIRECT_MEMBER',
        playerCapacity: Number(row.player_capacity),
      },
      memberCount: Number(row.member_count),
      createdAt: row.created_at_iso,
      updatedAt: row.updated_at_iso,
    };
  }

  async createRoom(actorId: string, sessionId: string, dto: CreateRoomRequest): Promise<RoomDTO> {
    const gameRes = await this.pool.query(
      `SELECT id, title FROM games WHERE id = $1 AND title = $2`,
      [dto.gameId, dto.gameTitle]
    );
    if ((gameRes.rowCount ?? 0) === 0) {
      roomError(ErrorCode.INVALID_INPUT, 'Game ID and title mismatch or game not found');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.checkActorSessionAndBan(client, actorId, sessionId);

      const roomId = `room_${randomUUID()}`;
      const conversationId = `conv_${randomUUID()}`;
      const roomMemberId = `rm_${randomUUID()}`;
      const conversationMemberId = `cm_${randomUUID()}`;

      await client.query(
        `INSERT INTO conversations(id, kind, created_at, updated_at) VALUES ($1, 'ROOM', now(), now())`,
        [conversationId]
      );

      await client.query(
        `INSERT INTO rooms(id, name, description, game_id, owner_id, owner_role, visibility, invite_policy, player_capacity, conversation_id, conversation_kind, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'OWNER', $6, $7, $8, $9, 'ROOM', now(), now())`,
        [
          roomId,
          dto.name,
          dto.description ?? null,
          dto.gameId,
          actorId,
          dto.visibility ?? 'PUBLIC',
          dto.invitePolicy ?? 'OWNER_APPROVAL',
          dto.playerCapacity ?? 5,
          conversationId,
        ]
      );

      await client.query(
        `INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES ($1, $2, $3, 'OWNER', now())`,
        [roomMemberId, roomId, actorId]
      );

      await client.query(
        `INSERT INTO conversation_members(id, conversation_id, user_id, joined_at) VALUES ($1, $2, $3, now())`,
        [conversationMemberId, conversationId, actorId]
      );

      const roomDto = await this.buildRoomDto(client, roomId);
      await client.query('COMMIT');
      return roomDto;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listOwnRooms(actorId: string, sessionId: string, query: ListOwnRoomsQuery): Promise<Page<RoomDTO>> {
    const limit = query.limit ?? 50;
    let cursorClause = '';
    const params: unknown[] = [actorId];

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

      const res = await client.query(
        `SELECT r.id, r.name, r.description, r.game_id, r.owner_id, r.visibility, r.invite_policy, r.player_capacity, r.conversation_id,
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
         FOR SHARE OF rm`,
        params
      );

      const hasMore = res.rows.length > limit;
      const rows = hasMore ? res.rows.slice(0, limit) : res.rows;

      const rawItems: RoomDTO[] = await Promise.all(
        rows.map(async (row) => {
          const ownerProfile = await this.profilesService.getPublicProfile(row.owner_id);
          const ownerSummary: UserSummary = {
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
              visibility: row.visibility as 'PUBLIC' | 'PRIVATE',
              invitePolicy: row.invite_policy as 'OWNER_APPROVAL' | 'DIRECT_MEMBER',
              playerCapacity: Number(row.player_capacity),
            },
            memberCount: Number(row.member_count),
            createdAt: row.created_at_iso,
            updatedAt: row.updated_at_iso,
          };
        })
      );

      await this.checkActorSessionAndBan(client, actorId, sessionId);

      const items: RoomDTO[] = [];
      for (const item of rawItems) {
        const memCheck = await client.query(
          `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 FOR SHARE`,
          [item.id, actorId]
        );
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
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getRoomDetail(actorId: string, sessionId: string, roomId: string): Promise<RoomDTO> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.checkActorSessionAndBan(client, actorId, sessionId);

      const roomExists = (await client.query(`SELECT 1 FROM rooms WHERE id = $1 FOR SHARE`, [roomId])).rowCount ?? 0;
      if (roomExists === 0) {
        roomError(ErrorCode.NOT_FOUND, 'Room not found');
      }

      const checkRes = await client.query(
        `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 FOR SHARE`,
        [roomId, actorId]
      );
      if ((checkRes.rowCount ?? 0) === 0) {
        roomError(ErrorCode.FORBIDDEN, 'User is not a member of this room');
      }

      const dto = await this.buildRoomDto(client, roomId);
      await client.query('COMMIT');
      return dto;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listRoomMembers(actorId: string, sessionId: string, roomId: string): Promise<RoomMemberDTO[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.checkActorSessionAndBan(client, actorId, sessionId);

      const roomRes = await client.query(`SELECT 1 FROM rooms WHERE id = $1 FOR SHARE`, [roomId]);
      if ((roomRes.rowCount ?? 0) === 0) {
        roomError(ErrorCode.NOT_FOUND, 'Room not found');
      }

      const checkRes = await client.query(
        `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 FOR SHARE`,
        [roomId, actorId]
      );
      if ((checkRes.rowCount ?? 0) === 0) {
        roomError(ErrorCode.FORBIDDEN, 'User is not a member of this room');
      }

      const membersRes = await client.query(
        `SELECT rm.room_id, rm.user_id, rm.role,
                to_char(rm.joined_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as joined_at_iso,
                COALESCE(
                  JSON_AGG(pg.permission) FILTER (WHERE pg.permission IS NOT NULL),
                  '[]'
                ) as permissions
         FROM room_members rm
         LEFT JOIN permission_grants pg ON pg.room_id = rm.room_id AND pg.user_id = rm.user_id
         WHERE rm.room_id = $1
         GROUP BY rm.id, rm.room_id, rm.user_id, rm.role, rm.joined_at
         ORDER BY CASE rm.role WHEN 'OWNER' THEN 1 WHEN 'HELPER' THEN 2 ELSE 3 END, rm.joined_at ASC`,
        [roomId]
      );

      const result = await Promise.all(
        membersRes.rows.map(async (row) => {
          const userProfile = await this.profilesService.getPublicProfile(row.user_id);
          const userSummary: UserSummary = {
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
            role: row.role as 'OWNER' | 'HELPER' | 'MEMBER',
            permissions: perms,
            joinedAt: row.joined_at_iso,
          };
        })
      );

      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateSettings(actorId: string, sessionId: string, roomId: string, dto: UpdateRoomSettingsRequest): Promise<RoomDTO> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const roomRes = await client.query(
        `SELECT * FROM rooms WHERE id = $1 FOR UPDATE`,
        [roomId]
      );
      if ((roomRes.rowCount ?? 0) === 0) {
        roomError(ErrorCode.NOT_FOUND, 'Room not found');
      }

      await this.checkActorSessionAndBan(client, actorId, sessionId);

      const room = roomRes.rows[0];
      if (room.owner_id !== actorId) {
        roomError(ErrorCode.FORBIDDEN, 'Only room owner can update settings');
      }

      if (dto.visibility === 'PRIVATE' && room.visibility === 'PUBLIC') {
        await client.query(
          `UPDATE recruitments SET state = 'CLOSED', updated_at = now() WHERE room_id = $1 AND state = 'OPEN'`,
          [roomId]
        );
      }

      const newName = dto.name !== undefined ? dto.name : room.name;
      const newDesc = dto.description !== undefined ? dto.description : room.description;
      const newVis = dto.visibility !== undefined ? dto.visibility : room.visibility;
      const newPolicy = dto.invitePolicy !== undefined ? dto.invitePolicy : room.invite_policy;
      const newCap = dto.playerCapacity !== undefined ? dto.playerCapacity : room.player_capacity;

      await client.query(
        `UPDATE rooms SET name = $1, description = $2, visibility = $3, invite_policy = $4, player_capacity = $5, updated_at = now()
         WHERE id = $6`,
        [newName, newDesc, newVis, newPolicy, newCap, roomId]
      );

      const updatedDto = await this.buildRoomDto(client, roomId);
      await client.query('COMMIT');
      return updatedDto;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateHelperPermissions(
    actorId: string,
    sessionId: string,
    roomId: string,
    targetUserId: string,
    dto: UpdateHelperPermissionsRequest
  ): Promise<RoomMemberDTO> {
    const escalated = dto.permissions.filter(
      (p: string) => p === 'OWNER_TRANSFER' || p === 'ROOM_DISSOLVE'
    );
    if (escalated.length > 0) {
      roomError(ErrorCode.INVALID_INPUT, 'Helper role cannot be assigned owner-only permissions');
    }

    const uniquePermissions = Array.from(new Set(dto.permissions));

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const roomRes = await client.query(`SELECT owner_id FROM rooms WHERE id = $1 FOR UPDATE`, [roomId]);
      if ((roomRes.rowCount ?? 0) === 0) {
        roomError(ErrorCode.NOT_FOUND, 'Room not found');
      }

      await this.checkActorSessionAndBan(client, actorId, sessionId);

      if (roomRes.rows[0].owner_id !== actorId) {
        roomError(ErrorCode.FORBIDDEN, 'Only room owner can update helper permissions');
      }

      const memberRes = await client.query(
        `SELECT role, to_char(joined_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as joined_at_iso FROM room_members WHERE room_id = $1 AND user_id = $2 FOR UPDATE`,
        [roomId, targetUserId]
      );
      if ((memberRes.rowCount ?? 0) === 0) {
        roomError(ErrorCode.NOT_FOUND, 'Target member not found in room');
      }

      const targetRole = memberRes.rows[0].role;
      if (targetUserId === actorId || targetRole === 'OWNER') {
        roomError(ErrorCode.FORBIDDEN, 'Cannot modify owner helper permissions');
      }

      // CRITICAL FK FIX: Always DELETE permission_grants BEFORE updating room_members.role!
      // (FK permission_grants_member_fk references (room_id, user_id, role) where role='HELPER')
      await client.query(
        `DELETE FROM permission_grants WHERE room_id = $1 AND user_id = $2`,
        [roomId, targetUserId]
      );

      if (uniquePermissions.length > 0) {
        await client.query(
          `UPDATE room_members SET role = 'HELPER' WHERE room_id = $1 AND user_id = $2`,
          [roomId, targetUserId]
        );
        for (const perm of uniquePermissions) {
          const grantId = `pg_${randomUUID()}`;
          await client.query(
            `INSERT INTO permission_grants(id, room_id, user_id, grantee_role, permission, granted_by, granted_at)
             VALUES ($1, $2, $3, 'HELPER', $4, $5, now())`,
            [grantId, roomId, targetUserId, perm, actorId]
          );
        }
      } else {
        await client.query(
          `UPDATE room_members SET role = 'MEMBER' WHERE room_id = $1 AND user_id = $2`,
          [roomId, targetUserId]
        );
      }

      const userProfile = await this.profilesService.getPublicProfile(targetUserId);
      const userSummary: UserSummary = {
        id: userProfile.id,
        displayName: userProfile.displayName,
        avatarUrl: userProfile.avatarUrl,
        customStatus: userProfile.customStatus,
      };

      const updatedRole = uniquePermissions.length > 0 ? 'HELPER' : 'MEMBER';
      const resultDto: RoomMemberDTO = {
        roomId,
        userId: targetUserId,
        user: userSummary,
        role: updatedRole,
        permissions: uniquePermissions,
        joinedAt: memberRes.rows[0].joined_at_iso,
      };

      await client.query('COMMIT');
      return resultDto;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async transferOwner(
    actorId: string,
    sessionId: string,
    roomId: string,
    dto: TransferRoomOwnerRequest
  ): Promise<RoomDTO> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const roomRes = await client.query(`SELECT * FROM rooms WHERE id = $1 FOR UPDATE`, [roomId]);
      if ((roomRes.rowCount ?? 0) === 0) {
        roomError(ErrorCode.NOT_FOUND, 'Room not found');
      }

      await this.checkActorSessionAndBan(client, actorId, sessionId);

      if (roomRes.rows[0].owner_id !== actorId) {
        roomError(ErrorCode.FORBIDDEN, 'Only room owner can transfer ownership');
      }

      if (dto.newOwnerId === actorId) {
        const currentDto = await this.buildRoomDto(client, roomId);
        await client.query('COMMIT');
        return currentDto;
      }

      const targetMemberRes = await client.query(
        `SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2 FOR UPDATE`,
        [roomId, dto.newOwnerId]
      );
      if ((targetMemberRes.rowCount ?? 0) === 0) {
        roomError(ErrorCode.FORBIDDEN, 'Owner cannot transfer ownership to non-member outsider');
      }

      // CRITICAL FK FIX: Delete permission_grants for old owner & new owner FIRST!
      await client.query(
        `DELETE FROM permission_grants WHERE room_id = $1 AND user_id = $2`,
        [roomId, actorId]
      );
      await client.query(
        `DELETE FROM permission_grants WHERE room_id = $1 AND user_id = $2`,
        [roomId, dto.newOwnerId]
      );

      // Update old owner to MEMBER
      await client.query(
        `UPDATE room_members SET role = 'MEMBER' WHERE room_id = $1 AND user_id = $2`,
        [roomId, actorId]
      );

      // Update new owner to OWNER
      await client.query(
        `UPDATE room_members SET role = 'OWNER' WHERE room_id = $1 AND user_id = $2`,
        [roomId, dto.newOwnerId]
      );

      // Update room owner_id
      await client.query(
        `UPDATE rooms SET owner_id = $1, owner_role = 'OWNER', updated_at = now() WHERE id = $2`,
        [dto.newOwnerId, roomId]
      );

      const updatedDto = await this.buildRoomDto(client, roomId);
      await client.query('COMMIT');
      return updatedDto;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async leaveOrRemoveMember(
    actorId: string,
    sessionId: string,
    roomId: string,
    targetUserId: string
  ): Promise<{ success: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const roomRes = await client.query(`SELECT conversation_id, owner_id FROM rooms WHERE id = $1 FOR UPDATE`, [roomId]);
      if ((roomRes.rowCount ?? 0) === 0) {
        roomError(ErrorCode.NOT_FOUND, 'Room not found');
      }

      await this.checkActorSessionAndBan(client, actorId, sessionId);
      const room = roomRes.rows[0];

      const targetRes = await client.query(
        `SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2 FOR UPDATE`,
        [roomId, targetUserId]
      );
      if ((targetRes.rowCount ?? 0) === 0) {
        roomError(ErrorCode.NOT_FOUND, 'Target user is not a member of this room');
      }
      const targetRole = targetRes.rows[0].role;

      if (actorId === targetUserId) {
        // Self leaving
        if (targetRole === 'OWNER') {
          const countRes = await client.query(`SELECT COUNT(*)::int as count FROM room_members WHERE room_id = $1`, [roomId]);
          const totalMembers = Number(countRes.rows[0].count);
          if (totalMembers > 1) {
            roomError(ErrorCode.FORBIDDEN, 'Owner with other members must transfer or dissolve before leave');
          }
          // Sole member owner leaving -> close/dissolve room
          await client.query(`DELETE FROM rooms WHERE id = $1`, [roomId]);
          if(!await retirePrivateCryptoConversation(client,room.conversation_id))await client.query(`DELETE FROM conversations WHERE id = $1`, [room.conversation_id]);
          await this.checkActorSessionAndBan(client, actorId, sessionId);
          await client.query('COMMIT');
          await this.callRevoker?.();
          return { success: true };
        }

        await client.query(`DELETE FROM permission_grants WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
        await client.query(`DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
        await client.query(`DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, [room.conversation_id, targetUserId]);
        await cryptoMemberLeft(client,room.conversation_id,targetUserId);
        await this.checkActorSessionAndBan(client, actorId, sessionId);
        await client.query('COMMIT');
        await this.callRevoker?.();
        return { success: true };
      }

      // Removing another member
      if (targetRole === 'OWNER') {
        roomError(ErrorCode.FORBIDDEN, 'Cannot remove room owner');
      }

      const actorRes = await client.query(
        `SELECT rm.role, COALESCE(JSON_AGG(pg.permission) FILTER (WHERE pg.permission IS NOT NULL), '[]') as permissions
         FROM room_members rm
         LEFT JOIN permission_grants pg ON pg.room_id = rm.room_id AND pg.user_id = rm.user_id
         WHERE rm.room_id = $1 AND rm.user_id = $2
         GROUP BY rm.role`,
        [roomId, actorId]
      );

      if ((actorRes.rowCount ?? 0) === 0) {
        roomError(ErrorCode.FORBIDDEN, 'Requesting user is not a member of this room');
      }

      const actorRole = actorRes.rows[0].role;
      const actorPerms: string[] = Array.isArray(actorRes.rows[0].permissions) ? actorRes.rows[0].permissions : [];

      if (actorRole === 'MEMBER') {
        roomError(ErrorCode.FORBIDDEN, 'Regular members cannot remove other members');
      }

      if (actorRole === 'HELPER') {
        if (!actorPerms.includes('MANAGE_MEMBERS')) {
          roomError(ErrorCode.FORBIDDEN, 'Helper lacks MANAGE_MEMBERS permission');
        }
        if (targetRole === 'HELPER' || targetRole === 'OWNER') {
          roomError(ErrorCode.FORBIDDEN, 'Helper cannot remove another helper or owner');
        }
      }

      await client.query(`DELETE FROM permission_grants WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
      await client.query(`DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
      await client.query(`DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, [room.conversation_id, targetUserId]);
      await cryptoMemberLeft(client,room.conversation_id,targetUserId);

      await this.checkActorSessionAndBan(client, actorId, sessionId);
      await client.query('COMMIT');
      await this.callRevoker?.();
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async dissolveRoom(actorId: string, sessionId: string, roomId: string): Promise<{ success: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const roomRes = await client.query(`SELECT conversation_id, owner_id FROM rooms WHERE id = $1 FOR UPDATE`, [roomId]);
      if ((roomRes.rowCount ?? 0) === 0) {
        roomError(ErrorCode.NOT_FOUND, 'Room not found');
      }

      await this.checkActorSessionAndBan(client, actorId, sessionId);

      const room = roomRes.rows[0];
      if (room.owner_id !== actorId) {
        roomError(ErrorCode.FORBIDDEN, 'Only room owner can dissolve room');
      }

      await client.query(`DELETE FROM rooms WHERE id = $1`, [roomId]);
      if(!await retirePrivateCryptoConversation(client,room.conversation_id))await client.query(`DELETE FROM conversations WHERE id = $1`, [room.conversation_id]);

      await this.checkActorSessionAndBan(client, actorId, sessionId);
      await client.query('COMMIT');
      await this.callRevoker?.();
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
