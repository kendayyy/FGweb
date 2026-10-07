import { z } from 'zod';
export * from './common.js';
export * from './auth.js';
export * from './profiles.js';
export * from './presence.js';
export * from './messages.js';
export * from './uploads.js';
export * from './rooms.js';
export * from './teams.js';
export * from './calls.js';
export * from './notifications.js';
export * from './moderation.js';
export declare const SocketMessageCreatedPayloadSchema: z.ZodObject<{
    id: z.ZodString;
    conversationId: z.ZodString;
    senderId: z.ZodString;
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
    content: z.ZodString;
    attachments: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        url: z.ZodString;
        fileName: z.ZodString;
        fileSize: z.ZodNumber;
        mimeType: z.ZodEnum<{
            "image/jpeg": "image/jpeg";
            "image/png": "image/png";
            "image/webp": "image/webp";
        }>;
    }, z.core.$strip>>>;
    mentions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>>;
    mentionedUserIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    replyToId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodString;
    updatedAt: z.ZodOptional<z.ZodString>;
    replyToMessage: z.ZodLazy<z.ZodOptional<z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        conversationId: z.ZodString;
        senderId: z.ZodString;
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
        content: z.ZodString;
        attachments: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            url: z.ZodString;
            fileName: z.ZodString;
            fileSize: z.ZodNumber;
            mimeType: z.ZodEnum<{
                "image/jpeg": "image/jpeg";
                "image/png": "image/png";
                "image/webp": "image/webp";
            }>;
        }, z.core.$strip>>>;
        mentions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            displayName: z.ZodString;
            avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            customStatus: z.ZodDefault<z.ZodEnum<{
                LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
                PLAYING: "PLAYING";
                JUST_CHATTING: "JUST_CHATTING";
            }>>;
        }, z.core.$strip>>>;
        mentionedUserIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        replyToId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        createdAt: z.ZodString;
        updatedAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>>;
}, z.core.$strip>;
export declare const SocketConversationRequestSchema: z.ZodObject<{
    conversationId: z.ZodString;
}, z.core.$strict>;
export type SocketConversationRequest = z.infer<typeof SocketConversationRequestSchema>;
export declare const SocketConversationAckSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    ok: z.ZodLiteral<true>;
    conversationId: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    ok: z.ZodLiteral<false>;
    error: z.ZodObject<{
        code: z.ZodEnum<typeof import("./common.js").ErrorCode>;
        message: z.ZodString;
        requestId: z.ZodString;
        details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strict>;
}, z.core.$strict>], "ok">;
export type SocketConversationAck = z.infer<typeof SocketConversationAckSchema>;
export declare const SocketMessageDeletedPayloadSchema: z.ZodObject<{
    messageId: z.ZodString;
    conversationId: z.ZodString;
}, z.core.$strip>;
export declare const SocketRecruitmentUpdatedPayloadSchema: z.ZodObject<{
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
export declare const TeamSnapshotSchema: z.ZodObject<{
    playSession: z.ZodObject<{
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
    roster: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>;
}, z.core.$strip>;
export type TeamSnapshotDTO = z.infer<typeof TeamSnapshotSchema>;
export declare const SocketTeamUpdatedPayloadSchema: z.ZodObject<{
    playSession: z.ZodObject<{
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
    roster: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const SocketRoomUpdatedPayloadSchema: z.ZodObject<{
    id: z.ZodString;
    conversationId: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
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
    ownerId: z.ZodString;
    owner: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>;
    settings: z.ZodObject<{
        visibility: z.ZodDefault<z.ZodEnum<{
            PUBLIC: "PUBLIC";
            PRIVATE: "PRIVATE";
        }>>;
        invitePolicy: z.ZodDefault<z.ZodEnum<{
            OWNER_APPROVAL: "OWNER_APPROVAL";
            DIRECT_MEMBER: "DIRECT_MEMBER";
        }>>;
        playerCapacity: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    memberCount: z.ZodNumber;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export declare const SocketCallUpdatedPayloadSchema: z.ZodObject<{
    id: z.ZodString;
    roomId: z.ZodString;
    state: z.ZodEnum<{
        OPEN: "OPEN";
        CLOSED: "CLOSED";
    }>;
    participantCount: z.ZodNumber;
    publisherCount: z.ZodNumber;
    hasExternalLive: z.ZodDefault<z.ZodBoolean>;
    externalLive: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        callId: z.ZodString;
        provider: z.ZodEnum<{
            youtube: "youtube";
            twitch: "twitch";
        }>;
        url: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        configuredBy: z.ZodString;
        createdAt: z.ZodString;
    }, z.core.$strip>>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export declare const SocketNotificationCreatedPayloadSchema: z.ZodObject<{
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
export declare const SocketNotificationReadPayloadSchema: z.ZodObject<{
    notificationId: z.ZodString;
}, z.core.$strip>;
export declare const SocketEventSchemaMap: {
    readonly "message.created": z.ZodObject<{
        id: z.ZodString;
        conversationId: z.ZodString;
        senderId: z.ZodString;
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
        content: z.ZodString;
        attachments: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            url: z.ZodString;
            fileName: z.ZodString;
            fileSize: z.ZodNumber;
            mimeType: z.ZodEnum<{
                "image/jpeg": "image/jpeg";
                "image/png": "image/png";
                "image/webp": "image/webp";
            }>;
        }, z.core.$strip>>>;
        mentions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            displayName: z.ZodString;
            avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            customStatus: z.ZodDefault<z.ZodEnum<{
                LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
                PLAYING: "PLAYING";
                JUST_CHATTING: "JUST_CHATTING";
            }>>;
        }, z.core.$strip>>>;
        mentionedUserIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        replyToId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        createdAt: z.ZodString;
        updatedAt: z.ZodOptional<z.ZodString>;
        replyToMessage: z.ZodLazy<z.ZodOptional<z.ZodNullable<z.ZodObject<{
            id: z.ZodString;
            conversationId: z.ZodString;
            senderId: z.ZodString;
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
            content: z.ZodString;
            attachments: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                url: z.ZodString;
                fileName: z.ZodString;
                fileSize: z.ZodNumber;
                mimeType: z.ZodEnum<{
                    "image/jpeg": "image/jpeg";
                    "image/png": "image/png";
                    "image/webp": "image/webp";
                }>;
            }, z.core.$strip>>>;
            mentions: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                displayName: z.ZodString;
                avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                customStatus: z.ZodDefault<z.ZodEnum<{
                    LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
                    PLAYING: "PLAYING";
                    JUST_CHATTING: "JUST_CHATTING";
                }>>;
            }, z.core.$strip>>>;
            mentionedUserIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
            replyToId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            createdAt: z.ZodString;
            updatedAt: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>>;
    }, z.core.$strip>;
    readonly "message.deleted": z.ZodObject<{
        messageId: z.ZodString;
        conversationId: z.ZodString;
    }, z.core.$strip>;
    readonly "presence.subscribe": z.ZodObject<{
        conversationId: z.ZodString;
    }, z.core.$strict>;
    readonly "presence.unsubscribe": z.ZodObject<{
        conversationId: z.ZodString;
    }, z.core.$strict>;
    readonly "presence.heartbeat": z.ZodObject<{
        conversationId: z.ZodString;
    }, z.core.$strict>;
    readonly "presence.changed": z.ZodObject<{
        conversationId: z.ZodString;
        userId: z.ZodString;
        customStatus: z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>;
        isOnline: z.ZodBoolean;
    }, z.core.$strict>;
    readonly "recruitment.updated": z.ZodObject<{
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
    readonly "team.updated": z.ZodObject<{
        playSession: z.ZodObject<{
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
        roster: z.ZodArray<z.ZodObject<{
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
        }, z.core.$strip>>;
    }, z.core.$strip>;
    readonly "room.updated": z.ZodObject<{
        id: z.ZodString;
        conversationId: z.ZodString;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
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
        ownerId: z.ZodString;
        owner: z.ZodOptional<z.ZodObject<{
            id: z.ZodString;
            displayName: z.ZodString;
            avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            customStatus: z.ZodDefault<z.ZodEnum<{
                LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
                PLAYING: "PLAYING";
                JUST_CHATTING: "JUST_CHATTING";
            }>>;
        }, z.core.$strip>>;
        settings: z.ZodObject<{
            visibility: z.ZodDefault<z.ZodEnum<{
                PUBLIC: "PUBLIC";
                PRIVATE: "PRIVATE";
            }>>;
            invitePolicy: z.ZodDefault<z.ZodEnum<{
                OWNER_APPROVAL: "OWNER_APPROVAL";
                DIRECT_MEMBER: "DIRECT_MEMBER";
            }>>;
            playerCapacity: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strip>;
        memberCount: z.ZodNumber;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, z.core.$strip>;
    readonly "call.updated": z.ZodObject<{
        id: z.ZodString;
        roomId: z.ZodString;
        state: z.ZodEnum<{
            OPEN: "OPEN";
            CLOSED: "CLOSED";
        }>;
        participantCount: z.ZodNumber;
        publisherCount: z.ZodNumber;
        hasExternalLive: z.ZodDefault<z.ZodBoolean>;
        externalLive: z.ZodOptional<z.ZodObject<{
            id: z.ZodString;
            callId: z.ZodString;
            provider: z.ZodEnum<{
                youtube: "youtube";
                twitch: "twitch";
            }>;
            url: z.ZodString;
            title: z.ZodOptional<z.ZodString>;
            configuredBy: z.ZodString;
            createdAt: z.ZodString;
        }, z.core.$strip>>;
        createdAt: z.ZodString;
    }, z.core.$strip>;
    readonly "notification.created": z.ZodObject<{
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
    readonly "notification.read": z.ZodObject<{
        notificationId: z.ZodString;
    }, z.core.$strip>;
};
export type EndpointAuthLevel = 'Public' | 'Authenticated' | 'RoomMember' | 'ConversationRead' | 'ConversationMember' | 'MessageAuthorOrModerator' | 'RoomOwner' | 'RoomHelperOrOwner' | 'CallParticipant' | 'Admin' | 'OwnUserOrTarget';
export interface ApiEndpointDefinition {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    auth: EndpointAuthLevel;
    requiredPermission?: 'MANAGE_CHAT' | 'MANAGE_CALLS' | 'MANAGE_RECRUITMENT' | 'MANAGE_MEMBERS';
    requestSchema?: z.ZodTypeAny;
    responseSchema: z.ZodTypeAny;
    requestFormat?: 'multipart';
    responseFormat?: 'binary';
}
export declare const ApiEndpointRegistry: ApiEndpointDefinition[];
