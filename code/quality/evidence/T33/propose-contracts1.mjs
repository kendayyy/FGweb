import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const d='quality/evidence/T33',h=s=>createHash('sha256').update(s).digest('hex'),files=[];
function propose(path,edit){const old=fs.readFileSync(path,'utf8'),next=edit(old);assert.notEqual(old,next);const proposed=d+'/contract-proposals1/'+path;fs.mkdirSync(proposed.slice(0,proposed.lastIndexOf('/')),{recursive:true});fs.writeFileSync(proposed,next,{flag:'wx'});files.push({path,proposed,beforeSha256:h(old),afterSha256:h(next)});}
function replace(s,from,to){assert.equal(s.split(from).length,2,'Unique anchor '+from);return s.replace(from,()=>to);}
propose('packages/contracts/src/notifications.ts',s=>s+`
// T33: partial per-event saves never manufacture changes to omitted channels.
const AllowedPreferencePatchSchema = z.object({inApp:z.boolean().optional(),push:z.boolean().optional(),email:z.boolean().optional()}).strict().refine(value => Object.keys(value).length > 0, 'Choose at least one channel');
const ForbiddenEmailPreferencePatchSchema = z.object({inApp:z.boolean().optional(),push:z.boolean().optional(),email:z.literal(false).optional()}).strict().refine(value => Object.keys(value).length > 0, 'Choose at least one channel');
export const NotificationPreferencesPatchSchema = z.object({
 DM:ForbiddenEmailPreferencePatchSchema.optional(),MENTION:ForbiddenEmailPreferencePatchSchema.optional(),
 FRIEND_INVITE:AllowedPreferencePatchSchema.optional(),ROOM_INVITE:AllowedPreferencePatchSchema.optional(),TEAM_INVITE:AllowedPreferencePatchSchema.optional(),
 JOIN_REQUEST:ForbiddenEmailPreferencePatchSchema.optional(),JOIN_REQUEST_RESULT:ForbiddenEmailPreferencePatchSchema.optional(),REMINDER_10MIN:AllowedPreferencePatchSchema.optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Choose at least one notification type');
export type NotificationPreferencesPatch = z.infer<typeof NotificationPreferencesPatchSchema>;
export const NotificationUnreadCountSchema = z.object({unreadCount:z.number().int().min(0)}).strict();
export type NotificationUnreadCountDTO = z.infer<typeof NotificationUnreadCountSchema>;
export const NotificationReadAllResultSchema = z.object({updatedCount:z.number().int().min(0)}).strict();
`);
propose('packages/contracts/src/index.ts',s=>{
 s=replace(s,"import { NotificationSchema, NotificationPreferencesSchema, WebPushSubscriptionSchema } from './notifications.js';","import { NotificationSchema, NotificationPreferencesSchema, NotificationPreferencesPatchSchema, NotificationUnreadCountSchema, NotificationReadAllResultSchema, WebPushSubscriptionSchema } from './notifications.js';");
 s=replace(s,"  { method: 'GET', path: '/api/v1/notifications/preferences', auth: 'Authenticated', responseSchema: NotificationPreferencesSchema },","  { method: 'GET', path: '/api/v1/notifications/unread-count', auth: 'Authenticated', responseSchema: NotificationUnreadCountSchema },\n  { method: 'GET', path: '/api/v1/notifications/preferences', auth: 'Authenticated', responseSchema: NotificationPreferencesSchema },");
 s=replace(s,"  { method: 'PATCH', path: '/api/v1/notifications/preferences', auth: 'Authenticated', requestSchema: NotificationPreferencesSchema, responseSchema: NotificationPreferencesSchema },","  { method: 'PATCH', path: '/api/v1/notifications/preferences', auth: 'Authenticated', requestSchema: NotificationPreferencesPatchSchema, responseSchema: NotificationPreferencesSchema },");
 return replace(s,"  { method: 'PATCH', path: '/api/v1/notifications/read-all', auth: 'Authenticated', responseSchema: z.object({ updatedCount: z.number() }) },","  { method: 'PATCH', path: '/api/v1/notifications/read-all', auth: 'Authenticated', responseSchema: NotificationReadAllResultSchema },");
});
fs.writeFileSync(d+'/contracts-adoption-plan1.json',JSON.stringify({reviewer:'Codex',unresolvedSourceFindings:[],reason:'Approved T33 unread-count and safe per-event/channel partial preferences; retain existing full preference DTO and all old valid full request objects, add formal nonnegative read-count responses. No actor authority from input or forbidden email types.',files},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({proposed:files.length,applied:false}));
