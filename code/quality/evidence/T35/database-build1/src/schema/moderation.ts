import { pgTable, text, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.js';
import { messages } from './messages.js';

export const reports = pgTable(
  'reports',
  {
    id: text('id').primaryKey(),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'no action' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reportedUserId: text('reported_user_id').references(() => user.id, { onDelete: 'no action' }),
    reportedMessageId: text('reported_message_id').references(() => messages.id, { onDelete: 'no action' }),
    reason: text('reason').notNull(),
    details: text('details'),
    status: text('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  () => [
    check('report_target_type_check', sql`target_type IN ('USER', 'MESSAGE')`),
    check('report_status_check', sql`status IN ('PENDING', 'RESOLVED', 'DISMISSED')`),
    check('report_reason_length_check', sql`length(reason) >= 1 AND length(reason) <= 200`),
    check('report_details_length_check', sql`details IS NULL OR length(details) <= 1000`),
    check(
      'report_target_shape_check',
      sql`(target_type = 'USER' AND reported_user_id IS NOT NULL AND reported_message_id IS NULL AND target_id = reported_user_id) OR (target_type = 'MESSAGE' AND reported_message_id IS NOT NULL AND reported_user_id IS NULL AND target_id = reported_message_id)`
    ),
  ]
);

export const adminActions = pgTable(
  'admin_actions',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'no action' }),
    targetUserId: text('target_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'no action' }),
    action: text('action').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  () => [
    check('admin_action_type_check', sql`action IN ('BAN', 'UNBAN', 'RESOLVE_REPORT', 'DISMISS_REPORT')`),
  ]
);
