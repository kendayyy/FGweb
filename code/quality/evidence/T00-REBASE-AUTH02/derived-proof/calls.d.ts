import { z } from 'zod';
export declare const CallStateSchema: z.ZodEnum<{
    OPEN: "OPEN";
    CLOSED: "CLOSED";
}>;
export type CallState = z.infer<typeof CallStateSchema>;
export declare const ExternalLiveProviderSchema: z.ZodEnum<{
    youtube: "youtube";
    twitch: "twitch";
}>;
export type ExternalLiveProvider = z.infer<typeof ExternalLiveProviderSchema>;
export declare const ExternalLiveSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type ExternalLiveDTO = z.infer<typeof ExternalLiveSchema>;
export declare const CallParticipantSchema: z.ZodObject<{
    callId: z.ZodString;
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
    isPublishing: z.ZodDefault<z.ZodBoolean>;
    isMuted: z.ZodDefault<z.ZodBoolean>;
    joinedAt: z.ZodString;
}, z.core.$strip>;
export type CallParticipantDTO = z.infer<typeof CallParticipantSchema>;
export declare const CallGroupSchema: z.ZodObject<{
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
export type CallGroupDTO = z.infer<typeof CallGroupSchema>;
export declare const CallJoinSchema: z.ZodObject<{
    callId: z.ZodString;
    token: z.ZodString;
    sfuUrl: z.ZodString;
    roomName: z.ZodString;
}, z.core.$strip>;
export type CallJoinDTO = z.infer<typeof CallJoinSchema>;
export declare const SetExternalLiveRequestSchema: z.ZodObject<{
    provider: z.ZodEnum<{
        youtube: "youtube";
        twitch: "twitch";
    }>;
    url: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type SetExternalLiveRequest = z.infer<typeof SetExternalLiveRequestSchema>;
export declare const MuteParticipantRequestSchema: z.ZodObject<{
    muted: z.ZodBoolean;
}, z.core.$strip>;
export type MuteParticipantRequest = z.infer<typeof MuteParticipantRequestSchema>;
export declare const ToggleSelfMicRequestSchema: z.ZodObject<{
    muted: z.ZodBoolean;
}, z.core.$strip>;
export type ToggleSelfMicRequest = z.infer<typeof ToggleSelfMicRequestSchema>;
export declare const ListCallParticipantsQuerySchema: z.ZodObject<{
    callId: z.ZodString;
}, z.core.$strip>;
export type ListCallParticipantsQuery = z.infer<typeof ListCallParticipantsQuerySchema>;
export declare const RefreshPublishTokenSchema: z.ZodObject<{
    callId: z.ZodString;
}, z.core.$strip>;
export type RefreshPublishTokenRequest = z.infer<typeof RefreshPublishTokenSchema>;
export declare const KickCallParticipantSchema: z.ZodObject<{
    targetUserId: z.ZodString;
}, z.core.$strip>;
export type KickCallParticipantRequest = z.infer<typeof KickCallParticipantSchema>;
