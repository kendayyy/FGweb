import {z} from 'zod';
import {CreateRecruitmentSchema,PublicRecruitmentQuerySchema,PublicRecruitmentSchema,RecruitmentSchema,ApiErrorResponseSchema,createPageSchema} from '@fg/contracts';
export type CreateRecruitment = z.infer<ReturnType<typeof CreateRecruitmentSchema>>;
export type Filters = Pick<z.input<typeof PublicRecruitmentQuerySchema>,'mode'|'timingType'>;
const CardsPage=createPageSchema(PublicRecruitmentSchema);
export class RecruitmentApiError extends Error {
 constructor(public readonly status:number,public readonly code?:string){super(`Recruitment request failed (${status})`);}
}
async function read(response:Response){
 const body:unknown=await response.json().catch(()=>null);
 if(!response.ok){const parsed=ApiErrorResponseSchema.safeParse(body);throw new RecruitmentApiError(response.status,parsed.success?parsed.data.code:undefined);}
 return body;
}
export async function fetchRecruitments(gameId:string,filters:Filters,cursor:string|undefined,signal:AbortSignal,suggestions=false){
 const parsed=PublicRecruitmentQuerySchema.parse({...filters,cursor,limit:20});
 const params=new URLSearchParams({state:parsed.state,visibility:parsed.visibility,limit:String(parsed.limit)});
 if(parsed.mode)params.set('mode',parsed.mode);if(parsed.timingType)params.set('timingType',parsed.timingType);if(cursor)params.set('cursor',cursor);
 const response=await fetch(`/api/v1/games/${encodeURIComponent(gameId)}/recruitments${suggestions?'/suggestions':''}?${params}`,{credentials:'include',signal,headers:{Accept:'application/json'}});
 return CardsPage.parse(await read(response));
}
export async function createRecruitment(input:CreateRecruitment,signal:AbortSignal){
 const response=await fetch('/api/v1/recruitments',{method:'POST',credentials:'include',signal,headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(input)});
 return RecruitmentSchema.parse(await read(response));
}
