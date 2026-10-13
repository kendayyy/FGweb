import React,{useEffect,useRef,useState} from 'react';
import {Headphones,Mic,MicOff,PhoneOff,Plus,Volume2,VolumeX} from 'lucide-react';
import type {CallGroupDTO,CallParticipantDTO} from '@fg/contracts';
import {Button} from '../../components/ui/Button.js';
import {registerAuthCleanup} from '../auth/lifecycle.js';
import {CallApiError,callError,createCall,joinCall,leaveCall,listCalls,listParticipants,selfMic} from './api.js';
import type {MediaSession,MediaState} from './media.js';
import {loadMediaSessionFactory} from './media-loader.js';
import {LiveViewer} from '../live/LiveViewer.js';
import './calls.css';
type Preference={volume:number;muted:boolean};
const permissionHelp='Bạn chưa cho phép microphone. Mở cài đặt quyền microphone của trình duyệt rồi thử Bật mic; bạn vẫn có thể nghe cuộc gọi.';
export function CallPanel({roomId,actorId}:{roomId:string;actorId:string}){
 const [groups,setGroups]=useState<CallGroupDTO[]>([]),[participants,setParticipants]=useState<CallParticipantDTO[]>([]),[selected,setSelected]=useState<string|null>(null),[active,setActive]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[state,setState]=useState<MediaState>('disconnected'),[muted,setMuted]=useState(true),[error,setError]=useState<string|null>(null),[guidance,setGuidance]=useState<string|null>(null),[preferences,setPreferences]=useState<Record<string,Preference>>({});
 const [audioBlocked,setAudioBlocked]=useState(false);
 const [controlsTarget,setControlsTarget]=useState<HTMLDivElement|null>(null);
 const leaving=useRef(false);
 const alive=useRef(false),operation=useRef(false),selection=useRef<string|null>(null),currentCall=useRef<string|null>(null),media=useRef<MediaSession|null>(null),audioRoot=useRef<HTMLDivElement>(null),refreshRef=useRef<()=>Promise<void>>(async()=>{}),controllers=useRef(new Set<AbortController>());
 const selectedGroup=groups.find(g=>g.id===selected),self=participants.find(p=>p.userId===actorId),restricted=self?.micRestricted===true;
 const release=async(bestEffort=false)=>{
  const session=media.current,id=currentCall.current;media.current=null;currentCall.current=null;
  if(alive.current){setActive(null);setMuted(true);setState('disconnected');setGuidance(null);setPreferences({});setAudioBlocked(false);}
  // Stop tracks locally even when the server/session is already unavailable.
  let failure:unknown;
  try{await session?.disconnect();}catch(error){failure=error;}
  try{if(id)await leaveCall(id);}catch(error){
   if(!(error instanceof CallApiError&&[401,403,404,409].includes(error.status)))failure??=error;
  }
  if(failure&&!bestEffort)throw failure;
 };
 useEffect(()=>{
  alive.current=true;let timer:ReturnType<typeof setTimeout>|undefined,refreshing=false,disposed=false;
  const refresh=async()=>{
   if(disposed||!alive.current||refreshing)return;refreshing=true;const controller=new AbortController();controllers.current.add(controller);
   try{
    const calls=await listCalls(roomId,controller.signal);if(disposed||!alive.current||controller.signal.aborted)return;
    setGroups(calls);
    if(currentCall.current&&!calls.some(c=>c.id===currentCall.current)){await release(true);if(disposed||!alive.current||controller.signal.aborted)return;setError('Cuộc gọi đã đóng. Hãy chọn hoặc tạo nhóm gọi mới.');}
    const id=currentCall.current??(calls.some(c=>c.id===selection.current)?selection.current:calls[0]?.id??null);
    selection.current=id;setSelected(id);
    const people=id?await listParticipants(id,controller.signal):[];
    if(!disposed&&alive.current&&!controller.signal.aborted)setParticipants(people);
   }catch(failure){if(disposed||!alive.current||controller.signal.aborted)return;setError(callError(failure));if(failure instanceof CallApiError&&([401,403,404].includes(failure.status)||failure.code==='CALL_CLOSED')){await release(true);if(!disposed&&alive.current){setGroups([]);setParticipants([]);}}}
   finally{controllers.current.delete(controller);refreshing=false;if(!disposed&&alive.current)setLoading(false);}
  };
  refreshRef.current=refresh;
  const poll=async()=>{await refresh();if(!disposed&&alive.current)timer=setTimeout(()=>void poll(),2000);};void poll();
  const dispose=async()=>{disposed=true;alive.current=false;clearTimeout(timer);for(const controller of controllers.current)controller.abort();controllers.current.clear();await release(true);};
  const unregister=registerAuthCleanup(dispose);
  return ()=>{unregister();void dispose();};
 },[roomId,actorId]);
 useEffect(()=>{if(restricted&&media.current){setMuted(true);void media.current.setMicrophone(false).catch(()=>{});}},[restricted]);
 useEffect(()=>{for(const person of participants){const preference=preferences[person.userId];if(person.mediaIdentity&&preference)media.current?.setVolume(person.mediaIdentity,preference.volume/100,preference.muted);}},[participants,preferences]);
 const join=async()=>{
  const id=selection.current;if(!id||operation.current||leaving.current||!audioRoot.current)return;
  operation.current=true;setBusy(true);setError(null);setGuidance(null);
  try{
   const createMediaSession=await loadMediaSessionFactory();
   if(!alive.current)return;
   const grant=await joinCall(id);
   if(!alive.current){await leaveCall(id);return;}
   if(media.current)await media.current.disconnect();
   currentCall.current=id;
   const session=createMediaSession(audioRoot.current,s=>{if(alive.current)setState(s);},blocked=>{if(alive.current)setAudioBlocked(blocked);});media.current=session;
   await session.connect(grant);
   if(!alive.current||currentCall.current!==id||media.current!==session){await release(true);return;}
   setActive(id);setMuted(true);
   const people=await listParticipants(id);if(!alive.current||currentCall.current!==id||media.current!==session){await release(true);return;}setParticipants(people);
   if(people.find(p=>p.userId===actorId)?.isMuted===false){const dto=await selfMic(id,true);if(!alive.current||currentCall.current!==id){await release(true);return;}setParticipants(old=>old.map(p=>p.userId===actorId?dto:p));}
   if(!people.find(p=>p.userId===actorId)?.micRestricted)try{await session.requestMicrophone();}catch{if(alive.current&&currentCall.current===id&&media.current===session)setGuidance(permissionHelp);}
  }catch(failure){await release(true);if(alive.current)setError(callError(failure));}
  finally{operation.current=false;if(alive.current)setBusy(leaving.current);}
 };
 const toggleMic=async()=>{
  const id=currentCall.current,session=media.current;if(!id||!session||operation.current||leaving.current||restricted&&muted)return;
  operation.current=true;setBusy(true);setError(null);
  const nextMuted=!muted;
  try{
   if(nextMuted)await session.setMicrophone(false);
   const dto=await selfMic(id,nextMuted);
   if(!alive.current||currentCall.current!==id)return;
   if(!nextMuted)try{await session.setMicrophone(true);}catch{await session.setMicrophone(false);await selfMic(id,true);if(alive.current){setMuted(true);setGuidance(permissionHelp);}return;}
   if(alive.current){setMuted(nextMuted);setGuidance(null);setParticipants(old=>old.map(p=>p.userId===actorId?dto:p));}
  }catch(failure){if(alive.current)setError(callError(failure));await refreshRef.current();}
  finally{operation.current=false;if(alive.current)setBusy(leaving.current);}
 };
 const create=async()=>{if(operation.current||leaving.current)return;operation.current=true;setBusy(true);setError(null);try{const call=await createCall(roomId);if(alive.current){selection.current=call.id;await refreshRef.current();}}catch(failure){if(alive.current)setError(callError(failure));}finally{operation.current=false;if(alive.current)setBusy(leaving.current);}};
 const leave=async()=>{if(leaving.current||!currentCall.current)return;leaving.current=true;setBusy(true);setError(null);try{await release();await refreshRef.current();}catch(failure){if(alive.current)setError(callError(failure));}finally{leaving.current=false;if(alive.current)setBusy(operation.current);}};
 const prefer=(person:CallParticipantDTO,update:Partial<Preference>)=>{const next={...(preferences[person.userId]??{volume:100,muted:false}),...update};setPreferences(old=>({...old,[person.userId]:next}));if(person.mediaIdentity)media.current?.setVolume(person.mediaIdentity,next.volume/100,next.muted);};
 const choose=async(id:string)=>{if(active||busy)return;selection.current=id;setSelected(id);setParticipants([]);await refreshRef.current();};
 const connectionLabel=state==='connected'?'Đã kết nối':state==='reconnecting'?'Đang nối lại cuộc gọi…':state==='connecting'?'Đang kết nối…':'Chưa vào cuộc gọi';
 return <section className="fg-call-panel" aria-label="Nhóm gọi">
  <header className="fg-call-heading"><div><Headphones size={20} aria-hidden="true"/><h3>Nhóm gọi</h3></div><Button variant="outline" disabled={busy||loading} onClick={()=>void create()} leftIcon={<Plus size={16} aria-hidden="true"/>}>Tạo nhóm gọi</Button></header>
  {error&&<p role="alert" className="fg-call-error">{error}</p>}
  <div className="fg-call-layout">
   <aside className="fg-call-groups" aria-label="Các nhóm gọi">{loading?<p role="status">Đang tải nhóm gọi…</p>:groups.length===0?<p>Chưa có nhóm gọi. Bạn có thể tạo nhóm mới.</p>:groups.map((group,index)=><button type="button" className={`fg-call-group ${group.id===selected?'selected':''}`} key={group.id} aria-pressed={group.id===selected} disabled={busy||Boolean(active&&active!==group.id)} onClick={()=>void choose(group.id)}><Headphones size={18} aria-hidden="true"/><span>Nhóm gọi {index+1}<small>{group.participantCount}/10</small></span></button>)}</aside>
   <div className="fg-call-stage">
    <p role="status" aria-atomic="true" className="fg-call-status">{connectionLabel}{active?` · ${participants.length}/10 người`:''}</p>
    {selectedGroup&&<>
     {active&&media.current&&<LiveViewer callId={active} actorId={actorId} session={media.current} participants={participants} controlsTarget={controlsTarget}/>}
     <ul className="fg-call-people" aria-label="Người trong nhóm gọi">{participants.map(person=>{const name=person.user?.displayName??'Người chơi',preference=preferences[person.userId]??{volume:100,muted:false},isSelf=person.userId===actorId;return <li className="fg-call-person" key={person.userId}><span className="fg-call-avatar">{person.user?.avatarUrl?<img src={person.user.avatarUrl} alt=""/>:name.slice(0,1)}{person.isMuted?<MicOff size={13} aria-hidden="true"/>:<Mic size={13} aria-hidden="true"/>}</span><strong>{name}{isSelf?' (bạn)':''}</strong>{active&&!isSelf&&person.mediaIdentity&&<div className="fg-call-listener"><label htmlFor={`volume-${person.userId}`}>Âm lượng {name}<output>{preference.volume}%</output></label><input id={`volume-${person.userId}`} aria-label={`Âm lượng ${name}`} type="range" min="0" max="100" value={preference.volume} onChange={e=>prefer(person,{volume:Number(e.target.value)})}/><button type="button" aria-label={`${preference.muted?'Bật':'Tắt'} tiếng ${name} với tôi`} aria-pressed={preference.muted} onClick={()=>prefer(person,{muted:!preference.muted})}>{preference.muted?<VolumeX size={16} aria-hidden="true"/>:<Volume2 size={16} aria-hidden="true"/>}<span>{preference.muted?'Bật tiếng với tôi':'Tắt tiếng với tôi'}</span></button></div>}</li>;})}</ul>
     {!active&&<p className="fg-call-hint">Vào nhóm để trò chuyện và nghe bạn bè. Người xem cũng có thể bật mic.</p>}
     {guidance&&<p role="status" className="fg-call-guidance">{guidance}</p>}
     {active&&audioBlocked&&<div className="fg-call-guidance"><p>Trình duyệt đang chặn phát âm thanh. Bấm nút bên dưới để nghe cuộc gọi.</p><Button variant="outline" onClick={()=>{void media.current?.resumeAudio().catch(failure=>{if(alive.current)setError(callError(failure));});}}>Bật âm thanh cuộc gọi</Button></div>}
     {active&&restricted&&<p className="fg-call-guidance">Chủ phòng đã hạn chế mic của bạn. Bạn vẫn có thể nghe cuộc gọi.</p>}
     <div className="fg-call-actions">{active?<><Button variant="secondary" disabled={busy||restricted||state!=='connected'} aria-pressed={!muted} onClick={()=>void toggleMic()} leftIcon={muted?<MicOff size={18} aria-hidden="true"/>:<Mic size={18} aria-hidden="true"/>}>{muted?'Bật mic':'Tắt mic'}</Button><div ref={setControlsTarget} className="fg-call-live-controls"/>{state==='disconnected'&&<Button disabled={busy} onClick={()=>void join()}>Nối lại</Button>}<Button variant="destructive" onClick={()=>void leave()} leftIcon={<PhoneOff size={18} aria-hidden="true"/>}>Rời cuộc gọi</Button></>:<Button disabled={busy||selectedGroup.participantCount>=10&&!self} onClick={()=>void join()} leftIcon={<Headphones size={18} aria-hidden="true"/>}>{busy?'Đang xử lý…':'Vào gọi'}</Button>}</div>
    </>}
   </div>
  </div>
  <div ref={audioRoot} className="fg-call-audio" aria-hidden="true"/>
 </section>;
}
