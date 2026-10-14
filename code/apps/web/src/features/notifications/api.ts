import {IdSchema,NotificationSchema,NotificationPreferencesSchema,NotificationPreferencesPatchSchema,NotificationTypeSchema,NotificationUnreadCountSchema,NotificationReadAllResultSchema,createPageSchema,type NotificationDTO,type NotificationPreferencesDTO,type NotificationPreferencesPatch} from '@fg/contracts';
import type {z} from 'zod';

export class NotificationApiError extends Error {
 constructor(public readonly status:number,public readonly invalidResponse=false){super(invalidResponse?'Invalid notification response':'Notification request unavailable');this.name='NotificationApiError';}
}
export function encodedId(value:string){const id=IdSchema.parse(value);if(id==='.'||id==='..'||id.length>512||Array.from(id).some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127))throw new NotificationApiError(0,true);return encodeURIComponent(id);}
async function request(path:string,signal:AbortSignal,method='GET',body?:unknown){
 const response=await fetch('/api/v1/'+path,{method,signal,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(!response.ok)throw new NotificationApiError(response.status);
 try{return await response.json() as unknown;}catch{throw new NotificationApiError(response.status,true);}
}
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new NotificationApiError(0,true);return result.data;}
function owned(notice:NotificationDTO,actorId:string,id?:string){if(notice.userId!==actorId||!notice.data||id&&notice.id!==id)throw new NotificationApiError(0,true);encodedId(notice.id);return notice;}
export async function getNotifications(actorId:string,signal:AbortSignal,cursor?:string){
 const query=new URLSearchParams({limit:'20'});if(cursor)query.set('cursor',cursor);
 const page=parse(createPageSchema(NotificationSchema),await request('notifications?'+query,signal));
 if(page.items.length>20||page.hasMore&&!page.nextCursor||new Set(page.items.map(n=>n.id)).size!==page.items.length)throw new NotificationApiError(0,true);
 page.items.forEach(n=>owned(n,actorId));return page;
}
export async function getUnreadCount(signal:AbortSignal){return parse(NotificationUnreadCountSchema,await request('notifications/unread-count',signal)).unreadCount;}
export async function readNotification(actorId:string,id:string,signal:AbortSignal){return owned(parse(NotificationSchema,await request('notifications/'+encodedId(id)+'/read',signal,'PATCH',{})),actorId,id);}
export async function readAllNotifications(signal:AbortSignal){return parse(NotificationReadAllResultSchema,await request('notifications/read-all',signal,'PATCH',{}));}
function preferences(value:unknown):NotificationPreferencesDTO{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==NotificationTypeSchema.options.length)throw new NotificationApiError(0,true);
 for(const type of NotificationTypeSchema.options){const row=(value as Record<string,unknown>)[type];if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==3||!['inApp','push','email'].every(key=>Object.hasOwn(row,key)&&typeof(row as Record<string,unknown>)[key]==='boolean'))throw new NotificationApiError(0,true);}
 return parse(NotificationPreferencesSchema.strict(),value);
}
export async function getNotificationPreferences(signal:AbortSignal){return preferences(await request('notifications/preferences',signal));}
export async function saveNotificationPreferences(patch:NotificationPreferencesPatch,signal:AbortSignal){return preferences(await request('notifications/preferences',signal,'PATCH',NotificationPreferencesPatchSchema.parse(patch)));}
export function notificationError(error:unknown){
 if(error instanceof NotificationApiError){if(error.invalidResponse)return 'Dữ liệu thông báo không hợp lệ. Hãy tải lại.';if(error.status===401)return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';if(error.status===403||error.status===404)return 'Thông báo hoặc nội dung không còn khả dụng; bạn không còn quyền truy cập.';}
 return 'Không tải được thông báo. Kiểm tra kết nối và thử lại.';
}
