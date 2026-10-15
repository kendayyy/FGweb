/// <reference lib="webworker" />
import {PublicShellCacheRuntime} from './cache-runtime.js';
import {createPublicShellPolicy,handleNotificationClick,notificationPresentation,type PublicAsset} from './worker-policy.js';
declare const __FG_SW_BUILD_ID__:string;
declare const self:ServiceWorkerGlobalScope & {__WB_MANIFEST:PublicAsset[]};
const manifest=self.__WB_MANIFEST;
const origin=self.location.origin;
const policy=createPublicShellPolicy(origin,manifest);
const runtime=new PublicShellCacheRuntime({origin,manifest,buildId:__FG_SW_BUILD_ID__,caches:self.caches,fetch:request=>self.fetch(request)});
self.addEventListener('install',event=>event.waitUntil(runtime.install()));
// Waiting updates activate only after existing clients close. No forced reload of drafts/calls.
self.addEventListener('activate',event=>event.waitUntil(runtime.activate()));
self.addEventListener('fetch',event=>{
 const request=event.request,navigation=request.mode==='navigate';
 if(request.method!=='GET'||request.headers.has('Authorization'))return;
 if(navigation?!policy.navigationFallback(request.url):!policy.cacheable(request))return;
 event.respondWith(runtime.fetch(request,navigation).then(response=>response??self.fetch(request)));
});
self.addEventListener('push',event=>{
 let payload:unknown=null;try{payload=event.data?.json();}catch{/* Malformed previews get generic text. */}
 const notice=notificationPresentation(payload,origin);
 event.waitUntil(self.registration.showNotification(notice.title,{body:notice.body,tag:notice.tag,icon:'/brand/icon-192.png',badge:'/brand/icon-192.png',data:{url:notice.url}}));
});
self.addEventListener('notificationclick',event=>event.waitUntil(handleNotificationClick(origin,self.clients,event.notification)));
