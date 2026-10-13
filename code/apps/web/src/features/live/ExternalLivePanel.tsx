import React,{useEffect,useRef,useState} from 'react';
import type {ExternalLiveDTO} from '@fg/contracts';
import {CallApiError} from '../calls/api.js';
import {getExternalLive,putExternalLive,deleteExternalLive} from './external-api.js';
import {normalizeExternalInput} from './external-player-protocol.js';
import {ExternalLivePlayer} from './ExternalLivePlayer.js';

export function ExternalLivePanel({callId,actorId,active}:{callId:string;actorId:string;active:boolean}) {
 const [source,setSource]=useState<ExternalLiveDTO|null>(null),[provider,setProvider]=useState<'youtube'|'twitch'>('youtube'),[url,setUrl]=useState(''),[title,setTitle]=useState(''),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const request=useRef<AbortController|null>(null),epoch=useRef(0),busyRef=useRef(false),live=useRef(false),sourceOwner=useRef('');
 const owner=callId+':'+actorId;
 const currentSource=sourceOwner.current===owner?source:null;
 useEffect(()=>{setUrl('');setTitle('');setProvider('youtube');},[callId,actorId]);
 const resetError=(reason:unknown)=>{
  setSource(null);
  setError(reason instanceof CallApiError&&[401,403,404,409].includes(reason.status)?'Bạn không còn quyền xem hoặc thay đổi nguồn trong cuộc gọi này.':'Không thể xác nhận nguồn live ngoài. Hãy thử lại.');
 };
 useEffect(()=>{
  live.current=true;const current=++epoch.current;setError(null);setLoading(active);setBusy(false);if(!active)setSource(null);let timer:ReturnType<typeof setTimeout>;
  const load=async()=>{
   if(!active||!live.current||epoch.current!==current)return;
   if(busyRef.current){timer=setTimeout(()=>void load(),2000);return;}
   const controller=new AbortController();request.current=controller;
   try{const next=await getExternalLive(callId,controller.signal);if(!controller.signal.aborted&&live.current&&epoch.current===current){sourceOwner.current=owner;setSource(next);setError(null);}}
   catch(reason){if(!controller.signal.aborted&&live.current&&epoch.current===current)resetError(reason);}
   finally{if(!controller.signal.aborted&&live.current&&epoch.current===current){setLoading(false);timer=setTimeout(()=>void load(),2000);}}
  };
  if(active)void load();
  return ()=>{live.current=false;++epoch.current;clearTimeout(timer);request.current?.abort();busyRef.current=false;};
 },[callId,actorId,active,revision,owner]);
 const mutate=async(remove:boolean)=>{
  if(busyRef.current)return;
  const identity=normalizeExternalInput(provider,url);
  if(!remove&&!identity){setError('Liên kết không hợp lệ. Nhập URL HTTPS của video YouTube hoặc kênh Twitch.');return;}
  const current=epoch.current;request.current?.abort();const controller=new AbortController();request.current=controller;busyRef.current=true;setBusy(true);setError(null);
  try{const next=remove?await deleteExternalLive(callId,controller.signal):await putExternalLive(callId,{provider,url:identity!.url,...(title?{title}:{})},controller.signal);if(!controller.signal.aborted&&live.current&&epoch.current===current){sourceOwner.current=owner;setSource(next);if(remove){setUrl('');setTitle('');}}}
  catch(reason){if(!controller.signal.aborted&&live.current&&epoch.current===current)resetError(reason);}
  finally{if(live.current&&epoch.current===current){busyRef.current=false;setBusy(false);setRevision(value=>value+1);}}
 };
 return <section hidden={!active} aria-label="Nguồn YouTube–Twitch" className="fg-external-panel">
  {loading&&<p role="status" className="fg-live-guidance">Đang kiểm tra nguồn trong cuộc gọi…</p>}
  {active&&!loading&&currentSource&&<><p className="fg-external-title">{currentSource.title||'Nguồn '+(currentSource.provider==='youtube'?'YouTube':'Twitch')}</p><ExternalLivePlayer source={currentSource}/></>}
  {!loading&&!currentSource&&!error&&<p className="fg-live-empty">Chưa có nguồn YouTube hoặc Twitch trong nhóm gọi.</p>}
  <form onSubmit={event=>{event.preventDefault();void mutate(false);}} className="fg-external-form">
   <label>Nền tảng <select aria-label="Nền tảng live ngoài" value={provider} onChange={e=>setProvider(e.target.value as 'youtube'|'twitch')} disabled={busy}><option value="youtube">YouTube</option><option value="twitch">Twitch</option></select></label>
   <label>Liên kết nguồn <input aria-label="Liên kết nguồn" type="url" maxLength={2048} value={url} onChange={e=>setUrl(e.target.value)} required disabled={busy} placeholder={provider==='youtube'?'https://www.youtube.com/watch?v=…':'https://www.twitch.tv/…'}/></label>
   <label>Tên nguồn <input aria-label="Tên nguồn" maxLength={100} value={title} onChange={e=>setTitle(e.target.value)} disabled={busy}/></label>
   <div className="fg-live-controls"><button className="fg-live-tab" type="submit" disabled={busy||loading}>{busy?'Đang xử lý…':'Đặt nguồn'}</button><button className="fg-live-tab" type="button" disabled={busy||loading||!currentSource} onClick={()=>void mutate(true)}>Xóa nguồn</button><button className="fg-live-tab" type="button" disabled={busy} onClick={()=>setRevision(value=>value+1)}>Tải lại nguồn</button></div>
  </form>
  {error&&<p role="alert" className="fg-live-error">{error}</p>}
 </section>;
}
