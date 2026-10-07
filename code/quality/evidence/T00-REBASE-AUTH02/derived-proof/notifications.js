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
    RoomInviteNotificationDataSchema,
    TeamInviteNotificationDataSchema,
    JoinRequestNotificationDataSchema,
    JoinRequestResultNotificationDataSchema,
    Reminder10MinNotificationDataSchema,
]);
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
export const WebPushSubscriptionSchema = z.object({
    endpoint: z.string().url(),
    keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
    }),
});
