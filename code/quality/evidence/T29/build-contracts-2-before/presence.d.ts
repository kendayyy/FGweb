import { z } from 'zod';
export declare const PRESENCE_HEARTBEAT_INTERVAL_MS = 15000;
export declare const PRESENCE_TTL_MS = 45000;
export declare const ListGameOnlineUsersQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    cursor: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ListGameOnlineUsersQuery = z.infer<typeof ListGameOnlineUsersQuerySchema>;
export declare const UpdateCustomStatusRequestSchema: z.ZodObject<{
    customStatus: z.ZodEnum<{
        LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
        PLAYING: "PLAYING";
        JUST_CHATTING: "JUST_CHATTING";
    }>;
}, z.core.$strict>;
export type UpdateCustomStatusRequest = z.infer<typeof UpdateCustomStatusRequestSchema>;
export declare const UpdateCustomStatusResponseSchema: z.ZodObject<{
    customStatus: z.ZodEnum<{
        LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
        PLAYING: "PLAYING";
        JUST_CHATTING: "JUST_CHATTING";
    }>;
    isOnline: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type UpdateCustomStatusResponse = z.infer<typeof UpdateCustomStatusResponseSchema>;
export declare const SocketPresenceRequestSchema: z.ZodObject<{
    conversationId: z.ZodString;
}, z.core.$strict>;
export type SocketPresenceRequest = z.infer<typeof SocketPresenceRequestSchema>;
export declare const SocketPresenceSubscribeRequestSchema: z.ZodObject<{
    conversationId: z.ZodString;
}, z.core.$strict>;
export type SocketPresenceSubscribeRequest = SocketPresenceRequest;
export declare const SocketPresenceUnsubscribeRequestSchema: z.ZodObject<{
    conversationId: z.ZodString;
}, z.core.$strict>;
export type SocketPresenceUnsubscribeRequest = SocketPresenceRequest;
export declare const SocketPresenceHeartbeatRequestSchema: z.ZodObject<{
    conversationId: z.ZodString;
}, z.core.$strict>;
export type SocketPresenceHeartbeatRequest = SocketPresenceRequest;
export declare const SocketPresenceAckSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
export type SocketPresenceAck = z.infer<typeof SocketPresenceAckSchema>;
export declare const SocketPresenceSubscribeAckSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
export type SocketPresenceSubscribeAck = SocketPresenceAck;
export declare const SocketPresenceUnsubscribeAckSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
export type SocketPresenceUnsubscribeAck = SocketPresenceAck;
export declare const SocketPresenceHeartbeatAckSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
export type SocketPresenceHeartbeatAck = SocketPresenceAck;
export declare const SocketScopedPresenceChangedPayloadSchema: z.ZodObject<{
    conversationId: z.ZodString;
    userId: z.ZodString;
    customStatus: z.ZodEnum<{
        LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
        PLAYING: "PLAYING";
        JUST_CHATTING: "JUST_CHATTING";
    }>;
    isOnline: z.ZodBoolean;
}, z.core.$strict>;
export type SocketScopedPresenceChangedPayload = z.infer<typeof SocketScopedPresenceChangedPayloadSchema>;
export declare const SocketPresenceChangedPayloadSchema: z.ZodObject<{
    userId: z.ZodString;
    customStatus: z.ZodEnum<{
        LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
        PLAYING: "PLAYING";
        JUST_CHATTING: "JUST_CHATTING";
    }>;
    isOnline: z.ZodBoolean;
    conversationId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type SocketPresenceChangedPayload = z.infer<typeof SocketPresenceChangedPayloadSchema>;
