import React,{useId,useState} from 'react';
import {useInfiniteQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {GameDTO,RecruitmentDTO} from '@fg/contracts';
import {useAuth} from '../auth/index.js';
import {fetchRecruitments,Filters} from './api.js';
import {RecruitmentCard} from './RecruitmentCard.js';
import {CreateRecruitmentForm} from './CreateRecruitmentForm.js';
import './recruitments.css';
export function RecruitmentPanel({game}:{game:GameDTO}) {
 const auth=useAuth();const actor=auth.user?.id??'guest';
 return <Panel key={`${game.id}:${actor}:${auth.isSigningOut}`} game={game}/>;
}
function Panel({game}:{game:GameDTO}) {
 const auth=useAuth(),id=useId();const [open,setOpen]=useState(false),[created,setCreated]=useState<RecruitmentDTO|null>(null),[mode,setMode]=useState(''),[timing,setTiming]=useState<Filters['timingType']>(undefined);
 const canCreate=Boolean(auth.user&&!auth.isLoading&&!auth.isError&&!auth.isSigningOut&&auth.user.onboardingComplete&&auth.user.interestedGames?.length);
 const list=useInfiniteQuery({queryKey:['recruitments',game.id,mode.trim(),timing],initialPageParam:undefined as string|undefined,queryFn:({pageParam,signal})=>fetchRecruitments(game.id,{...(mode.trim()?{mode:mode.trim()}:{}),...(timing?{timingType:timing}:{})},pageParam,signal),getNextPageParam:p=>p.hasMore?p.nextCursor:undefined,retry:false,staleTime:0,refetchInterval:5000});
 const cards=list.data?.pages.flatMap(p=>p.items)??[];
 return <section className="fg-recruit-feature" aria-label={`Tìm đội ${game.title}`}>
  <div className="fg-recruit-heading"><h2>Tìm đội</h2>{canCreate&&<button type="button" className="fg-btn fg-btn-primary" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setCreated(null);}}>Tạo đội</button>}</div>
  {!auth.user&&!auth.isLoading&&<p className="fg-recruit-hint"><Link to="/login">Đăng nhập Discord</Link> để tạo đội và tìm bạn chơi.</p>}
  {auth.isError&&<p role="alert">Không xác minh được tài khoản. Hãy đăng nhập lại để tạo đội.</p>}
  {created&&<div role="status" className="fg-recruit-success">Đã tạo đội.</div>}
  {open&&canCreate&&auth.user&&<CreateRecruitmentForm key={`${game.id}:${auth.user.id}`} game={game} actorId={auth.user.id} onCreated={c=>{setCreated(c);setOpen(false);}} onCancel={()=>setOpen(false)}/>}
  <div className="fg-recruit-filters"><label htmlFor={`${id}-filter`}>Lọc chế độ<input id={`${id}-filter`} value={mode} maxLength={50} placeholder="Tất cả chế độ" onChange={e=>setMode(e.target.value)}/></label><label htmlFor={`${id}-time`}>Thời gian<select id={`${id}-time`} value={timing??''} onChange={e=>setTiming(e.target.value?e.target.value as Filters['timingType']:undefined)}><option value="">Tất cả</option><option value="now">Chơi ngay</option><option value="scheduledAt">Hẹn giờ</option></select></label></div>
  {list.isPending?<p role="status">Đang tải đội…</p>:list.isError?<div role="alert">Không tải được thẻ tuyển. <button type="button" className="fg-btn fg-btn-secondary" onClick={()=>void list.refetch()}>Thử lại</button></div>:<><div className="fg-recruit-list">{cards.map(c=><RecruitmentCard key={c.id} card={c}/>)}</div>{!cards.length&&<p className="fg-recruit-hint">Chưa có đội tuyển phù hợp. Bạn có thể tạo đội mới.</p>}{list.hasNextPage&&<button type="button" className="fg-btn fg-btn-secondary" disabled={list.isFetchingNextPage} onClick={()=>void list.fetchNextPage()}>{list.isFetchingNextPage?'Đang tải…':'Xem thêm đội'}</button>}{list.isFetchNextPageError&&<p role="alert">Chưa tải được trang tiếp theo. Hãy thử lại.</p>}</>}
 </section>;
}
