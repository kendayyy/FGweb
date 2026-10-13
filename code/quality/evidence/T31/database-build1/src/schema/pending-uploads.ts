import { pgTable, text, timestamp, integer, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.js';
import { conversations } from './conversations.js';
/** Durable upload drafts; consume inside the message transaction, expire while unbound. */
export const pendingImageUploads = pgTable('pending_image_uploads', {
    id: text('id').primaryKey(),
    uploaderId: text('uploader_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: text('mime_type').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
}, table => [
    index('pending_image_uploads_expiry_idx').on(table.expiresAt, table.id),
    check('pending_image_uploads_size_check', sql `${table.fileSize}>0 AND ${table.fileSize}<=5242880`),
    check('pending_image_uploads_mime_check', sql `${table.mimeType}='image/webp'`),
    check('pending_image_uploads_expiry_check', sql `${table.expiresAt}>${table.createdAt}`),
    check('pending_image_uploads_filename_check', sql `length(${table.fileName}) BETWEEN 1 AND 255 AND position('/' in ${table.fileName})=0 AND position(chr(92) in ${table.fileName})=0`),
]);
