import React from 'react';
import {Link} from 'react-router-dom';
import {useQuery,useQueries,useInfiniteQuery} from '@tanstack/react-query';
import {InvitationApprovalPermissionByTarget} from '@fg/contracts';
import {Button} from '../../components/ui/Button.js';
import {fetchOwnRooms,fetchRoomMembers} from '../rooms/api.js';
import {getMyJoins,getMyInvitations,cancelRequest,respondInvitation,approveInvitation,teamError} from '../team-roster/api.js';
import {useTeamActions,requestStatus} from '../team-roster/useTeamActions.js';
import {useTeamProfiles} from '../team-roster/useTeamProfiles.js';
import '../team-roster/team-roster.css';
export function TeamActivityPage({actorId}:{actorId:string}){return <Activity key={actorId} actorId={actorId}/>;}
function Activity({actorId}:{actorId:string}){
 const actions=useTeamActions(actorId,'activity');
 const joins=useQuery({queryKey:['t25',actorId,'my-joins'],queryFn:({signal})=>getMyJoins(signal),enabled:!actions.revoked,retry:false,refetchInterval:15000});
 const invites=useQuery({queryKey:['t25',actorId,'my-invitations'],queryFn:({signal})=>getMyInvitations(signal),enabled:!actions.revoked,retry:false,refetchInterval:15000});
 const rooms=useInfiniteQuery({queryKey:['t25',actorId,'own-rooms'],queryFn:({pageParam,signal})=>fetchOwnRooms(pageParam,50,signal),initialPageParam:undefined as string|undefined,getNextPageParam:p=>p.hasMore?p.nextCursor:undefined,enabled:!actions.revoked,retry:false});
 const ownRooms=!rooms.isError?rooms.data?.pages.flatMap(p=>p.items)??[]:[];
 const roomIds=[...new Set((!invites.isError?invites.data??[]:[]).filter(i=>ownRooms.some(r=>r.id===i.roomId)&&i.status==='PENDING'&&i.recipientAcceptedAt).map(i=>i.roomId))];
 const memberships=useQueries({queries:roomIds.map(roomId=>({queryKey:['t25',actorId,roomId,'members'],queryFn:({signal}:{signal:AbortSignal})=>fetchRoomMembers(roomId,signal),enabled:!actions.revoked,retry:false,refetchInterval:15000}))});
 const profiles=useTeamProfiles(actorId,(!invites.isError?invites.data??[]:[]).flatMap(i=>[...(!i.sender?[i.senderId]:[]),...(!i.receiver?[i.receiverId]:[])]),!actions.revoked);
 if(actions.revoked)return null;
 return <div className="fg-team-activity">
  <div className="fg-team-heading"><div><h1>Yêu cầu & lời mời</h1><p>Theo dõi đội đã xin tham gia và lời mời của bạn.</p></div><Button variant="outline" disabled={actions.busy} onClick={()=>void actions.refresh()}>Tải lại</Button></div>
  {actions.error&&<p role="alert">{actions.error}</p>}
  <section aria-label="Yêu cầu của tôi"><h2>Yêu cầu tham gia đội</h2>{joins.isError?<p role="alert">{teamError(joins.error)}</p>:joins.isPending?<p role="status">Đang tải yêu cầu…</p>:<ul>{joins.data?.map(j=><li key={j.id}><article aria-label="Yêu cầu tham gia đội"><div className="fg-team-heading"><strong>Yêu cầu tham gia đội</strong><span>{requestStatus[j.status]}</span></div><p>Đã gửi {new Date(j.createdAt).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'})}</p>{j.status==='PENDING'&&<Button variant="outline" disabled={actions.busy} onClick={()=>void actions.run(signal=>cancelRequest(j.id,signal))}>Hủy yêu cầu</Button>}</article></li>)}{joins.data?.length===0&&<li>Bạn chưa gửi yêu cầu nào.</li>}</ul>}</section>
  <section aria-label="Lời mời"><h2>Lời mời phòng & đội chơi</h2>{invites.isError?<p role="alert">{teamError(invites.error)}</p>:invites.isPending?<p role="status">Đang tải lời mời…</p>:<ul>{invites.data?.map(i=>{
   const room=ownRooms.find(r=>r.id===i.roomId),permission=memberships[roomIds.indexOf(i.roomId)],member=!permission?.isError?permission?.data?.find(m=>m.userId===actorId):undefined;
   const manager=Boolean(room&&member&&(member.role==='OWNER'&&room.ownerId===actorId||member.role==='HELPER'&&member.permissions.includes(InvitationApprovalPermissionByTarget[i.targetType])));
   const recipient=i.receiverId===actorId,pending=i.status==='PENDING',consented=Boolean(i.recipientAcceptedAt),title=i.targetType==='ROOM'?'Lời mời vào phòng':'Lời mời vào đội chơi';
   return <li key={i.id}><article aria-label={title}><div className="fg-team-heading"><strong>{title}</strong><span>{pending?(consented?'Đã đồng ý, chờ xét duyệt':'Chờ người nhận đồng ý'):requestStatus[i.status]}</span></div>
    <p>{i.senderId===actorId?'Bạn đã gửi lời mời':`Từ ${i.sender?.displayName??profiles(i.senderId).profile?.displayName??'một người chơi'}`} · Người nhận: {recipient?'bạn':i.receiver?.displayName??profiles(i.receiverId).profile?.displayName??'người chơi'}{room&&` · ${room.name}`} · {new Date(i.createdAt).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'})}</p>
    <div className="fg-team-actions">
     {recipient&&pending&&!consented&&<><Button disabled={actions.busy} onClick={()=>void actions.run(signal=>respondInvitation(i.id,'ACCEPT',signal))}>Đồng ý lời mời</Button><Button variant="outline" disabled={actions.busy} onClick={()=>void actions.run(signal=>respondInvitation(i.id,'REJECT',signal))}>Từ chối lời mời</Button></>}
     {manager&&pending&&consented&&<><Button disabled={actions.busy} onClick={()=>void actions.run(signal=>approveInvitation(i.id,'ACCEPT',signal))}>Duyệt lời mời</Button><Button variant="outline" disabled={actions.busy} onClick={()=>void actions.run(signal=>approveInvitation(i.id,'REJECT',signal))}>Không duyệt</Button></>}
     {i.status==='ACCEPTED'&&(recipient||room)&&<Link to={`/rooms/${encodeURIComponent(i.roomId)}`}>Mở phòng</Link>}
    </div>
   </article></li>;
  })}{invites.data?.length===0&&<li>Chưa có lời mời.</li>}</ul>}
  {rooms.isError&&<p role="alert">Không tải được quyền quản lý phòng. Hãy tải lại để xét duyệt lời mời.</p>}
  {memberships.some(m=>m.isError)&&<p role="alert">Không xác minh được quyền xét duyệt. Hãy tải lại.</p>}
  {rooms.hasNextPage&&<Button variant="outline" disabled={rooms.isFetchingNextPage} onClick={()=>void rooms.fetchNextPage()}>Tải thêm phòng để xét duyệt</Button>}
  </section>
  <Link to="/rooms">Về phòng của tôi</Link>
 </div>;
}
