import {createTransport,type Transporter} from 'nodemailer';import {createHash} from 'node:crypto';import {z} from 'zod';import type {DeliveryOutcome,DeliveryPayload} from './delivery-worker.js';
export interface EmailConfig {host:string;port:number;user:string;password:string;from:string;publicOrigin:string;}
export function smtpFailureOutcome(error:unknown):DeliveryOutcome {
 const e=error as {responseCode?:unknown;code?:unknown;command?:unknown;timeoutType?:unknown},status=Number(e?.responseCode);
 if(status>=400&&status<500)return{status:'retryable'};if(status>=500&&status<600)return{status:'failed'};
 if(e?.code==='EDNS'||['CONN','AUTH LOGIN','AUTH PLAIN','AUTH XOAUTH2','MAIL FROM','RCPT TO'].includes(String(e?.command))||['CONNECT_TIMEOUT','GREETING_TIMEOUT','UPGRADE_TIMEOUT'].includes(String(e?.timeoutType)))return{status:'retryable'};
 return{status:'uncertain'};
}
export function createEmailAdapter(config:EmailConfig,provided?:Transporter){
 const origin=new URL(config.publicOrigin);if(origin.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(origin.hostname))throw new Error('HTTPS email link origin required');
 if(!config.host||![465,587].includes(config.port)||!config.user||!config.password||!config.from)throw new Error('Email delivery configuration required');
 const transport=provided??createTransport({host:config.host,port:config.port,secure:config.port===465,requireTLS:config.port!==465,auth:{user:config.user,pass:config.password},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
 return{async send(recipient:string,payload:DeliveryPayload,id:string):Promise<DeliveryOutcome>{
 if(!z.string().max(320).email().safeParse(recipient).success||!/^\/notifications\/[A-Za-z0-9%_-]+$/.test(payload.url))return{status:'failed'};
 try{const result=await transport.sendMail({from:config.from,to:{address:recipient,name:''},subject:'FG — '+payload.title,text:payload.title+'\n\n'+payload.body+'\n\n'+origin.origin+payload.url,messageId:'<fg-'+createHash('sha256').update(id).digest('hex')+'@'+origin.hostname+'>',disableFileAccess:true,disableUrlAccess:true});
 const accepted=Array.isArray(result.accepted)&&result.accepted.some((r:string|{address:string})=>(typeof r==='string'?r:r.address).toLowerCase()===recipient.toLowerCase());if(accepted&&!result.rejected?.length)return{status:'accepted'};if(result.rejected?.length&&!accepted)return{status:'failed'};return{status:'uncertain'};
 }catch(error){return smtpFailureOutcome(error);}
 },close(){transport.close();}};
}
