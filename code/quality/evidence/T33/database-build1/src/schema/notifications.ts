import { pgTable, text, integer, boolean, timestamp, unique, check, foreignKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.js';

export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: text('data'),
    isRead: boolean('is_read').notNull().default(false),
    dedupKey: text('dedup_key').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('notifications_user_dedup_unique').on(table.userId, table.dedupKey),
    unique('notifications_id_user_unique').on(table.id, table.userId),
    check(
      'notification_type_check',
      sql`type IN ('DM', 'MENTION', 'FRIEND_INVITE', 'ROOM_INVITE', 'TEAM_INVITE', 'JOIN_REQUEST', 'JOIN_REQUEST_RESULT', 'REMINDER_10MIN')`
    ),
    check('notification_dedup_key_nonempty', sql`length(trim(dedup_key)) > 0`),
  ]
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    notificationType: text('notification_type').notNull(),
    inApp: boolean('in_app').notNull().default(true),
    push: boolean('push').notNull().default(true),
    email: boolean('email').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('notification_pref_user_type_unique').on(table.userId, table.notificationType),
    check(
      'notification_pref_type_check',
      sql`notification_type IN ('DM', 'MENTION', 'FRIEND_INVITE', 'ROOM_INVITE', 'TEAM_INVITE', 'JOIN_REQUEST', 'JOIN_REQUEST_RESULT', 'REMINDER_10MIN')`
    ),
    check(
      'notification_pref_email_forbidden_check',
      sql`(notification_type IN ('DM', 'MENTION', 'JOIN_REQUEST', 'JOIN_REQUEST_RESULT') AND email = false) OR (notification_type IN ('FRIEND_INVITE', 'ROOM_INVITE', 'TEAM_INVITE', 'REMINDER_10MIN'))`
    ),
  ]
);

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('push_sub_endpoint_unique').on(table.endpoint),
    unique('push_sub_user_endpoint_unique').on(table.userId, table.endpoint),
  ]
);

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: text('id').primaryKey(),
    notificationId: text('notification_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    status: text('status').notNull().default('PENDING'),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    dedupKey: text('dedup_key').notNull(),
    lastError: text('last_error'),
    scheduledAt: timestamp('scheduled_at', { mode: 'date' }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('outbox_channel_user_dedup_unique').on(table.channel, table.userId, table.dedupKey),
    check('outbox_channel_check', sql`channel IN ('IN_APP', 'PUSH', 'EMAIL')`),
    check('outbox_status_check', sql`status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')`),
    check('outbox_retry_bounds_check', sql`retry_count >= 0 AND max_retries >= 1 AND retry_count <= max_retries`),
    foreignKey({
      name: 'outbox_notification_user_fk',
      columns: [table.notificationId, table.userId],
      foreignColumns: [notifications.id, notifications.userId],
    }).onDelete('cascade'),
  ]
);
