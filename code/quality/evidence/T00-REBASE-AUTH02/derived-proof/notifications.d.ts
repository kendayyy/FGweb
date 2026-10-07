import { z } from 'zod';
export declare const NotificationTypeSchema: z.ZodEnum<{
    DM: "DM";
    MENTION: "MENTION";
    FRIEND_INVITE: "FRIEND_INVITE";
    ROOM_INVITE: "ROOM_INVITE";
    TEAM_INVITE: "TEAM_INVITE";
    JOIN_REQUEST: "JOIN_REQUEST";
    JOIN_REQUEST_RESULT: "JOIN_REQUEST_RESULT";
    REMINDER_10MIN: "REMINDER_10MIN";
}>;
export type NotificationType = z.infer<typeof NotificationTypeSchema>;
export declare const DMNotificationDataSchema: z.ZodObject<{
    conversationId: z.ZodString;
    messageId: z.ZodString;
    senderId: z.ZodString;
}, z.core.$strip>;
export declare const MentionNotificationDataSchema: z.ZodObject<{
    conversationId: z.ZodString;
    messageId: z.ZodString;
    mentionerId: z.ZodString;
}, z.core.$strip>;
export declare const FriendInviteNotificationDataSchema: z.ZodObject<{
    requestId: z.ZodString;
    senderId: z.ZodString;
}, z.core.$strip>;
export declare const RoomInviteNotificationDataSchema: z.ZodObject<{
    invitationId: z.ZodString;
    roomId: z.ZodString;
    senderId: z.ZodString;
}, z.core.$strip>;
export declare const TeamInviteNotificationDataSchema: z.ZodObject<{
    invitationId: z.ZodString;
    roomId: z.ZodString;
    playSessionId: z.ZodString;
    senderId: z.ZodString;
}, z.core.$strip>;
export declare const JoinRequestNotificationDataSchema: z.ZodObject<{
    requestId: z.ZodString;
    recruitmentId: z.ZodString;
    applicantId: z.ZodString;
}, z.core.$strip>;
export declare const JoinRequestResultNotificationDataSchema: z.ZodObject<{
    requestId: z.ZodString;
    recruitmentId: z.ZodString;
    result: z.ZodEnum<{
        ACCEPTED: "ACCEPTED";
        REJECTED: "REJECTED";
    }>;
}, z.core.$strip>;
export declare const Reminder10MinNotificationDataSchema: z.ZodObject<{
    playSessionId: z.ZodString;
    roomId: z.ZodString;
    scheduledAt: z.ZodString;
}, z.core.$strip>;
export declare const NotificationDataSchema: z.ZodUnion<readonly [z.ZodObject<{
    conversationId: z.ZodString;
    messageId: z.ZodString;
    senderId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    conversationId: z.ZodString;
    messageId: z.ZodString;
    mentionerId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    requestId: z.ZodString;
    senderId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    invitationId: z.ZodString;
    roomId: z.ZodString;
    senderId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    invitationId: z.ZodString;
    roomId: z.ZodString;
    playSessionId: z.ZodString;
    senderId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    requestId: z.ZodString;
    recruitmentId: z.ZodString;
    applicantId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    requestId: z.ZodString;
    recruitmentId: z.ZodString;
    result: z.ZodEnum<{
        ACCEPTED: "ACCEPTED";
        REJECTED: "REJECTED";
    }>;
}, z.core.$strip>, z.ZodObject<{
    playSessionId: z.ZodString;
    roomId: z.ZodString;
    scheduledAt: z.ZodString;
}, z.core.$strip>]>;
export type NotificationDataDTO = z.infer<typeof NotificationDataSchema>;
export declare const DMNotificationSchema: z.ZodObject<{
    type: z.ZodLiteral<"DM">;
    data: z.ZodObject<{
        conversationId: z.ZodString;
        messageId: z.ZodString;
        senderId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const MentionNotificationSchema: z.ZodObject<{
    type: z.ZodLiteral<"MENTION">;
    data: z.ZodObject<{
        conversationId: z.ZodString;
        messageId: z.ZodString;
        mentionerId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const FriendInviteNotificationSchema: z.ZodObject<{
    type: z.ZodLiteral<"FRIEND_INVITE">;
    data: z.ZodObject<{
        requestId: z.ZodString;
        senderId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const RoomInviteNotificationSchema: z.ZodObject<{
    type: z.ZodLiteral<"ROOM_INVITE">;
    data: z.ZodObject<{
        invitationId: z.ZodString;
        roomId: z.ZodString;
        senderId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const TeamInviteNotificationSchema: z.ZodObject<{
    type: z.ZodLiteral<"TEAM_INVITE">;
    data: z.ZodObject<{
        invitationId: z.ZodString;
        roomId: z.ZodString;
        playSessionId: z.ZodString;
        senderId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const JoinRequestNotificationSchema: z.ZodObject<{
    type: z.ZodLiteral<"JOIN_REQUEST">;
    data: z.ZodObject<{
        requestId: z.ZodString;
        recruitmentId: z.ZodString;
        applicantId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const JoinRequestResultNotificationSchema: z.ZodObject<{
    type: z.ZodLiteral<"JOIN_REQUEST_RESULT">;
    data: z.ZodObject<{
        requestId: z.ZodString;
        recruitmentId: z.ZodString;
        result: z.ZodEnum<{
            ACCEPTED: "ACCEPTED";
            REJECTED: "REJECTED";
        }>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const Reminder10MinNotificationSchema: z.ZodObject<{
    type: z.ZodLiteral<"REMINDER_10MIN">;
    data: z.ZodObject<{
        playSessionId: z.ZodString;
        roomId: z.ZodString;
        scheduledAt: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const NotificationTypedPayloadUnion: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"DM">;
    data: z.ZodObject<{
        conversationId: z.ZodString;
        messageId: z.ZodString;
        senderId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"MENTION">;
    data: z.ZodObject<{
        conversationId: z.ZodString;
        messageId: z.ZodString;
        mentionerId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"FRIEND_INVITE">;
    data: z.ZodObject<{
        requestId: z.ZodString;
        senderId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"ROOM_INVITE">;
    data: z.ZodObject<{
        invitationId: z.ZodString;
        roomId: z.ZodString;
        senderId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"TEAM_INVITE">;
    data: z.ZodObject<{
        invitationId: z.ZodString;
        roomId: z.ZodString;
        playSessionId: z.ZodString;
        senderId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"JOIN_REQUEST">;
    data: z.ZodObject<{
        requestId: z.ZodString;
        recruitmentId: z.ZodString;
        applicantId: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"JOIN_REQUEST_RESULT">;
    data: z.ZodObject<{
        requestId: z.ZodString;
        recruitmentId: z.ZodString;
        result: z.ZodEnum<{
            ACCEPTED: "ACCEPTED";
            REJECTED: "REJECTED";
        }>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"REMINDER_10MIN">;
    data: z.ZodObject<{
        playSessionId: z.ZodString;
        roomId: z.ZodString;
        scheduledAt: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>], "type">;
export declare const NotificationSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    type: z.ZodEnum<{
        DM: "DM";
        MENTION: "MENTION";
        FRIEND_INVITE: "FRIEND_INVITE";
        ROOM_INVITE: "ROOM_INVITE";
        TEAM_INVITE: "TEAM_INVITE";
        JOIN_REQUEST: "JOIN_REQUEST";
        JOIN_REQUEST_RESULT: "JOIN_REQUEST_RESULT";
        REMINDER_10MIN: "REMINDER_10MIN";
    }>;
    title: z.ZodString;
    body: z.ZodString;
    data: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
        conversationId: z.ZodString;
        messageId: z.ZodString;
        senderId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        conversationId: z.ZodString;
        messageId: z.ZodString;
        mentionerId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        requestId: z.ZodString;
        senderId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        invitationId: z.ZodString;
        roomId: z.ZodString;
        senderId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        invitationId: z.ZodString;
        roomId: z.ZodString;
        playSessionId: z.ZodString;
        senderId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        requestId: z.ZodString;
        recruitmentId: z.ZodString;
        applicantId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        requestId: z.ZodString;
        recruitmentId: z.ZodString;
        result: z.ZodEnum<{
            ACCEPTED: "ACCEPTED";
            REJECTED: "REJECTED";
        }>;
    }, z.core.$strip>, z.ZodObject<{
        playSessionId: z.ZodString;
        roomId: z.ZodString;
        scheduledAt: z.ZodString;
    }, z.core.$strip>]>>;
    isRead: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type NotificationDTO = z.infer<typeof NotificationSchema>;
export declare const EmailAllowedChannelPreferencesSchema: z.ZodObject<{
    inApp: z.ZodDefault<z.ZodBoolean>;
    push: z.ZodDefault<z.ZodBoolean>;
    email: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const EmailForbiddenChannelPreferencesSchema: z.ZodObject<{
    inApp: z.ZodDefault<z.ZodBoolean>;
    push: z.ZodDefault<z.ZodBoolean>;
    email: z.ZodDefault<z.ZodLiteral<false>>;
}, z.core.$strip>;
export declare const NotificationPreferencesSchema: z.ZodObject<{
    DM: z.ZodObject<{
        inApp: z.ZodDefault<z.ZodBoolean>;
        push: z.ZodDefault<z.ZodBoolean>;
        email: z.ZodDefault<z.ZodLiteral<false>>;
    }, z.core.$strip>;
    MENTION: z.ZodObject<{
        inApp: z.ZodDefault<z.ZodBoolean>;
        push: z.ZodDefault<z.ZodBoolean>;
        email: z.ZodDefault<z.ZodLiteral<false>>;
    }, z.core.$strip>;
    FRIEND_INVITE: z.ZodObject<{
        inApp: z.ZodDefault<z.ZodBoolean>;
        push: z.ZodDefault<z.ZodBoolean>;
        email: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
    ROOM_INVITE: z.ZodObject<{
        inApp: z.ZodDefault<z.ZodBoolean>;
        push: z.ZodDefault<z.ZodBoolean>;
        email: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
    TEAM_INVITE: z.ZodObject<{
        inApp: z.ZodDefault<z.ZodBoolean>;
        push: z.ZodDefault<z.ZodBoolean>;
        email: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
    JOIN_REQUEST: z.ZodObject<{
        inApp: z.ZodDefault<z.ZodBoolean>;
        push: z.ZodDefault<z.ZodBoolean>;
        email: z.ZodDefault<z.ZodLiteral<false>>;
    }, z.core.$strip>;
    JOIN_REQUEST_RESULT: z.ZodObject<{
        inApp: z.ZodDefault<z.ZodBoolean>;
        push: z.ZodDefault<z.ZodBoolean>;
        email: z.ZodDefault<z.ZodLiteral<false>>;
    }, z.core.$strip>;
    REMINDER_10MIN: z.ZodObject<{
        inApp: z.ZodDefault<z.ZodBoolean>;
        push: z.ZodDefault<z.ZodBoolean>;
        email: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type NotificationPreferencesDTO = z.infer<typeof NotificationPreferencesSchema>;
export declare const WebPushSubscriptionSchema: z.ZodObject<{
    endpoint: z.ZodString;
    keys: z.ZodObject<{
        p256dh: z.ZodString;
        auth: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type WebPushSubscriptionDTO = z.infer<typeof WebPushSubscriptionSchema>;
