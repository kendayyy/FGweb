import {z} from 'zod';
import {ApiEndpointRegistry,createPageSchema,PlaySessionSchema,TeamSnapshotSchema,JoinRequestSchema,InvitationSchema,CreateInvitationRequestSchema,RespondInvitationSchema,RespondJoinRequestSchema,ApproveInvitationSchema,CancelJoinRequestSchema,PlaySessionRequestDecisionSchema,PlaySessionActionRequestSchema,IdSchema} from '@fg/contracts';
import type {CreateInvitationRequest} from '@fg/contracts';
export class TeamApiError extends Error {constructor(public status:number,public code?:string){super(`Team request failed (${status})`);}}
const id=(value:string)=>encodeURIComponent(IdSchema.parse(value));
export async function teamFetch<T>(path:string,schema:z.ZodType<T>,signal:AbortSignal,method='GET',body?:unknown):Promise<T>{
 const response=await fetch(`/api/v1/${path}`,{method,signal,credentials:'include',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(!response.ok){let code:string|undefined;try{const error:unknown=await response.json();if(error&&typeof error==='object'&&'code' in error&&typeof error.code==='string')code=error.code;}catch{/* HTTP status remains authoritative. */}throw new TeamApiError(response.status,code);}
 return schema.parse(await response.json());
}
export const listSessions=(roomId:string,cursor:string|undefined,signal:AbortSignal)=>teamFetch(`rooms/${id(roomId)}/play-sessions?limit=20${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`,createPageSchema(PlaySessionSchema),signal);
export const getSnapshot=(playId:string,signal:AbortSignal)=>teamFetch(`play-sessions/${id(playId)}`,TeamSnapshotSchema,signal);
export const getQueue=(playId:string,signal:AbortSignal)=>teamFetch(`play-sessions/${id(playId)}/requests`,z.array(JoinRequestSchema),signal);
export const getMyJoins=(signal:AbortSignal)=>teamFetch('recruitments/me/joins',z.array(JoinRequestSchema),signal);
export const getMyInvitations=(signal:AbortSignal)=>teamFetch('invitations/me',z.array(InvitationSchema),signal);
export const joinSession=(playId:string,signal:AbortSignal)=>teamFetch(`play-sessions/${id(playId)}/join`,JoinRequestSchema,signal,'POST',PlaySessionActionRequestSchema.parse({}));
export const applyToCard=(cardId:string,signal:AbortSignal)=>teamFetch(`recruitments/${id(cardId)}/requests`,JoinRequestSchema,signal,'POST',{});
export function decideRequest(playId:string,requestId:string,action:'ACCEPT'|'REJECT',signal:AbortSignal,isCurrentMember:boolean){
 return isCurrentMember?teamFetch(`play-sessions/${id(playId)}/requests/${id(requestId)}/respond`,JoinRequestSchema,signal,'POST',PlaySessionRequestDecisionSchema.parse({action})):teamFetch(`join-requests/${id(requestId)}/respond`,JoinRequestSchema,signal,'PATCH',RespondJoinRequestSchema.strict().parse({action}));
}
const successFor=(method:string,path:string)=>{const endpoint=ApiEndpointRegistry.find(e=>e.method===method&&e.path===path);if(!endpoint)throw new Error('Missing shared endpoint');return endpoint.responseSchema.refine(data=>typeof data==='object'&&data!==null&&'success' in data&&data.success===true,'Operation did not succeed') as z.ZodType<{success:boolean}>;};
export async function playAction(playId:string,action:'start'|'leave'|'end',signal:AbortSignal){
 const path=`play-sessions/${id(playId)}/${action}`,body=PlaySessionActionRequestSchema.parse({});
 if(action==='leave')return teamFetch(path,successFor('POST','/api/v1/play-sessions/:id/leave'),signal,'POST',body);
 return teamFetch(path,PlaySessionSchema,signal,'POST',body);
}
export const cancelRequest=(requestId:string,signal:AbortSignal)=>teamFetch(`join-requests/${id(requestId)}/cancel`,successFor('DELETE','/api/v1/join-requests/:id/cancel'),signal,'DELETE',CancelJoinRequestSchema.parse({requestId}));
export const createInvitation=(data:CreateInvitationRequest,signal:AbortSignal)=>teamFetch('invitations',InvitationSchema,signal,'POST',CreateInvitationRequestSchema.parse(data));
export const respondInvitation=(invitationId:string,action:'ACCEPT'|'REJECT',signal:AbortSignal)=>teamFetch(`invitations/${id(invitationId)}/respond`,InvitationSchema,signal,'PATCH',RespondInvitationSchema.parse({action}));
export const approveInvitation=(invitationId:string,action:'ACCEPT'|'REJECT',signal:AbortSignal)=>teamFetch(`invitations/${id(invitationId)}/approve`,InvitationSchema,signal,'POST',ApproveInvitationSchema.parse({invitationId,action}));
export function teamError(error:unknown){
 if(error instanceof TeamApiError){if(error.status===409)return 'Đội hoặc yêu cầu đã thay đổi. Đã tải lại dữ liệu; hãy kiểm tra trước khi thử lại.';if(error.status===401)return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';if(error.status===403||error.status===404)return 'Bạn không còn quyền thực hiện thao tác này hoặc đội không còn tồn tại.';if(error.status===400)return 'Yêu cầu không còn hợp lệ. Hãy tải lại và kiểm tra thông tin.';}
 return 'Không tải được dữ liệu đội. Kiểm tra kết nối và thử lại.';
}
