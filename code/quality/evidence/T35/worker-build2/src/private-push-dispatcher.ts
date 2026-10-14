import type {Pool,PoolClient} from 'pg';
import https from 'node:https';
import {createHash} from 'node:crypto';
import webpush from 'web-push';
import {DMNotificationDataSchema,MentionNotificationDataSchema,NotificationSchema} from '@fg/contracts';
export type PrivatePushConfiguration={allowedOrigins:string[];vapid:{subject:string;publicKey:string;privateKey:string};ca?:Buffer};
/** Private-only durable delivery. No decryption, EMAIL, plaintext preview or proxy. */
export class PrivatePushDispatcher{
 private readonly origins:Set<string>;
 constructor(private readonly pool:Pool,private readonly configuration:PrivatePushConfiguration){
  const valid=configuration.allowedOrigins.length>0&&configuration.allowedOrigins.length<=20&&configuration.allowedOrigins.every(value=>{if(!URL.canParse(value))return false;const url=new URL(value);return url.protocol==='https:'&&url.origin===value&&!url.username&&!url.password&&!url.search&&!url.hash;});
  const keys=configuration.vapid;if(!valid||!/^[-_A-Za-z0-9]{87}$/.test(keys.publicKey)||!/^[-_A-Za-z0-9]{43}$/.test(keys.privateKey)||!URL.canParse(keys.subject)||!['https:','mailto:'].includes(new URL(keys.subject).protocol)||(configuration.ca&&configuration.ca.length>128*1024))throw new Error('Private PUSH configuration unavailable');
  this.origins=new Set(configuration.allowedOrigins);
 }
 private endpoint(value:string){if(value.length>8192||!URL.canParse(value))return false;const url=new URL(value);return url.protocol==='https:'&&this.origins.has(url.origin)&&!url.username&&!url.password&&!url.hash;}
 private async suppress(db:PoolClient,id:string){await db.query("UPDATE notification_outbox SET status='FAILED',last_error='PRIVATE_PUSH_SUPPRESSED' WHERE id=$1",[id]);}
 private async ready(db:Pick<PoolClient,'query'>):Promise<boolean>{
  const required=['chat_crypto_cohort_members','chat_crypto_devices','chat_crypto_history_cohorts','chat_crypto_identity_keys','chat_crypto_legacy_attestations','chat_crypto_legacy_candidate_images','chat_crypto_legacy_candidates','chat_crypto_legacy_migrations','chat_crypto_legacy_stage_objects','chat_crypto_legacy_stage_sources','chat_crypto_legacy_stages','chat_crypto_membership_intervals','chat_crypto_one_time_keys','chat_crypto_outbound_sessions','chat_crypto_protocol_events','chat_crypto_protocol_outbox','chat_crypto_recovery_backups','chat_crypto_report_audit','chat_crypto_report_evidence','chat_crypto_report_upload_sources','chat_crypto_state','chat_crypto_to_device_events','chat_crypto_upload_drafts'].concat(['notification_outbox','notifications','notification_preferences','push_subscriptions','messages','conversations','blocks','admin_actions','mentions','rooms','room_members','conversation_members']);
  return (await db.query('SELECT bool_and(to_regclass(name) IS NOT NULL) AS ready FROM unnest($1::text[]) AS names(name)',[required])).rows[0]?.ready===true;
 }
 async isReady():Promise<boolean>{return this.ready(this.pool);}
 private async current(db:PoolClient,job:{notification_id:string;user_id:string;data:string;type:string;dedup_key:string},data:{messageId:string;conversationId:string;senderId:string},subscription?:{id:string;endpoint:string;p256dh:string;auth:string}){
  return Boolean((await db.query(`SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN chat_crypto_state s ON s.conversation_id=c.id JOIN notifications n ON n.id=$5 AND n.user_id=$4
    WHERE m.id=$1 AND c.id=$2 AND m.sender_id=$3 AND n.data=$6 AND n.type=$7 AND n.dedup_key=$8 AND m.sender_id<>n.user_id AND m.encryption_mode='E2EE' AND s.mode='E2EE' AND s.migration_state='RECONCILED'
   AND ((n.type='DM' AND c.kind='DM' AND n.dedup_key='crypto-dm:'||m.id) OR (n.type='MENTION' AND n.dedup_key='crypto-mention:'||m.id||':'||n.user_id AND EXISTS(SELECT 1 FROM mentions WHERE message_id=m.id AND mentioned_user_id=n.user_id)))
   AND ((c.kind='DM' AND (c.user1_id=n.user_id OR c.user2_id=n.user_id)) OR (c.kind<>'LOBBY' AND c.kind<>'DM' AND (EXISTS(SELECT 1 FROM rooms r JOIN room_members rm ON rm.room_id=r.id WHERE r.conversation_id=c.id AND rm.user_id=n.user_id) OR (NOT EXISTS(SELECT 1 FROM rooms r WHERE r.conversation_id=c.id) AND EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.user_id=n.user_id)))))
   AND EXISTS(SELECT 1 FROM chat_crypto_membership_intervals i WHERE i.conversation_id=c.id AND i.user_id=n.user_id AND i.start_revision<=m.crypto_revision AND (i.end_revision IS NULL OR m.crypto_revision<i.end_revision))
   AND NOT EXISTS(SELECT 1 FROM chat_crypto_legacy_migrations lm WHERE lm.message_id=m.id)
   AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=n.user_id AND blocked_id=m.sender_id) OR (blocker_id=m.sender_id AND blocked_id=n.user_id))
   AND NOT EXISTS(SELECT 1 FROM notification_preferences WHERE user_id=n.user_id AND notification_type=n.type AND push=false)
   AND COALESCE((SELECT action FROM admin_actions WHERE target_user_id=n.user_id AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1),'UNBAN')<>'BAN'
   AND ($9::text IS NULL OR EXISTS(SELECT 1 FROM push_subscriptions ps WHERE ps.id=$9 AND ps.user_id=n.user_id AND ps.endpoint=$10 AND ps.p256dh=$11 AND ps.auth=$12))`,[data.messageId,data.conversationId,data.senderId,job.user_id,job.notification_id,job.data,job.type,job.dedup_key,subscription?.id??null,subscription?.endpoint??null,subscription?.p256dh??null,subscription?.auth??null])).rowCount);
 }
 async dispatchOne(jobId:string):Promise<boolean>{
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(jobId))return false;
  const db=await this.pool.connect();let started=false,broken=false;
  try{
   // Required crypto schema20 tables match the API boot boundary; no auto-DDL.
   if(!await this.ready(db))return false;
   await db.query('BEGIN');started=true;
   const job=(await db.query("SELECT o.*,n.type,n.data,n.created_at AT TIME ZONE 'UTC' AS created_at FROM notification_outbox o JOIN notifications n ON n.id=o.notification_id AND n.user_id=o.user_id WHERE o.id=$1 AND o.channel='PUSH' AND ((n.type='DM' AND o.dedup_key LIKE 'crypto-dm:%') OR (n.type='MENTION' AND o.dedup_key LIKE 'crypto-mention:%')) AND n.dedup_key=o.dedup_key AND o.status='PENDING' AND o.scheduled_at<=clock_timestamp() FOR UPDATE OF o SKIP LOCKED",[jobId])).rows[0];
   if(!job){await db.query('COMMIT');started=false;return false;}
   let input:unknown;try{input=typeof job.data==='string'?JSON.parse(job.data):null;}catch{await this.suppress(db,job.id);await db.query('COMMIT');started=false;return false;}const parse=job.type==='DM'?DMNotificationDataSchema.strict().safeParse(input):MentionNotificationDataSchema.strict().safeParse(input);
   const preference=(await db.query("SELECT push FROM notification_preferences WHERE user_id=$1 AND notification_type=$2",[job.user_id,job.type])).rows[0];
   if(!parse.success||job.dedup_key!==(job.type==='DM'?'crypto-dm:'+parse.data.messageId:'crypto-mention:'+parse.data.messageId+':'+job.user_id)||preference?.push===false||job.retry_count>=job.max_retries){await this.suppress(db,job.id);await db.query('COMMIT');started=false;return false;}
   const data=parse.data,senderId='senderId' in data?data.senderId:data.mentionerId,eligible=await this.current(db,job,{messageId:data.messageId,conversationId:data.conversationId,senderId});
   if(!eligible){await this.suppress(db,job.id);await db.query('COMMIT');started=false;return false;}
   const subscriptions=(await db.query('SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=$1 ORDER BY id LIMIT 101',[job.user_id])).rows;
   if(!subscriptions.length||subscriptions.length>100||subscriptions.some(row=>!this.endpoint(row.endpoint))){await this.suppress(db,job.id);await db.query('COMMIT');started=false;return false;}
   const payload=NotificationSchema.parse({id:job.notification_id,userId:job.user_id,type:job.type,title:'Tin nhắn mới',body:'Bạn có tin nhắn mới.',data,isRead:false,createdAt:job.created_at.toISOString()}),agent=new https.Agent({ca:this.configuration.ca,keepAlive:false,rejectUnauthorized:true}),topic=createHash('sha256').update(job.notification_id).digest('base64url').slice(0,32);let delivered=0,transient=false,suppressed=false;
   try{for(const subscription of subscriptions){
    // Final source and exact subscription snapshot check after asynchronous reads.
    if(!await this.current(db,job,{messageId:data.messageId,conversationId:data.conversationId,senderId},subscription)){suppressed=true;break;}
    try{await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},JSON.stringify(payload),{vapidDetails:this.configuration.vapid,agent,timeout:5000,TTL:300,contentEncoding:'aes128gcm',topic});delivered++;}
    catch(error){const status=(error as {statusCode?:number})?.statusCode;if(status===404||status===410)await db.query('DELETE FROM push_subscriptions WHERE id=$1 AND user_id=$2 AND endpoint=$3 AND p256dh=$4 AND auth=$5',[subscription.id,job.user_id,subscription.endpoint,subscription.p256dh,subscription.auth]);else{transient=true;break;}}
   }}finally{agent.destroy();}
   if(suppressed)await this.suppress(db,job.id);
   else if(transient)await db.query("UPDATE notification_outbox SET retry_count=retry_count+1,status=CASE WHEN retry_count+1>=max_retries THEN 'FAILED' ELSE 'PENDING' END,last_error='PRIVATE_PUSH_UNAVAILABLE',scheduled_at=clock_timestamp()+interval '5 seconds' WHERE id=$1",[job.id]);
   else if(delivered)await db.query("UPDATE notification_outbox SET status='SENT',sent_at=clock_timestamp(),last_error=NULL WHERE id=$1",[job.id]);
   else await this.suppress(db,job.id);
   await db.query('COMMIT');started=false;return !suppressed&&!transient&&delivered>0;
  }catch{if(started)try{await db.query('ROLLBACK');}catch{broken=true;}return false;}
  finally{db.release(broken);}
 }
}
