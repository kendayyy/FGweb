import { pgTable, text, integer, boolean, timestamp, unique, uniqueIndex, check, foreignKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.js';
import { rooms, roomMembers } from './rooms.js';

export const callGroups = pgTable(
  'call_groups',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    state: text('state').notNull().default('OPEN'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { mode: 'date' }),
  },
  (table) => [
    unique('call_groups_id_room_unique').on(table.id, table.roomId),
    unique('call_groups_id_state_unique').on(table.id, table.state),
    check('call_group_state_check', sql`state IN ('OPEN', 'CLOSED')`),
  ]
);

export const callMembers = pgTable(
  'call_members',
  {
    id: text('id').primaryKey(),
    callGroupId: text('call_group_id').notNull(),
    roomId: text('room_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    seatIndex: integer('seat_index').notNull(),
    isMuted: boolean('is_muted').notNull().default(true),
    joinedAt: timestamp('joined_at', { mode: 'date' }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { mode: 'date' }),
    callState: text('call_state').generatedAlwaysAs(
      sql`CASE WHEN left_at IS NULL THEN 'OPEN' ELSE NULL END`
    ),
    active: boolean('active').generatedAlwaysAs(
      sql`CASE WHEN left_at IS NULL THEN true ELSE NULL END`
    ),
  },
  (table) => [
    unique('call_member_group_user_unique').on(table.callGroupId, table.userId),
    unique('call_members_group_user_active_unique').on(table.callGroupId, table.userId, table.active),
    uniqueIndex('call_members_group_seat_active_idx').on(table.callGroupId, table.seatIndex).where(sql`left_at IS NULL`),
    uniqueIndex('call_members_user_active_idx').on(table.userId).where(sql`left_at IS NULL`),
    check('call_member_seat_index_check', sql`seat_index >= 1 AND seat_index <= 10`),
    foreignKey({
      name: 'call_members_room_member_fk',
      columns: [table.roomId, table.userId],
      foreignColumns: [roomMembers.roomId, roomMembers.userId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'call_members_call_group_fk',
      columns: [table.callGroupId, table.roomId],
      foreignColumns: [callGroups.id, callGroups.roomId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'call_members_open_call_fk',
      columns: [table.callGroupId, table.callState],
      foreignColumns: [callGroups.id, callGroups.state],
    }).onDelete('cascade'),
  ]
);

export const callPublishSlots = pgTable(
  'call_publish_slots',
  {
    id: text('id').primaryKey(),
    callGroupId: text('call_group_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    isCallActive: boolean('is_call_active').notNull().default(true),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('call_publish_slot_ordinal_unique').on(table.callGroupId, table.ordinal),
    unique('call_publish_slot_user_unique').on(table.callGroupId, table.userId),
    check('call_publish_slot_ordinal_bounds', sql`ordinal >= 1 AND ordinal <= 3`),
    check('call_publish_slot_active_check', sql`is_call_active = true`),
    foreignKey({
      name: 'call_publish_slots_active_member_fk',
      columns: [table.callGroupId, table.userId, table.isCallActive],
      foreignColumns: [callMembers.callGroupId, callMembers.userId, callMembers.active],
    }).onDelete('cascade'),
  ]
);

export const callRestrictions = pgTable(
  'call_restrictions',
  {
    id: text('id').primaryKey(),
    callGroupId: text('call_group_id')
      .notNull()
      .references(() => callGroups.id, { onDelete: 'cascade' }),
    targetUserId: text('target_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    restrictionType: text('restriction_type').notNull(),
    issuedBy: text('issued_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('call_restriction_group_target_type_unique').on(table.callGroupId, table.targetUserId, table.restrictionType),
    check('call_restriction_type_check', sql`restriction_type IN ('MIC_MUTED', 'STREAM_BLOCKED')`),
  ]
);

export const externalLives = pgTable(
  'external_lives',
  {
    id: text('id').primaryKey(),
    callGroupId: text('call_group_id').notNull(),
    provider: text('provider').notNull(),
    url: text('url').notNull(),
    videoId: text('video_id'),
    channelName: text('channel_name'),
    title: text('title'),
    configuredBy: text('configured_by')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    isCallActive: boolean('is_call_active').notNull().default(true),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('external_lives_call_group_unique').on(table.callGroupId),
    check('external_live_provider_check', sql`provider IN ('youtube', 'twitch')`),
    check('external_lives_structured_source_check', sql`(video_id IS NULL AND channel_name IS NULL) OR (provider='youtube' AND video_id IS NOT NULL AND video_id ~ '^[A-Za-z0-9_-]{11}$' AND channel_name IS NULL) OR (provider='twitch' AND channel_name IS NOT NULL AND channel_name ~ '^[a-z0-9_]{1,25}$' AND video_id IS NULL)`),
    check('external_lives_active_check', sql`is_call_active = true`),
    foreignKey({
      name: 'external_lives_call_group_fk',
      columns: [table.callGroupId],
      foreignColumns: [callGroups.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'external_lives_active_member_fk',
      columns: [table.callGroupId, table.configuredBy, table.isCallActive],
      foreignColumns: [callMembers.callGroupId, callMembers.userId, callMembers.active],
    }).onDelete('cascade'),
  ]
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: text('payload'),
    processedAt: timestamp('processed_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('webhook_events_event_id_unique').on(table.eventId),
  ]
);
