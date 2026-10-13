import { z } from 'zod';
export const API_CONTRACT_VERSION1 = '1.0.0';
export const API_CONTRACT_VERSION = '1.0.0';
export const ALLOWED_GAMES = [
    'Liên Minh Huyền Thoại',
    'Valorant',
    'Teamfight Tactics (TFT)',
    'Dota 2',
    'Roblox',
    'Liên Quân Mobile',
    'Free Fire',
];
export const GameTitleSchema = z.enum(ALLOWED_GAMES);
export var ErrorCode;
(function (ErrorCode) {
    ErrorCode["LOGIN_REQUIRED"] = "LOGIN_REQUIRED";
    ErrorCode["FORBIDDEN"] = "FORBIDDEN";
    ErrorCode["NOT_FOUND"] = "NOT_FOUND";
    ErrorCode["CAPACITY_FULL"] = "CAPACITY_FULL";
    ErrorCode["ACTIVE_PLAY_CONFLICT"] = "ACTIVE_PLAY_CONFLICT";
    ErrorCode["CALL_CLOSED"] = "CALL_CLOSED";
    ErrorCode["PUBLISH_LIMIT"] = "PUBLISH_LIMIT";
    ErrorCode["INVALID_INPUT"] = "INVALID_INPUT";
    ErrorCode["RATE_LIMITED"] = "RATE_LIMITED";
})(ErrorCode || (ErrorCode = {}));
export const ErrorCodeToHttpStatus = {
    [ErrorCode.LOGIN_REQUIRED]: 401,
    [ErrorCode.FORBIDDEN]: 403,
    [ErrorCode.NOT_FOUND]: 404,
    [ErrorCode.CAPACITY_FULL]: 409,
    [ErrorCode.ACTIVE_PLAY_CONFLICT]: 409,
    [ErrorCode.CALL_CLOSED]: 409,
    [ErrorCode.PUBLISH_LIMIT]: 409,
    [ErrorCode.INVALID_INPUT]: 422,
    [ErrorCode.RATE_LIMITED]: 429,
};
export const ApiErrorResponseSchema = z.object({
    code: z.nativeEnum(ErrorCode),
    message: z.string(),
    requestId: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
});
export const SocketEventNames = {
    CRYPTO_SUBSCRIBE: 'crypto.subscribe',
    CRYPTO_UNSUBSCRIBE: 'crypto.unsubscribe',
    CRYPTO_MESSAGE_CREATED: 'crypto.message.created',
    CRYPTO_SYNC_AVAILABLE: 'crypto.sync.available',
    CONVERSATION_SUBSCRIBE: 'conversation.subscribe',
    CONVERSATION_UNSUBSCRIBE: 'conversation.unsubscribe',
    MESSAGE_CREATED: 'message.created',
    MESSAGE_DELETED: 'message.deleted',
    PRESENCE_SUBSCRIBE: 'presence.subscribe',
    PRESENCE_UNSUBSCRIBE: 'presence.unsubscribe',
    PRESENCE_HEARTBEAT: 'presence.heartbeat',
    PRESENCE_CHANGED: 'presence.changed',
    RECRUITMENT_UPDATED: 'recruitment.updated',
    TEAM_UPDATED: 'team.updated',
    ROOM_UPDATED: 'room.updated',
    CALL_UPDATED: 'call.updated',
    NOTIFICATION_CREATED: 'notification.created',
    NOTIFICATION_READ: 'notification.read',
};
export const IdSchema = z
    .string()
    .min(1, 'ID must be a non-empty string')
    .refine(s => s.trim().length > 0, 'ID cannot be whitespace only');
export const IsoDateTimeSchema = z
    .string()
    .datetime({ message: 'Must be a valid UTC ISO string ending in Z' });
export const IdempotencyHeaderSchema = z.string().min(1).optional();
export const IdempotencyKeySchema = z.string().min(1).optional();
export const CustomStatusSchema = z.enum([
    'LOOKING_FOR_TEAM',
    'PLAYING',
    'JUST_CHATTING',
]);
export const PresenceStatusSchema = z.enum(['ONLINE', 'OFFLINE']);
export const GameSchema = z.object({
    id: IdSchema,
    title: GameTitleSchema,
    lobbyRoomId: IdSchema,
    description: z.string().max(500).optional(),
    iconUrl: z.string().url().optional(),
    bannerUrl: z.string().url().optional(),
});
export const PlayerCapacitySchema = z
    .number()
    .int()
    .min(1, 'Minimum player capacity is 1')
    .max(10, 'Maximum player capacity is 10');
export const PaginationQuerySchema = z.object({
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(50),
});
export function createPageSchema(itemSchema) {
    return z.object({
        items: z.array(itemSchema),
        nextCursor: z.string().nullable().optional(),
        hasMore: z.boolean(),
    });
}
export const ListGamesQuerySchema = z.object({
    search: z.string().optional(),
});
export const ListOnlineUsersQuerySchema = z.object({
    gameTitle: GameTitleSchema.optional(),
    limit: z.number().int().min(1).max(50).default(50),
});
