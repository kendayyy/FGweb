import type {NotificationDTO} from '@fg/contracts';
export async function notificationForOpen(_actorId:string,id:string,_signal:AbortSignal,read:(id:string)=>Promise<NotificationDTO>):Promise<NotificationDTO>{return read(id);}
