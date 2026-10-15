import {SocketMessageDeletedPayloadSchema,SupportIdSchema,type MessageDTO} from '@fg/contracts';
export const RETRACTION_EVENT='fg:message-deleted';
function event(value:unknown){const result=SocketMessageDeletedPayloadSchema.strict().safeParse(value);if(!result.success||!SupportIdSchema.safeParse(result.data.conversationId).success||!SupportIdSchema.safeParse(result.data.messageId).success||[result.data.conversationId,result.data.messageId].some(id=>id==='.'||id==='..'))return null;return result.data;}
export class MessageRetractions{
 private readonly deleted=new Set<string>();
 constructor(readonly conversationId:string){}
 accept(value:unknown){const parsed=event(value);if(!parsed||parsed.conversationId!==this.conversationId||this.deleted.has(parsed.messageId))return false;this.deleted.add(parsed.messageId);return true;}
 has(id:string){return this.deleted.has(id);}
 replyVisible(id?:string|null){return Boolean(id&&!this.deleted.has(id));}
 visible<T extends{id:string}>(rows:readonly T[]):T[]{return rows.filter(row=>!this.deleted.has(row.id));}
 legacy(rows:readonly MessageDTO[]){return this.visible(rows).map(row=>row.replyToId&&this.has(row.replyToId)||row.replyToMessage&&this.has(row.replyToMessage.id)?{...row,replyToId:null,replyToMessage:null}:row);}
 clear(){this.deleted.clear();}
}
export function publishMessageRetraction(conversationId:string,messageId:string){const detail=event({conversationId,messageId});if(!detail)throw new Error('Invalid retraction context');window.dispatchEvent(new CustomEvent(RETRACTION_EVENT,{detail}));}
