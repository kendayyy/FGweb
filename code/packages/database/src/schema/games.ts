import { pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const games = pgTable(
  'games',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull().unique(),
    description: text('description'),
    iconUrl: text('icon_url'),
    bannerUrl: text('banner_url'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [unique('games_id_title_unique').on(table.id, table.title)]
);

export const lobbies = pgTable('lobbies', {
  id: text('id').primaryKey(),
  gameId: text('game_id')
    .notNull()
    .unique()
    .references(() => games.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});
