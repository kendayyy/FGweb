import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../src/index.js';

function loadLocalEnv(): Record<string, string> {
  if (process.env.DATABASE_URL) {
    return process.env as Record<string, string>;
  }
  const envPath = path.resolve(import.meta.dirname, '../../../.env.local');
  const content = fs.readFileSync(envPath, 'utf8');
  return parseEnv(content) as Record<string, string>;
}

function getPgErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const pgErr = err as { code?: string; cause?: { code?: string } };
  return pgErr.cause?.code ?? pgErr.code;
}

describe('T07 - Call, Notification, Moderation & Outbox Constraints', () => {
  let client: pg.Client;
  let db: NodePgDatabase<typeof schema> & { $client: pg.Client };
  let schemaName: string;
  let env: Record<string, string>;
  let codeRootDir: string;

  beforeAll(async () => {
    codeRootDir = path.resolve(import.meta.dirname, '../../../');
    process.chdir(codeRootDir);

    env = loadLocalEnv();
    schemaName = `test_t07_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    client = new pg.Client({ connectionString: env.DATABASE_URL });
    await client.connect();

    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}"`);

    db = drizzle(client, { schema });

    const migrationsFolder = path.resolve(codeRootDir, 'packages/database/migrations');
    await migrate(db, { migrationsFolder, migrationsSchema: schemaName });
  }, 30000);

  afterAll(async () => {
    const errors: unknown[] = [];
    if (client) {
      try {
        if (schemaName.startsWith('test_t07_')) {
          await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        }
      } catch (err) {
        errors.push(err);
      }
      try {
        await client.end();
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'Failed to clean up test suite schema');
  });

  async function createRoomFixture(prefix: string) {
    const now = new Date();
    const gameId = 'game_' + prefix + '_' + Math.random().toString(36).substring(2, 6);
    const ownerId = 'user_owner_' + prefix + '_' + Math.random().toString(36).substring(2, 6);
    const convId = 'conv_room_' + prefix + '_' + Math.random().toString(36).substring(2, 6);
    const roomId = 'room_' + prefix + '_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values({
      id: ownerId,
      name: 'Owner ' + prefix,
      email: `${ownerId}@example.com`,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.games).values({
      id: gameId,
      title: 'Game ' + prefix,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.conversations).values({
      id: convId,
      kind: 'ROOM',
      createdAt: now,
      updatedAt: now,
    });

    const txClient = new pg.Client({ connectionString: env.DATABASE_URL });
    await txClient.connect();
    await txClient.query(`SET search_path TO "${schemaName}"`);
    try {
      await txClient.query('BEGIN');
      await txClient.query(
        `INSERT INTO rooms (id, name, game_id, owner_id, conversation_id, conversation_kind, visibility, invite_policy, player_capacity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'ROOM', 'PRIVATE', 'OWNER_APPROVAL', 5, $6, $6)`,
        [roomId, 'Room ' + prefix, gameId, ownerId, convId, now]
      );
      await txClient.query(
        `INSERT INTO room_members (id, room_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, 'OWNER', $4)`,
        ['rm_owner_' + roomId, roomId, ownerId, now]
      );
      await txClient.query('COMMIT');
    } finally {
      await txClient.end();
    }

    return { gameId, ownerId, convId, roomId, now };
  }

  it('should enforce call member is a member of the same private room', async () => {
    const { roomId, now } = await createRoomFixture('room_nonmember');
    const callId = 'call_nm_' + Math.random().toString(36).substring(2, 6);
    const outsiderId = 'user_outsider_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values({
      id: outsiderId,
      name: 'Outsider User',
      email: `${outsiderId}@example.com`,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.callGroups).values({
      id: callId,
      roomId,
      state: 'OPEN',
      createdAt: now,
    });

    // Inserting an outsider not in room_members for this room must fail FK (23503)
    let err: unknown = null;
    try {
      await db.insert(schema.callMembers).values({
        id: 'cm_outsider',
        callGroupId: callId,
        roomId,
        userId: outsiderId,
        seatIndex: 1,
        isMuted: true,
        joinedAt: now,
      });
    } catch (e) {
      err = e;
    }
    expect(getPgErrorCode(err)).toBe('23503');
  });

  it('should reject adding active call member to a CLOSED call group', async () => {
    const { ownerId, roomId, now } = await createRoomFixture('closed_call');
    const callId = 'call_closed_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.callGroups).values({
      id: callId,
      roomId,
      state: 'CLOSED',
      createdAt: now,
      endedAt: now,
    });

    // Attempting to add active member to CLOSED call group must fail FK (23503)
    let err: unknown = null;
    try {
      await db.insert(schema.callMembers).values({
        id: 'cm_closed',
        callGroupId: callId,
        roomId,
        userId: ownerId,
        seatIndex: 1,
        isMuted: true,
        joinedAt: now,
      });
    } catch (e) {
      err = e;
    }
    expect(getPgErrorCode(err)).toBe('23503');
  });

  it('should enforce max 10 active call participants and unique user across active calls', async () => {
    const { ownerId, roomId, now } = await createRoomFixture('max_participants');
    const callId = 'call_max_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.callGroups).values({
      id: callId,
      roomId,
      state: 'OPEN',
      createdAt: now,
    });

    // Create 10 users and add them as room members
    const memberIds: string[] = [ownerId];
    for (let i = 2; i <= 11; i++) {
      const uId = `user_p_${i}_` + Math.random().toString(36).substring(2, 6);
      await db.insert(schema.user).values({
        id: uId,
        name: `User ${i}`,
        email: `${uId}@example.com`,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(schema.roomMembers).values({
        id: `rm_p_${i}_` + roomId,
        roomId,
        userId: uId,
        role: 'MEMBER',
        joinedAt: now,
      });
      memberIds.push(uId);
    }

    // Insert 10 active call members (seats 1..10)
    for (let i = 1; i <= 10; i++) {
      await db.insert(schema.callMembers).values({
        id: `cm_seat_${i}`,
        callGroupId: callId,
        roomId,
        userId: memberIds[i - 1],
        seatIndex: i,
        isMuted: true,
        joinedAt: now,
      });
    }

    // 11th active participant (seat 11 > max 10) must fail check constraint (23514)
    let overMaxErr: unknown = null;
    try {
      await db.insert(schema.callMembers).values({
        id: 'cm_seat_11',
        callGroupId: callId,
        roomId,
        userId: memberIds[10],
        seatIndex: 11,
        isMuted: true,
        joinedAt: now,
      });
    } catch (e) {
      overMaxErr = e;
    }
    expect(getPgErrorCode(overMaxErr)).toBe('23514');

    // User already active in call 1 trying to join active call 2 must fail unique constraint (23505)
    const { roomId: roomId2 } = await createRoomFixture('cross_call');
    await db.insert(schema.roomMembers).values({
      id: 'rm_owner_room2',
      roomId: roomId2,
      userId: ownerId,
      role: 'MEMBER',
      joinedAt: now,
    });
    const callId2 = 'call_cross_' + Math.random().toString(36).substring(2, 6);
    await db.insert(schema.callGroups).values({
      id: callId2,
      roomId: roomId2,
      state: 'OPEN',
      createdAt: now,
    });

    let crossCallErr: unknown = null;
    try {
      await db.insert(schema.callMembers).values({
        id: 'cm_cross_user',
        callGroupId: callId2,
        roomId: roomId2,
        userId: ownerId,
        seatIndex: 1,
        isMuted: true,
        joinedAt: now,
      });
    } catch (e) {
      crossCallErr = e;
    }
    expect(getPgErrorCode(crossCallErr)).toBe('23505');
  });

  it('should allow seat reuse when participant departs while preserving member history', async () => {
    const { ownerId, roomId, now } = await createRoomFixture('seat_reuse');
    const callId = 'call_reuse_' + Math.random().toString(36).substring(2, 6);

    const user2Id = 'user_reuse_2_' + Math.random().toString(36).substring(2, 6);
    await db.insert(schema.user).values({
      id: user2Id,
      name: 'User Reuse 2',
      email: `${user2Id}@example.com`,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.roomMembers).values({
      id: 'rm_reuse_2',
      roomId,
      userId: user2Id,
      role: 'MEMBER',
      joinedAt: now,
    });

    await db.insert(schema.callGroups).values({
      id: callId,
      roomId,
      state: 'OPEN',
      createdAt: now,
    });

    // Owner joins seat 1
    await db.insert(schema.callMembers).values({
      id: 'cm_reuse_1',
      callGroupId: callId,
      roomId,
      userId: ownerId,
      seatIndex: 1,
      isMuted: true,
      joinedAt: now,
    });

    // Owner leaves call
    await db
      .update(schema.callMembers)
      .set({ leftAt: new Date() })
      .where(eq(schema.callMembers.id, 'cm_reuse_1'));

    // User 2 joins seat 1 now that it's vacated
    await db.insert(schema.callMembers).values({
      id: 'cm_reuse_2',
      callGroupId: callId,
      roomId,
      userId: user2Id,
      seatIndex: 1,
      isMuted: false,
      joinedAt: new Date(),
    });

    const activeCount = await db
      .select()
      .from(schema.callMembers)
      .where(sql`call_group_id = ${callId} AND left_at IS NULL`);
    expect(activeCount).toHaveLength(1);

    const totalCount = await db
      .select()
      .from(schema.callMembers)
      .where(eq(schema.callMembers.callGroupId, callId));
    expect(totalCount).toHaveLength(2);
  });

  it('should enforce screen publisher is an active call member and ordinals 1..3 are unique', async () => {
    const { ownerId, roomId, now } = await createRoomFixture('publishers');
    const callId = 'call_pub_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.callGroups).values({
      id: callId,
      roomId,
      state: 'OPEN',
      createdAt: now,
    });

    // 1. Non-call-member attempting to acquire publish slot must fail FK (23503)
    let nonMemberPubErr: unknown = null;
    try {
      await db.insert(schema.callPublishSlots).values({
        id: 'pub_nonmember',
        callGroupId: callId,
        userId: ownerId,
        ordinal: 1,
        createdAt: now,
      });
    } catch (e) {
      nonMemberPubErr = e;
    }
    expect(getPgErrorCode(nonMemberPubErr)).toBe('23503');

    // Add owner as active call member
    await db.insert(schema.callMembers).values({
      id: 'cm_pub_owner',
      callGroupId: callId,
      roomId,
      userId: ownerId,
      seatIndex: 1,
      isMuted: false,
      joinedAt: now,
    });

    // 2. Add owner as publisher 1 -> succeed
    await db.insert(schema.callPublishSlots).values({
      id: 'pub_owner_1',
      callGroupId: callId,
      userId: ownerId,
      ordinal: 1,
      createdAt: now,
    });

    // 3. Departed member cannot retain or obtain screen publish slot
    const user2Id = 'user_pub2_' + Math.random().toString(36).substring(2, 6);
    await db.insert(schema.user).values({
      id: user2Id,
      name: 'User Pub 2',
      email: `${user2Id}@example.com`,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.roomMembers).values({
      id: 'rm_pub2',
      roomId,
      userId: user2Id,
      role: 'MEMBER',
      joinedAt: now,
    });
    await db.insert(schema.callMembers).values({
      id: 'cm_pub2',
      callGroupId: callId,
      roomId,
      userId: user2Id,
      seatIndex: 2,
      isMuted: false,
      joinedAt: now,
    });

    // Depart user2
    await db.update(schema.callMembers).set({ leftAt: new Date() }).where(eq(schema.callMembers.id, 'cm_pub2'));

    // Inserting publisher for departed user2 fails FK (23503)
    let departedPubErr: unknown = null;
    try {
      await db.insert(schema.callPublishSlots).values({
        id: 'pub_departed',
        callGroupId: callId,
        userId: user2Id,
        ordinal: 2,
        createdAt: now,
      });
    } catch (e) {
      departedPubErr = e;
    }
    expect(getPgErrorCode(departedPubErr)).toBe('23503');

    // 4. 4th publisher ordinal (ordinal 4 > max 3) must fail check (23514)
    const user3Id = 'user_pub3_' + Math.random().toString(36).substring(2, 6);
    await db.insert(schema.user).values({
      id: user3Id,
      name: 'User Pub 3',
      email: `${user3Id}@example.com`,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.roomMembers).values({
      id: 'rm_pub3',
      roomId,
      userId: user3Id,
      role: 'MEMBER',
      joinedAt: now,
    });
    await db.insert(schema.callMembers).values({
      id: 'cm_pub3',
      callGroupId: callId,
      roomId,
      userId: user3Id,
      seatIndex: 3,
      isMuted: false,
      joinedAt: now,
    });

    let overPubErr: unknown = null;
    try {
      await db.insert(schema.callPublishSlots).values({
        id: 'pub_over',
        callGroupId: callId,
        userId: user3Id,
        ordinal: 4,
        createdAt: now,
      });
    } catch (e) {
      overPubErr = e;
    }
    expect(getPgErrorCode(overPubErr)).toBe('23514');
  });

  it('should enforce external live source constraints (max 1 source/call, youtube/twitch only)', async () => {
    const { ownerId, roomId, now } = await createRoomFixture('external_live');
    const callId = 'call_el_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.callGroups).values({
      id: callId,
      roomId,
      state: 'OPEN',
      createdAt: now,
    });

    await db.insert(schema.callMembers).values({
      id: 'cm_el_owner',
      callGroupId: callId,
      roomId,
      userId: ownerId,
      seatIndex: 1,
      isMuted: true,
      joinedAt: now,
    });

    // 1. Invalid provider (e.g. vimeo) fails check (23514)
    let invalidProviderErr: unknown = null;
    try {
      await db.insert(schema.externalLives).values({
        id: 'el_vimeo',
        callGroupId: callId,
        provider: 'vimeo',
        url: 'https://vimeo.com/123456',
        configuredBy: ownerId,
        createdAt: now,
      });
    } catch (e) {
      invalidProviderErr = e;
    }
    expect(getPgErrorCode(invalidProviderErr)).toBe('23514');

    // 2. Valid YouTube source -> succeed
    await db.insert(schema.externalLives).values({
      id: 'el_yt',
      callGroupId: callId,
      provider: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Awesome Live Stream',
      configuredBy: ownerId,
      createdAt: now,
    });

    // 3. Second source on same call group fails unique constraint (23505)
    let secondSourceErr: unknown = null;
    try {
      await db.insert(schema.externalLives).values({
        id: 'el_twitch',
        callGroupId: callId,
        provider: 'twitch',
        url: 'https://www.twitch.tv/streamer',
        configuredBy: ownerId,
        createdAt: now,
      });
    } catch (e) {
      secondSourceErr = e;
    }
    expect(getPgErrorCode(secondSourceErr)).toBe('23505');
  });

  it('should enforce unique eventId on webhook_events for anti-replay', async () => {
    const eventId = 'evt_' + Math.random().toString(36).substring(2, 8);
    const now = new Date();

    await db.insert(schema.webhookEvents).values({
      id: 'we_1',
      eventId,
      eventType: 'room_finished',
      payload: JSON.stringify({ room_name: 'test' }),
      processedAt: now,
    });

    let duplicateErr: unknown = null;
    try {
      await db.insert(schema.webhookEvents).values({
        id: 'we_2',
        eventId,
        eventType: 'room_finished',
        payload: JSON.stringify({ room_name: 'test' }),
        processedAt: now,
      });
    } catch (e) {
      duplicateErr = e;
    }
    expect(getPgErrorCode(duplicateErr)).toBe('23505');
  });

  it('should enforce notification dedup keys and preference channel email restrictions', async () => {
    const now = new Date();
    const uId = 'user_notif_' + Math.random().toString(36).substring(2, 6);
    const u2Id = 'user_notif2_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values([
      { id: uId, name: 'Notif User', email: `${uId}@example.com`, createdAt: now, updatedAt: now },
      { id: u2Id, name: 'Notif User 2', email: `${u2Id}@example.com`, createdAt: now, updatedAt: now },
    ]);

    // 1. Notification dedup key uniqueness per user (23505)
    await db.insert(schema.notifications).values({
      id: 'n_1',
      userId: uId,
      type: 'DM',
      title: 'New Message',
      body: 'Hello',
      dedupKey: 'dm_msg_100',
      isRead: false,
      createdAt: now,
    });

    let dupNotifErr: unknown = null;
    try {
      await db.insert(schema.notifications).values({
        id: 'n_2',
        userId: uId,
        type: 'DM',
        title: 'New Message Duplicate',
        body: 'Hello again',
        dedupKey: 'dm_msg_100',
        isRead: false,
        createdAt: now,
      });
    } catch (e) {
      dupNotifErr = e;
    }
    expect(getPgErrorCode(dupNotifErr)).toBe('23505');

    // 2. Outbox recipient must match notification user ID (composite FK 23503)
    let wrongRecipientErr: unknown = null;
    try {
      await db.insert(schema.notificationOutbox).values({
        id: 'ob_wrong_recipient',
        notificationId: 'n_1',
        userId: u2Id, // u2Id does not match uId of n_1
        channel: 'IN_APP',
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
        dedupKey: 'outbox_key_wrong',
        scheduledAt: now,
        createdAt: now,
      });
    } catch (e) {
      wrongRecipientErr = e;
    }
    expect(getPgErrorCode(wrongRecipientErr)).toBe('23503');

    // 3. Preference forbidden email check (e.g. DM with email=true fails 23514)
    let forbiddenEmailErr: unknown = null;
    try {
      await db.insert(schema.notificationPreferences).values({
        id: 'np_dm_email',
        userId: uId,
        notificationType: 'DM',
        inApp: true,
        push: true,
        email: true, // DM email is forbidden!
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      forbiddenEmailErr = e;
    }
    expect(getPgErrorCode(forbiddenEmailErr)).toBe('23514');

    // 4. Valid preference with allowed email (e.g. FRIEND_INVITE with email=true) -> succeed
    await db.insert(schema.notificationPreferences).values({
      id: 'np_friend_email',
      userId: uId,
      notificationType: 'FRIEND_INVITE',
      inApp: true,
      push: true,
      email: true,
      createdAt: now,
      updatedAt: now,
    });

    // 5. Push subscription endpoint unique (23505)
    const endpointUrl = 'https://push.example.com/sub/12345';
    await db.insert(schema.pushSubscriptions).values({
      id: 'ps_1',
      userId: uId,
      endpoint: endpointUrl,
      p256dh: 'p256dh_key',
      auth: 'auth_key',
      createdAt: now,
    });

    let dupPushErr: unknown = null;
    try {
      await db.insert(schema.pushSubscriptions).values({
        id: 'ps_2',
        userId: uId,
        endpoint: endpointUrl,
        p256dh: 'p256dh_key_2',
        auth: 'auth_key_2',
        createdAt: now,
      });
    } catch (e) {
      dupPushErr = e;
    }
    expect(getPgErrorCode(dupPushErr)).toBe('23505');

    // 6. Notification outbox dedup key unique per channel + user (23505)
    await db.insert(schema.notificationOutbox).values({
      id: 'ob_1',
      notificationId: 'n_1',
      userId: uId,
      channel: 'IN_APP',
      status: 'PENDING',
      retryCount: 0,
      maxRetries: 3,
      dedupKey: 'outbox_key_1',
      scheduledAt: now,
      createdAt: now,
    });

    let dupOutboxErr: unknown = null;
    try {
      await db.insert(schema.notificationOutbox).values({
        id: 'ob_2',
        notificationId: 'n_1',
        userId: uId,
        channel: 'IN_APP',
        status: 'PENDING',
        retryCount: 0,
        maxRetries: 3,
        dedupKey: 'outbox_key_1',
        scheduledAt: now,
        createdAt: now,
      });
    } catch (e) {
      dupOutboxErr = e;
    }
    expect(getPgErrorCode(dupOutboxErr)).toBe('23505');
  });

  it('should enforce reports and admin actions audit rules', async () => {
    const now = new Date();
    const reporterId = 'user_rep_' + Math.random().toString(36).substring(2, 6);
    const targetUserId = 'user_target_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values([
      { id: reporterId, name: 'Reporter User', email: `${reporterId}@example.com`, createdAt: now, updatedAt: now },
      { id: targetUserId, name: 'Target User', email: `${targetUserId}@example.com`, createdAt: now, updatedAt: now },
    ]);

    // 1. Report reason > 200 chars fails check (23514)
    let longReasonErr: unknown = null;
    try {
      await db.insert(schema.reports).values({
        id: 'rep_long',
        reporterId,
        targetType: 'USER',
        targetId: targetUserId,
        reportedUserId: targetUserId,
        reason: 'x'.repeat(201),
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      longReasonErr = e;
    }
    expect(getPgErrorCode(longReasonErr)).toBe('23514');

    // 2. Missing target user on USER report fails shape check (23514)
    let missingTargetErr: unknown = null;
    try {
      await db.insert(schema.reports).values({
        id: 'rep_missing_target',
        reporterId,
        targetType: 'USER',
        targetId: 'non_existent_target',
        reportedUserId: null as unknown as string,
        reason: 'Harassment',
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      missingTargetErr = e;
    }
    expect(getPgErrorCode(missingTargetErr)).toBe('23514');

    // 3. Target shape mismatch (targetType = USER but reportedMessageId supplied) fails check (23514)
    let shapeErr: unknown = null;
    try {
      await db.insert(schema.reports).values({
        id: 'rep_shape',
        reporterId,
        targetType: 'USER',
        targetId: targetUserId,
        reportedUserId: targetUserId,
        reportedMessageId: 'msg_invalid_for_user_type',
        reason: 'Harassment',
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      shapeErr = e;
    }
    expect(getPgErrorCode(shapeErr)).toBe('23514');

    // 4. Valid USER report -> succeed
    await db.insert(schema.reports).values({
      id: 'rep_valid',
      reporterId,
      targetType: 'USER',
      targetId: targetUserId,
      reportedUserId: targetUserId,
      reason: 'Harassment in voice chat',
      details: 'Spamming loud noises',
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    });

    // 4b. MESSAGE report carrying unrelated reportedUserId fails shape check (23514)
    const convId = 'conv_rep_msg_' + Math.random().toString(36).substring(2, 6);
    const msgId = 'msg_rep_' + Math.random().toString(36).substring(2, 6);
    await db.insert(schema.conversations).values({
      id: convId,
      kind: 'DM',
      user1Id: reporterId,
      user2Id: targetUserId,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.messages).values({
      id: msgId,
      conversationId: convId,
      senderId: targetUserId,
      clientMessageId: 'client_rep_msg',
      content: 'Abusive message content',
      createdAt: now,
    });

    let mixedMessageReportErr: unknown = null;
    try {
      await db.insert(schema.reports).values({
        id: 'rep_msg_mixed',
        reporterId,
        targetType: 'MESSAGE',
        targetId: msgId,
        reportedUserId: targetUserId, // Unrelated user target on MESSAGE report MUST fail!
        reportedMessageId: msgId,
        reason: 'Spam',
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      mixedMessageReportErr = e;
    }
    expect(getPgErrorCode(mixedMessageReportErr)).toBe('23514');

    // 4c. Valid MESSAGE report (reportedUserId is NULL) -> succeed
    await db.insert(schema.reports).values({
      id: 'rep_msg_valid',
      reporterId,
      targetType: 'MESSAGE',
      targetId: msgId,
      reportedMessageId: msgId,
      reason: 'Spam',
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    });

    // 5. Admin audit action requires actorId (23502)
    let missingActorErr: unknown = null;
    try {
      await db.insert(schema.adminActions).values({
        id: 'act_no_actor',
        actorId: null as unknown as string,
        targetUserId,
        action: 'BAN',
        reason: 'Violation',
        createdAt: now,
      });
    } catch (e) {
      missingActorErr = e;
    }
    expect(getPgErrorCode(missingActorErr)).toBe('23502');

    // 6. Valid admin audit action -> succeed
    await db.insert(schema.adminActions).values({
      id: 'act_ban',
      actorId: reporterId,
      targetUserId,
      action: 'BAN',
      reason: 'Rule violation',
      createdAt: now,
    });

    // 7. Hard deletion of actor user fails FK violation (23503)
    let deleteActorErr: unknown = null;
    try {
      await db.delete(schema.user).where(eq(schema.user.id, reporterId));
    } catch (e) {
      deleteActorErr = e;
    }
    expect(getPgErrorCode(deleteActorErr)).toBe('23503');
  });

  it('should handle real 2-client transaction race for last seat 10 in active call', { timeout: 30000 }, async () => {
    const { roomId, now } = await createRoomFixture('race_seat10');
    const callId = 'call_race10_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.callGroups).values({
      id: callId,
      roomId,
      state: 'OPEN',
      createdAt: now,
    });

    // Create 11 member users in room
    const memberIds: string[] = [];
    for (let i = 1; i <= 11; i++) {
      const uId = `user_race10_${i}_` + Math.random().toString(36).substring(2, 6);
      await db.insert(schema.user).values({
        id: uId,
        name: `User Race ${i}`,
        email: `${uId}@example.com`,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(schema.roomMembers).values({
        id: `rm_race10_${i}_` + roomId,
        roomId,
        userId: uId,
        role: 'MEMBER',
        joinedAt: now,
      });
      memberIds.push(uId);
    }

    // Fill seats 1..9
    for (let i = 1; i <= 9; i++) {
      await db.insert(schema.callMembers).values({
        id: `cm_race10_seat_${i}`,
        callGroupId: callId,
        roomId,
        userId: memberIds[i - 1],
        seatIndex: i,
        isMuted: true,
        joinedAt: now,
      });
    }

    // Candidates for 10th seat
    const candA = memberIds[9];
    const candB = memberIds[10];

    const c1 = new pg.Client({ connectionString: env.DATABASE_URL });
    const c2 = new pg.Client({ connectionString: env.DATABASE_URL });
    await c1.connect();
    await c2.connect();
    await c1.query(`SET search_path TO "${schemaName}"`);
    await c2.query(`SET search_path TO "${schemaName}"`);

    const runTx = async (c: pg.Client, userId: string, id: string) => {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO call_members (id, call_group_id, room_id, user_id, seat_index, joined_at)
         VALUES ($1, $2, $3, $4, 10, NOW())`,
        [id, callId, roomId, userId]
      );
      await c.query('COMMIT');
    };

    const results = await Promise.allSettled([
      runTx(c1, candA, 'cm_race10_candA'),
      runTx(c2, candB, 'cm_race10_candB'),
    ]);

    await c1.end();
    await c2.end();

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(getPgErrorCode((rejected[0] as PromiseRejectedResult).reason)).toBe('23505');

    const activeMembers = await db
      .select()
      .from(schema.callMembers)
      .where(sql`call_group_id = ${callId} AND left_at IS NULL`);
    expect(activeMembers).toHaveLength(10);
  });

  it('should handle real 2-client transaction race for 3rd publisher slot', { timeout: 30000 }, async () => {
    const { ownerId, roomId, now } = await createRoomFixture('race_pub3');
    const callId = 'call_race_pub3_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.callGroups).values({
      id: callId,
      roomId,
      state: 'OPEN',
      createdAt: now,
    });

    const userIds: string[] = [ownerId];
    for (let i = 2; i <= 4; i++) {
      const uId = `user_pub_cand_${i}_` + Math.random().toString(36).substring(2, 6);
      await db.insert(schema.user).values({
        id: uId,
        name: `User Pub Cand ${i}`,
        email: `${uId}@example.com`,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(schema.roomMembers).values({
        id: `rm_pub_cand_${i}`,
        roomId,
        userId: uId,
        role: 'MEMBER',
        joinedAt: now,
      });
      userIds.push(uId);
    }

    // Add all 4 as active call members
    for (let i = 1; i <= 4; i++) {
      await db.insert(schema.callMembers).values({
        id: `cm_pub_cand_${i}`,
        callGroupId: callId,
        roomId,
        userId: userIds[i - 1],
        seatIndex: i,
        isMuted: false,
        joinedAt: now,
      });
    }

    // Ordinals 1 and 2 assigned to userIds[0] and userIds[1]
    await db.insert(schema.callPublishSlots).values([
      { id: 'pub_slot_1', callGroupId: callId, userId: userIds[0], ordinal: 1, createdAt: now },
      { id: 'pub_slot_2', callGroupId: callId, userId: userIds[1], ordinal: 2, createdAt: now },
    ]);

    // Candidates 3a and 3b compete for ordinal 3
    const cand3a = userIds[2];
    const cand3b = userIds[3];

    const c1 = new pg.Client({ connectionString: env.DATABASE_URL });
    const c2 = new pg.Client({ connectionString: env.DATABASE_URL });
    await c1.connect();
    await c2.connect();
    await c1.query(`SET search_path TO "${schemaName}"`);
    await c2.query(`SET search_path TO "${schemaName}"`);

    const runTx = async (c: pg.Client, userId: string, id: string) => {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO call_publish_slots (id, call_group_id, user_id, ordinal, created_at)
         VALUES ($1, $2, $3, 3, NOW())`,
        [id, callId, userId]
      );
      await c.query('COMMIT');
    };

    const results = await Promise.allSettled([
      runTx(c1, cand3a, 'pub_slot_3a'),
      runTx(c2, cand3b, 'pub_slot_3b'),
    ]);

    await c1.end();
    await c2.end();

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(getPgErrorCode((rejected[0] as PromiseRejectedResult).reason)).toBe('23505');

    const activePubs = await db
      .select()
      .from(schema.callPublishSlots)
      .where(eq(schema.callPublishSlots.callGroupId, callId));
    expect(activePubs).toHaveLength(3);
  });

  it('should handle real 2-client transaction race for same user joining 2 active calls', { timeout: 30000 }, async () => {
    const { ownerId, roomId: roomId1, now } = await createRoomFixture('race_cross1');
    const { roomId: roomId2 } = await createRoomFixture('race_cross2');

    await db.insert(schema.roomMembers).values({
      id: 'rm_cross_owner_room2',
      roomId: roomId2,
      userId: ownerId,
      role: 'MEMBER',
      joinedAt: now,
    });

    const callId1 = 'call_cross_race1_' + Math.random().toString(36).substring(2, 6);
    const callId2 = 'call_cross_race2_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.callGroups).values([
      { id: callId1, roomId: roomId1, state: 'OPEN', createdAt: now },
      { id: callId2, roomId: roomId2, state: 'OPEN', createdAt: now },
    ]);

    const c1 = new pg.Client({ connectionString: env.DATABASE_URL });
    const c2 = new pg.Client({ connectionString: env.DATABASE_URL });
    await c1.connect();
    await c2.connect();
    await c1.query(`SET search_path TO "${schemaName}"`);
    await c2.query(`SET search_path TO "${schemaName}"`);

    const runTx = async (c: pg.Client, callId: string, roomId: string, cmId: string) => {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO call_members (id, call_group_id, room_id, user_id, seat_index, joined_at)
         VALUES ($1, $2, $3, $4, 1, NOW())`,
        [cmId, callId, roomId, ownerId]
      );
      await c.query('COMMIT');
    };

    const results = await Promise.allSettled([
      runTx(c1, callId1, roomId1, 'cm_cross_c1'),
      runTx(c2, callId2, roomId2, 'cm_cross_c2'),
    ]);

    await c1.end();
    await c2.end();

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(getPgErrorCode((rejected[0] as PromiseRejectedResult).reason)).toBe('23505');

    const userCalls = await db
      .select()
      .from(schema.callMembers)
      .where(sql`user_id = ${ownerId} AND left_at IS NULL`);
    expect(userCalls).toHaveLength(1);
  });

  it('should stage prefix 0000-0002, seed populated data, apply 0003 twice idempotently, and preserve private room data', { timeout: 30000 }, async () => {
    const root = path.resolve(codeRootDir, '.cache');
    await fs.promises.mkdir(root, { recursive: true });
    const dir = await fs.promises.mkdtemp(path.join(root, 't07_migration_'));
    const cleanupErrors: unknown[] = [];
    const testSchemaName = 'test_t07_upgrade_' + randomUUID().replaceAll('-', '');

    const testClient = new pg.Client({ connectionString: env.DATABASE_URL });
    await testClient.connect();

    try {
      await fs.promises.mkdir(path.join(dir, 'meta'));
      const journalPath = path.resolve(codeRootDir, 'packages/database/migrations/meta/_journal.json');
      const journal = JSON.parse(await fs.promises.readFile(journalPath, 'utf8'));

      // Stage prefix 0000-0002 only
      const prefixEntries = journal.entries.slice(0, 3);
      await fs.promises.writeFile(
        path.join(dir, 'meta/_journal.json'),
        JSON.stringify({ version: journal.version, dialect: journal.dialect, entries: prefixEntries })
      );

      for (const entry of prefixEntries) {
        await fs.promises.copyFile(
          path.resolve(codeRootDir, `packages/database/migrations/${entry.tag}.sql`),
          path.join(dir, `${entry.tag}.sql`)
        );
      }

      await testClient.query(`CREATE SCHEMA "${testSchemaName}"`);
      await testClient.query(`SET search_path TO "${testSchemaName}"`);

      const testDb = drizzle(testClient, { schema });
      await migrate(testDb, { migrationsFolder: dir, migrationsSchema: testSchemaName });
      await schema.seedGames(testDb);

      // Seed representative data: users, games, conversations, messages, private room, room_member, play_session, roster (team_members), active_play_slots
      const now = new Date();
      await testClient.query(
        'INSERT INTO "user"(id, name, email, created_at, updated_at) VALUES ($1, $2, $3, $4, $4), ($5, $6, $7, $4, $4)',
        ['u_seed_a', 'Seed User A', 'u_seed_a@example.com', now, 'u_seed_b', 'Seed User B', 'u_seed_b@example.com']
      );

      await testClient.query(
        "INSERT INTO conversations(id, kind, user1_id, user2_id, created_at, updated_at) VALUES ('conv_dm_1', 'DM', 'u_seed_a', 'u_seed_b', $1, $1)",
        [now]
      );
      await testClient.query(
        "INSERT INTO messages(id, conversation_id, sender_id, client_message_id, content, created_at) VALUES ('msg_dm_1', 'conv_dm_1', 'u_seed_a', 'client_1', 'Secret DM', $1)",
        [now]
      );

      const gamesRes = await testClient.query('SELECT id FROM games ORDER BY title LIMIT 1');
      const firstGameId = gamesRes.rows[0].id;

      await testClient.query(
        "INSERT INTO conversations(id, kind, created_at, updated_at) VALUES ('conv_priv_room', 'ROOM', $1, $1)",
        [now]
      );

      await testClient.query('BEGIN');
      await testClient.query(
        `INSERT INTO rooms(id, name, game_id, owner_id, conversation_id, conversation_kind, visibility, invite_policy, player_capacity, created_at, updated_at)
         VALUES ('room_priv_1', 'Private Squad', $1, 'u_seed_a', 'conv_priv_room', 'ROOM', 'PRIVATE', 'OWNER_APPROVAL', 5, $2, $2)`,
        [firstGameId, now]
      );
      await testClient.query(
        "INSERT INTO room_members(id, room_id, user_id, role, joined_at) VALUES ('rm_priv_a', 'room_priv_1', 'u_seed_a', 'OWNER', $1), ('rm_priv_b', 'room_priv_1', 'u_seed_b', 'MEMBER', $1)",
        [now]
      );
      await testClient.query(
        "INSERT INTO play_sessions(id, room_id, host_user_id, player_capacity, timing_type, state, created_at, updated_at) VALUES ('ps_seed_1', 'room_priv_1', 'u_seed_a', 5, 'now', 'ACTIVE', $1, $1)",
        [now]
      );
      await testClient.query(
        "INSERT INTO team_members(id, play_session_id, user_id, slot_index, player_capacity, is_host, joined_at) VALUES ('tm_seed_1', 'ps_seed_1', 'u_seed_a', 1, 5, true, $1), ('tm_seed_2', 'ps_seed_1', 'u_seed_b', 2, 5, false, $1)",
        [now]
      );
      await testClient.query(
        "INSERT INTO active_play_slots(user_id, play_session_id, session_state, slot_index, created_at) VALUES ('u_seed_a', 'ps_seed_1', 'ACTIVE', 1, $1), ('u_seed_b', 'ps_seed_1', 'ACTIVE', 2, $1)",
        [now]
      );
      await testClient.query('COMMIT');

      // Snapshot exact rows
      const tables = [
        'user',
        'games',
        'lobbies',
        'conversations',
        'messages',
        'rooms',
        'room_members',
        'play_sessions',
        'team_members',
        'active_play_slots',
      ];
      const snapshotBefore: Record<string, unknown[]> = {};
      for (const t of tables) {
        const orderCol = t === 'active_play_slots' ? 'user_id' : 'id';
        snapshotBefore[t] = (await testClient.query(`SELECT * FROM "${t}" ORDER BY ${orderCol}`)).rows;
      }
      expect(snapshotBefore.games).toHaveLength(7);
      expect(snapshotBefore.lobbies).toHaveLength(7);

      // Apply forward 0003 migration TWICE
      const fullMigrationsFolder = path.resolve(codeRootDir, 'packages/database/migrations');
      await migrate(testDb, { migrationsFolder: fullMigrationsFolder, migrationsSchema: testSchemaName });
      await migrate(testDb, { migrationsFolder: fullMigrationsFolder, migrationsSchema: testSchemaName });

      // Assert all rows remain identical and private visibility preserved
      for (const t of tables) {
        const orderCol = t === 'active_play_slots' ? 'user_id' : 'id';
        const snapshotAfter = (await testClient.query(`SELECT * FROM "${t}" ORDER BY ${orderCol}`)).rows;
        expect(snapshotAfter).toEqual(snapshotBefore[t]);
      }

      const roomRes = await testClient.query("SELECT visibility FROM rooms WHERE id = 'room_priv_1'");
      expect(roomRes.rows[0].visibility).toBe('PRIVATE');
    } finally {
      try {
        await testClient.query(`DROP SCHEMA IF EXISTS "${testSchemaName}" CASCADE`);
      } catch (e) {
        cleanupErrors.push(e);
      }
      try {
        await testClient.end();
      } catch (e) {
        cleanupErrors.push(e);
      }
      try {
        const resolved = path.resolve(dir);
        if (path.dirname(resolved) === root && path.basename(resolved).startsWith('t07_migration_')) {
          await fs.promises.rm(resolved, { recursive: true, force: true });
        } else {
          cleanupErrors.push(new Error('Unsafe cleanup path: ' + resolved));
        }
      } catch (e) {
        cleanupErrors.push(e);
      }
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'Migration test cleanup failed');
    }
  });
});
