import {z,type ZodType} from 'zod';
import {CallGroupSchema,CallJoinSchema,CallParticipantSchema,type CallGroupDTO,type CallJoinDTO,type CallParticipantDTO} from '@fg/contracts';
export class CallApiError extends Error {
 constructor(public status:number,public code?:string){super('Call request failed');}
}
async function request<T>(path:string,schema:ZodType<T>,method='GET',body?:object,signal?:AbortSignal):Promise<T>{
 const response=await fetch(`/api/v1/${path}`,{method,credentials:'include',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal,keepalive:method==='POST'&&path.endsWith('/leave')});
 if(!response.ok){const error=await response.json().catch(()=>null);throw new CallApiError(response.status,typeof error?.code==='string'?error.code:undefined);}
 return schema.parse(await response.json());
}
export const listCalls=(id:string,signal?:AbortSignal):Promise<CallGroupDTO[]>=>request(`rooms/${encodeURIComponent(id)}/calls`,z.array(CallGroupSchema),'GET',undefined,signal);
export const createCall=(id:string):Promise<CallGroupDTO>=>request(`rooms/${encodeURIComponent(id)}/calls`,CallGroupSchema,'POST',{});
export const joinCall=(id:string):Promise<CallJoinDTO>=>request(`calls/${encodeURIComponent(id)}/join`,CallJoinSchema,'POST',{});
export const leaveCall=(id:string)=>request(`calls/${encodeURIComponent(id)}/leave`,z.object({success:z.literal(true)}),'POST',{});
export const listParticipants=(id:string,signal?:AbortSignal):Promise<CallParticipantDTO[]>=>request(`calls/${encodeURIComponent(id)}/participants`,z.array(CallParticipantSchema),'GET',undefined,signal);
export const selfMic=(id:string,muted:boolean):Promise<CallParticipantDTO>=>request(`calls/${encodeURIComponent(id)}/self-mic`,CallParticipantSchema,'POST',{muted});
export function callError(error:unknown){
 if(error instanceof CallApiError){
  if(error.code==='CAPACITY_FULL')return 'Nhóm gọi đã đủ 10 người. Hãy chọn nhóm khác.';
  if(error.code==='CALL_CLOSED')return 'Cuộc gọi đã đóng. Hãy chọn hoặc tạo nhóm gọi mới.';
  if(error.code==='ACTIVE_PLAY_CONFLICT')return 'Bạn đang ở một cuộc gọi khác. Hãy rời cuộc gọi đó trước.';
  if([401,403,404].includes(error.status))return 'Bạn không còn quyền vào cuộc gọi này. Hãy kiểm tra phiên đăng nhập và thành viên phòng.';
 }
 return 'Không thể kết nối cuộc gọi. Hãy thử lại.';
}
