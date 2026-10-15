import { pgTable, text, timestamp, check, foreignKey, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.js';
import {feedPosts,feedComments} from './feed.js';
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
    reportedFeedPostId: text('reported_feed_post_id').references(()=>feedPosts.id,{onDelete:'restrict'}),
    reportedFeedCommentId: text('reported_feed_comment_id').references(()=>feedComments.id,{onDelete:'restrict'}),
    reason: text('reason').notNull(),
    details: text('details'),
    status: text('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  () => [
    check('report_target_type_check', sql`target_type IN ('USER', 'MESSAGE', 'FEED_POST', 'FEED_COMMENT')`),
    check('report_status_check', sql`status IN ('PENDING', 'RESOLVED', 'DISMISSED')`),
    check('report_reason_length_check', sql`length(reason) >= 1 AND length(reason) <= 200`),
    check('report_details_length_check', sql`details IS NULL OR length(details) <= 1000`),
    check(
      'report_target_shape_check',
      sql`(target_type='USER' AND reported_user_id IS NOT NULL AND reported_message_id IS NULL AND reported_feed_post_id IS NULL AND reported_feed_comment_id IS NULL AND target_id=reported_user_id) OR (target_type='MESSAGE' AND reported_message_id IS NOT NULL AND reported_user_id IS NULL AND reported_feed_post_id IS NULL AND reported_feed_comment_id IS NULL AND target_id=reported_message_id) OR (target_type='FEED_POST' AND reported_feed_post_id IS NOT NULL AND reported_user_id IS NULL AND reported_message_id IS NULL AND reported_feed_comment_id IS NULL AND target_id=reported_feed_post_id) OR (target_type='FEED_COMMENT' AND reported_feed_comment_id IS NOT NULL AND reported_user_id IS NULL AND reported_message_id IS NULL AND reported_feed_post_id IS NULL AND target_id=reported_feed_comment_id)`
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

export const feedContentAudit=pgTable('feed_content_audit',{
 id:text('id').primaryKey(),actorId:text('actor_id').notNull().references(()=>user.id,{onDelete:'restrict'}),postId:text('post_id').notNull().references(()=>feedPosts.id,{onDelete:'restrict'}),commentId:text('comment_id'),reportId:text('report_id').references(()=>reports.id,{onDelete:'restrict'}),action:text('action').notNull(),reason:text('reason').notNull(),createdAt:timestamp('created_at',{withTimezone:true,mode:'date'}).notNull().defaultNow(),
},t=>[foreignKey({name:'feed_audit_same_post_comment_fk',columns:[t.postId,t.commentId],foreignColumns:[feedComments.postId,feedComments.id]}).onDelete('restrict'),check('feed_audit_action_check',sql`(${t.action}='DELETE_POST' AND ${t.commentId} IS NULL) OR (${t.action}='DELETE_COMMENT' AND ${t.commentId} IS NOT NULL)`),check('feed_audit_reason_check',sql`char_length(btrim(${t.reason})) BETWEEN 1 AND 300`),index('feed_audit_post_idx').on(t.postId,t.createdAt,t.id)]);
