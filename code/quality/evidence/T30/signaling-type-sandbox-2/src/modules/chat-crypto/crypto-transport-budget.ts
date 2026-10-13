import {ServiceUnavailableException} from '@nestjs/common';
import type {PoolClient} from 'pg';
import {ErrorCode} from '@fg/contracts';
import {chatError} from '../chat/chat.service.js';

export type CryptoTransportBudget={maxRows:number;maxPayloadBytes:number};
export type CryptoTransportAddition={senderId:string;recipientId:string;payload:unknown};
export function cryptoTransportBudget(env:NodeJS.ProcessEnv=process.env):CryptoTransportBudget{
 const value=(name:string)=>{const text=env[name];if(!text||!/^\d+$/.test(text))throw new ServiceUnavailableException('Crypto transport budget unavailable');const number=Number(text);if(!Number.isSafeInteger(number)||number<1)throw new ServiceUnavailableException('Crypto transport budget unavailable');return number;};
 return {maxRows:value('FG_CRYPTO_TRANSPORT_MAX_ROWS_PER_USER'),maxPayloadBytes:value('FG_CRYPTO_TRANSPORT_MAX_PAYLOAD_BYTES_PER_USER')};
}
export async function lockCryptoTransportBudget(db:PoolClient,additions:Pick<CryptoTransportAddition,'senderId'|'recipientId'>[]):Promise<void>{
 const isolation=await db.query('SHOW transaction_isolation');if(isolation.rows[0]?.transaction_isolation!=='read committed')throw new ServiceUnavailableException('Crypto transport budget unavailable');
 const dimensions=new Map<string,{kind:string;user:string}>();
 for(const item of additions)for(const kind of ['SENDER','RECIPIENT']){const user=kind==='SENDER'?item.senderId:item.recipientId;dimensions.set(JSON.stringify([kind,user]),{kind,user});}
 for(const [,entry]of [...dimensions.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0))await db.query("SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_crypto_transport',current_schema(),$1::text,$2::text)::text,0::bigint))",[entry.kind,entry.user]);
}

/** Retained transport payload accounting, not a physical database size claim.
 * Must run in the owning READ COMMITTED transaction, after retry dedup and before
 * any inserts. Transaction advisory locks coordinate independent API instances.
 * ACK and expiry alone do not free retained bytes; actual deletion does. */
export async function enforceCryptoTransportBudget(db:PoolClient,additions:CryptoTransportAddition[],budget:CryptoTransportBudget):Promise<void>{
 if(!Number.isSafeInteger(budget.maxRows)||budget.maxRows<1||!Number.isSafeInteger(budget.maxPayloadBytes)||budget.maxPayloadBytes<1)throw new ServiceUnavailableException('Crypto transport budget unavailable');
 if(!additions.length)return;
 await lockCryptoTransportBudget(db,additions);
 const dimensions=new Map<string,{kind:'SENDER'|'RECIPIENT';user:string;rows:number;bytes:number}>();
 for(const addition of additions){
  const encoded=JSON.stringify(addition.payload);if(encoded===undefined)throw new ServiceUnavailableException('Crypto transport budget unavailable');
  const size=await db.query<{bytes:string}>('SELECT octet_length($1::jsonb::text)::text AS bytes',[encoded]),bytes=Number(size.rows[0].bytes);
  if(!Number.isSafeInteger(bytes)||bytes<1)throw new ServiceUnavailableException('Crypto transport budget unavailable');
  for(const kind of ['SENDER','RECIPIENT'] as const){const user=kind==='SENDER'?addition.senderId:addition.recipientId,key=JSON.stringify([kind,user]),entry=dimensions.get(key)??{kind,user,rows:0,bytes:0};entry.rows++;entry.bytes+=bytes;dimensions.set(key,entry);}
 }
 const entries=[...dimensions.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0);
 for(const [,entry]of entries)await db.query("SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_crypto_transport',current_schema(),$1::text,$2::text)::text,0::bigint))",[entry.kind,entry.user]);
 for(const [,entry]of entries){
  const column=entry.kind==='SENDER'?'sender_user_id':'recipient_user_id';
  const result=await db.query<{rows:string;bytes:string}>(`SELECT sum(n)::text AS rows,sum(b)::text AS bytes FROM (SELECT count(*) AS n,COALESCE(sum(octet_length(content::text)),0) AS b FROM chat_crypto_to_device_events WHERE ${column}=$1 UNION ALL SELECT count(*) AS n,COALESCE(sum(octet_length(event::text)),0) AS b FROM chat_crypto_protocol_events WHERE ${column}=$1) retained`,[entry.user]);
  const rows=Number(result.rows[0].rows),bytes=Number(result.rows[0].bytes);
  if(!Number.isSafeInteger(rows)||!Number.isSafeInteger(bytes)||!Number.isSafeInteger(entry.bytes))throw new ServiceUnavailableException('Crypto transport budget unavailable');
  if(rows>budget.maxRows-entry.rows||bytes>budget.maxPayloadBytes-entry.bytes)chatError(ErrorCode.RATE_LIMITED,'Crypto transport quota exceeded');
 }
}
