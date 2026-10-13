import {pgTable,text,timestamp,uniqueIndex,index,check} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {session} from './auth.js';
import {callMembers} from './calls.js';

/** Opaque SFU identity per admission, never a reusable user identity.
 * Native session/member deletion removes the binding immediately. Backend and
 * signaling gateway must still check live expiry, ban, room membership, call
 * state and equality of session.userId to member.userId on every connection.
 */
export const callAdmissions=pgTable('call_admissions',{
 id:text('id').primaryKey(),
 callMemberId:text('call_member_id').notNull().references(()=>callMembers.id,{onDelete:'cascade'}),
 sessionId:text('session_id').notNull().references(()=>session.id,{onDelete:'cascade'}),
 createdAt:timestamp('created_at',{mode:'date',withTimezone:true}).notNull().defaultNow(),
 expiresAt:timestamp('expires_at',{mode:'date',withTimezone:true}).notNull(),
 connectedAt:timestamp('connected_at',{mode:'date',withTimezone:true}),
 disconnectedAt:timestamp('disconnected_at',{mode:'date',withTimezone:true}),
 revokedAt:timestamp('revoked_at',{mode:'date',withTimezone:true}),
},table=>[
 uniqueIndex('call_admissions_member_live_idx').on(table.callMemberId).where(sql`${table.revokedAt} IS NULL`),
 index('call_admissions_expiry_live_idx').on(table.expiresAt).where(sql`${table.revokedAt} IS NULL`),
 check('call_admission_expiry_check',sql`${table.expiresAt}>${table.createdAt}`),
]);
