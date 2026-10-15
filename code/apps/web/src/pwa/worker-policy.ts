export interface PublicAsset {url:string;revision?:string|null;}
export interface PublicShellPolicy {publicURLs:()=>string[];cacheable:(request:Request)=>boolean;navigationFallback:(url:string)=>string|null;}
export interface NotificationWindow {url:string;focus:()=>Promise<unknown>;postMessage:(message:{type:'FG_NOTIFICATION_OPEN';url:string})=>void;}
export interface NotificationClients {matchAll:(options:{type:'window';includeUncontrolled:boolean})=>Promise<readonly NotificationWindow[]>;openWindow:(url:string)=>Promise<unknown>;}
export interface ClickNotification {data?:unknown;close:()=>void;}
const privatePath=(path:string)=>/^\/(?:api|socket\.io|uploads|media|objects)(?:\/|$)/.test(path);
const controls=(value:string)=>Array.from(value).some(char=>char.charCodeAt(0)<=32||char.charCodeAt(0)===127||char==='\\');
// Public fixed phrases only. Unknown or legacy preview text becomes generic.
const trustedText=[
 {title:'Tin nhắn mới',body:'Bạn có tin nhắn mới.'},{title:'Bạn được nhắc tên',body:'Có người nhắc tên bạn.'},
 {title:'Lời mời kết bạn',body:'Bạn có lời mời kết bạn mới.'},{title:'Lời mời vào phòng',body:'Bạn có cập nhật lời mời vào phòng.'},{title:'Lời mời vào đội',body:'Bạn có cập nhật lời mời vào đội.'},
 {title:'Yêu cầu vào đội',body:'Có yêu cầu mới cần xét duyệt.'},{title:'Kết quả xin vào đội',body:'Yêu cầu vào đội của bạn đã được xét duyệt.'},{title:'Sắp đến giờ chơi',body:'Buổi chơi đã lên lịch sắp bắt đầu.'},
];
function sameOriginURL(value:string,origin:string):URL|null{try{if(!value||controls(value))return null;const url=new URL(value,origin+'/');return url.origin===origin&&!url.username&&!url.password&&!url.hash?url:null;}catch{return null;}}
export function createPublicShellPolicy(origin:string,manifest:PublicAsset[]):PublicShellPolicy{
 const base=new URL(origin);if(!['https:','http:'].includes(base.protocol)||base.origin!==origin)throw new Error('Public shell origin required');const urls:string[]=[];
 for(const entry of manifest){const url=typeof entry?.url==='string'?sameOriginURL(entry.url,origin):null;if(!url||url.search||!( ['/index.html','/favicon.svg','/favicon.ico','/apple-touch-icon.png'].includes(url.pathname)||/^\/brand\/(?:icon|maskable)-(?:192|512)\.png$/.test(url.pathname)||/^\/assets\/[^/?#]+-[A-Za-z0-9_-]{6,}\.(?:js|css|woff2|wasm|png|svg|webp)$/.test(url.pathname)))throw new Error('Private/unversioned cache entry rejected');if(!urls.includes(url.href))urls.push(url.href);}
 const listed=new Set(urls);return{publicURLs:()=>[...urls],cacheable:request=>{const url=sameOriginURL(request.url,origin);return request.method==='GET'&&!request.headers.has('Authorization')&&!!url&&!url.search&&listed.has(url.href);},navigationFallback:value=>{const url=sameOriginURL(value,origin);return url&&!privatePath(url.pathname)&&listed.has(origin+'/index.html')?origin+'/index.html':null;}};
}
export function approvedNotificationPath(value:unknown,origin:string):string|null{
 if(typeof value!=='string'||value.length>2048)return null;const url=sameOriginURL(value,origin);if(!url||url.search)return null;const match=url.pathname.match(/^\/notifications\/([^/]+)$/);if(!match)return null;
 try{const id=decodeURIComponent(match[1]);if(!id||id.length>128||['.','..'].includes(id)||controls(id)||/[/%?#]/.test(id))return null;return'/notifications/'+encodeURIComponent(id);}catch{return null;}
}
export function notificationPresentation(value:unknown,origin:string){
 const data=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};const trusted=trustedText.find(text=>text.title===data.title&&text.body===data.body);const url=approvedNotificationPath(data.url,origin)??'/notifications';
 return{title:trusted?.title??'FG',body:trusted?.body??'Bạn có thông báo mới.',url,tag:url.startsWith('/notifications/')?'fg-notice-'+url.slice('/notifications/'.length):'fg-notice'};
}
export async function handleNotificationClick(origin:string,clients:NotificationClients,notice:ClickNotification):Promise<void>{
 notice.close();const data=notice.data&&typeof notice.data==='object'?notice.data as Record<string,unknown>:{},url=approvedNotificationPath(data.url,origin)??'/notifications';
 for(const client of await clients.matchAll({type:'window',includeUncontrolled:true})){const current=sameOriginURL(client.url,origin);if(!current||privatePath(current.pathname))continue;try{await client.focus();client.postMessage({type:'FG_NOTIFICATION_OPEN',url});return;}catch{/* A closed client must not prevent opening the guarded app route. */}}
 await clients.openWindow(origin+url);
}
