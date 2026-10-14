import {pgTable,text,timestamp,unique,check,index} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {chatCryptoToDeviceEvents} from './chat-crypto.js';
import {chatCryptoProtocolEvents} from './chat-crypto-transport.js';
/** Durable wakeups reference authoritative queues, never copy payload/routing.
 * Expiry deletion cascades jobs; recipient ACL is rechecked during delivery. */
export const chatCryptoProtocolOutbox=pgTable('chat_crypto_protocol_outbox',{
 id:text('id').primaryKey(),
 toDeviceEventId:text('to_device_event_id').references(()=>chatCryptoToDeviceEvents.id,{onDelete:'cascade'}),
 verificationEventId:text('verification_event_id').references(()=>chatCryptoProtocolEvents.id,{onDelete:'cascade'}),
 createdAt:timestamp('created_at',{withTimezone:true,mode:'date'}).notNull().defaultNow(),
 deliveredAt:timestamp('delivered_at',{withTimezone:true,mode:'date'}),
},t=>[
 unique('chat_crypto_wakeup_encrypted_unique').on(t.toDeviceEventId),unique('chat_crypto_wakeup_verification_unique').on(t.verificationEventId),
 check('chat_crypto_wakeup_one_event_check',sql`(${t.toDeviceEventId} IS NOT NULL AND ${t.verificationEventId} IS NULL) OR (${t.toDeviceEventId} IS NULL AND ${t.verificationEventId} IS NOT NULL)`),
 check('chat_crypto_wakeup_delivery_check',sql`${t.deliveredAt} IS NULL OR ${t.deliveredAt}>=${t.createdAt}`),
 index('chat_crypto_wakeup_pending_idx').on(t.createdAt,t.id).where(sql`${t.deliveredAt} IS NULL`),
]);
