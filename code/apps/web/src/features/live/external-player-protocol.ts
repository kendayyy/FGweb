export type ExternalIdentity =
 | {provider:'youtube';url:string;videoId:string}
 | {provider:'twitch';url:string;channelName:string};
export interface ExternalFrame {provider:'youtube'|'twitch';url:string;origin:string;sourceUrl:string;}
export type PlayerState='loading'|'ready'|'playing'|'paused'|'blocked'|'offline'|'error';
export interface PlayerEvent {state:PlayerState;code?:number;}

/** Syntax validation only. Never establishes provider availability. */
export function normalizeExternalInput(provider:unknown,input:unknown):ExternalIdentity|null {
 if(typeof input!=='string'||input.length>2048||Array.from(input).some(c=>c.charCodeAt(0)<=32||c.charCodeAt(0)===127||c==='\\'))return null;
 let url:URL;try{url=new URL(input);}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
 if(provider==='youtube'){
  if(!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(url.hostname))return null;
  let id:string|undefined;
  if(url.hostname==='youtu.be')id=/^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  else if(url.pathname==='/watch'){const ids=url.searchParams.getAll('v');if(ids.length!==1)return null;id=ids[0];}
  else id=/^\/(?:live|embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?{provider,url:'https://www.youtube.com/watch?v='+id,videoId:id}:null;
 }
 if(provider==='twitch'){
  if(!['twitch.tv','www.twitch.tv','m.twitch.tv'].includes(url.hostname))return null;
  const channel=/^\/([A-Za-z0-9_]{1,25})\/?$/.exec(url.pathname)?.[1]?.toLowerCase();
  return channel&&!['directory','videos','downloads','settings','subscriptions','search','login','signup','jobs','turbo'].includes(channel)?{provider,url:'https://www.twitch.tv/'+channel,channelName:channel}:null;
 }
 return null;
}

export function externalFrame(source:unknown,hostOrigin:string):ExternalFrame|null {
 if(!source||typeof source!=='object')return null;
 const value=source as Record<string,unknown>,identity=normalizeExternalInput(value.provider,value.url);
 if(!identity)return null;
 if(identity.provider==='youtube'&&(value.channelName!==undefined||(value.videoId!==undefined&&value.videoId!==identity.videoId)))return null;
 if(identity.provider==='twitch'&&(value.videoId!==undefined||(value.channelName!==undefined&&value.channelName!==identity.channelName)))return null;
 let host:URL;try{host=new URL(hostOrigin);}catch{return null;}
 if(host.username||host.password||!(host.protocol==='https:'||(host.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(host.hostname))))return null;
 const url=identity.provider==='youtube'?new URL('https://www.youtube-nocookie.com/embed/'+identity.videoId):new URL('https://player.twitch.tv/');
 if(identity.provider==='youtube'){
  url.searchParams.set('enablejsapi','1');url.searchParams.set('origin',host.origin);url.searchParams.set('autoplay','0');url.searchParams.set('playsinline','1');
 }else{
  url.searchParams.set('channel',identity.channelName);url.searchParams.set('parent',host.hostname);url.searchParams.set('autoplay','false');url.searchParams.set('muted','true');
 }
 return {provider:identity.provider,url:url.href,origin:url.origin,sourceUrl:identity.url};
}

/** Messages from any other frame, origin or stale player are ignored. */
export function readPlayerEvent(frame:ExternalFrame,event:Pick<MessageEvent,'source'|'origin'|'data'>,owner:Window|null):PlayerEvent|null {
 if(!owner||event.source!==owner||event.origin!==frame.origin)return null;
 let data:unknown=event.data;
 if(typeof data==='string'){if(data.length>100000)return null;try{data=JSON.parse(data);}catch{return null;}}
 if(!data||typeof data!=='object')return null;
 const message=data as Record<string,unknown>;
 if(frame.provider==='youtube'){
  if(message.event==='onReady')return {state:'ready'};
  if(message.event==='onAutoplayBlocked')return {state:'blocked'};
  if(message.event==='onError'&&typeof message.info==='number')return {state:'error',code:message.info};
  if(message.event==='onStateChange'){
   if(message.info===1)return {state:'playing'};
   if(message.info===2||message.info===0)return {state:'paused'};
  }
 }else if(message.namespace==='twitch-embed'){
  const states:Record<string,PlayerState>={ready:'ready','video.ready':'ready',playing:'playing',pause:'paused',offline:'offline',playbackBlocked:'blocked',error:'error'};
  if(typeof message.eventName==='string'&&Object.hasOwn(states,message.eventName))return {state:states[message.eventName]};
 }
 return null;
}

export function sendPlayerCommand(frame:ExternalFrame,owner:Window|null,command:'play'|'pause'|'volume'|'mute',value?:number|boolean) {
 if(!owner)return;
 if(frame.provider==='youtube'){
  const funcs={play:'playVideo',pause:'pauseVideo',volume:'setVolume',mute:value?'mute':'unMute'};
  owner.postMessage(JSON.stringify({event:'command',func:funcs[command],args:command==='volume'?[value]:[],channel:'widget'}),frame.origin);
 }else{
  const numbers={play:3,pause:2,volume:11,mute:10};
  owner.postMessage({namespace:'twitch-embed-player-proxy',eventName:numbers[command],params:command==='volume'?Number(value)/100:command==='mute'?value:null},frame.origin);
 }
}
