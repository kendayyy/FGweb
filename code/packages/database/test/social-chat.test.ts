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

describe('T05 - Chat, Social Relations, and Forward Migration Schema', () => {
  let client: pg.Client;
  let db: NodePgDatabase<typeof schema> & { $client: pg.Client };
  let schemaName: string;
  let env: Record<string, string>;
  let codeRootDir: string;

  beforeAll(async () => {
    codeRootDir = path.resolve(import.meta.dirname, '../../../');
    process.chdir(codeRootDir);

    env = loadLocalEnv();
    schemaName = `test_t05_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
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
        if (schemaName.startsWith('test_t05_')) {
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

  it('should prevent duplicate DMs on concurrent insert and reject self-pair/unnormalized pair', async () => {
    const now = new Date();
    const userAId = 'user_dm_a_' + Math.random().toString(36).substring(2, 6);
    const userBId = 'user_dm_b_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values([
      { id: userAId, name: 'User A', email: `${userAId}@example.com`, createdAt: now, updatedAt: now },
      { id: userBId, name: 'User B', email: `${userBId}@example.com`, createdAt: now, updatedAt: now },
    ]);

    const user1Id = userAId < userBId ? userAId : userBId;
    const user2Id = userAId < userBId ? userBId : userAId;

    // 1. Self pair rejection (CHECK 23514)
    let selfPairErr: unknown = null;
    try {
      await db.insert(schema.conversations).values({
        id: 'conv_self_' + Date.now(),
        kind: 'DM',
        user1Id: userAId,
        user2Id: userAId,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      selfPairErr = err;
    }
    expect(getPgErrorCode(selfPairErr)).toBe('23514');

    // 2. Unnormalized pair rejection (CHECK 23514)
    let unnormalizedErr: unknown = null;
    try {
      await db.insert(schema.conversations).values({
        id: 'conv_unnorm_' + Date.now(),
        kind: 'DM',
        user1Id: user2Id,
        user2Id: user1Id,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      unnormalizedErr = err;
    }
    expect(getPgErrorCode(unnormalizedErr)).toBe('23514');

    // 3. Real concurrent insert using 2 separate connections
    const client1 = new pg.Client({ connectionString: env.DATABASE_URL });
    const client2 = new pg.Client({ connectionString: env.DATABASE_URL });
    await client1.connect();
    await client2.connect();
    await client1.query(`SET search_path TO "${schemaName}"`);
    await client2.query(`SET search_path TO "${schemaName}"`);

    const insertQuery = `
      INSERT INTO "${schemaName}".conversations (id, kind, user1_id, user2_id, created_at, updated_at)
      VALUES ($1, 'DM', $2, $3, NOW(), NOW())
    `;

    const convId1 = 'conv_concurrent_1_' + Date.now();
    const convId2 = 'conv_concurrent_2_' + Date.now();

    const results = await Promise.allSettled([
      client1.query(insertQuery, [convId1, user1Id, user2Id]),
      client2.query(insertQuery, [convId2, user1Id, user2Id]),
    ]);

    await client1.end();
    await client2.end();

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(getPgErrorCode(rejectedReason)).toBe('23505');
  });

  it('should enforce clientMessageId unique per sender and conversation', async () => {
    const now = new Date();
    const senderId = 'user_msg_sender_' + Math.random().toString(36).substring(2, 6);
    await db.insert(schema.user).values({
      id: senderId,
      name: 'Sender',
      email: `${senderId}@example.com`,
      createdAt: now,
      updatedAt: now,
    });

    await schema.seedGames(db);
    const gameList = await db.select().from(schema.games);
    const gameId = gameList[0].id;
    const lobbyList = await db.select().from(schema.lobbies).where(eq(schema.lobbies.gameId, gameId));
    const lobbyId = lobbyList[0].id;

    const convId = 'conv_lobby_msg_' + Date.now();
    await db.insert(schema.conversations).values({
      id: convId,
      kind: 'LOBBY',
      lobbyId,
      createdAt: now,
      updatedAt: now,
    });

    const clientMsgId = 'client_msg_unique_1';

    await db.insert(schema.messages).values({
      id: 'msg_1_' + Date.now(),
      conversationId: convId,
      senderId,
      type: 'TEXT',
      content: 'First message',
      clientMessageId: clientMsgId,
      createdAt: now,
      updatedAt: now,
    });

    let duplicateErr: unknown = null;
    try {
      await db.insert(schema.messages).values({
        id: 'msg_2_' + Date.now(),
        conversationId: convId,
        senderId,
        type: 'TEXT',
        content: 'Resent message',
        clientMessageId: clientMsgId,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      duplicateErr = err;
    }
    expect(getPgErrorCode(duplicateErr)).toBe('23505');
  });

  it('should reject replies across different conversations with 23503 FK violation', async () => {
    const now = new Date();
    const senderId = 'user_reply_test_' + Math.random().toString(36).substring(2, 6);
    await db.insert(schema.user).values({
      id: senderId,
      name: 'Replier',
      email: `${senderId}@example.com`,
      createdAt: now,
      updatedAt: now,
    });

    const conv1Id = 'conv_reply_1_' + Date.now();
    const conv2Id = 'conv_reply_2_' + Date.now();

    await db.insert(schema.conversations).values([
      { id: conv1Id, kind: 'ROOM', createdAt: now, updatedAt: now },
      { id: conv2Id, kind: 'ROOM', createdAt: now, updatedAt: now },
    ]);

    const msg1Id = 'msg_in_conv1_' + Date.now();
    await db.insert(schema.messages).values({
      id: msg1Id,
      conversationId: conv1Id,
      senderId,
      type: 'TEXT',
      content: 'Message in conversation 1',
      clientMessageId: 'c1',
      createdAt: now,
      updatedAt: now,
    });

    let crossReplyErr: unknown = null;
    try {
      await db.insert(schema.messages).values({
        id: 'msg_in_conv2_' + Date.now(),
        conversationId: conv2Id,
        senderId,
        type: 'TEXT',
        content: 'Cross reply to msg 1',
        clientMessageId: 'c2',
        replyToId: msg1Id,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      crossReplyErr = err;
    }
    expect(getPgErrorCode(crossReplyErr)).toBe('23503');
  });

  it('should reject attachments with mismatched conversationId with 23503', async () => {
    const now = new Date();
    const senderId = 'user_att_test_' + Math.random().toString(36).substring(2, 6);
    await db.insert(schema.user).values({
      id: senderId,
      name: 'Attachment Tester',
      email: `${senderId}@example.com`,
      createdAt: now,
      updatedAt: now,
    });

    const conv1Id = 'conv_att_1_' + Date.now();
    const conv2Id = 'conv_att_2_' + Date.now();

    await db.insert(schema.conversations).values([
      { id: conv1Id, kind: 'ROOM', createdAt: now, updatedAt: now },
      { id: conv2Id, kind: 'ROOM', createdAt: now, updatedAt: now },
    ]);

    const msg1Id = 'msg_att_1_' + Date.now();
    await db.insert(schema.messages).values({
      id: msg1Id,
      conversationId: conv1Id,
      senderId,
      type: 'IMAGE',
      content: '',
      clientMessageId: 'att_c1',
      createdAt: now,
      updatedAt: now,
    });

    let mismatchedAttErr: unknown = null;
    try {
      await db.insert(schema.attachments).values({
        id: 'att_1_' + Date.now(),
        messageId: msg1Id,
        conversationId: conv2Id,
        url: 'https://example.com/test.png',
        fileName: 'test.png',
        fileSize: 1024,
        mimeType: 'image/png',
        createdAt: now,
      });
    } catch (err) {
      mismatchedAttErr = err;
    }
    expect(getPgErrorCode(mismatchedAttErr)).toBe('23503');
  });

  it('should enforce normalized friendship pair unique and reject reverse/self-friendships', async () => {
    const now = new Date();
    const u1 = 'user_f1_' + Math.random().toString(36).substring(2, 6);
    const u2 = 'user_f2_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values([
      { id: u1, name: 'F1', email: `${u1}@example.com`, createdAt: now, updatedAt: now },
      { id: u2, name: 'F2', email: `${u2}@example.com`, createdAt: now, updatedAt: now },
    ]);

    const user1Id = u1 < u2 ? u1 : u2;
    const user2Id = u1 < u2 ? u2 : u1;

    // 1. Valid friendship
    await db.insert(schema.friendships).values({
      id: 'f_valid_' + Date.now(),
      user1Id,
      user2Id,
      createdAt: now,
    });

    // 2. Duplicate friendship (23505)
    let dupErr: unknown = null;
    try {
      await db.insert(schema.friendships).values({
        id: 'f_dup_' + Date.now(),
        user1Id,
        user2Id,
        createdAt: now,
      });
    } catch (err) {
      dupErr = err;
    }
    expect(getPgErrorCode(dupErr)).toBe('23505');

    // 3. Reverse friendship (CHECK 23514)
    let reverseErr: unknown = null;
    try {
      await db.insert(schema.friendships).values({
        id: 'f_rev_' + Date.now(),
        user1Id: user2Id,
        user2Id: user1Id,
        createdAt: now,
      });
    } catch (err) {
      reverseErr = err;
    }
    expect(getPgErrorCode(reverseErr)).toBe('23514');

    // 4. Self friendship (CHECK 23514)
    let selfErr: unknown = null;
    try {
      await db.insert(schema.friendships).values({
        id: 'f_self_' + Date.now(),
        user1Id: u1,
        user2Id: u1,
        createdAt: now,
      });
    } catch (err) {
      selfErr = err;
    }
    expect(getPgErrorCode(selfErr)).toBe('23514');
  });

  it('should enforce friend request uniqueness and no self-request', async () => {
    const now = new Date();
    const u1 = 'user_fr1_' + Math.random().toString(36).substring(2, 6);
    const u2 = 'user_fr2_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values([
      { id: u1, name: 'FR1', email: `${u1}@example.com`, createdAt: now, updatedAt: now },
      { id: u2, name: 'FR2', email: `${u2}@example.com`, createdAt: now, updatedAt: now },
    ]);

    await db.insert(schema.friendRequests).values({
      id: 'fr_1_' + Date.now(),
      senderId: u1,
      receiverId: u2,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    });

    let dupErr: unknown = null;
    try {
      await db.insert(schema.friendRequests).values({
        id: 'fr_dup_' + Date.now(),
        senderId: u1,
        receiverId: u2,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      dupErr = err;
    }
    expect(getPgErrorCode(dupErr)).toBe('23505');

    let selfErr: unknown = null;
    try {
      await db.insert(schema.friendRequests).values({
        id: 'fr_self_' + Date.now(),
        senderId: u1,
        receiverId: u1,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      selfErr = err;
    }
    expect(getPgErrorCode(selfErr)).toBe('23514');
  });

  it('should enforce directed block uniqueness and prevent self-block', async () => {
    const now = new Date();
    const u1 = 'user_b1_' + Math.random().toString(36).substring(2, 6);
    const u2 = 'user_b2_' + Math.random().toString(36).substring(2, 6);

    await db.insert(schema.user).values([
      { id: u1, name: 'B1', email: `${u1}@example.com`, createdAt: now, updatedAt: now },
      { id: u2, name: 'B2', email: `${u2}@example.com`, createdAt: now, updatedAt: now },
    ]);

    await db.insert(schema.blocks).values({
      id: 'blk_1_' + Date.now(),
      blockerId: u1,
      blockedId: u2,
      createdAt: now,
    });

    let dupErr: unknown = null;
    try {
      await db.insert(schema.blocks).values({
        id: 'blk_dup_' + Date.now(),
        blockerId: u1,
        blockedId: u2,
        createdAt: now,
      });
    } catch (err) {
      dupErr = err;
    }
    expect(getPgErrorCode(dupErr)).toBe('23505');

    let selfErr: unknown = null;
    try {
      await db.insert(schema.blocks).values({
        id: 'blk_self_' + Date.now(),
        blockerId: u1,
        blockedId: u1,
        createdAt: now,
      });
    } catch (err) {
      selfErr = err;
    }
    expect(getPgErrorCode(selfErr)).toBe('23514');
  });

  it('should preserve T04 data when applying T05 forward migration over old T04 migration and seed', async () => {
    const migSchemaName = `test_t05_mig_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const migClient = new pg.Client({ connectionString: env.DATABASE_URL });
    await migClient.connect();

    // Create temp migration directory inside code/.cache
    const cacheDir = path.resolve(codeRootDir, '.cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const tempDir = path.resolve(cacheDir, `t05_mig_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
    const tempMetaDir = path.resolve(tempDir, 'meta');
    fs.mkdirSync(tempMetaDir, { recursive: true });

    const realMigrationsDir = path.resolve(codeRootDir, 'packages/database/migrations');
    const t04SqlName = '0000_solid_maria_hill.sql';
    fs.copyFileSync(path.resolve(realMigrationsDir, t04SqlName), path.resolve(tempDir, t04SqlName));

    // Initial journal with 0000 only
    const journal0000 = {
      version: '7',
      dialect: 'postgresql',
      entries: [
        {
          idx: 0,
          version: '7',
          when: 1791155209916,
          tag: '0000_solid_maria_hill',
          breakpoints: true,
        },
      ],
    };
    fs.writeFileSync(path.resolve(tempMetaDir, '_journal.json'), JSON.stringify(journal0000, null, 2));

    let testError: unknown = null;
    let cleanupError: unknown = null;

    try {
      await migClient.query(`CREATE SCHEMA "${migSchemaName}"`);
      await migClient.query(`SET search_path TO "${migSchemaName}"`);

      const migDb = drizzle(migClient, { schema });

      // 1. Run migrator with ONLY 0000 in temp directory
      await migrate(migDb, { migrationsFolder: tempDir, migrationsSchema: migSchemaName });

      // Seed games in T04 schema
      const seeded = await schema.seedGames(migDb);
      expect(seeded).toHaveLength(7);

      // Insert representative user identity, profile, game profile
      const now = new Date();
      const testUserId = 'user_mig_preserve_1';
      await migDb.insert(schema.user).values({
        id: testUserId,
        name: 'Migration User',
        email: 'mig_user@example.com',
        createdAt: now,
        updatedAt: now,
      });

      await migDb.insert(schema.profiles).values({
        userId: testUserId,
        displayName: 'Migration Display',
        customStatus: 'LOOKING_FOR_TEAM',
        createdAt: now,
        updatedAt: now,
      });

      const gameId = seeded[0].id;
      await migDb.insert(schema.gameProfiles).values({
        id: 'gp_mig_1',
        userId: testUserId,
        gameId,
        inGameName: 'MigGamer#1234',
        rank: 'Gold',
        createdAt: now,
        updatedAt: now,
      });

      // 2. Add T05 migration file and full journal to temp directory
      const journalFull = fs.readFileSync(path.resolve(realMigrationsDir, 'meta/_journal.json'), 'utf8');
      fs.writeFileSync(path.resolve(tempMetaDir, '_journal.json'), journalFull);

      const filesInReal = fs.readdirSync(realMigrationsDir);
      for (const file of filesInReal) {
        if (file.endsWith('.sql')) {
          fs.copyFileSync(path.resolve(realMigrationsDir, file), path.resolve(tempDir, file));
        }
      }

      // 3. Run forward migration (applies 0001)
      await migrate(migDb, { migrationsFolder: tempDir, migrationsSchema: migSchemaName });

      // 4. Prove T04 data is completely preserved
      const usersAfter = await migDb.select().from(schema.user).where(eq(schema.user.id, testUserId));
      expect(usersAfter).toHaveLength(1);
      expect(usersAfter[0].email).toBe('mig_user@example.com');

      const profilesAfter = await migDb.select().from(schema.profiles).where(eq(schema.profiles.userId, testUserId));
      expect(profilesAfter).toHaveLength(1);
      expect(profilesAfter[0].displayName).toBe('Migration Display');

      const gameProfilesAfter = await migDb.select().from(schema.gameProfiles).where(eq(schema.gameProfiles.id, 'gp_mig_1'));
      expect(gameProfilesAfter).toHaveLength(1);
      expect(gameProfilesAfter[0].userId).toBe(testUserId);
      expect(gameProfilesAfter[0].gameId).toBe(gameId);
      expect(gameProfilesAfter[0].inGameName).toBe('MigGamer#1234');
      expect(gameProfilesAfter[0].rank).toBe('Gold');

      const gamesAfter = await migDb.select().from(schema.games);
      expect(gamesAfter).toHaveLength(7);

      const lobbiesAfter = await migDb.select().from(schema.lobbies);
      expect(lobbiesAfter).toHaveLength(7);

      // 5. Verify new T05 table works in migrated DB
      const convId = 'conv_after_mig_' + Date.now();
      await migDb.insert(schema.conversations).values({
        id: convId,
        kind: 'ROOM',
        createdAt: now,
        updatedAt: now,
      });
      const convsAfter = await migDb.select().from(schema.conversations).where(eq(schema.conversations.id, convId));
      expect(convsAfter).toHaveLength(1);
    } catch (err) {
      testError = err;
    } finally {
      const cleanupErrors: unknown[] = [];

      try {
        const cacheDir = path.resolve(codeRootDir, '.cache');
        const resolvedTempDir = path.resolve(tempDir);
        const basename = path.basename(resolvedTempDir);
        if (
          path.isAbsolute(resolvedTempDir) &&
          resolvedTempDir.startsWith(cacheDir) &&
          basename.startsWith('t05_mig_') &&
          fs.existsSync(resolvedTempDir)
        ) {
          fs.rmSync(resolvedTempDir, { recursive: true, force: true });
        }
      } catch (err) {
        cleanupErrors.push(err);
      }

      try {
        if (migSchemaName.startsWith('test_t05_mig_') && migClient) {
          await migClient.query(`DROP SCHEMA IF EXISTS "${migSchemaName}" CASCADE`);
        }
      } catch (err) {
        cleanupErrors.push(err);
      }

      try {
        if (migClient) {
          await migClient.end();
        }
      } catch (err) {
        cleanupErrors.push(err);
      }

      if (cleanupErrors.length === 1) {
        cleanupError = cleanupErrors[0];
      } else if (cleanupErrors.length > 1) {
        cleanupError = new AggregateError(cleanupErrors, 'Failed to clean up migration test resources');
      }
    }

    if (testError) {
      throw testError;
    }
    if (cleanupError) {
      throw cleanupError;
    }
  });

  it('should enforce conversation kind shapes for DM, LOBBY, and ROOM', async () => {
    const now = new Date();
    const u1 = 'user_ks1_' + Math.random().toString(36).substring(2, 6);
    const u2 = 'user_ks2_' + Math.random().toString(36).substring(2, 6);
    await db.insert(schema.user).values([
      { id: u1, name: 'KS1', email: `${u1}@example.com`, createdAt: now, updatedAt: now },
      { id: u2, name: 'KS2', email: `${u2}@example.com`, createdAt: now, updatedAt: now },
    ]);
    const user1Id = u1 < u2 ? u1 : u2;
    const user2Id = u1 < u2 ? u2 : u1;

    await schema.seedGames(db);
    const gameList = await db.select().from(schema.games);
    const lobbyList = await db.select().from(schema.lobbies).where(eq(schema.lobbies.gameId, gameList[0].id));
    const lobbyId = lobbyList[0].id;

    // 1. Malformed LOBBY (LOBBY carrying user pair) -> 23514
    let badLobbyUserPairErr: unknown = null;
    try {
      await db.insert(schema.conversations).values({
        id: 'conv_bad_lobby_1_' + Date.now(),
        kind: 'LOBBY',
        lobbyId,
        user1Id,
        user2Id,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      badLobbyUserPairErr = err;
    }
    expect(getPgErrorCode(badLobbyUserPairErr)).toBe('23514');

    // 2. Malformed LOBBY (LOBBY without lobbyId) -> 23514
    let badLobbyNoIdErr: unknown = null;
    try {
      await db.insert(schema.conversations).values({
        id: 'conv_bad_lobby_2_' + Date.now(),
        kind: 'LOBBY',
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      badLobbyNoIdErr = err;
    }
    expect(getPgErrorCode(badLobbyNoIdErr)).toBe('23514');

    // 3. Malformed DM (DM with lobbyId) -> 23514
    let badDmLobbyErr: unknown = null;
    try {
      await db.insert(schema.conversations).values({
        id: 'conv_bad_dm_1_' + Date.now(),
        kind: 'DM',
        lobbyId,
        user1Id,
        user2Id,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      badDmLobbyErr = err;
    }
    expect(getPgErrorCode(badDmLobbyErr)).toBe('23514');

    // 4. Malformed ROOM (ROOM carrying lobbyId or user pair) -> 23514
    let badRoomErr: unknown = null;
    try {
      await db.insert(schema.conversations).values({
        id: 'conv_bad_room_1_' + Date.now(),
        kind: 'ROOM',
        lobbyId,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      badRoomErr = err;
    }
    expect(getPgErrorCode(badRoomErr)).toBe('23514');
  });

  it('should clear replyToId and preserve conversationId when replied-to parent message is deleted', async () => {
    const now = new Date();
    const senderId = 'user_del_parent_' + Math.random().toString(36).substring(2, 6);
    await db.insert(schema.user).values({
      id: senderId,
      name: 'DelParent',
      email: `${senderId}@example.com`,
      createdAt: now,
      updatedAt: now,
    });

    const convId = 'conv_del_parent_' + Date.now();
    await db.insert(schema.conversations).values({
      id: convId,
      kind: 'ROOM',
      createdAt: now,
      updatedAt: now,
    });

    const parentId = 'msg_parent_' + Date.now();
    await db.insert(schema.messages).values({
      id: parentId,
      conversationId: convId,
      senderId,
      type: 'TEXT',
      content: 'Parent msg',
      clientMessageId: 'c_parent',
      createdAt: now,
      updatedAt: now,
    });

    const replyId = 'msg_reply_' + Date.now();
    await db.insert(schema.messages).values({
      id: replyId,
      conversationId: convId,
      senderId,
      type: 'TEXT',
      content: 'Reply msg',
      clientMessageId: 'c_reply',
      replyToId: parentId,
      createdAt: now,
      updatedAt: now,
    });

    // Delete parent message
    await db.delete(schema.messages).where(eq(schema.messages.id, parentId));

    // Verify reply message exists, replyToId is null, conversationId is preserved
    const replyMsgs = await db.select().from(schema.messages).where(eq(schema.messages.id, replyId));
    expect(replyMsgs).toHaveLength(1);
    expect(replyMsgs[0].replyToId).toBeNull();
    expect(replyMsgs[0].conversationId).toBe(convId);
  });
});
