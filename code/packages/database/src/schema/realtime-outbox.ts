import {pgTable,text,timestamp,integer,unique,index,check,foreignKey} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {messages} from './messages.js';

/** Durable at-least-once creation events; dispatch resolves the message and current ACL. */
export const realtimeOutbox=pgTable('realtime_outbox',{
  id:text('id').primaryKey(),
  messageId:text('message_id').notNull(),
  conversationId:text('conversation_id').notNull(),
  eventName:text('event_name').notNull(),
  attempts:integer('attempts').notNull().default(0),
  createdAt:timestamp('created_at',{mode:'date'}).notNull().defaultNow(),
  deliveredAt:timestamp('delivered_at',{mode:'date'}),
},table=>[
  unique('realtime_outbox_message_event_unique').on(table.messageId,table.eventName),
  foreignKey({name:'realtime_outbox_message_conversation_fk',columns:[table.messageId,table.conversationId],foreignColumns:[messages.id,messages.conversationId]}).onDelete('cascade'),
  index('realtime_outbox_pending_cursor_idx').on(table.createdAt,table.id).where(sql`${table.deliveredAt} IS NULL`),
  check('realtime_outbox_attempts_check',sql`${table.attempts} >= 0`),
  check('realtime_outbox_event_check',sql`${table.eventName} = 'message.created'`),
]);
