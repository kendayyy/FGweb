import React from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import type {RecruitmentDTO} from '@fg/contracts';
import {useAuth} from '../auth/index.js';
import {Button} from '../../components/ui/Button.js';
import {getMyJoins,applyToCard,cancelRequest,teamError} from './api.js';
import {useTeamActions,requestStatus} from './useTeamActions.js';
import './team-roster.css';
export function JoinCardAction({card}:{card:RecruitmentDTO}){
 const {user,isLoading,isSigningOut}=useAuth();
 if(isLoading||isSigningOut)return null;
 if(!user)return <div className="fg-team-card-action"><Link to="/login">Đăng nhập để xin vào đội</Link></div>;
 if(!user.onboardingComplete)return null;
 return <ActorJoin key={`${user.id}:${card.id}`} actorId={user.id} card={card}/>;
}
function ActorJoin({actorId,card}:{actorId:string;card:RecruitmentDTO}){
 const actions=useTeamActions(actorId,card.id);
 const requests=useQuery({queryKey:['t25',actorId,'my-joins'],queryFn:({signal})=>getMyJoins(signal),retry:false,enabled:!actions.revoked,refetchInterval:15000});
 if(actions.revoked)return null;
 const request=!requests.isError?requests.data?.find(j=>j.recruitmentId===card.id):undefined;
 return <div className="fg-team-card-action">
  {requests.isError?<p role="alert">{teamError(requests.error)}</p>:request?<><p role="status">{requestStatus[request.status]}</p>{request.status==='PENDING'&&<Button variant="outline" disabled={actions.busy} onClick={()=>void actions.run(signal=>cancelRequest(request.id,signal))}>Hủy yêu cầu</Button>}</>:<Button disabled={requests.isPending||actions.busy||card.state!=='OPEN'||card.currentPlayers>=card.playerCapacity} onClick={()=>void actions.run(signal=>applyToCard(card.id,signal))}>Xin tham gia</Button>}
  {actions.error&&<p role="alert">{actions.error}</p>}<Link to="/team-activity">Theo dõi yêu cầu</Link>
 </div>;
}
