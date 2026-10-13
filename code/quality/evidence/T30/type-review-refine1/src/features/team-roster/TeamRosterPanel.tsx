import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import {useQuery,useInfiniteQuery} from '@tanstack/react-query';
import type {RoomDTO,RoomMemberDTO} from '@fg/contracts';
import {Button} from '../../components/ui/Button.js';
import {ConfirmationModal} from '../rooms/ConfirmationModal.js';
import {fetchRoomMembers} from '../rooms/api.js';
import {RoomPolicySummary} from '../room-settings/RoomPolicySummary.js';
import {InviteFriendForm} from '../invitations/InviteFriendForm.js';
import {listSessions,getSnapshot,getQueue,joinSession,decideRequest,playAction,teamError} from './api.js';
import {useTeamActions,requestStatus} from './useTeamActions.js';
import {useTeamProfiles} from './useTeamProfiles.js';
import '../rooms/rooms.css';
import './team-roster.css';
export interface TeamRosterPanelProps {room:RoomDTO;actorId:string;members:RoomMemberDTO[];onOpenSettings?:()=>void}
export function TeamRosterPanel(props:TeamRosterPanelProps){return <RoomTeams key={`${props.actorId}:${props.room.id}`} {...props}/>;}
function RoomTeams({room,actorId,onOpenSettings}:TeamRosterPanelProps){
 const actions=useTeamActions(actorId,room.id),[selected,setSelected]=useState('');
 const history=useInfiniteQuery({queryKey:['t25',actorId,room.id,'sessions'],queryFn:({pageParam,signal})=>listSessions(room.id,pageParam,signal),initialPageParam:undefined as string|undefined,getNextPageParam:last=>last.hasMore?last.nextCursor:undefined,retry:false,enabled:!actions.revoked,refetchInterval:15000});
 const sessions=history.data?.pages.flatMap(p=>p.items)??[],chosen=sessions.find(s=>s.id===selected)??sessions[0];
 if(actions.revoked)return null;
 return <section className="fg-team-panel" aria-label="Đội chơi trong phòng">
  <div className="fg-team-heading"><h3>Đội chơi</h3><Button variant="ghost" disabled={actions.busy||history.isFetching} onClick={()=>void actions.refresh()}>Tải lại đội</Button></div>
  <p>Phòng nhóm vẫn được giữ khi lượt chơi kết thúc hoặc bạn rời đội.</p>
  {history.isError?<p role="alert">{teamError(history.error)}</p>:history.isPending?<p role="status">Đang tải lượt chơi…</p>:sessions.length===0?<p>Chưa có lượt chơi trong phòng này.</p>:<>
   <label>Lượt chơi<select value={chosen?.id??''} onChange={e=>setSelected(e.target.value)}>{sessions.map(s=><option key={s.id} value={s.id}>{s.state==='ENDED'?'Đã kết thúc':s.state==='SCHEDULED'?'Hẹn giờ':'Đang chơi'} · {new Date(s.createdAt).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'})}</option>)}</select></label>
   {history.hasNextPage&&<Button variant="outline" disabled={history.isFetchingNextPage} onClick={()=>void history.fetchNextPage()}>Xem lượt chơi cũ hơn</Button>}
   {chosen&&<SessionTeam key={chosen.id} room={room} actorId={actorId} playId={chosen.id}/>}
  </>}
  {!history.isPending&&!history.isError&&sessions.length===0&&<InviteFriendForm room={room} actorId={actorId}/>}
  <RoomPolicySummary room={room} onOpenSettings={onOpenSettings}/>
  <Link to="/team-activity">Yêu cầu & lời mời của tôi</Link>
 </section>;
}
function SessionTeam({room,actorId,playId}:{room:RoomDTO;actorId:string;playId:string}){
 const actions=useTeamActions(actorId,`${room.id}:${playId}`),[confirmation,setConfirmation]=useState<'leave'|'end'|null>(null),[pendingRequest,setPendingRequest]=useState(false);
 const members=useQuery({queryKey:['t25',actorId,room.id,'members'],queryFn:({signal})=>fetchRoomMembers(room.id,signal),retry:false,enabled:!actions.revoked,refetchInterval:15000});
 const current=!members.isError?members.data?.find(m=>m.userId===actorId):undefined;
 const manager=Boolean(current&&(current.role==='OWNER'&&room.ownerId===actorId||current.role==='HELPER'&&current.permissions.includes('MANAGE_RECRUITMENT')));
 const snapshot=useQuery({queryKey:['t25',actorId,room.id,playId,'snapshot'],queryFn:({signal})=>getSnapshot(playId,signal),retry:false,enabled:!actions.revoked,refetchInterval:10000});
 const data=!snapshot.isError?snapshot.data:undefined,play=data?.playSession;
 const complete=play?.playerCapacity!==undefined;
 const queue=useQuery({queryKey:['t25',actorId,room.id,playId,'queue'],queryFn:({signal})=>getQueue(playId,signal),retry:false,enabled:manager&&complete&&play?.state!=='ENDED'&&!actions.revoked,refetchInterval:10000});
 const profiles=useTeamProfiles(actorId,manager&&!queue.isError?(queue.data??[]).filter(r=>!r.applicant&&!members.data?.some(m=>m.userId===r.applicantId&&m.user)).map(r=>r.applicantId):[],manager&&!actions.revoked);
 if(actions.revoked)return null;
 if(snapshot.isError||members.isError)return <p role="alert">{teamError(snapshot.error??members.error)}</p>;
 if(!data||!members.data)return <p role="status">Đang tải thành viên đội…</p>;
 if(!current)return <p role="alert">Bạn không còn là thành viên phòng này.</p>;
 if(!complete)return <p role="alert">Dữ liệu lượt chơi thiếu sức chứa. Hãy tải lại; chưa thể xét duyệt đội này.</p>;
 const joined=data.roster.some(r=>r.userId===actorId),ended=play!.state==='ENDED';
 const knownName=(id:string)=>members.data?.find(m=>m.userId===id)?.user?.displayName??profiles(id).profile?.displayName;
 const name=(id:string)=>knownName(id)??'Người chơi';
 return <>
  <div className="fg-team-heading"><strong>{data.roster.length}/{play!.playerCapacity} người</strong><span>{play!.state==='ACTIVE'?'Đang chơi':ended?'Đã kết thúc':'Chờ bắt đầu'}</span></div>
  {play!.scheduledAt&&<p>Giờ hẹn: <time dateTime={play!.scheduledAt}>{new Date(play!.scheduledAt).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'})}</time> · Bangkok</p>}
  <ul aria-label="Thành viên đội chơi">{data.roster.map(r=><li className="fg-team-row" key={r.userId}><span>{r.user?.displayName??name(r.userId)}</span><span>{r.isHost?'Chủ đội':`Vị trí ${r.slotIndex}`}</span></li>)}</ul>
  {actions.error&&<p role="alert">{actions.error}</p>}
  <div className="fg-team-actions">
   {!ended&&current&&!joined&&(pendingRequest?<p role="status">Chờ xét duyệt</p>:<Button disabled={actions.busy||data.roster.length>=play!.playerCapacity!} onClick={()=>void actions.run(signal=>joinSession(playId,signal)).then(result=>{if(result)setPendingRequest(result.status==='PENDING');})}>Xin vào đội</Button>)}
   {!ended&&joined&&play!.hostUserId!==actorId&&<Button variant="outline" disabled={actions.busy} onClick={()=>setConfirmation('leave')}>Rời đội chơi</Button>}
   {manager&&play!.state==='SCHEDULED'&&<Button disabled={actions.busy} onClick={()=>void actions.run(signal=>playAction(playId,'start',signal))}>Bắt đầu chơi</Button>}
   {manager&&!ended&&<Button variant="outline" disabled={actions.busy} onClick={()=>setConfirmation('end')}>Kết thúc lượt chơi</Button>}
  </div>
  {manager&&!ended&&<section aria-label="Yêu cầu vào đội"><h4>Yêu cầu tham gia</h4>{queue.isError?<p role="alert">{teamError(queue.error)}</p>:queue.isPending?<p>Đang tải yêu cầu…</p>:<ul>{queue.data?.map(r=>{const resolved=r.applicant?.displayName??knownName(r.applicantId),applicant=resolved??'Người chơi';return <li className="fg-team-row" key={r.id}><span><Link to={`/users/${encodeURIComponent(r.applicantId)}`}>{applicant}</Link> · {requestStatus[r.status]}{!resolved&&<small>{profiles(r.applicantId).failed?' · Không tải được hồ sơ. Hãy tải lại đội.':' · Đang tải hồ sơ…'}</small>}</span>{r.status==='PENDING'&&<div className="fg-team-actions"><Button aria-label={`Duyệt ${applicant}`} disabled={actions.busy||!resolved} onClick={()=>void actions.run(signal=>decideRequest(playId,r.id,'ACCEPT',signal,Boolean(members.data?.some(m=>m.userId===r.applicantId))))}>Duyệt</Button><Button variant="outline" aria-label={`Từ chối ${applicant}`} disabled={actions.busy||!resolved} onClick={()=>void actions.run(signal=>decideRequest(playId,r.id,'REJECT',signal,Boolean(members.data?.some(m=>m.userId===r.applicantId))))}>Từ chối</Button></div>}</li>;})}{queue.data?.length===0&&<li>Chưa có yêu cầu.</li>}</ul>}</section>}
  {current&&<InviteFriendForm key={playId} room={room} actorId={actorId} playId={!ended?playId:undefined}/>}
  <ConfirmationModal isOpen={confirmation!==null} title={confirmation==='end'?'Kết thúc lượt chơi?':'Rời đội chơi?'} message="Chỉ thay đổi đội chơi. Bạn vẫn là thành viên phòng; cuộc gọi được quản lý riêng." confirmText={confirmation==='end'?'Kết thúc':'Rời đội'} isLoading={actions.busy} error={actions.error} onCancel={()=>setConfirmation(null)} onConfirm={()=>{if(confirmation)void actions.run(signal=>playAction(playId,confirmation,signal)).then(result=>{if(result)setConfirmation(null);});}}/>
 </>;
}
