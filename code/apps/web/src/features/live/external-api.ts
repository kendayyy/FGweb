import {ExternalLiveSchema,SetExternalLiveRequestSchema,type ExternalLiveDTO,type SetExternalLiveRequest} from '@fg/contracts';
import {CallApiError} from '../calls/api.js';
import {externalFrame} from './external-player-protocol.js';

async function request(callId:string,method:'GET'|'PUT'|'DELETE',signal:AbortSignal,body?:SetExternalLiveRequest):Promise<ExternalLiveDTO|null>{
 const response=await fetch('/api/v1/calls/'+encodeURIComponent(callId)+'/external-live',{method,credentials:'include',signal,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(SetExternalLiveRequestSchema.parse(body))}:{})});
 if(!response.ok){const error=await response.json().catch(()=>null);throw new CallApiError(response.status,typeof error?.code==='string'?error.code:undefined);}
 const raw:unknown=await response.json();
 if(method==='DELETE'){if(!raw||typeof raw!=='object'||(raw as Record<string,unknown>).success!==true)throw new Error('Invalid delete response');return null;}
 if(raw===null&&method==='GET')return null;
 // Validate raw URL before a URL schema can normalize whitespace.
 if(!externalFrame(raw,window.location.origin))throw new Error('Invalid external player source');
 const source=ExternalLiveSchema.parse(raw);if(source.callId!==callId)throw new Error('External source belongs to another call');return source;
}
export const getExternalLive=(callId:string,signal:AbortSignal)=>request(callId,'GET',signal);
export const putExternalLive=(callId:string,body:SetExternalLiveRequest,signal:AbortSignal)=>request(callId,'PUT',signal,body);
export const deleteExternalLive=(callId:string,signal:AbortSignal)=>request(callId,'DELETE',signal);
