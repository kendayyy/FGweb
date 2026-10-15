import {z} from 'zod';
import {IdSchema,IsoDateTimeSchema} from './common.js';

export const SupportAccessPolicy={forms:'AUTHENTICATED',chat:'AUTHENTICATED',userRead:'CURRENT_OWNER',admin:'SOLE_SERVER_ADMIN',guestPrivateRead:false} as const;
export const SUPPORT_RECEIPT_TEXT='FG đã nhận tin nhắn của bạn.';
export const SupportIdSchema=IdSchema.refine(value=>Array.from(value).length<=128&&value===value.trim()&&!Array.from(value).some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127),'Invalid bounded support identity');
const sequence=z.number().int().min(0).max(2147483647),positiveSequence=sequence.refine(value=>value>0);
const plain=(maximum:number)=>z.string().trim().min(1).refine(value=>Array.from(value).length<=maximum,'Support text is too long');
export const SupportBodySchema=plain(4000),SupportTitleSchema=plain(160);
export const SupportKindSchema=z.enum(['FEEDBACK','BUG','CHAT']);
export const SupportStatusSchema=z.enum(['NEW','IN_PROGRESS','RESOLVED']);
const cursor=z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/);
export const SupportCreateRequestSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.enum(['FEEDBACK','BUG']),clientRequestId:SupportIdSchema,title:SupportTitleSchema,body:SupportBodySchema}).strict(),
 z.object({kind:z.literal('CHAT'),clientRequestId:SupportIdSchema,body:SupportBodySchema}).strict(),
]);
export const SupportSendMessageRequestSchema=z.object({clientMessageId:SupportIdSchema,body:SupportBodySchema}).strict();
export const SupportCreateNoteRequestSchema=z.object({clientNoteId:SupportIdSchema,body:SupportBodySchema}).strict();
export const SupportStatusPatchSchema=z.object({status:SupportStatusSchema,expectedVersion:positiveSequence}).strict();
export const SupportReadRequestSchema=z.object({lastReadMessageId:SupportIdSchema}).strict();
export const SupportListQuerySchema=z.object({limit:z.coerce.number().int().min(1).max(50).default(20),cursor:cursor.optional(),status:SupportStatusSchema.optional(),kind:SupportKindSchema.optional()}).strict();
export const SupportMessageQuerySchema=z.object({limit:z.coerce.number().int().min(1).max(100).default(20),afterSequence:z.coerce.number().int().min(0).max(2147483647).default(0)}).strict();
export const SupportInternalPageQuerySchema=z.object({limit:z.coerce.number().int().min(1).max(100).default(20),cursor:cursor.optional()}).strict();

const requestFields=z.object({id:SupportIdSchema,ownerId:SupportIdSchema,kind:SupportKindSchema,title:SupportTitleSchema,status:SupportStatusSchema,version:positiveSequence,lastMessageSequence:sequence,lastReadSequence:sequence,unreadCount:sequence,createdAt:IsoDateTimeSchema,updatedAt:IsoDateTimeSchema,lastActivityAt:IsoDateTimeSchema,resolvedAt:IsoDateTimeSchema.nullable()}).strict();
type RequestFields=z.infer<typeof requestFields>;
const coherentRequest=(value:RequestFields)=>value.lastReadSequence<=value.lastMessageSequence&&value.unreadCount<=value.lastMessageSequence&&Date.parse(value.updatedAt)>=Date.parse(value.createdAt)&&Date.parse(value.lastActivityAt)>=Date.parse(value.createdAt)&&(value.status==='RESOLVED'?value.resolvedAt!==null&&Date.parse(value.resolvedAt)>=Date.parse(value.createdAt):value.resolvedAt===null)&&(value.kind!=='CHAT'||value.title==='Chat hỗ trợ');
export const SupportUserRequestSchema=requestFields.refine(coherentRequest,'Inconsistent support request state');
const owner=z.object({id:SupportIdSchema,displayName:z.string().min(1).max(50)}).strict();
export const SupportAdminRequestSchema=requestFields.extend({owner}).strict().refine(value=>coherentRequest(value)&&value.owner.id===value.ownerId,'Inconsistent support owner/state');

const messageFields={id:SupportIdSchema,requestId:SupportIdSchema,sequence:positiveSequence,body:SupportBodySchema,createdAt:IsoDateTimeSchema};
export const SupportMessageSchema=z.discriminatedUnion('authorRole',[
 z.object({...messageFields,authorRole:z.literal('USER'),authorId:SupportIdSchema,clientMessageId:SupportIdSchema}).strict(),
 z.object({...messageFields,authorRole:z.literal('ADMIN'),authorId:SupportIdSchema,clientMessageId:SupportIdSchema}).strict(),
 z.object({...messageFields,authorRole:z.literal('SYSTEM'),authorId:z.null(),clientMessageId:z.null(),body:z.literal(SUPPORT_RECEIPT_TEXT)}).strict(),
]);
export const SupportNoteSchema=z.object({id:SupportIdSchema,requestId:SupportIdSchema,authorId:SupportIdSchema,clientNoteId:SupportIdSchema,body:SupportBodySchema,createdAt:IsoDateTimeSchema,updatedAt:IsoDateTimeSchema}).strict().refine(value=>Date.parse(value.updatedAt)>=Date.parse(value.createdAt),'Invalid note timestamps');
export const SupportAuditSchema=z.object({id:SupportIdSchema,requestId:SupportIdSchema,actorId:SupportIdSchema,actorRole:z.enum(['OWNER','ADMIN']),action:z.enum(['CREATED','STATUS_CHANGED','NOTE_ADDED']),fromStatus:SupportStatusSchema.nullable(),toStatus:SupportStatusSchema.nullable(),requestVersion:positiveSequence.nullable(),noteId:SupportIdSchema.nullable(),createdAt:IsoDateTimeSchema}).strict().refine(value=>{
 if(value.action==='CREATED')return value.actorRole==='OWNER'&&value.fromStatus===null&&value.toStatus==='NEW'&&value.requestVersion===1&&value.noteId===null;
 if(value.action==='STATUS_CHANGED')return value.actorRole==='ADMIN'&&value.fromStatus!==null&&value.toStatus!==null&&value.fromStatus!==value.toStatus&&value.requestVersion!==null&&value.requestVersion>=2&&value.noteId===null;
 return value.actorRole==='ADMIN'&&value.fromStatus===null&&value.toStatus===null&&value.requestVersion===null&&value.noteId!==null;
},'Invalid support audit action shape');
export const SupportReceiptSchema=z.object({received:z.literal(true),requestId:SupportIdSchema,messageId:SupportIdSchema,text:z.literal(SUPPORT_RECEIPT_TEXT)}).strict();
export const SupportReadStateSchema=z.object({requestId:SupportIdSchema,lastReadMessageId:SupportIdSchema.nullable(),lastReadSequence:sequence,unreadCount:sequence}).strict().refine(value=>(value.lastReadMessageId===null)===(value.lastReadSequence===0),'Invalid read identity');
const page=<T extends z.ZodTypeAny>(item:T,maximum:number)=>z.object({items:z.array(item).max(maximum),nextCursor:cursor.nullable()}).strict();
export const SupportUserRequestPageSchema=page(SupportUserRequestSchema,50),SupportAdminRequestPageSchema=page(SupportAdminRequestSchema,50);
export const SupportNotePageSchema=page(SupportNoteSchema,100),SupportAuditPageSchema=page(SupportAuditSchema,100);
export const SupportUserDetailSchema=z.object({request:SupportUserRequestSchema}).strict();
export const SupportAdminDetailSchema=z.object({request:SupportAdminRequestSchema,notes:SupportNotePageSchema,audit:SupportAuditPageSchema}).strict().refine(value=>value.notes.items.every(note=>note.requestId===value.request.id)&&value.audit.items.every(event=>event.requestId===value.request.id),'Mixed support request detail');
export const SupportMessagePageSchema=z.object({requestId:SupportIdSchema,items:z.array(SupportMessageSchema).max(100),nextAfterSequence:sequence.nullable()}).strict().refine(value=>{
 const ids=new Set<string>();let previous=0;for(const message of value.items){if(message.requestId!==value.requestId||ids.has(message.id)||message.sequence<=previous)return false;ids.add(message.id);previous=message.sequence;}
 return value.nextAfterSequence===null||(value.items.length>0&&value.nextAfterSequence===previous);
},'Mixed or unordered support messages');
export const SupportSendMessageResponseSchema=z.object({message:SupportMessageSchema,receipt:SupportReceiptSchema}).strict().refine(value=>value.message.id===value.receipt.messageId&&value.message.requestId===value.receipt.requestId,'Mismatched receipt');
export const SupportCreateResponseSchema=z.object({request:SupportUserRequestSchema,message:SupportMessageSchema,receipt:SupportReceiptSchema}).strict().refine(value=>value.message.authorRole==='USER'&&value.message.authorId===value.request.ownerId&&value.message.requestId===value.request.id&&value.receipt.requestId===value.request.id&&value.receipt.messageId===value.message.id,'Mismatched initial support receipt');

export const SupportSocketEventNames={SUBSCRIBE:'support.subscribe',UNSUBSCRIBE:'support.unsubscribe',ADMIN_SUBSCRIBE:'support.admin.subscribe',ADMIN_UNSUBSCRIBE:'support.admin.unsubscribe',MESSAGE_CREATED:'support.message.created',REQUEST_UPDATED:'support.request.updated',ADMIN_REQUEST_UPDATED:'support.admin.request.updated',ADMIN_NOTE_CREATED:'support.admin.note.created'} as const;
export const SupportSubscribeSchema=z.object({requestId:SupportIdSchema}).strict();
export const SupportAdminSubscribeSchema=z.object({}).strict();
export const SupportMessageCreatedEventSchema=z.object({requestId:SupportIdSchema,message:SupportMessageSchema}).strict().refine(value=>value.requestId===value.message.requestId,'Mixed support event');
export const SupportUserRequestUpdatedEventSchema=z.object({request:SupportUserRequestSchema}).strict();
export const SupportAdminRequestUpdatedEventSchema=z.object({request:SupportAdminRequestSchema}).strict();
export const SupportAdminNoteCreatedEventSchema=z.object({requestId:SupportIdSchema,note:SupportNoteSchema}).strict().refine(value=>value.requestId===value.note.requestId,'Mixed support note event');
export const SupportSocketPayloadSchemas={
 [SupportSocketEventNames.SUBSCRIBE]:SupportSubscribeSchema,[SupportSocketEventNames.UNSUBSCRIBE]:SupportSubscribeSchema,
 [SupportSocketEventNames.ADMIN_SUBSCRIBE]:SupportAdminSubscribeSchema,[SupportSocketEventNames.ADMIN_UNSUBSCRIBE]:SupportAdminSubscribeSchema,
 [SupportSocketEventNames.MESSAGE_CREATED]:SupportMessageCreatedEventSchema,[SupportSocketEventNames.REQUEST_UPDATED]:SupportUserRequestUpdatedEventSchema,
 [SupportSocketEventNames.ADMIN_REQUEST_UPDATED]:SupportAdminRequestUpdatedEventSchema,[SupportSocketEventNames.ADMIN_NOTE_CREATED]:SupportAdminNoteCreatedEventSchema,
} as const;
// Metadata only: T37 implements current session/ban/owner/sole-admin checks.
export const SupportApiEndpointRegistry=[
 {method:'POST',path:'/api/v1/support/requests',auth:'Authenticated',requestSchema:SupportCreateRequestSchema,responseSchema:SupportCreateResponseSchema},
 {method:'GET',path:'/api/v1/support/requests',auth:'Authenticated',requestSchema:SupportListQuerySchema,responseSchema:SupportUserRequestPageSchema},
 {method:'GET',path:'/api/v1/support/requests/:id',auth:'Authenticated',responseSchema:SupportUserDetailSchema},
 {method:'GET',path:'/api/v1/support/requests/:id/messages',auth:'Authenticated',requestSchema:SupportMessageQuerySchema,responseSchema:SupportMessagePageSchema},
 {method:'POST',path:'/api/v1/support/requests/:id/messages',auth:'Authenticated',requestSchema:SupportSendMessageRequestSchema,responseSchema:SupportSendMessageResponseSchema},
 {method:'POST',path:'/api/v1/support/requests/:id/read',auth:'Authenticated',requestSchema:SupportReadRequestSchema,responseSchema:SupportReadStateSchema},
 {method:'GET',path:'/api/v1/admin/support/requests',auth:'Admin',requestSchema:SupportListQuerySchema,responseSchema:SupportAdminRequestPageSchema},
 {method:'GET',path:'/api/v1/admin/support/requests/:id',auth:'Admin',responseSchema:SupportAdminDetailSchema},
 {method:'GET',path:'/api/v1/admin/support/requests/:id/messages',auth:'Admin',requestSchema:SupportMessageQuerySchema,responseSchema:SupportMessagePageSchema},
 {method:'POST',path:'/api/v1/admin/support/requests/:id/messages',auth:'Admin',requestSchema:SupportSendMessageRequestSchema,responseSchema:SupportSendMessageResponseSchema},
 {method:'POST',path:'/api/v1/admin/support/requests/:id/read',auth:'Admin',requestSchema:SupportReadRequestSchema,responseSchema:SupportReadStateSchema},
 {method:'PATCH',path:'/api/v1/admin/support/requests/:id/status',auth:'Admin',requestSchema:SupportStatusPatchSchema,responseSchema:SupportAdminRequestSchema},
 {method:'GET',path:'/api/v1/admin/support/requests/:id/notes',auth:'Admin',requestSchema:SupportInternalPageQuerySchema,responseSchema:SupportNotePageSchema},
 {method:'POST',path:'/api/v1/admin/support/requests/:id/notes',auth:'Admin',requestSchema:SupportCreateNoteRequestSchema,responseSchema:SupportNoteSchema},
 {method:'GET',path:'/api/v1/admin/support/requests/:id/audit',auth:'Admin',requestSchema:SupportInternalPageQuerySchema,responseSchema:SupportAuditPageSchema},
] as const satisfies readonly {method:'GET'|'POST'|'PATCH';path:string;auth:'Authenticated'|'Admin';requestSchema?:z.ZodTypeAny;responseSchema:z.ZodTypeAny}[];
export type SupportKind=z.infer<typeof SupportKindSchema>;
export type SupportStatus=z.infer<typeof SupportStatusSchema>;
export type SupportCreateRequest=z.infer<typeof SupportCreateRequestSchema>;
export type SupportUserRequest=z.infer<typeof SupportUserRequestSchema>;
export type SupportAdminRequest=z.infer<typeof SupportAdminRequestSchema>;
export type SupportMessage=z.infer<typeof SupportMessageSchema>;
export type SupportNote=z.infer<typeof SupportNoteSchema>;
export type SupportAudit=z.infer<typeof SupportAuditSchema>;
