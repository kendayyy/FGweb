import { pgTable, text, integer, timestamp, unique, check, foreignKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.js';
import { games } from './games.js';
import { rooms } from './rooms.js';
import { playSessions } from './teams.js';

export const recruitments = pgTable(
  'recruitments',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id').notNull(),
    gameId: text('game_id').notNull(),
    gameTitle: text('game_title').notNull(),
    playSessionId: text('play_session_id').notNull(),
    title: text('title').notNull(),
    mode: text('mode').notNull(),
    playerCapacity: integer('player_capacity').notNull().default(5),
    currentPlayers: integer('current_players').notNull().default(1),
    timingType: text('timing_type').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true, mode: 'date' }),
    requirementText: text('requirement_text'),
    experienceName: text('experience_name'),
    experienceUrl: text('experience_url'),
    state: text('state').notNull().default('OPEN'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check('recruitment_capacity_check', sql`player_capacity >= 1 AND player_capacity <= 10`),
    check('recruitment_current_players_check', sql`current_players >= 1 AND current_players <= player_capacity`),
    check('recruitment_timing_check', sql`timing_type IN ('now', 'scheduledAt')`),
    check(
      'recruitment_scheduled_at_check',
      sql`(timing_type = 'now' AND scheduled_at IS NULL) OR (timing_type = 'scheduledAt' AND scheduled_at IS NOT NULL)`
    ),
    check(
      'recruitment_roblox_fields_check',
      sql`(game_title = 'Roblox' AND experience_name IS NOT NULL AND length(trim(experience_name)) > 0 AND experience_url IS NOT NULL AND length(trim(experience_url)) > 0) OR (game_title <> 'Roblox' AND experience_name IS NULL AND experience_url IS NULL)`
    ),
    check('recruitment_state_check', sql`state IN ('OPEN', 'CLOSED')`),
    foreignKey({
      name: 'recruitments_room_game_fk',
      columns: [table.roomId, table.gameId],
      foreignColumns: [rooms.id, rooms.gameId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'recruitments_game_title_fk',
      columns: [table.gameId, table.gameTitle],
      foreignColumns: [games.id, games.title],
    }).onDelete('cascade'),
    foreignKey({
      name: 'recruitments_play_session_fk',
      columns: [table.playSessionId, table.roomId],
      foreignColumns: [playSessions.id, playSessions.roomId],
    }).onDelete('no action'),
  ]
);

export const joinRequests = pgTable(
  'join_requests',
  {
    id: text('id').primaryKey(),
    recruitmentId: text('recruitment_id')
      .notNull()
      .references(() => recruitments.id, { onDelete: 'cascade' }),
    applicantId: text('applicant_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('join_request_recruitment_applicant_unique').on(table.recruitmentId, table.applicantId),
    check('join_request_status_check', sql`status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')`),
  ]
);

export const invitations = pgTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    targetType: text('target_type').notNull(),
    senderId: text('sender_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    receiverId: text('receiver_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roomId: text('room_id').notNull(),
    playSessionId: text('play_session_id'),
    status: text('status').notNull().default('PENDING'),
    recipientAcceptedAt: timestamp('recipient_accepted_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check('invitation_no_self_check', sql`sender_id <> receiver_id`),
    check(
      'invitation_target_shape_check',
      sql`(target_type = 'ROOM' AND play_session_id IS NULL) OR (target_type = 'PLAY_SESSION' AND play_session_id IS NOT NULL)`
    ),
    check('invitation_status_check', sql`status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')`),
    check('invitation_target_type_check', sql`target_type IN ('ROOM', 'PLAY_SESSION')`),
    foreignKey({
      name: 'invitations_room_id_rooms_id_fk',
      columns: [table.roomId],
      foreignColumns: [rooms.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'invitations_session_room_fk',
      columns: [table.playSessionId, table.roomId],
      foreignColumns: [playSessions.id, playSessions.roomId],
    }).onDelete('cascade'),
  ]
);
