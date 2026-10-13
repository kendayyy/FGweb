import {ApiEndpointRegistry} from '@fg/contracts';
import {PASSWORD_POLICY_HELP} from './AuthFields.js';
export class AuthRequestError extends Error{
 constructor(public code:string,public status:number,message:string){super(message);}
}
const messages:Record<string,string>={EMAIL_NOT_VERIFIED:'Email chưa được xác minh. Hãy kiểm tra hộp thư hoặc gửi lại xác minh.',AUTH_EMAIL_UNAVAILABLE:'Không thể gửi thư lúc này. Hãy thử lại sau.',INVALID_EMAIL_OR_PASSWORD:'Email, tên đăng nhập hoặc mật khẩu không đúng.',INVALID_PASSWORD:'Mật khẩu hiện tại không đúng.',INVALID_TOKEN:'Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.',EMAIL_OWNERSHIP_MISMATCH:'Liên kết thuộc phiên đăng nhập khác. Hãy mở bằng tài khoản đã yêu cầu.',PASSWORD_ALREADY_SET:'Tài khoản đã có mật khẩu. Hãy dùng chức năng đổi mật khẩu.',ACCOUNT_BANNED:'Tài khoản đã bị khóa.'};
export async function emailAuthRequest(path:string,body?:unknown,signal?:AbortSignal):Promise<unknown>{
 const endpoint=ApiEndpointRegistry.find(item=>item.path===`/api/auth${path}`);
 if(!endpoint?.responseSchema)throw new Error('Yêu cầu không được hỗ trợ.');
 const parsed=endpoint.requestSchema?.safeParse(body??{});
 if(parsed&&!parsed.success)throw new Error(`Kiểm tra thông tin. ${PASSWORD_POLICY_HELP}`);
 const queryData=parsed?.success?parsed.data:undefined;
 const query=endpoint.method==='GET'&&queryData!==null&&typeof queryData==='object'?new URLSearchParams(Object.entries(queryData).filter(([,value])=>value!==undefined).map(([key,value])=>[key,String(value)])).toString():'';
 const response=await fetch(`${endpoint.path}${query?`?${query}`:''}`,{method:endpoint.method,credentials:'same-origin',headers:{Accept:'application/json',...endpoint.method!=='GET'?{'Content-Type':'application/json'}:{}},...endpoint.method!=='GET'?{body:JSON.stringify(parsed?.data??body??{})}:{},signal});
 if(!response.ok){const data=await response.json().catch(()=>({}));const code=typeof data.code==='string'?data.code:'';throw new AuthRequestError(code,response.status,messages[code]??(response.status===429?'Bạn đã thử quá nhiều lần. Hãy chờ một phút rồi thử lại.':response.status===401?'Phiên đăng nhập không hợp lệ hoặc email/mật khẩu không đúng.':response.status===403?'Yêu cầu bị từ chối. Hãy kiểm tra tài khoản và thử lại.':'Không thể hoàn tất yêu cầu. Hãy thử lại.'));}
 const result=endpoint.responseSchema.safeParse(await response.json());
 if(!result.success)throw new Error('Phản hồi không hợp lệ. Chưa thể xác nhận yêu cầu thành công.');
 return result.data;
}
