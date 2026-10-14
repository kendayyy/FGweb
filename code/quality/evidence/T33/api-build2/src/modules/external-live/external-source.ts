import {ErrorCode,type ExternalLiveProvider} from '@fg/contracts';
import {roomError} from '../rooms/rooms.service.js';

export type NormalizedExternalSource=
 | {provider:'youtube';url:string;videoId:string}
 | {provider:'twitch';url:string;channelName:string};

/** Local parsing only: valid syntax does not prove a provider source exists. */
export function normalizeExternalSource(provider:ExternalLiveProvider,input:string):NormalizedExternalSource{
 const invalid=()=>roomError(ErrorCode.INVALID_INPUT,'Unsupported or invalid external live source');
 const invalidCharacter=Array.from(input).some(character=>character.charCodeAt(0)<=32||character.charCodeAt(0)===127||character==='\\');
 if(!/^https:\/\//i.test(input)||invalidCharacter)return invalid();
 let url:URL;try{url=new URL(input);}catch{return invalid();}
 if(url.protocol!=='https:'||url.username||url.password||url.port)return invalid();
 const host=url.hostname.toLowerCase();
 if(provider==='youtube'){
  if(!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(host))return invalid();
  let id:string|undefined;
  if(host==='youtu.be')id=/^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  else if(url.pathname==='/watch'){const ids=url.searchParams.getAll('v');if(ids.length!==1)return invalid();id=ids[0];}
  else id=/^\/(?:live|embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  if(!id||!/^[A-Za-z0-9_-]{11}$/.test(id))return invalid();
  return {provider,url:'https://www.youtube.com/watch?v='+id,videoId:id};
 }
 if(provider==='twitch'){
  if(!['twitch.tv','www.twitch.tv','m.twitch.tv'].includes(host))return invalid();
  const channel=/^\/([A-Za-z0-9_]{1,25})\/?$/.exec(url.pathname)?.[1]?.toLowerCase();
  if(!channel||['directory','videos','downloads','settings','subscriptions','search','login','signup','jobs','turbo'].includes(channel))return invalid();
  return {provider,url:'https://www.twitch.tv/'+channel,channelName:channel};
 }
 return invalid();
}
