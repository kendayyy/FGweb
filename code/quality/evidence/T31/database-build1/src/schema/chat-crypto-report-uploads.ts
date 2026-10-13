import {pgTable,text,foreignKey,check,index} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {messages} from './messages.js';
import {chatCryptoUploadDrafts} from './chat-crypto-transport.js';
/** Selected source ID is routing metadata. Retry identity is keyed, not an
 * unkeyed plaintext-image digest; no pixels, filenames or client keys here. */
export const chatCryptoReportUploadSources=pgTable('chat_crypto_report_upload_sources',{
 uploadId:text('upload_id').primaryKey(),sourceMessageId:text('source_message_id').notNull(),retryFingerprint:text('retry_fingerprint').notNull(),
},t=>[
 foreignKey({name:'crypto_report_upload_draft_fk',columns:[t.uploadId],foreignColumns:[chatCryptoUploadDrafts.id]}).onDelete('cascade'),
 foreignKey({name:'crypto_report_upload_source_fk',columns:[t.sourceMessageId],foreignColumns:[messages.id]}).onDelete('restrict'),
 check('crypto_report_upload_fingerprint_check',sql`${t.retryFingerprint} ~ '^[A-Za-z0-9+/]{43}=?$'`),
 index('crypto_report_upload_source_idx').on(t.sourceMessageId),
]);
