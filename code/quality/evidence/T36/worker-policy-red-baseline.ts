export interface PublicAsset {url:string;revision?:string|null;}
export interface PublicShellPolicy {publicURLs:()=>string[];cacheable:(request:Request)=>boolean;navigationFallback:(url:string)=>string|null;}
export interface NotificationWindow {url:string;focus:()=>Promise<unknown>;postMessage:(message:{type:'FG_NOTIFICATION_OPEN';url:string})=>void;}
export interface NotificationClients {matchAll:(options:{type:'window';includeUncontrolled:boolean})=>Promise<NotificationWindow[]>;openWindow:(url:string)=>Promise<unknown>;}
export interface ClickNotification {data?:unknown;close:()=>void;}
/** RED interface baseline only; no service worker is registered by this module. */
export function createPublicShellPolicy(origin:string,manifest:PublicAsset[]):PublicShellPolicy{void origin;void manifest;return{publicURLs:()=>[],cacheable:()=>false,navigationFallback:()=>null};}
export function approvedNotificationPath(value:unknown,origin:string):string|null{void value;void origin;return null;}
export function notificationPresentation(value:unknown,origin:string){void value;void origin;return{title:'FG',body:'Bạn có thông báo mới.',url:'/notifications',tag:'fg-notice'};}
export async function handleNotificationClick(origin:string,clients:NotificationClients,notice:ClickNotification):Promise<void>{void origin;void clients;void notice;}
