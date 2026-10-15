import { pgTable, text, timestamp, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.js';
import { lobbies } from './games.js';

export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    lobbyId: text('lobby_id')
      .unique()
      .references(() => lobbies.id, { onDelete: 'cascade' }),
    user1Id: text('user1_id').references(() => user.id, { onDelete: 'cascade' }),
    user2Id: text('user2_id').references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('conversations_id_kind_unique').on(table.id, table.kind),
    unique('dm_pair_unique').on(table.user1Id, table.user2Id),
    check(
      'conversation_kind_shape_check',
      sql`(kind = 'DM' AND user1_id IS NOT NULL AND user2_id IS NOT NULL AND user1_id < user2_id AND lobby_id IS NULL) OR (kind = 'LOBBY' AND lobby_id IS NOT NULL AND user1_id IS NULL AND user2_id IS NULL) OR (kind = 'ROOM' AND lobby_id IS NULL AND user1_id IS NULL AND user2_id IS NULL)`
    ),
  ]
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('conversation_member_unique').on(table.conversationId, table.userId),
  ]
);
