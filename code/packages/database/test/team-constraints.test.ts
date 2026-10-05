import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
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
  const pgErr = err as { code?: string; cause?: { code?: string } };
  return pgErr.cause?.code ?? pgErr.code;
}

describe('T06 - Room, Team, Play Session & Recruitment Constraints', () => {
  let client: pg.Client;
  let db: NodePgDatabase<typeof schema> & { $client: pg.Client };
  let schemaName: string;
  let env: Record<string, string>;
  let codeRootDir: string;

  beforeAll(async () => {
    codeRootDir = path.resolve(import.meta.dirname, '../../../');
    process.chdir(codeRootDir);

    env = loadLocalEnv();
    schemaName = `test_t06_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
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
        if (schemaName.startsWith('test_t06_')) {
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

  it('should enforce room owner is a member in real transaction commit via deferred composite FK', async () => {
    const now = new Date();
    const gameId = 'game_t06_' + Math.random().toString(36).substring(2, 6);
    const ownerId = 'user_owner_' + Math.random().toString(36).substring(2, 6);
    const convId = 'conv_room_' + Math.random().toString(36).substring(2, 6);
    const roomId = 'room_owner_test_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values({
      id: ownerId,
      name: 'Owner User',
      email: `${ownerId}@example.com`,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.games).values({
      id: gameId,
      title: 'Test Game ' + gameId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.conversations).values({
      id: convId,
      kind: 'ROOM',
      createdAt: now,
      updatedAt: now,
    });

    // 1. Transaction without inserting owner into room_members should fail at commit (23503)
    let commitErr: unknown = null;
    const txClient = new pg.Client({ connectionString: env.DATABASE_URL });
    await txClient.connect();
    await txClient.query(`SET search_path TO "${schemaName}"`);

    try {
      await txClient.query('BEGIN');
      await txClient.query(
        `INSERT INTO rooms (id, name, game_id, owner_id, conversation_id, conversation_kind, visibility, invite_policy, player_capacity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'ROOM', 'PUBLIC', 'OWNER_APPROVAL', 5, $6, $6)`,
        [roomId, 'Test Room', gameId, ownerId, convId, now]
      );
      await txClient.query('COMMIT');
    } catch (err) {
      commitErr = err;
      await txClient.query('ROLLBACK');
    } finally {
      await txClient.end();
    }
    expect(getPgErrorCode(commitErr)).toBe('23503');

    // 2. Transaction with room + room_members (owner) should succeed
    const validTxClient = new pg.Client({ connectionString: env.DATABASE_URL });
    await validTxClient.connect();
    await validTxClient.query(`SET search_path TO "${schemaName}"`);

    try {
      await validTxClient.query('BEGIN');
      await validTxClient.query(
        `INSERT INTO rooms (id, name, game_id, owner_id, conversation_id, conversation_kind, visibility, invite_policy, player_capacity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'ROOM', 'PUBLIC', 'OWNER_APPROVAL', 5, $6, $6)`,
        [roomId, 'Test Room Valid', gameId, ownerId, convId, now]
      );
      await validTxClient.query(
        `INSERT INTO room_members (id, room_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, 'OWNER', $4)`,
        ['rm_' + roomId, roomId, ownerId, now]
      );
      await validTxClient.query('COMMIT');
    } finally {
      await validTxClient.end();
    }
  });

  it('should prevent room from linking to non-ROOM conversation (e.g. LOBBY or DM)', async () => {
    const now = new Date();
    const gameId = 'game_conv_' + Math.random().toString(36).substring(2, 6);
    const ownerId = 'user_conv_' + Math.random().toString(36).substring(2, 6);
    const lobbyId = 'lobby_conv_' + Math.random().toString(36).substring(2, 6);
    const lobbyConvId = 'conv_lobby_' + Math.random().toString(36).substring(2, 6);
    const roomId = 'room_lobby_link_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values({
      id: ownerId,
      name: 'Owner User Conv',
      email: `${ownerId}@example.com`,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.games).values({
      id: gameId,
      title: 'Game Conv ' + gameId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.lobbies).values({
      id: lobbyId,
      gameId,
      name: 'Game Lobby',
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.conversations).values({
      id: lobbyConvId,
      kind: 'LOBBY',
      lobbyId,
      createdAt: now,
      updatedAt: now,
    });

    let linkErr: unknown = null;
    try {
      await db.insert(schema.rooms).values({
        id: roomId,
        name: 'Invalid Lobby Link Room',
        gameId,
        ownerId,
        conversationId: lobbyConvId,
        conversationKind: 'ROOM',
        visibility: 'PUBLIC',
        invitePolicy: 'OWNER_APPROVAL',
        playerCapacity: 5,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      linkErr = err;
    }
    expect(getPgErrorCode(linkErr)).toBe('23503');
  });

  it('should enforce team capacity and slot bounds at DB level', async () => {
    const now = new Date();
    const gameId = 'game_cap_' + Math.random().toString(36).substring(2, 6);
    const ownerId = 'user_cap_' + Math.random().toString(36).substring(2, 6);
    const convId = 'conv_cap_' + Math.random().toString(36).substring(2, 6);
    const roomId = 'room_cap_' + Math.random().toString(36).substring(2, 6);
    const sessionId = 'session_cap_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values({
      id: ownerId,
      name: 'User Cap',
      email: `${ownerId}@example.com`,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.games).values({
      id: gameId,
      title: 'Game Cap ' + gameId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.conversations).values({
      id: convId,
      kind: 'ROOM',
      createdAt: now,
      updatedAt: now,
    });

    // 1. Negative or >10 player capacity check
    let invalidCapErr: unknown = null;
    try {
      await db.insert(schema.rooms).values({
        id: 'room_neg_cap',
        name: 'Negative Cap',
        gameId,
        ownerId,
        conversationId: convId,
        playerCapacity: 0,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      invalidCapErr = err;
    }
    expect(getPgErrorCode(invalidCapErr)).toBe('23514');

    // Setup valid room and play session with capacity = 2
    const txClient = new pg.Client({ connectionString: env.DATABASE_URL });
    await txClient.connect();
    await txClient.query(`SET search_path TO "${schemaName}"`);
    try {
      await txClient.query('BEGIN');
      await txClient.query(
        `INSERT INTO rooms (id, name, game_id, owner_id, conversation_id, conversation_kind, visibility, invite_policy, player_capacity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'ROOM', 'PUBLIC', 'OWNER_APPROVAL', 2, $6, $6)`,
        [roomId, 'Cap Room', gameId, ownerId, convId, now]
      );
      await txClient.query(
        `INSERT INTO room_members (id, room_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, 'OWNER', $4)`,
        ['rm_' + roomId, roomId, ownerId, now]
      );
      await txClient.query('COMMIT');
    } finally {
      await txClient.end();
    }

    await db.insert(schema.playSessions).values({
      id: sessionId,
      roomId,
      hostUserId: ownerId,
      playerCapacity: 2,
      timingType: 'now',
      state: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    // 2. Insert member into slot 1
    await db.insert(schema.teamMembers).values({
      id: 'tm_1',
      playSessionId: sessionId,
      userId: ownerId,
      slotIndex: 1,
      playerCapacity: 2,
      isHost: true,
      joinedAt: now,
    });

    // 3. Insert member into slot 3 (> capacity 2) must fail check (23514)
    const user2Id = 'user_cap2_' + Math.random().toString(36).substring(2, 6);
    await db.insert(schema.user).values({
      id: user2Id,
      name: 'User Cap 2',
      email: `${user2Id}@example.com`,
      createdAt: now,
      updatedAt: now,
    });

    let overCapErr: unknown = null;
    try {
      await db.insert(schema.teamMembers).values({
        id: 'tm_3',
        playSessionId: sessionId,
        userId: user2Id,
        slotIndex: 3,
        playerCapacity: 2,
        isHost: false,
        joinedAt: now,
      });
    } catch (err) {
      overCapErr = err;
    }
    expect(getPgErrorCode(overCapErr)).toBe('23514');
  });

  it('should reject SCHEDULED session or spectator (non-roster) from acquiring active play slot', async () => {
    const now = new Date();
    const gameId = 'game_slot_' + Math.random().toString(36).substring(2, 6);
    const ownerId = 'user_slot_owner_' + Math.random().toString(36).substring(2, 6);
    const spectatorId = 'user_spectator_' + Math.random().toString(36).substring(2, 6);
    const convId = 'conv_slot_' + Math.random().toString(36).substring(2, 6);
    const roomId = 'room_slot_' + Math.random().toString(36).substring(2, 6);
    const scheduledSessionId = 'session_sched_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values([
      { id: ownerId, name: 'Owner User Slot', email: `${ownerId}@example.com`, createdAt: now, updatedAt: now },
      { id: spectatorId, name: 'Spectator User', email: `${spectatorId}@example.com`, createdAt: now, updatedAt: now },
    ]);

    await db.insert(schema.games).values({
      id: gameId,
      title: 'Game Slot ' + gameId,
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
         VALUES ($1, $2, $3, $4, $5, 'ROOM', 'PUBLIC', 'OWNER_APPROVAL', 5, $6, $6)`,
        [roomId, 'Slot Room', gameId, ownerId, convId, now]
      );
      await txClient.query(
        `INSERT INTO room_members (id, room_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, 'OWNER', $4)`,
        ['rm_' + roomId, roomId, ownerId, now]
      );
      await txClient.query('COMMIT');
    } finally {
      await txClient.end();
    }

    // 1. Scheduled play session
    const scheduledDate = new Date(Date.now() + 3600000);
    await db.insert(schema.playSessions).values({
      id: scheduledSessionId,
      roomId,
      hostUserId: ownerId,
      playerCapacity: 5,
      timingType: 'scheduledAt',
      scheduledAt: scheduledDate,
      state: 'SCHEDULED',
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.teamMembers).values({
      id: 'tm_sched_1',
      playSessionId: scheduledSessionId,
      userId: ownerId,
      slotIndex: 1,
      playerCapacity: 5,
      isHost: true,
      joinedAt: now,
    });

    // Attempt to acquire active play slot for SCHEDULED session must fail FK (23503)
    let schedSlotErr: unknown = null;
    try {
      await db.insert(schema.activePlaySlots).values({
        userId: ownerId,
        playSessionId: scheduledSessionId,
        sessionState: 'ACTIVE',
        slotIndex: 1,
        createdAt: now,
      });
    } catch (err) {
      schedSlotErr = err;
    }
    expect(getPgErrorCode(schedSlotErr)).toBe('23503');

    // 2. Active play session with spectator not in roster
    const activeSessionId = 'session_active_' + Math.random().toString(36).substring(2, 6);
    await db.insert(schema.playSessions).values({
      id: activeSessionId,
      roomId,
      hostUserId: ownerId,
      playerCapacity: 5,
      timingType: 'now',
      state: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    // Spectator tries to acquire active slot without being in team_members -> must fail FK (23503)
    let spectatorSlotErr: unknown = null;
    try {
      await db.insert(schema.activePlaySlots).values({
        userId: spectatorId,
        playSessionId: activeSessionId,
        sessionState: 'ACTIVE',
        slotIndex: 2,
        createdAt: now,
      });
    } catch (err) {
      spectatorSlotErr = err;
    }
    expect(getPgErrorCode(spectatorSlotErr)).toBe('23503');
  });

  it('should enforce exactly one active play slot per user during concurrent race (23505)', { timeout: 30000 }, async () => {
    const now = new Date();
    const gameId = 'game_race_' + Math.random().toString(36).substring(2, 6);
    const owner1Id = 'user_race_o1_' + Math.random().toString(36).substring(2, 6);
    const owner2Id = 'user_race_o2_' + Math.random().toString(36).substring(2, 6);
    const contestantId = 'user_race_c_' + Math.random().toString(36).substring(2, 6);
    const conv1Id = 'conv_race1_' + Math.random().toString(36).substring(2, 6);
    const conv2Id = 'conv_race2_' + Math.random().toString(36).substring(2, 6);
    const room1Id = 'room_race1_' + Math.random().toString(36).substring(2, 6);
    const room2Id = 'room_race2_' + Math.random().toString(36).substring(2, 6);
    const session1Id = 'session_race1_' + Math.random().toString(36).substring(2, 6);
    const session2Id = 'session_race2_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values([
      { id: owner1Id, name: 'Owner 1', email: `${owner1Id}@example.com`, createdAt: now, updatedAt: now },
      { id: owner2Id, name: 'Owner 2', email: `${owner2Id}@example.com`, createdAt: now, updatedAt: now },
      { id: contestantId, name: 'Contestant User', email: `${contestantId}@example.com`, createdAt: now, updatedAt: now },
    ]);

    await db.insert(schema.games).values({
      id: gameId,
      title: 'Game Race ' + gameId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.conversations).values([
      { id: conv1Id, kind: 'ROOM', createdAt: now, updatedAt: now },
      { id: conv2Id, kind: 'ROOM', createdAt: now, updatedAt: now },
    ]);

    const txClient = new pg.Client({ connectionString: env.DATABASE_URL });
    await txClient.connect();
    await txClient.query(`SET search_path TO "${schemaName}"`);
    try {
      await txClient.query('BEGIN');
      await txClient.query(
        `INSERT INTO rooms (id, name, game_id, owner_id, conversation_id, conversation_kind, visibility, invite_policy, player_capacity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'ROOM', 'PUBLIC', 'OWNER_APPROVAL', 5, $6, $6)`,
        [room1Id, 'Race Room 1', gameId, owner1Id, conv1Id, now]
      );
      await txClient.query(
        `INSERT INTO room_members (id, room_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, 'OWNER', $4)`,
        ['rm_' + room1Id, room1Id, owner1Id, now]
      );
      await txClient.query(
        `INSERT INTO rooms (id, name, game_id, owner_id, conversation_id, conversation_kind, visibility, invite_policy, player_capacity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'ROOM', 'PUBLIC', 'OWNER_APPROVAL', 5, $6, $6)`,
        [room2Id, 'Race Room 2', gameId, owner2Id, conv2Id, now]
      );
      await txClient.query(
        `INSERT INTO room_members (id, room_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, 'OWNER', $4)`,
        ['rm_' + room2Id, room2Id, owner2Id, now]
      );
      await txClient.query('COMMIT');
    } finally {
      await txClient.end();
    }

    await db.insert(schema.playSessions).values([
      { id: session1Id, roomId: room1Id, hostUserId: owner1Id, playerCapacity: 5, timingType: 'now', state: 'ACTIVE', createdAt: now, updatedAt: now },
      { id: session2Id, roomId: room2Id, hostUserId: owner2Id, playerCapacity: 5, timingType: 'now', state: 'ACTIVE', createdAt: now, updatedAt: now },
    ]);

    await db.insert(schema.teamMembers).values([
      { id: 'tm_race1', playSessionId: session1Id, userId: contestantId, slotIndex: 2, playerCapacity: 5, isHost: false, joinedAt: now },
      { id: 'tm_race2', playSessionId: session2Id, userId: contestantId, slotIndex: 2, playerCapacity: 5, isHost: false, joinedAt: now },
    ]);

    // Race two PG clients trying to give active slot to contestantId simultaneously
    const clientA = new pg.Client({ connectionString: env.DATABASE_URL });
    const clientB = new pg.Client({ connectionString: env.DATABASE_URL });
    await clientA.connect();
    await clientB.connect();
    await clientA.query(`SET search_path TO "${schemaName}"`);
    await clientB.query(`SET search_path TO "${schemaName}"`);

    const promiseA = clientA.query(
      `INSERT INTO active_play_slots (user_id, play_session_id, session_state, slot_index, created_at)
       VALUES ($1, $2, 'ACTIVE', 2, NOW())`,
      [contestantId, session1Id]
    );

    const promiseB = clientB.query(
      `INSERT INTO active_play_slots (user_id, play_session_id, session_state, slot_index, created_at)
       VALUES ($1, $2, 'ACTIVE', 2, NOW())`,
      [contestantId, session2Id]
    );

    const results = await Promise.allSettled([promiseA, promiseB]);

    await clientA.end();
    await clientB.end();

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(getPgErrorCode(err)).toBe('23505');
  });

  it('should preserve persistent room membership and history across multiple play sessions and ended games', async () => {
    const now = new Date();
    const gameId = 'game_hist_' + Math.random().toString(36).substring(2, 6);
    const ownerId = 'user_hist_o_' + Math.random().toString(36).substring(2, 6);
    const memberId = 'user_hist_m_' + Math.random().toString(36).substring(2, 6);
    const convId = 'conv_hist_' + Math.random().toString(36).substring(2, 6);
    const roomId = 'room_hist_' + Math.random().toString(36).substring(2, 6);
    const session1Id = 'session_hist1_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values([
      { id: ownerId, name: 'Hist Owner', email: `${ownerId}@example.com`, createdAt: now, updatedAt: now },
      { id: memberId, name: 'Hist Member', email: `${memberId}@example.com`, createdAt: now, updatedAt: now },
    ]);

    await db.insert(schema.games).values({
      id: gameId,
      title: 'Game Hist ' + gameId,
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
         VALUES ($1, $2, $3, $4, $5, 'ROOM', 'PUBLIC', 'OWNER_APPROVAL', 5, $6, $6)`,
        [roomId, 'History Room', gameId, ownerId, convId, now]
      );
      await txClient.query(
        `INSERT INTO room_members (id, room_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, 'OWNER', $4)`,
        ['rm_owner_' + roomId, roomId, ownerId, now]
      );
      await txClient.query(
        `INSERT INTO room_members (id, room_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, 'MEMBER', $4)`,
        ['rm_member_' + roomId, roomId, memberId, now]
      );
      await txClient.query('COMMIT');
    } finally {
      await txClient.end();
    }

    // Play Session 1: Active -> Ended
    await db.insert(schema.playSessions).values({
      id: session1Id,
      roomId,
      hostUserId: ownerId,
      playerCapacity: 5,
      timingType: 'now',
      state: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.teamMembers).values({
      id: 'tm_h1',
      playSessionId: session1Id,
      userId: memberId,
      slotIndex: 2,
      playerCapacity: 5,
      isHost: false,
      joinedAt: now,
    });

    await db.insert(schema.activePlaySlots).values({
      userId: memberId,
      playSessionId: session1Id,
      sessionState: 'ACTIVE',
      slotIndex: 2,
      createdAt: now,
    });

    // End session 1: remove active slot, update session state to ENDED
    await db.delete(schema.activePlaySlots).where(eq(schema.activePlaySlots.userId, memberId));
    await db.update(schema.playSessions).set({ state: 'ENDED' }).where(eq(schema.playSessions.id, session1Id));

    // Verify room_members still exists (not cascade deleted)
    const members = await db.select().from(schema.roomMembers).where(eq(schema.roomMembers.roomId, roomId));
    expect(members).toHaveLength(2);

    // Verify ended play session history remains intact
    const sessions = await db.select().from(schema.playSessions).where(eq(schema.playSessions.roomId, roomId));
    expect(sessions).toHaveLength(1);
    expect(sessions[0].state).toBe('ENDED');
  });

  it('should enforce helper permission restrictions and invitation target shape', async () => {
    const now = new Date();
    const gameId = 'game_perm_' + Math.random().toString(36).substring(2, 6);
    const ownerId = 'user_perm_o_' + Math.random().toString(36).substring(2, 6);
    const helperId = 'user_perm_h_' + Math.random().toString(36).substring(2, 6);
    const convId = 'conv_perm_' + Math.random().toString(36).substring(2, 6);
    const roomId = 'room_perm_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values([
      { id: ownerId, name: 'Perm Owner', email: `${ownerId}@example.com`, createdAt: now, updatedAt: now },
      { id: helperId, name: 'Perm Helper', email: `${helperId}@example.com`, createdAt: now, updatedAt: now },
    ]);

    await db.insert(schema.games).values({
      id: gameId,
      title: 'Game Perm ' + gameId,
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
         VALUES ($1, $2, $3, $4, $5, 'ROOM', 'PUBLIC', 'OWNER_APPROVAL', 5, $6, $6)`,
        [roomId, 'Perm Room', gameId, ownerId, convId, now]
      );
      await txClient.query(
        `INSERT INTO room_members (id, room_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, 'OWNER', $4)`,
        ['rm_owner_' + roomId, roomId, ownerId, now]
      );
      await txClient.query(
        `INSERT INTO room_members (id, room_id, user_id, role, joined_at)
         VALUES ($1, $2, $3, 'HELPER', $4)`,
        ['rm_helper_' + roomId, roomId, helperId, now]
      );
      await txClient.query('COMMIT');
    } finally {
      await txClient.end();
    }

    // 1. Granting elevated owner permission OWNER_TRANSFER to helper must fail check (23514)
    let elevatedPermErr: unknown = null;
    try {
      await db.insert(schema.permissionGrants).values({
        id: 'pg_invalid_1',
        roomId,
        userId: helperId,
        permission: 'OWNER_TRANSFER' as unknown as string,
        grantedBy: ownerId,
        grantedAt: now,
      });
    } catch (err) {
      elevatedPermErr = err;
    }
    expect(getPgErrorCode(elevatedPermErr)).toBe('23514');

    // 2. Granting valid helper permission MANAGE_MEMBERS must succeed
    await db.insert(schema.permissionGrants).values({
      id: 'pg_valid_1',
      roomId,
      userId: helperId,
      permission: 'MANAGE_MEMBERS',
      grantedBy: ownerId,
      grantedAt: now,
    });

    // 3. Invitation shape checks
    // Self invitation fails check (23514)
    let selfInviteErr: unknown = null;
    try {
      await db.insert(schema.invitations).values({
        id: 'inv_self',
        targetType: 'ROOM',
        senderId: ownerId,
        receiverId: ownerId,
        roomId,
        status: 'PENDING',
        createdAt: now,
      });
    } catch (err) {
      selfInviteErr = err;
    }
    expect(getPgErrorCode(selfInviteErr)).toBe('23514');

    // ROOM invitation with playSessionId present fails check (23514)
    let invalidRoomInviteErr: unknown = null;
    try {
      await db.insert(schema.invitations).values({
        id: 'inv_room_invalid',
        targetType: 'ROOM',
        senderId: ownerId,
        receiverId: helperId,
        roomId,
        playSessionId: 'some_session_id',
        status: 'PENDING',
        createdAt: now,
      });
    } catch (err) {
      invalidRoomInviteErr = err;
    }
    expect(getPgErrorCode(invalidRoomInviteErr)).toBe('23514');
  });
});
