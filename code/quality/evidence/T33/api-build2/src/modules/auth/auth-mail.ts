import {createTransport,type Transporter} from 'nodemailer';
import {APIError} from 'better-auth/api';

export function authMailTransport():Transporter {
 const {SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASSWORD,SMTP_FROM}=process.env;
 if(!SMTP_HOST||!['465','587'].includes(SMTP_PORT??'')||!SMTP_USER||!SMTP_PASSWORD||!SMTP_FROM)throw new Error('SMTP auth mail configuration is required');
 return createTransport({host:SMTP_HOST,port:Number(SMTP_PORT),secure:SMTP_PORT==='465',requireTLS:SMTP_PORT!=='465',auth:{user:SMTP_USER,pass:SMTP_PASSWORD},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
}
export async function sendAuthMail(transport:Transporter,from:string,to:string,kind:'VERIFY'|'RESET'|'ATTACH',url:string):Promise<void>{
 try{
  const result=await transport.sendMail({from,to,subject:`FG — ${kind==='VERIFY'?'Xác minh email':kind==='RESET'?'Đặt lại mật khẩu':'Thêm mật khẩu'}`,text:`FG ${kind}\n\n${url}\n\nIf you did not request this, ignore this email.`,disableFileAccess:true,disableUrlAccess:true});
  if(!result.accepted?.some((address:string|{address:string})=>(typeof address==='string'?address:address.address).toLowerCase()===to.toLowerCase())||result.rejected?.length)throw new Error('SMTP recipient not accepted');
 }catch{throw new APIError('SERVICE_UNAVAILABLE',{code:'AUTH_EMAIL_UNAVAILABLE',message:'Không thể gửi thư xác thực lúc này. Hãy thử lại sau.'});}
}
