import {NotificationSchema,type NotificationDTO} from '@fg/contracts';
import {encodedId,NotificationApiError} from '../features/notifications/api.js';
export async function notificationForOpen(actorId:string,id:string,signal:AbortSignal,read:(id:string)=>Promise<NotificationDTO>):Promise<NotificationDTO>{
 try{return await read(id);}catch(error){if(!(error instanceof NotificationApiError)||error.invalidResponse||error.status!==404||signal.aborted)throw error;}
 const response=await fetch('/api/v1/push/notifications/'+encodedId(id),{method:'GET',signal,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}});
 if(!response.ok)throw new NotificationApiError(response.status);
 let value:unknown;try{value=await response.json();}catch{throw new NotificationApiError(0,true);}
 const parsed=NotificationSchema.safeParse(value);if(!parsed.success||parsed.data.id!==id||parsed.data.userId!==actorId||!parsed.data.data)throw new NotificationApiError(0,true);
 return parsed.data;
}
