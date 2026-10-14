import {privateNotificationSourceAuthority as privateSourceAuthority} from '@fg/database';
import {Injectable,OnModuleInit,OnModuleDestroy,ServiceUnavailableException} from '@nestjs/common';
import {Pool,type PoolClient} from 'pg';
import {DMNotificationDataSchema,MentionNotificationDataSchema,NotificationSchema,PaginationQuerySchema,ErrorCode,type NotificationDTO} from '@fg/contracts';
import {ChatActor,chatError} from '../chat/chat.service.js';
import {cryptoSchemaAvailable} from '../chat-crypto/crypto-schema-readiness.js';
type Row=Record<string,unknown>;

@Injectable()
export class PrivateNotificationsService implements OnModuleInit,OnModuleDestroy{
 private pool!:Pool;private ready=false;
 async onModuleInit(){this.pool=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000,statement_timeout:10000});this.ready=await cryptoSchemaAvailable(this.pool);}
 async onModuleDestroy(){await this.pool?.end();}
 private async actor(db:Pool|PoolClient,actor:ChatActor){if(!actor)chatError(ErrorCode.LOGIN_REQUIRED,'Login required');if(!(await db.query('SELECT 1 FROM "session" WHERE id=$1 AND user_id=$2 AND expires_at>clock_timestamp()',[actor.sessionId,actor.userId])).rowCount)chatError(ErrorCode.LOGIN_REQUIRED,'Session unavailable');const action=(await db.query("SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN ('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1",[actor.userId])).rows[0];if(action?.action==='BAN')chatError(ErrorCode.FORBIDDEN,'Account unavailable');return actor;}
 private dto(row:Row):NotificationDTO|null{
  let value:unknown;try{value=typeof row.data==='string'?JSON.parse(row.data):undefined;}catch{return null;}const parsed=row.type==='DM'?DMNotificationDataSchema.strict().safeParse(value):row.type==='MENTION'?MentionNotificationDataSchema.strict().safeParse(value):undefined;if(!parsed?.success||row.dedup_key!==(row.type==='DM'?'crypto-dm:'+parsed.data.messageId:'crypto-mention:'+parsed.data.messageId+':'+row.user_id))return null;
  const dto=NotificationSchema.safeParse({id:row.id,userId:row.user_id,type:row.type,title:'Tin nhắn mới',body:'Bạn có tin nhắn mới.',data:parsed.data,isRead:row.is_read,createdAt:row.created_iso});return dto.success?dto.data:null;
 }
 private binding(item:NotificationDTO){if(item.type==='DM')return DMNotificationDataSchema.parse(item.data);const data=MentionNotificationDataSchema.parse(item.data);return {conversationId:data.conversationId,messageId:data.messageId,senderId:data.mentionerId};}
 private async notice(db:Pool|PoolClient,row:Row):Promise<NotificationDTO|null>{
  const dto=this.dto(row);if(!dto)return null;const data=this.binding(dto);
  const visible=(await db.query(`SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN chat_crypto_state s ON s.conversation_id=c.id JOIN notifications n ON n.id=$5 AND n.user_id=$4
   WHERE m.id=$1 AND c.id=$2 AND m.sender_id=$3 AND ${privateSourceAuthority}`,[data.messageId,data.conversationId,data.senderId,row.user_id,row.id])).rowCount;if(!visible)return null;
  return dto;
 }
 /** One fresh statement for all candidate IDs after asynchronous reads. */
 private async finalNotices(actor:NonNullable<ChatActor>,items:NotificationDTO[],rows:Row[]){
  if(!items.length)return items;const original=new Map(rows.map(row=>[row.id,row.data])),candidates=items.map(item=>{const data=this.binding(item);return {id:item.id,message_id:data.messageId,conversation_id:data.conversationId,sender_id:data.senderId,original_data:original.get(item.id)};});
  const allowed=(await this.pool.query(`SELECT q.id FROM jsonb_to_recordset($1::jsonb) AS q(id text,message_id text,conversation_id text,sender_id text,original_data text)
   JOIN notifications n ON n.id=q.id AND n.user_id=$2 AND n.data=q.original_data
   JOIN messages m ON m.id=q.message_id AND m.sender_id=q.sender_id
   JOIN conversations c ON c.id=m.conversation_id AND c.id=q.conversation_id
   JOIN chat_crypto_state s ON s.conversation_id=c.id
   WHERE ${privateSourceAuthority}
   AND EXISTS(SELECT 1 FROM notification_outbox o WHERE o.notification_id=n.id AND o.user_id=n.user_id AND o.channel='IN_APP' AND o.dedup_key=n.dedup_key)
   AND EXISTS(SELECT 1 FROM "session" WHERE id=$3 AND user_id=n.user_id AND expires_at>clock_timestamp())`,[JSON.stringify(candidates),actor.userId,actor.sessionId])).rows;const ids=new Set(allowed.map(row=>row.id));return items.filter(item=>ids.has(item.id));
 }
 private select(){return `SELECT n.*,to_char(n.created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_iso FROM notifications n WHERE ((n.type='DM' AND n.dedup_key LIKE 'crypto-dm:%') OR (n.type='MENTION' AND n.dedup_key LIKE 'crypto-mention:%')) AND EXISTS(SELECT 1 FROM notification_outbox o WHERE o.notification_id=n.id AND o.user_id=n.user_id AND o.channel='IN_APP' AND o.dedup_key=n.dedup_key)`;}
 async list(actor:ChatActor,input:unknown){
  if(!this.ready)throw new ServiceUnavailableException('Private notifications unavailable');const query=typeof input==='object'&&input!==null?input as Record<string,unknown>:{};const parsed=PaginationQuerySchema.strict().safeParse({...query,...(typeof query.limit==='string'&&/^[0-9]{1,2}$/.test(query.limit)?{limit:Number(query.limit)}:{})});if(!parsed.success||parsed.data.cursor&&(!/^[a-f0-9-]{36}$/.test(parsed.data.cursor)))chatError(ErrorCode.INVALID_INPUT,'Pagination unavailable');const user=await this.actor(this.pool,actor),{limit,cursor}=parsed.data;
  const rows=(await this.pool.query(this.select()+` AND n.user_id=$1 ${cursor?'AND (n.created_at,n.id)<(SELECT created_at,id FROM notifications WHERE id=$3 AND user_id=$1)':''} ORDER BY n.created_at DESC,n.id DESC LIMIT $2`,cursor?[user.userId,limit+1,cursor]:[user.userId,limit+1])).rows as Row[],items:NotificationDTO[]=[];for(const row of rows.slice(0,limit)){const notice=this.dto(row);if(notice)items.push(notice);}await this.actor(this.pool,user);const current=await this.finalNotices(user,items,rows);return {items:current,hasMore:rows.length>limit,nextCursor:rows.length>limit?String(rows[limit-1].id):null};
 }
 /** Server-only routing hint; never substitutes for realtimeNotice authorization. */
 async recipient(id:string):Promise<string|null>{if(!this.ready)return null;const row=(await this.pool.query("SELECT n.user_id FROM notifications n WHERE n.id=$1 AND ((n.type='DM' AND n.dedup_key LIKE 'crypto-dm:%') OR (n.type='MENTION' AND n.dedup_key LIKE 'crypto-mention:%')) AND EXISTS(SELECT 1 FROM notification_outbox o WHERE o.notification_id=n.id AND o.user_id=n.user_id AND o.channel='IN_APP' AND o.dedup_key=n.dedup_key)",[id])).rows[0];return row?String(row.user_id):null;}
 async realtimeNotice(actor:ChatActor,id:string){if(!this.ready||!actor)return null;const user=await this.actor(this.pool,actor),row=(await this.pool.query(this.select()+' AND n.id=$1 AND n.user_id=$2',[id,user.userId])).rows[0];if(!row)return null;const notice=this.dto(row);await this.actor(this.pool,user);return notice?(await this.finalNotices(user,[notice],[row]))[0]??null:null;}
 async dispatch(publish:(id:string)=>Promise<void>){
  if(!this.ready)return;const db=await this.pool.connect();let started=false,broken=false;
  try{await db.query('BEGIN');started=true;const jobs=(await db.query("SELECT o.id,o.notification_id,n.*,to_char(n.created_at,'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_iso FROM notification_outbox o JOIN notifications n ON n.id=o.notification_id AND n.user_id=o.user_id WHERE o.channel='IN_APP' AND o.status='PENDING' AND o.scheduled_at<=clock_timestamp() AND ((n.type='DM' AND n.dedup_key LIKE 'crypto-dm:%') OR (n.type='MENTION' AND n.dedup_key LIKE 'crypto-mention:%')) AND n.dedup_key=o.dedup_key ORDER BY o.scheduled_at,o.id LIMIT 20 FOR UPDATE OF o SKIP LOCKED")).rows as Row[];
   for(const job of jobs){const notice=await this.notice(db,job);if(!notice){await db.query("UPDATE notification_outbox SET status='FAILED',last_error='PRIVATE_NOTICE_SUPPRESSED' WHERE notification_id=$1 AND channel='IN_APP' AND dedup_key=$2",[job.notification_id,job.dedup_key]);continue;}await publish(String(job.notification_id));await db.query("UPDATE notification_outbox SET status='SENT',sent_at=clock_timestamp(),last_error=NULL WHERE notification_id=$1 AND channel='IN_APP' AND dedup_key=$2",[job.notification_id,job.dedup_key]);}await db.query('COMMIT');started=false;
  }catch{if(started)try{await db.query('ROLLBACK');}catch{broken=true;}throw new Error('Private notification dispatch unavailable');}finally{db.release(broken);}
 }
}
