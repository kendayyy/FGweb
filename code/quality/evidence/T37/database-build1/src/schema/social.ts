import { pgTable, text, timestamp, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.js';

export const friendships = pgTable(
  'friendships',
  {
    id: text('id').primaryKey(),
    user1Id: text('user1_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    user2Id: text('user2_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('friendship_pair_unique').on(table.user1Id, table.user2Id),
    check('friendship_canonical_order', sql`user1_id < user2_id`),
  ]
);

export const friendRequests = pgTable(
  'friend_requests',
  {
    id: text('id').primaryKey(),
    senderId: text('sender_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    receiverId: text('receiver_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('friend_request_pair_unique').on(table.senderId, table.receiverId),
    check('friend_request_no_self', sql`sender_id <> receiver_id`),
    check(
      'friend_request_status_check',
      sql`status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')`
    ),
  ]
);

export const blocks = pgTable(
  'blocks',
  {
    id: text('id').primaryKey(),
    blockerId: text('blocker_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('block_pair_unique').on(table.blockerId, table.blockedId),
    check('block_no_self', sql`blocker_id <> blocked_id`),
  ]
);
