export interface PendingDraft{body:string;id:string}
export interface SupportDraft{message:string;note:string;pendingMessage?:PendingDraft;pendingNote?:PendingDraft}
export const emptyDraft=():SupportDraft=>({message:'',note:''});
export function retryDraft(previous:PendingDraft|undefined,body:string):PendingDraft{return previous?.body===body?previous:{body,id:crypto.randomUUID()};}
