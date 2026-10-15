import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';

export const NotificationTypeSchema = z.enum([
  'DM',
  'MENTION',
  'FRIEND_INVITE',
  'ROOM_INVITE',
  'TEAM_INVITE',
  'JOIN_REQUEST',
  'JOIN_REQUEST_RESULT',
  'REMINDER_10MIN',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const DMNotificationDataSchema = z.object({
  conversationId: IdSchema,
  messageId: IdSchema,
  senderId: IdSchema,
});

export const MentionNotificationDataSchema = z.object({
  conversationId: IdSchema,
  messageId: IdSchema,
  mentionerId: IdSchema,
});

export const FriendInviteNotificationDataSchema = z.object({
  requestId: IdSchema,
  senderId: IdSchema,
});

export const RoomInviteNotificationDataSchema = z.object({
  invitationId: IdSchema,
  roomId: IdSchema,
  senderId: IdSchema,
});

export const TeamInviteNotificationDataSchema = z.object({
  invitationId: IdSchema,
  roomId: IdSchema,
  playSessionId: IdSchema,
  senderId: IdSchema,
});

export const JoinRequestNotificationDataSchema = z.object({
  requestId: IdSchema,
  recruitmentId: IdSchema,
  applicantId: IdSchema,
});

export const JoinRequestResultNotificationDataSchema = z.object({
  requestId: IdSchema,
  recruitmentId: IdSchema,
  result: z.enum(['ACCEPTED', 'REJECTED']),
});

export const Reminder10MinNotificationDataSchema = z.object({
  playSessionId: IdSchema,
  roomId: IdSchema,
  scheduledAt: IsoDateTimeSchema,
});

export const NotificationDataSchema = z.union([
  DMNotificationDataSchema,
  MentionNotificationDataSchema,
  FriendInviteNotificationDataSchema,
  TeamInviteNotificationDataSchema,
  RoomInviteNotificationDataSchema,
  JoinRequestNotificationDataSchema,
  JoinRequestResultNotificationDataSchema,
  Reminder10MinNotificationDataSchema,
]);
export type NotificationDataDTO = z.infer<typeof NotificationDataSchema>;

export const DMNotificationSchema = z.object({
  type: z.literal('DM'),
  data: DMNotificationDataSchema,
});

export const MentionNotificationSchema = z.object({
  type: z.literal('MENTION'),
  data: MentionNotificationDataSchema,
});

export const FriendInviteNotificationSchema = z.object({
  type: z.literal('FRIEND_INVITE'),
  data: FriendInviteNotificationDataSchema,
});

export const RoomInviteNotificationSchema = z.object({
  type: z.literal('ROOM_INVITE'),
  data: RoomInviteNotificationDataSchema,
});

export const TeamInviteNotificationSchema = z.object({
  type: z.literal('TEAM_INVITE'),
  data: TeamInviteNotificationDataSchema,
});

export const JoinRequestNotificationSchema = z.object({
  type: z.literal('JOIN_REQUEST'),
  data: JoinRequestNotificationDataSchema,
});

export const JoinRequestResultNotificationSchema = z.object({
  type: z.literal('JOIN_REQUEST_RESULT'),
  data: JoinRequestResultNotificationDataSchema,
});

export const Reminder10MinNotificationSchema = z.object({
  type: z.literal('REMINDER_10MIN'),
  data: Reminder10MinNotificationDataSchema,
});

export const NotificationTypedPayloadUnion = z.discriminatedUnion('type', [
  DMNotificationSchema,
  MentionNotificationSchema,
  FriendInviteNotificationSchema,
  RoomInviteNotificationSchema,
  TeamInviteNotificationSchema,
  JoinRequestNotificationSchema,
  JoinRequestResultNotificationSchema,
  Reminder10MinNotificationSchema,
]);

export const NotificationSchema = z
  .object({
    id: IdSchema,
    userId: IdSchema,
    type: NotificationTypeSchema,
    title: z.string().min(1),
    body: z.string().min(1),
    data: NotificationDataSchema.optional(),
    isRead: z.boolean().default(false),
    createdAt: IsoDateTimeSchema,
  })
  .superRefine((data, ctx) => {
    if (data.data) {
      const pairedCheck = NotificationTypedPayloadUnion.safeParse({
        type: data.type,
        data: data.data,
      });
      if (!pairedCheck.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Notification data payload does not match notification type '${data.type}'`,
          path: ['data'],
        });
      }
    }
  });
export type NotificationDTO = z.infer<typeof NotificationSchema>;

export const EmailAllowedChannelPreferencesSchema = z.object({
  inApp: z.boolean().default(true),
  push: z.boolean().default(true),
  email: z.boolean().default(true),
});

export const EmailForbiddenChannelPreferencesSchema = z.object({
  inApp: z.boolean().default(true),
  push: z.boolean().default(true),
  email: z.literal(false).default(false),
});

export const NotificationPreferencesSchema = z.object({
  DM: EmailForbiddenChannelPreferencesSchema,
  MENTION: EmailForbiddenChannelPreferencesSchema,
  FRIEND_INVITE: EmailAllowedChannelPreferencesSchema,
  ROOM_INVITE: EmailAllowedChannelPreferencesSchema,
  TEAM_INVITE: EmailAllowedChannelPreferencesSchema,
  JOIN_REQUEST: EmailForbiddenChannelPreferencesSchema,
  JOIN_REQUEST_RESULT: EmailForbiddenChannelPreferencesSchema,
  REMINDER_10MIN: EmailAllowedChannelPreferencesSchema,
});
export type NotificationPreferencesDTO = z.infer<typeof NotificationPreferencesSchema>;

export const WebPushEndpointSchema=z.string().min(1).max(2048).url().refine(value=>{
 try{const u=new URL(value);if(value.trim()!==value||Array.from(value).some(c=>c.charCodeAt(0)<33||c.charCodeAt(0)===127)||u.protocol!=='https:'||u.username||u.password||u.hash||u.port||u.pathname==='/')return false;
 if(u.hostname==='fcm.googleapis.com')return /^\/(wp|fcm\/send)\//.test(u.pathname);
 return u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||/^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname);
 }catch{return false;}
},'Supported HTTPS browser Push endpoint required');
export const WebPushSubscriptionSchema=z.object({endpoint:WebPushEndpointSchema,keys:z.object({p256dh:z.string().regex(/^B[A-Za-z0-9_-]{86}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{21}[AQgw]$/)}).strict()}).strict();
export const WebPushUnsubscribeSchema=z.object({endpoint:WebPushEndpointSchema}).strict();
export const WebPushConfigSchema=z.discriminatedUnion('available',[z.object({available:z.literal(true),publicKey:z.string().regex(/^B[A-Za-z0-9_-]{86}$/)}).strict(),z.object({available:z.literal(false)}).strict()]);
export type WebPushSubscriptionDTO = z.infer<typeof WebPushSubscriptionSchema>;

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
