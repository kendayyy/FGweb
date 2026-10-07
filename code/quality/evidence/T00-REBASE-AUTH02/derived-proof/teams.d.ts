import { z } from 'zod';
export declare const PlaySessionStateSchema: z.ZodEnum<{
    SCHEDULED: "SCHEDULED";
    ACTIVE: "ACTIVE";
    ENDED: "ENDED";
}>;
export type PlaySessionState = z.infer<typeof PlaySessionStateSchema>;
export declare const RecruitmentStateSchema: z.ZodEnum<{
    OPEN: "OPEN";
    CLOSED: "CLOSED";
}>;
export type RecruitmentState = z.infer<typeof RecruitmentStateSchema>;
export declare const JoinRequestStateSchema: z.ZodEnum<{
    PENDING: "PENDING";
    ACCEPTED: "ACCEPTED";
    REJECTED: "REJECTED";
    CANCELLED: "CANCELLED";
}>;
export type JoinRequestState = z.infer<typeof JoinRequestStateSchema>;
export declare const InviteTargetSchema: z.ZodEnum<{
    ROOM: "ROOM";
    PLAY_SESSION: "PLAY_SESSION";
}>;
export type InviteTarget = z.infer<typeof InviteTargetSchema>;
export declare const InvitationApprovalPermissionByTarget: Readonly<{
    readonly ROOM: "MANAGE_MEMBERS";
    readonly PLAY_SESSION: "MANAGE_RECRUITMENT";
}>;
export declare const InvitationStatusSchema: z.ZodEnum<{
    PENDING: "PENDING";
    ACCEPTED: "ACCEPTED";
    REJECTED: "REJECTED";
    CANCELLED: "CANCELLED";
}>;
export type InvitationStatus = z.infer<typeof InvitationStatusSchema>;
export declare const PlaySessionRosterSchema: z.ZodObject<{
    playSessionId: z.ZodString;
    userId: z.ZodString;
    user: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>;
    slotIndex: z.ZodNumber;
    isHost: z.ZodBoolean;
    joinedAt: z.ZodString;
}, z.core.$strip>;
export type PlaySessionRosterDTO = z.infer<typeof PlaySessionRosterSchema>;
export declare const PlaySessionSchema: z.ZodObject<{
    id: z.ZodString;
    roomId: z.ZodString;
    hostUserId: z.ZodString;
    timingType: z.ZodEnum<{
        now: "now";
        scheduledAt: "scheduledAt";
    }>;
    scheduledAt: z.ZodOptional<z.ZodString>;
    state: z.ZodEnum<{
        SCHEDULED: "SCHEDULED";
        ACTIVE: "ACTIVE";
        ENDED: "ENDED";
    }>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type PlaySessionDTO = z.infer<typeof PlaySessionSchema>;
export declare const RecruitmentSchema: z.ZodObject<{
    id: z.ZodString;
    roomId: z.ZodString;
    gameId: z.ZodString;
    gameTitle: z.ZodEnum<{
        "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
        Valorant: "Valorant";
        "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
        "Dota 2": "Dota 2";
        Roblox: "Roblox";
        "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
        "Free Fire": "Free Fire";
    }>;
    title: z.ZodString;
    mode: z.ZodString;
    playerCapacity: z.ZodNumber;
    currentPlayers: z.ZodDefault<z.ZodNumber>;
    timingType: z.ZodEnum<{
        now: "now";
        scheduledAt: "scheduledAt";
    }>;
    scheduledAt: z.ZodOptional<z.ZodString>;
    requirementText: z.ZodOptional<z.ZodString>;
    experienceName: z.ZodOptional<z.ZodString>;
    experienceUrl: z.ZodOptional<z.ZodString>;
    state: z.ZodEnum<{
        OPEN: "OPEN";
        CLOSED: "CLOSED";
    }>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type RecruitmentDTO = z.infer<typeof RecruitmentSchema>;
export declare function CreateRecruitmentSchema(clock?: Date | (() => Date)): z.ZodObject<{
    roomId: z.ZodOptional<z.ZodString>;
    gameId: z.ZodString;
    gameTitle: z.ZodEnum<{
        "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
        Valorant: "Valorant";
        "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
        "Dota 2": "Dota 2";
        Roblox: "Roblox";
        "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
        "Free Fire": "Free Fire";
    }>;
    title: z.ZodString;
    mode: z.ZodString;
    playerCapacity: z.ZodNumber;
    timingType: z.ZodEnum<{
        now: "now";
        scheduledAt: "scheduledAt";
    }>;
    scheduledAt: z.ZodOptional<z.ZodString>;
    requirementText: z.ZodOptional<z.ZodString>;
    experienceName: z.ZodOptional<z.ZodString>;
    experienceUrl: z.ZodOptional<z.ZodString>;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const JoinRequestSchema: z.ZodObject<{
    id: z.ZodString;
    recruitmentId: z.ZodString;
    applicantId: z.ZodString;
    applicant: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>;
    status: z.ZodEnum<{
        PENDING: "PENDING";
        ACCEPTED: "ACCEPTED";
        REJECTED: "REJECTED";
        CANCELLED: "CANCELLED";
    }>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type JoinRequestDTO = z.infer<typeof JoinRequestSchema>;
export declare const RoomInvitationSchema: z.ZodObject<{
    id: z.ZodString;
    targetType: z.ZodLiteral<"ROOM">;
    senderId: z.ZodString;
    sender: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>;
    receiverId: z.ZodString;
    receiver: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>;
    roomId: z.ZodString;
    status: z.ZodEnum<{
        PENDING: "PENDING";
        ACCEPTED: "ACCEPTED";
        REJECTED: "REJECTED";
        CANCELLED: "CANCELLED";
    }>;
    recipientAcceptedAt: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export declare const PlaySessionInvitationSchema: z.ZodObject<{
    id: z.ZodString;
    targetType: z.ZodLiteral<"PLAY_SESSION">;
    senderId: z.ZodString;
    sender: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>;
    receiverId: z.ZodString;
    receiver: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>;
    roomId: z.ZodString;
    playSessionId: z.ZodString;
    status: z.ZodEnum<{
        PENDING: "PENDING";
        ACCEPTED: "ACCEPTED";
        REJECTED: "REJECTED";
        CANCELLED: "CANCELLED";
    }>;
    recipientAcceptedAt: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export declare const InvitationSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodString;
    targetType: z.ZodLiteral<"ROOM">;
    senderId: z.ZodString;
    sender: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>;
    receiverId: z.ZodString;
    receiver: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>;
    roomId: z.ZodString;
    status: z.ZodEnum<{
        PENDING: "PENDING";
        ACCEPTED: "ACCEPTED";
        REJECTED: "REJECTED";
        CANCELLED: "CANCELLED";
    }>;
    recipientAcceptedAt: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    targetType: z.ZodLiteral<"PLAY_SESSION">;
    senderId: z.ZodString;
    sender: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>;
    receiverId: z.ZodString;
    receiver: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>;
    roomId: z.ZodString;
    playSessionId: z.ZodString;
    status: z.ZodEnum<{
        PENDING: "PENDING";
        ACCEPTED: "ACCEPTED";
        REJECTED: "REJECTED";
        CANCELLED: "CANCELLED";
    }>;
    recipientAcceptedAt: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>], "targetType">;
export type InvitationDTO = z.infer<typeof InvitationSchema>;
export declare const CreateInvitationRequestSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    targetType: z.ZodLiteral<"ROOM">;
    receiverId: z.ZodString;
    roomId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    targetType: z.ZodLiteral<"PLAY_SESSION">;
    receiverId: z.ZodString;
    roomId: z.ZodString;
    playSessionId: z.ZodString;
}, z.core.$strict>], "targetType">;
export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequestSchema>;
export declare const RespondJoinRequestSchema: z.ZodObject<{
    action: z.ZodEnum<{
        ACCEPT: "ACCEPT";
        REJECT: "REJECT";
    }>;
}, z.core.$strip>;
export type RespondJoinRequest = z.infer<typeof RespondJoinRequestSchema>;
export declare const PlaySessionActionRequestSchema: z.ZodDefault<z.ZodObject<{}, z.core.$strict>>;
export type PlaySessionActionRequest = z.infer<typeof PlaySessionActionRequestSchema>;
export declare const PlaySessionRequestDecisionSchema: z.ZodObject<{
    action: z.ZodEnum<{
        ACCEPT: "ACCEPT";
        REJECT: "REJECT";
    }>;
}, z.core.$strict>;
export type PlaySessionRequestDecision = z.infer<typeof PlaySessionRequestDecisionSchema>;
export declare const ListRoomPlaySessionsQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    cursor: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type ListRoomPlaySessionsQuery = z.infer<typeof ListRoomPlaySessionsQuerySchema>;
export declare const RespondInvitationSchema: z.ZodObject<{
    action: z.ZodEnum<{
        ACCEPT: "ACCEPT";
        REJECT: "REJECT";
    }>;
}, z.core.$strict>;
export type RespondInvitation = z.infer<typeof RespondInvitationSchema>;
export declare const CancelJoinRequestSchema: z.ZodObject<{
    requestId: z.ZodString;
}, z.core.$strip>;
export type CancelJoinRequest = z.infer<typeof CancelJoinRequestSchema>;
export declare const ApproveInvitationSchema: z.ZodObject<{
    invitationId: z.ZodString;
    action: z.ZodEnum<{
        ACCEPT: "ACCEPT";
        REJECT: "REJECT";
    }>;
}, z.core.$strict>;
export type ApproveInvitation = z.infer<typeof ApproveInvitationSchema>;
export declare const PublicRecruitmentSchema: z.ZodObject<{
    id: z.ZodString;
    roomId: z.ZodString;
    gameId: z.ZodString;
    gameTitle: z.ZodEnum<{
        "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
        Valorant: "Valorant";
        "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
        "Dota 2": "Dota 2";
        Roblox: "Roblox";
        "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
        "Free Fire": "Free Fire";
    }>;
    title: z.ZodString;
    mode: z.ZodString;
    playerCapacity: z.ZodNumber;
    currentPlayers: z.ZodDefault<z.ZodNumber>;
    timingType: z.ZodEnum<{
        now: "now";
        scheduledAt: "scheduledAt";
    }>;
    scheduledAt: z.ZodOptional<z.ZodString>;
    requirementText: z.ZodOptional<z.ZodString>;
    experienceName: z.ZodOptional<z.ZodString>;
    experienceUrl: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    state: z.ZodLiteral<"OPEN">;
    visibility: z.ZodLiteral<"PUBLIC">;
}, z.core.$strip>;
export type PublicRecruitmentDTO = z.infer<typeof PublicRecruitmentSchema>;
export declare const PublicRecruitmentQuerySchema: z.ZodObject<{
    gameId: z.ZodOptional<z.ZodString>;
    gameTitle: z.ZodOptional<z.ZodEnum<{
        "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
        Valorant: "Valorant";
        "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
        "Dota 2": "Dota 2";
        Roblox: "Roblox";
        "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
        "Free Fire": "Free Fire";
    }>>;
    mode: z.ZodOptional<z.ZodString>;
    timingType: z.ZodOptional<z.ZodEnum<{
        now: "now";
        scheduledAt: "scheduledAt";
    }>>;
    state: z.ZodDefault<z.ZodLiteral<"OPEN">>;
    visibility: z.ZodDefault<z.ZodLiteral<"PUBLIC">>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
