import { z } from 'zod';
export declare const ReportTargetTypeSchema: z.ZodEnum<{
    USER: "USER";
    MESSAGE: "MESSAGE";
}>;
export type ReportTargetType = z.infer<typeof ReportTargetTypeSchema>;
export declare const ReportStatusSchema: z.ZodEnum<{
    PENDING: "PENDING";
    RESOLVED: "RESOLVED";
    DISMISSED: "DISMISSED";
}>;
export type ReportStatus = z.infer<typeof ReportStatusSchema>;
export declare const ReportSchema: z.ZodObject<{
    id: z.ZodString;
    reporterId: z.ZodString;
    targetType: z.ZodEnum<{
        USER: "USER";
        MESSAGE: "MESSAGE";
    }>;
    targetId: z.ZodString;
    reason: z.ZodString;
    details: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<{
        PENDING: "PENDING";
        RESOLVED: "RESOLVED";
        DISMISSED: "DISMISSED";
    }>>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type ReportDTO = z.infer<typeof ReportSchema>;
export declare const CreateReportRequestSchema: z.ZodObject<{
    targetType: z.ZodEnum<{
        USER: "USER";
        MESSAGE: "MESSAGE";
    }>;
    targetId: z.ZodString;
    reason: z.ZodString;
    details: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CreateReportRequest = z.infer<typeof CreateReportRequestSchema>;
export declare const BlockSchema: z.ZodObject<{
    id: z.ZodString;
    blockerId: z.ZodString;
    blockedId: z.ZodString;
    blockedUser: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type BlockDTO = z.infer<typeof BlockSchema>;
export declare const CreateBlockRequestSchema: z.ZodObject<{
    blockedId: z.ZodString;
}, z.core.$strip>;
export type CreateBlockRequest = z.infer<typeof CreateBlockRequestSchema>;
export declare const SendFriendRequestSchema: z.ZodObject<{
    targetUserId: z.ZodString;
}, z.core.$strip>;
export type SendFriendRequest = z.infer<typeof SendFriendRequestSchema>;
export declare const ListFriendsQuerySchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type ListFriendsQuery = z.infer<typeof ListFriendsQuerySchema>;
export declare const ListFriendRequestsQuerySchema: z.ZodObject<{
    direction: z.ZodDefault<z.ZodEnum<{
        INCOMING: "INCOMING";
        OUTGOING: "OUTGOING";
    }>>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type ListFriendRequestsQuery = z.infer<typeof ListFriendRequestsQuerySchema>;
export declare const PendingFriendRequestSchema: z.ZodObject<{
    requestId: z.ZodString;
    sender: z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>;
    receiver: z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>;
    status: z.ZodLiteral<"PENDING">;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type PendingFriendRequestDTO = z.infer<typeof PendingFriendRequestSchema>;
export type PendingFriendRequest = PendingFriendRequestDTO;
export declare const RespondFriendRequestSchema: z.ZodObject<{
    action: z.ZodEnum<{
        ACCEPT: "ACCEPT";
        REJECT: "REJECT";
    }>;
}, z.core.$strip>;
export type RespondFriendRequest = z.infer<typeof RespondFriendRequestSchema>;
export declare const RemoveFriendSchema: z.ZodObject<{
    friendUserId: z.ZodString;
}, z.core.$strip>;
export type RemoveFriendRequest = z.infer<typeof RemoveFriendSchema>;
export declare const CancelFriendRequestSchema: z.ZodObject<{
    requestId: z.ZodString;
}, z.core.$strip>;
export type CancelFriendRequest = z.infer<typeof CancelFriendRequestSchema>;
export declare const CreateDirectConversationSchema: z.ZodObject<{
    recipientUserId: z.ZodString;
}, z.core.$strip>;
export type CreateDirectConversationRequest = z.infer<typeof CreateDirectConversationSchema>;
export declare const ListDirectConversationsQuerySchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type ListDirectConversationsQuery = z.infer<typeof ListDirectConversationsQuerySchema>;
export declare const ListAdminReportsQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        PENDING: "PENDING";
        RESOLVED: "RESOLVED";
        DISMISSED: "DISMISSED";
    }>>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type ListAdminReportsQuery = z.infer<typeof ListAdminReportsQuerySchema>;
export declare const UpdateAdminReportSchema: z.ZodObject<{
    status: z.ZodEnum<{
        RESOLVED: "RESOLVED";
        DISMISSED: "DISMISSED";
    }>;
}, z.core.$strip>;
export type UpdateAdminReportRequest = z.infer<typeof UpdateAdminReportSchema>;
export declare const ListAdminUsersQuerySchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type ListAdminUsersQuery = z.infer<typeof ListAdminUsersQuerySchema>;
export declare const AdminUserActionRequestSchema: z.ZodObject<{
    action: z.ZodEnum<{
        BAN: "BAN";
        UNBAN: "UNBAN";
    }>;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AdminUserActionRequest = z.infer<typeof AdminUserActionRequestSchema>;
