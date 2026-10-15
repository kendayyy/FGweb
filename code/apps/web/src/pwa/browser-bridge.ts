import {WebPushConfigSchema,WebPushSubscriptionSchema,WebPushUnsubscribeSchema} from '@fg/contracts';
import type {NativePushSubscription,PushBridge} from './push-controller.js';
export function nativeSubscription(subscription:PushSubscription):NativePushSubscription{
 return{endpoint:subscription.endpoint,toJSON:()=>{const value=subscription.toJSON();return{endpoint:subscription.endpoint,keys:{p256dh:value.keys?.p256dh??'',auth:value.keys?.auth??''}};},unsubscribe:()=>subscription.unsubscribe()};
}
export async function pushRequest(path:string,signal:AbortSignal,method='GET',body?:unknown):Promise<unknown>{
 const response=await fetch('/api/v1/push/'+path,{method,signal,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(!response.ok)throw new Error('Push request unavailable');
 try{return await response.json() as unknown;}catch{throw new Error('Push response unavailable');}
}
export function standalone():boolean{return window.matchMedia?.('(display-mode: standalone)').matches===true||(navigator as Navigator&{standalone?:boolean}).standalone===true;}
export function iphoneHomeScreenRequired():boolean{return(/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))&&!standalone();}
export function userGesture():boolean{return navigator.userActivation?.isActive===true;}
export async function registerPublicWorker():Promise<ServiceWorkerRegistration>{
 if(!window.isSecureContext||!('serviceWorker'in navigator))throw new Error('Service worker unavailable');
 await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
 let timeout:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Public shell installation unavailable')),30000);})]);}
 finally{if(timeout)clearTimeout(timeout);}
}
export function createBrowserPushBridge(registration:()=>Promise<ServiceWorkerRegistration>):PushBridge{
 return{secure:window.isSecureContext,supported:'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window,requiresInstall:iphoneHomeScreenRequired(),permission:()=>typeof Notification==='undefined'?'default':Notification.permission,userGesture,requestPermission:()=>Notification.requestPermission(),
  subscription:async()=>{const native=await(await registration()).pushManager.getSubscription();return native?nativeSubscription(native):null;},
  subscribe:async publicKey=>{const bytes=Uint8Array.from(atob(publicKey.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0));return nativeSubscription(await(await registration()).pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes}));},
  config:async signal=>WebPushConfigSchema.parse(await pushRequest('config',signal)),
  register:async(dto,signal)=>{const result=await pushRequest('subscriptions',signal,'POST',WebPushSubscriptionSchema.parse(dto));if(!result||typeof result!=='object'||(result as {success?:unknown}).success!==true)throw new Error('Push registration unconfirmed');},
  unregister:async(endpoint,signal)=>{const result=await pushRequest('subscriptions',signal,'DELETE',WebPushUnsubscribeSchema.parse({endpoint}));if(!result||typeof result!=='object'||(result as {success?:unknown}).success!==true)throw new Error('Push revoke unconfirmed');},
 };
}
