import React,{useEffect,useLayoutEffect,useId,useRef,useState} from 'react';
import {useInfiniteQuery,useQuery,useQueryClient} from '@tanstack/react-query';
import {CreateRecruitmentSchema,GameDTO,RecruitmentDTO} from '@fg/contracts';
import {fetchOwnRooms,fetchRoomDetail,fetchRoomMembers} from '../rooms/api.js';
import {registerAuthCleanup} from '../auth/lifecycle.js';
import {createRecruitment,fetchRecruitments,RecruitmentApiError} from './api.js';
import {bangkokToUTC} from './time.js';
import {RecruitmentCard} from './RecruitmentCard.js';

const examples:Record<GameDTO['title'],string>={
 'Liên Minh Huyền Thoại':'Ví dụ: Flex, ARAM',Valorant:'Ví dụ: Ranked, Unrated','Teamfight Tactics (TFT)':'Ví dụ: Double Up, Ranked','Dota 2':'Ví dụ: Ranked, Turbo',Roblox:'Ví dụ: Adventure, PvP','Liên Quân Mobile':'Ví dụ: Đấu hạng, Đấu thường','Free Fire':'Ví dụ: Squad, Clash Squad'
};
type Field='title'|'mode'|'playerCapacity'|'scheduledAt'|'requirementText'|'experienceName'|'experienceUrl'|'roomId';
const labels:Record<Field,string>={title:'Tiêu đề đội',mode:'Chế độ chơi',playerCapacity:'Quy mô đội',scheduledAt:'Giờ hẹn',requirementText:'Yêu cầu tham khảo',experienceName:'Tên experience',experienceUrl:'Link experience',roomId:'Phòng sử dụng'};
export function CreateRecruitmentForm({game,actorId,onCreated,onCancel}:{game:GameDTO;actorId:string;onCreated:(card:RecruitmentDTO)=>void;onCancel:()=>void}) {
 const prefix=useId(),summary=useRef<HTMLDivElement>(null),controller=useRef<AbortController|null>(null),alive=useRef(true),key=useRef(crypto.randomUUID());
 const [draft,setDraft]=useState({title:'',mode:'',playerCapacity:'5',timingType:'now' as 'now'|'scheduledAt',scheduledAt:'',requirementText:'',experienceName:'',experienceUrl:'',roomId:''});
 const [errors,setErrors]=useState<Partial<Record<Field,string>>>({}),[serverError,setServerError]=useState(''),[pending,setPending]=useState(false);
 const cache=useQueryClient();
 const ownRooms=useInfiniteQuery({queryKey:['recruitmentRooms',actorId],initialPageParam:undefined as string|undefined,queryFn:({pageParam,signal})=>fetchOwnRooms(pageParam,50,signal),getNextPageParam:p=>p.hasMore?p.nextCursor:undefined,retry:false,staleTime:0});
 useEffect(()=>{if(ownRooms.hasNextPage&&!ownRooms.isFetchingNextPage&&!ownRooms.isFetchNextPageError)void ownRooms.fetchNextPage();},[ownRooms.hasNextPage,ownRooms.isFetchingNextPage,ownRooms.isFetchNextPageError,ownRooms.fetchNextPage]);
 const suggestions=useQuery({queryKey:['recruitmentSuggestions',game.id,draft.mode.trim(),draft.timingType],queryFn:({signal})=>fetchRecruitments(game.id,{mode:draft.mode.trim(),timingType:draft.timingType},undefined,signal,true),enabled:Boolean(draft.mode.trim()),retry:false,staleTime:0});
 useEffect(()=>{alive.current=true;const stop=()=>controller.current?.abort();const unregister=registerAuthCleanup(stop);return()=>{alive.current=false;stop();unregister();};},[]);
 useLayoutEffect(()=>{if(serverError||Object.keys(errors).length)summary.current?.focus();},[errors,serverError]);
 const change=(field:keyof typeof draft,value:string)=>{key.current=crypto.randomUUID();setDraft(d=>({...d,[field]:value}));setErrors({});setServerError('');};
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();if(controller.current)return;
  setServerError('');const at=bangkokToUTC(draft.scheduledAt);
  const parsed=CreateRecruitmentSchema().safeParse({gameId:game.id,gameTitle:game.title,title:draft.title.trim(),mode:draft.mode.trim(),playerCapacity:Number(draft.playerCapacity),timingType:draft.timingType,...(draft.timingType==='scheduledAt'?{scheduledAt:at}:{}),...(draft.roomId?{roomId:draft.roomId}:{}),...(draft.requirementText.trim()?{requirementText:draft.requirementText.trim()}:{}),...(game.title==='Roblox'?{experienceName:draft.experienceName.trim(),experienceUrl:draft.experienceUrl.trim()}:{}),idempotencyKey:key.current});
  const issues:Partial<Record<Field,string>>={};
  if(!parsed.success)for(const issue of parsed.error.issues){const f=String(issue.path[0]) as Field;if(f in labels)issues[f]=`${labels[f]} chưa hợp lệ.`;}
  if(game.title==='Roblox'){if(!draft.experienceName.trim())issues.experienceName='Tên experience là bắt buộc.';if(!draft.experienceUrl.trim())issues.experienceUrl='Link experience là bắt buộc.';}
  if(draft.timingType==='scheduledAt'&&!at)issues.scheduledAt='Giờ hẹn cần ngày và giờ hợp lệ ở Asia/Bangkok.';
  if(Object.keys(issues).length||!parsed.success){setErrors(issues);return;}
  setErrors({});setPending(true);const abort=new AbortController();controller.current=abort;
  try {
   if(parsed.data.roomId){
    const detail=await fetchRoomDetail(parsed.data.roomId,abort.signal);
    if(detail.settings.visibility!=='PUBLIC'){setServerError('Phòng đã chuyển riêng tư; hãy chọn phòng công khai hoặc tạo phòng mới.');return;}
    if(detail.gameId!==game.id){setServerError('Phòng này thuộc game khác.');return;}
    if(detail.ownerId!==actorId){const members=await fetchRoomMembers(detail.id,abort.signal);const me=members.find(m=>m.userId===actorId);if(me?.role!=='HELPER'||!me.permissions.includes('MANAGE_RECRUITMENT')){setServerError('Bạn cần quyền tuyển đội trong phòng này.');return;}}
   }
   const card=await createRecruitment(parsed.data,abort.signal);if(!alive.current||abort.signal.aborted)return;
   void cache.invalidateQueries({queryKey:['recruitments',game.id]});void cache.invalidateQueries({queryKey:['ownRooms',actorId]});void cache.invalidateQueries({queryKey:['recruitmentRooms',actorId]});onCreated(card);
  }catch(error){
   if(!alive.current||abort.signal.aborted)return;
   setServerError(error instanceof RecruitmentApiError&&error.status===409?'Chủ phòng đang có đội chơi ngay hoặc buổi chơi đã thay đổi. Hãy kiểm tra lại đội hiện tại.':error instanceof RecruitmentApiError&&[401,403].includes(error.status)?'Phiên đăng nhập hoặc quyền tuyển đội đã thay đổi. Hãy đăng nhập và kiểm tra lại phòng.':'Không đăng được thẻ tuyển. Hãy kiểm tra kết nối hoặc thông tin rồi thử lại.');
  }finally{if(controller.current===abort)controller.current=null;if(alive.current)setPending(false);}
 };
 const input=(field:Field)=>({id:`${prefix}-${field}`,'aria-invalid':Boolean(errors[field]),'aria-describedby':errors[field]?`${prefix}-${field}-error`:undefined});
 const field=(name:Field,node:React.ReactNode)=><div className="fg-recruit-field"><label htmlFor={`${prefix}-${name}`}>{name==='scheduledAt'?'Giờ hẹn (Asia/Bangkok)':labels[name]}</label>{node}{errors[name]&&<p id={`${prefix}-${name}-error`} className="fg-recruit-error">{errors[name]}</p>}</div>;
 const available=ownRooms.data?.pages.flatMap(p=>p.items).filter(r=>r.gameId===game.id)??[];
 return <form className="fg-recruit-form" onSubmit={e=>void submit(e)} noValidate aria-label={`Tạo đội ${game.title}`}>
  <h3>Tạo đội · {game.title}</h3>
  {(serverError||Object.keys(errors).length>0)&&<div className="fg-recruit-error-summary" ref={summary} role="alert" tabIndex={-1}>{serverError&&<p>{serverError}</p>}{Object.entries(errors).map(([field,message])=><p key={field}><a href={`#${prefix}-${field}`} onClick={e=>{e.preventDefault();document.getElementById(`${prefix}-${field}`)?.focus();}}>{message}</a></p>)}</div>}
  <fieldset disabled={pending}>
   {field('title',<input {...input('title')} maxLength={100} value={draft.title} onChange={e=>change('title',e.target.value)}/>)}
   {field('mode',<input {...input('mode')} maxLength={50} placeholder={examples[game.title]} value={draft.mode} onChange={e=>change('mode',e.target.value)}/>)}
   {field('playerCapacity',<input {...input('playerCapacity')} type="number" min={1} max={10} value={draft.playerCapacity} onChange={e=>change('playerCapacity',e.target.value)}/>)}
   <p className="fg-recruit-hint">Tổng số người gồm chủ đội, từ 1–10.</p>
   <fieldset className="fg-recruit-timing"><legend>Thời gian chơi</legend>{(['now','scheduledAt'] as const).map(t=><label key={t}><input type="radio" name={`${prefix}-timing`} checked={draft.timingType===t} onChange={()=>change('timingType',t)}/>{t==='now'?'Chơi ngay':'Hẹn giờ'}</label>)}</fieldset>
   {draft.timingType==='scheduledAt'&&field('scheduledAt',<input {...input('scheduledAt')} type="datetime-local" value={draft.scheduledAt} onChange={e=>change('scheduledAt',e.target.value)}/>)}
   {field('roomId',<select {...input('roomId')} value={draft.roomId} onChange={e=>change('roomId',e.target.value)}><option value="">Tạo phòng công khai mới</option>{available.map(r=><option key={r.id} value={r.id} disabled={r.settings.visibility==='PRIVATE'}>{r.name}{r.settings.visibility==='PRIVATE'?' · riêng tư':''}</option>)}</select>)}
   {ownRooms.isPending&&<p role="status" className="fg-recruit-hint">Đang tải phòng của bạn…</p>}{ownRooms.isError&&<p role="alert">Không tải được phòng cũ. <button className="fg-btn fg-btn-secondary" type="button" onClick={()=>void ownRooms.refetch()}>Thử lại</button></p>}{ownRooms.isFetchNextPageError&&<p role="alert">Chưa tải đủ phòng. <button className="fg-btn fg-btn-secondary" type="button" onClick={()=>void ownRooms.fetchNextPage()}>Tải tiếp</button></p>}
   <p className="fg-recruit-hint">Phòng cũ giữ thành viên và lịch sử chat. Cần quyền tuyển đội.</p>
   {field('requirementText',<textarea {...input('requirementText')} maxLength={300} value={draft.requirementText} onChange={e=>change('requirementText',e.target.value)}/>)}
   <p className="fg-recruit-hint">Rank/vai trò là tham khảo; chủ đội tự duyệt.</p>
   {game.title==='Roblox'&&<>{field('experienceName',<input {...input('experienceName')} maxLength={100} value={draft.experienceName} onChange={e=>change('experienceName',e.target.value)}/>)}{field('experienceUrl',<input {...input('experienceUrl')} type="url" value={draft.experienceUrl} placeholder="https://www.roblox.com/games/…" onChange={e=>change('experienceUrl',e.target.value)}/>)}</>}
   {draft.mode.trim()&&<section className="fg-recruit-suggestions" aria-label="Gợi ý đội"><h4>Đội đang thiếu người</h4>{suggestions.isPending?<p role="status">Đang tìm đội phù hợp…</p>:suggestions.isError?<p role="alert">Không tải được gợi ý. <button className="fg-btn fg-btn-secondary" type="button" onClick={()=>void suggestions.refetch()}>Thử lại</button></p>:suggestions.data?.items.length?suggestions.data.items.slice(0,3).map(c=><RecruitmentCard key={c.id} card={c}/>):<p className="fg-recruit-hint">Chưa có đội phù hợp chế độ này.</p>}<p className="fg-recruit-hint">Bạn vẫn có thể tạo đội mới nếu chủ phòng chưa ở đội chơi ngay khác.</p></section>}
  </fieldset>
  <div className="fg-recruit-actions"><button className="fg-btn fg-btn-secondary" type="button" disabled={pending} onClick={onCancel}>Đóng form</button><button className="fg-btn fg-btn-primary" type="submit" disabled={pending}>{pending?'Đang đăng…':'Đăng thẻ tuyển'}</button></div>
 </form>;
}
