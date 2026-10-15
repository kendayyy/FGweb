import { pgTable, text, integer, boolean, timestamp, unique, check, foreignKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.js';
import { rooms } from './rooms.js';

export const playSessions = pgTable(
  'play_sessions',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    hostUserId: text('host_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    playerCapacity: integer('player_capacity').notNull().default(5),
    timingType: text('timing_type').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' }),
    state: text('state').notNull().default('SCHEDULED'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('play_sessions_id_room_unique').on(table.id, table.roomId),
    unique('play_sessions_id_state_unique').on(table.id, table.state),
    unique('play_sessions_id_capacity_unique').on(table.id, table.playerCapacity),
    check('play_session_state_check', sql`state IN ('SCHEDULED', 'ACTIVE', 'ENDED')`),
    check('play_session_timing_check', sql`timing_type IN ('now', 'scheduledAt')`),
    check('play_session_capacity_check', sql`player_capacity >= 1 AND player_capacity <= 10`),
    check(
      'play_session_scheduled_at_check',
      sql`(timing_type = 'now' AND scheduled_at IS NULL) OR (timing_type = 'scheduledAt' AND scheduled_at IS NOT NULL)`
    ),
  ]
);

export const teamMembers = pgTable(
  'team_members',
  {
    id: text('id').primaryKey(),
    playSessionId: text('play_session_id')
      .notNull()
      .references(() => playSessions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    slotIndex: integer('slot_index').notNull(),
    playerCapacity: integer('player_capacity').notNull().default(5),
    isHost: boolean('is_host').notNull().default(false),
    joinedAt: timestamp('joined_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('team_member_session_user_unique').on(table.playSessionId, table.userId),
    unique('team_member_session_slot_unique').on(table.playSessionId, table.slotIndex),
    unique('team_members_session_user_slot_unique').on(table.playSessionId, table.userId, table.slotIndex),
    foreignKey({
      name: 'team_members_session_capacity_fk',
      columns: [table.playSessionId, table.playerCapacity],
      foreignColumns: [playSessions.id, playSessions.playerCapacity],
    }).onDelete('cascade'),
    check('slot_index_bounds_check', sql`slot_index >= 1 AND slot_index <= player_capacity`),
  ]
);

export const activePlaySlots = pgTable(
  'active_play_slots',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    playSessionId: text('play_session_id').notNull(),
    sessionState: text('session_state').notNull().default('ACTIVE'),
    slotIndex: integer('slot_index').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check('active_play_slot_state_check', sql`session_state = 'ACTIVE'`),
    foreignKey({
      name: 'active_play_slots_session_state_fk',
      columns: [table.playSessionId, table.sessionState],
      foreignColumns: [playSessions.id, playSessions.state],
    }).onDelete('cascade'),
    foreignKey({
      name: 'active_play_slots_roster_fk',
      columns: [table.playSessionId, table.userId, table.slotIndex],
      foreignColumns: [teamMembers.playSessionId, teamMembers.userId, teamMembers.slotIndex],
    }).onDelete('cascade'),
  ]
);
