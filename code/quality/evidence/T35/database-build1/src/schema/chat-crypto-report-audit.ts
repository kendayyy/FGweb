import {pgTable,text,timestamp,check,index} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {user} from './auth.js';
import {reports} from './moderation.js';
/** Metadata only; retained moderation roots survive evidence expiry. */
export const chatCryptoReportAudit=pgTable('chat_crypto_report_audit',{
 id:text('id').primaryKey(),actorId:text('actor_id').notNull().references(()=>user.id,{onDelete:'restrict'}),reportId:text('report_id').notNull().references(()=>reports.id,{onDelete:'restrict'}),action:text('action').notNull(),attachmentId:text('attachment_id'),createdAt:timestamp('created_at',{withTimezone:true,mode:'date'}).notNull().defaultNow(),
},t=>[check('crypto_report_audit_action_check',sql`(${t.action}='READ_REPORT' AND ${t.attachmentId} IS NULL) OR (${t.action}='READ_IMAGE' AND ${t.attachmentId} IS NOT NULL)`),index('crypto_report_audit_report_idx').on(t.reportId,t.createdAt)]);
