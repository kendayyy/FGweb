import {pgTable,text,integer,timestamp,unique,uniqueIndex,index,check,foreignKey,primaryKey} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {user} from './auth.js';

// These relationships protect persisted identity, not server admin authority.
export const supportRequests=pgTable('support_requests',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull().references(()=>user.id,{onDelete:'restrict'}),clientRequestId:text('client_request_id').notNull(),
 kind:text('kind').notNull(),title:text('title').notNull(),status:text('status').notNull().default('NEW'),version:integer('version').notNull().default(1),lastMessageSequence:integer('last_message_sequence').notNull().default(0),
 createdAt:timestamp('created_at',{withTimezone:true,mode:'date'}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true,mode:'date'}).notNull().defaultNow(),lastActivityAt:timestamp('last_activity_at',{withTimezone:true,mode:'date'}).notNull().defaultNow(),resolvedAt:timestamp('resolved_at',{withTimezone:true,mode:'date'}),
},t=>[
 unique('support_request_owner_client_unique').on(t.ownerId,t.clientRequestId),
 check('support_request_identity_check',sql`char_length(id) BETWEEN 1 AND 128 AND id ~ '[^[:space:]]' AND id !~ '[[:cntrl:]]' AND char_length(client_request_id) BETWEEN 1 AND 128 AND client_request_id ~ '[^[:space:]]' AND client_request_id !~ '[[:cntrl:]]'`),
 check('support_request_kind_title_check',sql`kind IN ('FEEDBACK','BUG','CHAT') AND char_length(title) BETWEEN 1 AND 160 AND title ~ '[^[:space:]]' AND (kind<>'CHAT' OR title='Chat hỗ trợ')`),
 check('support_request_state_check',sql`status IN ('NEW','IN_PROGRESS','RESOLVED') AND version>=1 AND last_message_sequence>=0`),
 check('support_request_time_check',sql`updated_at>=created_at AND last_activity_at>=created_at AND ((status='RESOLVED' AND resolved_at IS NOT NULL AND resolved_at>=created_at) OR (status<>'RESOLVED' AND resolved_at IS NULL))`),
 index('support_request_owner_activity_idx').on(t.ownerId,t.lastActivityAt,t.id),index('support_request_status_activity_idx').on(t.status,t.lastActivityAt,t.id),
]);
export const supportMessages=pgTable('support_messages',{
 id:text('id').primaryKey(),requestId:text('request_id').notNull().references(()=>supportRequests.id,{onDelete:'cascade'}),sequence:integer('sequence').notNull(),authorRole:text('author_role').notNull(),authorId:text('author_id').references(()=>user.id,{onDelete:'restrict'}),clientMessageId:text('client_message_id'),body:text('body').notNull(),createdAt:timestamp('created_at',{withTimezone:true,mode:'date'}).notNull().defaultNow(),
},t=>[
 unique('support_message_request_sequence_unique').on(t.requestId,t.sequence),unique('support_message_request_id_unique').on(t.requestId,t.id),unique('support_message_cursor_identity_unique').on(t.requestId,t.id,t.sequence),
 uniqueIndex('support_message_author_client_unique').on(t.requestId,t.authorId,t.clientMessageId).where(sql`author_id IS NOT NULL`),
 uniqueIndex('support_message_initial_receipt_unique').on(t.requestId).where(sql`author_role='SYSTEM'`),
 check('support_message_identity_sequence_check',sql`char_length(id) BETWEEN 1 AND 128 AND id ~ '[^[:space:]]' AND id !~ '[[:cntrl:]]' AND sequence>0`),
 check('support_message_body_check',sql`char_length(body) BETWEEN 1 AND 4000 AND body ~ '[^[:space:]]'`),
 check('support_message_author_shape_check',sql`(author_role IN ('USER','ADMIN') AND author_id IS NOT NULL AND client_message_id IS NOT NULL AND char_length(client_message_id) BETWEEN 1 AND 128 AND client_message_id ~ '[^[:space:]]' AND client_message_id !~ '[[:cntrl:]]') OR (author_role='SYSTEM' AND author_id IS NULL AND client_message_id IS NULL AND body='FG đã nhận tin nhắn của bạn.')`),
]);
export const supportNotes=pgTable('support_notes',{
 id:text('id').primaryKey(),requestId:text('request_id').notNull().references(()=>supportRequests.id,{onDelete:'cascade'}),authorId:text('author_id').notNull().references(()=>user.id,{onDelete:'restrict'}),clientNoteId:text('client_note_id').notNull(),body:text('body').notNull(),createdAt:timestamp('created_at',{withTimezone:true,mode:'date'}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true,mode:'date'}).notNull().defaultNow(),
},t=>[
 unique('support_note_author_client_unique').on(t.requestId,t.authorId,t.clientNoteId),unique('support_note_audit_identity_unique').on(t.requestId,t.id,t.authorId),
 check('support_note_identity_check',sql`char_length(id) BETWEEN 1 AND 128 AND id ~ '[^[:space:]]' AND id !~ '[[:cntrl:]]' AND char_length(client_note_id) BETWEEN 1 AND 128 AND client_note_id ~ '[^[:space:]]' AND client_note_id !~ '[[:cntrl:]]'`),
 check('support_note_body_time_check',sql`char_length(body) BETWEEN 1 AND 4000 AND body ~ '[^[:space:]]' AND updated_at>=created_at`),index('support_note_request_created_idx').on(t.requestId,t.createdAt,t.id),
]);
export const supportReadCursors=pgTable('support_read_cursors',{
 requestId:text('request_id').notNull().references(()=>supportRequests.id,{onDelete:'cascade'}),readerId:text('reader_id').notNull().references(()=>user.id,{onDelete:'restrict'}),readerRole:text('reader_role').notNull(),lastReadMessageId:text('last_read_message_id'),lastReadSequence:integer('last_read_sequence').notNull().default(0),readAt:timestamp('read_at',{withTimezone:true,mode:'date'}).notNull().defaultNow(),
},t=>[
 primaryKey({name:'support_cursor_reader_unique',columns:[t.requestId,t.readerId]}),
 foreignKey({name:'support_cursor_request_message_fk',columns:[t.requestId,t.lastReadMessageId,t.lastReadSequence],foreignColumns:[supportMessages.requestId,supportMessages.id,supportMessages.sequence]}).onDelete('no action'),
 check('support_cursor_shape_check',sql`reader_role IN ('OWNER','ADMIN') AND ((last_read_message_id IS NULL AND last_read_sequence=0) OR (last_read_message_id IS NOT NULL AND last_read_sequence>0))`),
]);
export const supportAudit=pgTable('support_audit',{
 id:text('id').primaryKey(),requestId:text('request_id').notNull().references(()=>supportRequests.id,{onDelete:'cascade'}),actorId:text('actor_id').notNull().references(()=>user.id,{onDelete:'restrict'}),actorRole:text('actor_role').notNull(),action:text('action').notNull(),fromStatus:text('from_status'),toStatus:text('to_status'),requestVersion:integer('request_version'),noteId:text('note_id'),createdAt:timestamp('created_at',{withTimezone:true,mode:'date'}).notNull().defaultNow(),
},t=>[
 foreignKey({name:'support_audit_note_identity_fk',columns:[t.requestId,t.noteId,t.actorId],foreignColumns:[supportNotes.requestId,supportNotes.id,supportNotes.authorId]}).onDelete('no action'),
 unique('support_audit_note_once_unique').on(t.requestId,t.noteId),uniqueIndex('support_audit_status_revision_unique').on(t.requestId,t.requestVersion).where(sql`action IN ('CREATED','STATUS_CHANGED')`),
 check('support_audit_identity_check',sql`char_length(id) BETWEEN 1 AND 128 AND id ~ '[^[:space:]]' AND id !~ '[[:cntrl:]]'`),
 check('support_audit_status_values_check',sql`(from_status IS NULL OR from_status IN ('NEW','IN_PROGRESS','RESOLVED')) AND (to_status IS NULL OR to_status IN ('NEW','IN_PROGRESS','RESOLVED'))`),
 check('support_audit_action_shape_check',sql`(action='CREATED' AND actor_role='OWNER' AND from_status IS NULL AND to_status IS NOT NULL AND to_status='NEW' AND request_version IS NOT NULL AND request_version=1 AND note_id IS NULL) OR (action='STATUS_CHANGED' AND actor_role='ADMIN' AND from_status IS NOT NULL AND to_status IS NOT NULL AND from_status<>to_status AND request_version IS NOT NULL AND request_version>=2 AND note_id IS NULL) OR (action='NOTE_ADDED' AND actor_role='ADMIN' AND from_status IS NULL AND to_status IS NULL AND request_version IS NULL AND note_id IS NOT NULL)`),
 index('support_audit_request_created_idx').on(t.requestId,t.createdAt,t.id),
]);
