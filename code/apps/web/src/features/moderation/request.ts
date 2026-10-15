import type {z} from 'zod';import {SupportIdSchema} from '@fg/contracts';

export class ActionApiError extends Error{
 constructor(public readonly status:number,public readonly invalidResponse=false){super('FG request could not be verified');this.name='ActionApiError';}
}
export function pathId(value:string){if(!SupportIdSchema.safeParse(value).success||value==='.'||value==='..')throw new ActionApiError(422);return encodeURIComponent(value);}
export function parsed<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new ActionApiError(0,true);return result.data;}
export async function requestJson<T>(schema:z.ZodType<T>,path:string,signal:AbortSignal,method='GET',body?:unknown):Promise<T>{
 if(!path.startsWith('/api/v1/')||path.includes('\\')||signal.aborted)throw new ActionApiError(0);
 let response:Response;try{response=await fetch(path,{method,signal,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});}catch(error){if(signal.aborted)throw error;throw new ActionApiError(0);}
 if(!response.ok)throw new ActionApiError(response.status);
 let value:unknown;try{value=await response.json();}catch{throw new ActionApiError(response.status,true);}if(signal.aborted)throw new DOMException('Request expired','AbortError');return parsed(schema,value);
}
export function actionError(error:unknown){if(error instanceof ActionApiError){if(error.status===401)return 'Phiên làm việc đã hết hạn. Đăng nhập lại để tiếp tục.';if(error.status===403)return 'Bạn không còn quyền thực hiện thao tác này.';if(error.status===404)return 'Nội dung không còn khả dụng với quyền hiện tại.';if(error.status===409)return 'Dữ liệu đã thay đổi. Tải lại nội dung trước khi thử tiếp.';if(error.status===422)return 'Kiểm tra nội dung và lý do trước khi gửi.';if(error.status===429)return 'Bạn thao tác quá nhanh. Vui lòng đợi rồi thử lại.';}return 'Chưa xác nhận được kết quả. Bản nháp vẫn được giữ; kiểm tra kết nối rồi thử lại.';}
