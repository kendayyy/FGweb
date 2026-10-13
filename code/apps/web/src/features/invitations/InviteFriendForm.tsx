import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import {useInfiniteQuery} from '@tanstack/react-query';
import type {RoomDTO} from '@fg/contracts';
import {Button} from '../../components/ui/Button.js';
import {fetchFriends} from '../friends/api.js';
import {createInvitation,teamError} from '../team-roster/api.js';
import {useTeamActions} from '../team-roster/useTeamActions.js';
export function InviteFriendForm({room,actorId,playId}:{room:RoomDTO;actorId:string;playId?:string}){
 const [open,setOpen]=useState(false),[receiverId,setReceiverId]=useState(''),[target,setTarget]=useState<'ROOM'|'PLAY_SESSION'>('ROOM'),[sent,setSent]=useState(false),actions=useTeamActions(actorId,`${room.id}:invite:${playId??''}`);
 const friends=useInfiniteQuery({queryKey:['t25',actorId,'friends'],queryFn:({pageParam,signal})=>fetchFriends({cursor:pageParam,limit:50},signal),initialPageParam:undefined as string|undefined,getNextPageParam:p=>p.hasMore?p.nextCursor:undefined,enabled:open&&!actions.revoked,retry:false});
 if(actions.revoked)return null;
 const people=friends.data?.pages.flatMap(p=>p.items).filter(p=>p.id!==actorId)??[];
 return <div><Button variant="outline" aria-expanded={open} onClick={()=>setOpen(!open)}>Mời bạn</Button>{open&&<form className="fg-team-invite" onSubmit={e=>{e.preventDefault();if(!people.some(p=>p.id===receiverId)||target==='PLAY_SESSION'&&!playId)return;setSent(false);void actions.run(signal=>createInvitation(target==='ROOM'?{targetType:'ROOM',receiverId,roomId:room.id}:{targetType:'PLAY_SESSION',receiverId,roomId:room.id,playSessionId:playId!},signal)).then(result=>{if(result)setSent(true);});}}>
  {friends.isError?<p role="alert">{teamError(friends.error)}</p>:friends.isPending?<p>Đang tải bạn bè…</p>:people.length===0?<p>Chưa có bạn bè để mời. Bạn có thể kết bạn từ hồ sơ người chơi.</p>:<>
   <label>Bạn muốn mời<select required value={receiverId} onChange={e=>{setReceiverId(e.target.value);setSent(false);}} disabled={actions.busy}><option value="">Chọn một người bạn</option>{people.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label>
   <label>Mời tham gia<select value={target} onChange={e=>{setTarget(e.target.value as 'ROOM'|'PLAY_SESSION');setSent(false);}} disabled={actions.busy}><option value="ROOM">Phòng nhóm</option>{playId&&<option value="PLAY_SESSION">Đội chơi hiện tại</option>}</select></label>
   <Button type="submit" disabled={actions.busy||!receiverId}>Gửi lời mời</Button>
  </>}
  {friends.hasNextPage&&<Button variant="ghost" disabled={friends.isFetchingNextPage} onClick={()=>void friends.fetchNextPage()}>Xem thêm bạn bè</Button>}
  {actions.error&&<p role="alert">{actions.error}</p>}{sent&&<p role="status">Đã gửi lời mời. Người nhận cần đồng ý để tiếp tục.</p>}
  <Link to="/team-activity">Theo dõi lời mời</Link>
 </form>}</div>;
}
