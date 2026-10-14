import {Injectable,OnModuleInit,OnModuleDestroy} from '@nestjs/common';
import {Pool,type PoolClient} from 'pg';import {randomUUID,ECDH,createECDH,createHash} from 'node:crypto';
import {WebPushSubscriptionSchema,WebPushUnsubscribeSchema,WebPushConfigSchema,IdSchema,ErrorCode} from '@fg/contracts';
import {notificationAuthoritySql,notificationCryptoSchemaAvailable,notificationDTO} from '@fg/database';
import {chatError,type ChatActor} from '../chat/chat.service.js';

@Injectable()
export class PushService implements OnModuleInit,OnModuleDestroy {
 private pool!:Pool;private cryptoReady=false;
 async onModuleInit(){this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000,statement_timeout:10000});this.cryptoReady=await notificationCryptoSchemaAvailable(this.pool);}
 async onModuleDestroy(){await this.pool?.end();}
 private async actor(db:Pool|PoolClient,actor:ChatActor){
  if(!actor||!(await db.query('SELECT 1 FROM session WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp()',[actor?.sessionId,actor?.userId])).rowCount)chatError(ErrorCode.LOGIN_REQUIRED,'Session unavailable');
  if((await db.query("SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1",[actor.userId])).rows[0]?.action==='BAN')chatError(ErrorCode.FORBIDDEN,'Account unavailable');
  return actor;
 }
 async config(actor:ChatActor){
  await this.actor(this.pool,actor);
  try{const publicKey=process.env.VAPID_PUBLIC_KEY??'',privateKey=process.env.VAPID_PRIVATE_KEY??'',curve=createECDH('prime256v1');curve.setPrivateKey(Buffer.from(privateKey,'base64url'));if(curve.getPublicKey().toString('base64url')!==publicKey||!process.env.VAPID_SUBJECT)return{available:false as const};return WebPushConfigSchema.parse({available:true,publicKey});}catch{return{available:false as const};}
 }
 async target(actor:ChatActor,id:string){
  if(!IdSchema.safeParse(id).success||id.length>128||['.','..'].includes(id)||Array.from(id).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127))chatError(ErrorCode.INVALID_INPUT,'Invalid notification identity');
  const user=await this.actor(this.pool,actor);
  for(const channel of ['PUSH','EMAIL'] as const){
   const row=(await this.pool.query(`SELECT n.*,to_char(n.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM notifications n
    WHERE n.id=$1 AND n.user_id=$2
     AND EXISTS(SELECT 1 FROM session s WHERE s.id=$3 AND s.user_id=n.user_id AND s.expires_at>clock_timestamp())
     AND EXISTS(SELECT 1 FROM notification_outbox o JOIN notification_delivery_receipts r ON r.outbox_id=o.id WHERE o.notification_id=n.id AND o.user_id=n.user_id AND o.channel='${channel}' AND r.status='ACCEPTED')
     AND ${notificationAuthoritySql(this.cryptoReady,channel)}`,[id,user.userId,user.sessionId])).rows[0];
   if(row){const dto=notificationDTO(row);if(dto)return dto;}
  }
  chatError(ErrorCode.NOT_FOUND,'Notification unavailable');
 }
 async register(actor:ChatActor,input:unknown){
  const parsed=WebPushSubscriptionSchema.safeParse(input);if(!parsed.success)chatError(ErrorCode.INVALID_INPUT,'Invalid Push subscription');parsed.data.endpoint=new URL(parsed.data.endpoint).href;
  try{const publicBytes=Buffer.from(parsed.data.keys.p256dh,'base64url');if(publicBytes.toString('base64url')!==parsed.data.keys.p256dh||ECDH.convertKey(publicBytes,'prime256v1',undefined,undefined,'uncompressed').length!==65)throw new Error();}catch{chatError(ErrorCode.INVALID_INPUT,'Invalid browser public key');}
  const db=await this.pool.connect();let begun=false;
  try{await db.query('BEGIN');begun=true;const user=await this.actor(db,actor);const device=createHash('sha256').update(JSON.stringify(parsed.data.keys)).digest('hex');await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['fg-push-device:'+device]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['fg-push-endpoint:'+parsed.data.endpoint]);
   const existing=(await db.query('SELECT user_id FROM push_subscriptions WHERE endpoint=$1 OR(p256dh=$2 AND auth=$3) ORDER BY id FOR UPDATE',[parsed.data.endpoint,parsed.data.keys.p256dh,parsed.data.keys.auth])).rows;if(existing.some((row:{user_id:string})=>row.user_id!==user.userId))chatError(ErrorCode.FORBIDDEN,'Subscription unavailable');
   await db.query('INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth) VALUES($1,$2,$3,$4,$5) ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth WHERE push_subscriptions.user_id=EXCLUDED.user_id',[randomUUID(),user.userId,parsed.data.endpoint,parsed.data.keys.p256dh,parsed.data.keys.auth]);await db.query('COMMIT');begun=false;return{success:true};
  }finally{try{if(begun)await db.query('ROLLBACK');}finally{db.release();}}
 }
 async unregister(actor:ChatActor,input:unknown){
  const parsed=WebPushUnsubscribeSchema.safeParse(input);if(!parsed.success)chatError(ErrorCode.INVALID_INPUT,'Invalid Push endpoint');parsed.data.endpoint=new URL(parsed.data.endpoint).href;const db=await this.pool.connect();let begun=false;
  try{await db.query('BEGIN');begun=true;const user=await this.actor(db,actor);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['fg-push-endpoint:'+parsed.data.endpoint]);const removed=await db.query('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2 RETURNING id',[parsed.data.endpoint,user.userId]);if(!removed.rowCount)chatError(ErrorCode.NOT_FOUND,'Subscription unavailable');await db.query('COMMIT');begun=false;return{success:true};}
  finally{try{if(begun)await db.query('ROLLBACK');}finally{db.release();}}
 }
}
