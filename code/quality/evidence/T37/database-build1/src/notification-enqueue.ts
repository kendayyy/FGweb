import {randomUUID,createHash} from 'node:crypto';import type {PoolClient} from 'pg';
import {NotificationTypedPayloadUnion,NotificationPreferencesSchema,NotificationTypeSchema,NotificationSchema,type NotificationType,type NotificationDataDTO,type NotificationDTO} from '@fg/contracts';

export function notificationBusChannel(databaseURL:string):string{return 'fg:chat:'+createHash('sha256').update(databaseURL).digest('hex').slice(0,24);}
export function defaultNotificationPreferences(){return NotificationPreferencesSchema.parse(Object.fromEntries(NotificationTypeSchema.options.map(type=>[type,{}])));}
export function parseNotificationMetadata(type:unknown,stored:unknown):NotificationDataDTO|null {
 let data:unknown=stored;if(typeof data==='string')try{data=JSON.parse(data);}catch{return null;}
 const result=NotificationTypedPayloadUnion.safeParse({type,data});return result.success?result.data.data:null;
}
const messages:Record<NotificationType,{title:string;body:string}>={
 DM:{title:'Tin nhắn mới',body:'Bạn có tin nhắn mới.'},MENTION:{title:'Bạn được nhắc tên',body:'Có người nhắc tên bạn.'},
 FRIEND_INVITE:{title:'Lời mời kết bạn',body:'Bạn có lời mời kết bạn mới.'},ROOM_INVITE:{title:'Lời mời vào phòng',body:'Bạn có cập nhật lời mời vào phòng.'},TEAM_INVITE:{title:'Lời mời vào đội',body:'Bạn có cập nhật lời mời vào đội.'},
 JOIN_REQUEST:{title:'Yêu cầu vào đội',body:'Có yêu cầu mới cần xét duyệt.'},JOIN_REQUEST_RESULT:{title:'Kết quả xin vào đội',body:'Yêu cầu vào đội của bạn đã được xét duyệt.'},REMINDER_10MIN:{title:'Sắp đến giờ chơi',body:'Buổi chơi đã lên lịch sắp bắt đầu.'},
};
export function notificationText(type:NotificationType){return messages[type];}
export function notificationDTO(row:Record<string,unknown>):NotificationDTO|null {
 const type=NotificationTypeSchema.safeParse(row.type);if(!type.success)return null;
 const data=parseNotificationMetadata(type.data,row.data);if(!data)return null;
 const dto=NotificationSchema.safeParse({id:row.id,userId:row.user_id,type:type.data,...notificationText(type.data),data,isRead:row.is_read,createdAt:row.created_iso});return dto.success?dto.data:null;
}
/** Caller supplies its live domain transaction. Never commit or dispatch here. */
export async function enqueueNotification(db:PoolClient,userId:string,type:NotificationType,data:unknown,dedupKey:string):Promise<string|null>{
 const parsed=NotificationTypedPayloadUnion.parse({type,data});if(!userId||!dedupKey||dedupKey.length>512)throw new Error('Notification identity unavailable');
 if((type==='DM'&&'senderId'in parsed.data&&parsed.data.senderId===userId)||(type==='MENTION'&&'mentionerId'in parsed.data&&parsed.data.mentionerId===userId))return null;
 const user=(await db.query('SELECT email_verified,(email IS NOT NULL AND length(trim(email))>0) AS has_email FROM "user" WHERE id=$1',[userId])).rows[0];if(!user)return null;
 const saved=(await db.query('SELECT in_app,push,email FROM notification_preferences WHERE user_id=$1 AND notification_type=$2 FOR SHARE',[userId,type])).rows[0];const defaultPreference=defaultNotificationPreferences()[type],inApp=saved?.in_app??defaultPreference.inApp,push=saved?.push??defaultPreference.push,email=saved?.email??defaultPreference.email,channels:string[]=[];
 if(inApp)channels.push('IN_APP');if(push&&(await db.query('SELECT 1 FROM push_subscriptions WHERE user_id=$1 LIMIT 1',[userId])).rowCount)channels.push('PUSH');if(email&&defaultPreference.email&&user.email_verified&&user.has_email)channels.push('EMAIL');if(!channels.length)return null;
 const id=randomUUID(),text=notificationText(type),added=await db.query('INSERT INTO notifications(id,user_id,type,title,body,data,dedup_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,dedup_key) DO NOTHING RETURNING id',[id,userId,type,text.title,text.body,JSON.stringify(parsed.data),dedupKey]);if(!added.rowCount)return null;
 for(const channel of channels)await db.query('INSERT INTO notification_outbox(id,notification_id,user_id,channel,dedup_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(channel,user_id,dedup_key) DO NOTHING',[randomUUID(),id,userId,channel,dedupKey]);return id;
}
