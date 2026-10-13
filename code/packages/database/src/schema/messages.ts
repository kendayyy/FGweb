import {
  pgTable,
  text,
  timestamp,
  integer,
  unique,
  index,
  check,
  foreignKey,
  jsonb,
  bigint,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.js';
import { conversations } from './conversations.js';

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull().default('TEXT'),
    content: text('content').notNull().default(''),
    encryptionMode: text('encryption_mode').notNull().default('LEGACY_PENDING'),
    cryptoEnvelope: jsonb('crypto_envelope'),
    cryptoRevision: bigint('crypto_revision', {mode:'number'}),
    clientMessageId: text('client_message_id').notNull(),
    replyToId: text('reply_to_id'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('message_id_conversation_unique').on(table.id, table.conversationId),
    unique('sender_client_message_id_unique').on(
      table.senderId,
      table.conversationId,
      table.clientMessageId
    ),
    index('messages_conversation_cursor_idx').on(
      table.conversationId,
      table.createdAt,
      table.id
    ),
    check('message_type_check', sql`type IN ('TEXT', 'IMAGE')`),
    check('message_encryption_shape_check',sql`(${table.encryptionMode}='LEGACY_PENDING' AND ${table.cryptoEnvelope} IS NULL AND ${table.cryptoRevision} IS NULL) OR (${table.content}='' AND ${table.cryptoRevision} IS NOT NULL AND ${table.cryptoRevision} BETWEEN 1 AND 9007199254740991 AND chat_crypto_valid_envelope(${table.cryptoEnvelope},${table.encryptionMode},'fg-lobby'))`),
    // Note: Drizzle DSL onDelete('set null') specifies SET NULL on composite FK.
    // In PostgreSQL 17, the migration SQL specifies ON DELETE SET NULL ("reply_to_id")
    // to clear only reply_to_id while preserving non-null conversation_id upon parent deletion.
    foreignKey({
      columns: [table.replyToId, table.conversationId],
      foreignColumns: [table.id, table.conversationId],
      name: 'messages_reply_to_same_conversation_fk',
    }).onDelete('set null'),
  ]
);

export const attachments = pgTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: text('mime_type').notNull(),
    encryptionMode: text('encryption_mode').notNull().default('LEGACY_PENDING'),
    cryptoEnvelope: jsonb('crypto_envelope'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check('attachment_encryption_shape_check',sql`(${table.encryptionMode}='LEGACY_PENDING' AND ${table.cryptoEnvelope} IS NULL) OR (${table.encryptionMode}='E2EE' AND ${table.fileName}='' AND ${table.mimeType}='application/octet-stream' AND ${table.cryptoEnvelope} IS NULL AND ${table.fileSize} BETWEEN 1 AND 5242880) OR (${table.encryptionMode}='LOBBY_AEAD' AND chat_crypto_valid_envelope(${table.cryptoEnvelope},'LOBBY_AEAD','fg-lobby'))`),
    foreignKey({
      columns: [table.messageId, table.conversationId],
      foreignColumns: [messages.id, messages.conversationId],
      name: 'attachments_message_conversation_fk',
    }).onDelete('cascade'),
  ]
);

export const mentions = pgTable(
  'mentions',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    mentionedUserId: text('mentioned_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('message_mentioned_user_unique').on(table.messageId, table.mentionedUserId),
  ]
);
