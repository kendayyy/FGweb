import { pgTable, text, timestamp, doublePrecision, unique } from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { games } from './games.js';

export const profiles = pgTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  customStatus: text('custom_status').notNull().default('JUST_CHATTING'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

export const gameProfiles = pgTable(
  'game_profiles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    inGameName: text('in_game_name'),
    rank: text('rank'),
    role: text('role'),
    playHours: doublePrecision('play_hours'),
    playStyle: text('play_style'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('user_game_profile_unique').on(table.userId, table.gameId),
  ]
);

export const gameInterests = pgTable(
  'game_interests',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    gameId: text('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('user_game_interest_unique').on(table.userId, table.gameId),
  ]
);
