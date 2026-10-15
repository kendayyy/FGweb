import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';

/** Called inside the owning membership transaction; never commits or publishes. */
async function installed(db:PoolClient){return Boolean((await db.query(`SELECT to_regclass('chat_crypto_state') IS NOT NULL AS available`)).rows[0]?.available);}

export async function ensurePrivateCryptoState(db:PoolClient,conversationId:string){
 // Legacy writes take a compatible conversation lock before checking state.
 // This closes the empty-check/activation race without changing old schemas.
 const conversation=(await db.query(`SELECT kind,user1_id,user2_id FROM conversations WHERE id=$1 FOR UPDATE`,[conversationId])).rows[0];
 if(!conversation||conversation.kind==='LOBBY')return;
 const existing=(await db.query(`SELECT * FROM chat_crypto_state WHERE conversation_id=$1 FOR UPDATE`,[conversationId])).rows[0];if(existing)return existing;
 const old=Boolean((await db.query(`SELECT 1 FROM messages WHERE conversation_id=$1 LIMIT 1`,[conversationId])).rowCount);
 const state=(await db.query(`INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES($1,'E2EE',$2,$3) RETURNING *`,[conversationId,old?'LEGACY_PENDING':'RECONCILED',old?'UNKNOWN':'KNOWN'])).rows[0];
 if(!old){
  const members=conversation.kind==='DM'?[conversation.user1_id,conversation.user2_id]:(await db.query(`SELECT DISTINCT user_id FROM room_members WHERE room_id IN(SELECT id FROM rooms WHERE conversation_id=$1) UNION SELECT user_id FROM conversation_members WHERE conversation_id=$1 AND NOT EXISTS(SELECT 1 FROM rooms WHERE conversation_id=$1)`,[conversationId])).rows.map(row=>row.user_id);
  for(const userId of members.sort())await db.query(`INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES($1,$2,$3,1,clock_timestamp())`,[randomUUID(),conversationId,userId]);
 }
 return state;
}

export async function cryptoMemberJoined(db:PoolClient,conversationId:string,userId:string){
 if(!await installed(db))return;
 const state=(await db.query(`SELECT mode,membership_revision FROM chat_crypto_state WHERE conversation_id=$1 FOR UPDATE`,[conversationId])).rows[0];if(state?.mode!=='E2EE')return;
 if((await db.query(`SELECT 1 FROM chat_crypto_membership_intervals WHERE conversation_id=$1 AND user_id=$2 AND end_revision IS NULL`,[conversationId,userId])).rowCount)return;
 const revision=(await db.query(`UPDATE chat_crypto_state SET membership_revision=membership_revision+1,updated_at=clock_timestamp() WHERE conversation_id=$1 RETURNING membership_revision`,[conversationId])).rows[0].membership_revision;
 await db.query(`INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES($1,$2,$3,$4,clock_timestamp())`,[randomUUID(),conversationId,userId,revision]);
}

export async function cryptoMemberLeft(db:PoolClient,conversationId:string,userId:string){
 if(!await installed(db))return;
 const state=(await db.query(`SELECT mode FROM chat_crypto_state WHERE conversation_id=$1 FOR UPDATE`,[conversationId])).rows[0];if(state?.mode!=='E2EE')return;
 const revision=(await db.query(`UPDATE chat_crypto_state SET membership_revision=membership_revision+1,updated_at=clock_timestamp() WHERE conversation_id=$1 RETURNING membership_revision`,[conversationId])).rows[0].membership_revision;
 await db.query(`UPDATE chat_crypto_membership_intervals SET end_revision=$3,left_at=clock_timestamp() WHERE conversation_id=$1 AND user_id=$2 AND end_revision IS NULL`,[conversationId,userId,revision]);
}

/** A dissolved crypto conversation is an inaccessible tombstone, not a reusable
 * ID/session. The owning room is removed; ciphertext and session bindings stay. */
export async function retirePrivateCryptoConversation(db:PoolClient,conversationId:string){
 if(!await installed(db))return false;
 // Membership locks precede conversation/state locks, as in authorization.
 await db.query(`SELECT id FROM conversation_members WHERE conversation_id=$1 ORDER BY user_id FOR UPDATE`,[conversationId]);
 await db.query(`SELECT id FROM conversations WHERE id=$1 FOR UPDATE`,[conversationId]);
 const state=(await db.query(`SELECT mode FROM chat_crypto_state WHERE conversation_id=$1 FOR UPDATE`,[conversationId])).rows[0];if(state?.mode!=='E2EE')return false;
 const revision=(await db.query(`UPDATE chat_crypto_state SET membership_revision=membership_revision+1,updated_at=clock_timestamp() WHERE conversation_id=$1 RETURNING membership_revision`,[conversationId])).rows[0].membership_revision;
 await db.query(`UPDATE chat_crypto_membership_intervals SET end_revision=$2,left_at=clock_timestamp() WHERE conversation_id=$1 AND end_revision IS NULL`,[conversationId,revision]);
 await db.query(`DELETE FROM conversation_members WHERE conversation_id=$1`,[conversationId]);return true;
}
