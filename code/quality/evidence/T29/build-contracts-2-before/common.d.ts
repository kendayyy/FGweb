import { z } from 'zod';
export declare const API_CONTRACT_VERSION1 = "1.0.0";
export declare const API_CONTRACT_VERSION = "1.0.0";
export declare const ALLOWED_GAMES: readonly ["Liên Minh Huyền Thoại", "Valorant", "Teamfight Tactics (TFT)", "Dota 2", "Roblox", "Liên Quân Mobile", "Free Fire"];
export type GameTitle = (typeof ALLOWED_GAMES)[number];
export declare const GameTitleSchema: z.ZodEnum<{
    "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
    Valorant: "Valorant";
    "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
    "Dota 2": "Dota 2";
    Roblox: "Roblox";
    "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
    "Free Fire": "Free Fire";
}>;
export declare enum ErrorCode {
    LOGIN_REQUIRED = "LOGIN_REQUIRED",
    FORBIDDEN = "FORBIDDEN",
    NOT_FOUND = "NOT_FOUND",
    CAPACITY_FULL = "CAPACITY_FULL",
    ACTIVE_PLAY_CONFLICT = "ACTIVE_PLAY_CONFLICT",
    CALL_CLOSED = "CALL_CLOSED",
    PUBLISH_LIMIT = "PUBLISH_LIMIT",
    INVALID_INPUT = "INVALID_INPUT",
    RATE_LIMITED = "RATE_LIMITED"
}
export declare const ErrorCodeToHttpStatus: Record<ErrorCode, number>;
export declare const ApiErrorResponseSchema: z.ZodObject<{
    code: z.ZodEnum<typeof ErrorCode>;
    message: z.ZodString;
    requestId: z.ZodString;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export declare const SocketEventNames: {
    readonly CRYPTO_SUBSCRIBE: "crypto.subscribe";
    readonly CRYPTO_UNSUBSCRIBE: "crypto.unsubscribe";
    readonly CRYPTO_MESSAGE_CREATED: "crypto.message.created";
    readonly CRYPTO_SYNC_AVAILABLE: "crypto.sync.available";
    readonly CONVERSATION_SUBSCRIBE: "conversation.subscribe";
    readonly CONVERSATION_UNSUBSCRIBE: "conversation.unsubscribe";
    readonly MESSAGE_CREATED: "message.created";
    readonly MESSAGE_DELETED: "message.deleted";
    readonly PRESENCE_SUBSCRIBE: "presence.subscribe";
    readonly PRESENCE_UNSUBSCRIBE: "presence.unsubscribe";
    readonly PRESENCE_HEARTBEAT: "presence.heartbeat";
    readonly PRESENCE_CHANGED: "presence.changed";
    readonly RECRUITMENT_UPDATED: "recruitment.updated";
    readonly TEAM_UPDATED: "team.updated";
    readonly ROOM_UPDATED: "room.updated";
    readonly CALL_UPDATED: "call.updated";
    readonly NOTIFICATION_CREATED: "notification.created";
    readonly NOTIFICATION_READ: "notification.read";
};
export type SocketEventName = (typeof SocketEventNames)[keyof typeof SocketEventNames];
export declare const IdSchema: z.ZodString;
export type Id = z.infer<typeof IdSchema>;
export declare const IsoDateTimeSchema: z.ZodString;
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;
export declare const IdempotencyHeaderSchema: z.ZodOptional<z.ZodString>;
export declare const IdempotencyKeySchema: z.ZodOptional<z.ZodString>;
export declare const CustomStatusSchema: z.ZodEnum<{
    LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
    PLAYING: "PLAYING";
    JUST_CHATTING: "JUST_CHATTING";
}>;
export type CustomStatus = z.infer<typeof CustomStatusSchema>;
export declare const PresenceStatusSchema: z.ZodEnum<{
    ONLINE: "ONLINE";
    OFFLINE: "OFFLINE";
}>;
export type PresenceStatus = z.infer<typeof PresenceStatusSchema>;
export declare const GameSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodEnum<{
        "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
        Valorant: "Valorant";
        "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
        "Dota 2": "Dota 2";
        Roblox: "Roblox";
        "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
        "Free Fire": "Free Fire";
    }>;
    lobbyRoomId: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    iconUrl: z.ZodOptional<z.ZodString>;
    bannerUrl: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type GameDTO = z.infer<typeof GameSchema>;
export declare const PlayerCapacitySchema: z.ZodNumber;
export type PlayerCapacity = z.infer<typeof PlayerCapacitySchema>;
export declare const PaginationQuerySchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export declare function createPageSchema<T extends z.ZodTypeAny>(itemSchema: T): z.ZodObject<{
    items: z.ZodArray<T>;
    nextCursor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    hasMore: z.ZodBoolean;
}, z.core.$strip>;
export type Page<T> = {
    items: T[];
    nextCursor?: string | null;
    hasMore: boolean;
};
export declare const ListGamesQuerySchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ListGamesQuery = z.infer<typeof ListGamesQuerySchema>;
export declare const ListOnlineUsersQuerySchema: z.ZodObject<{
    gameTitle: z.ZodOptional<z.ZodEnum<{
        "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
        Valorant: "Valorant";
        "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
        "Dota 2": "Dota 2";
        Roblox: "Roblox";
        "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
        "Free Fire": "Free Fire";
    }>>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type ListOnlineUsersQuery = z.infer<typeof ListOnlineUsersQuerySchema>;
