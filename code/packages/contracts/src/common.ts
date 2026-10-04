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
] as const;

export type GameTitle = (typeof ALLOWED_GAMES)[number];
export const GameTitleSchema = z.enum(ALLOWED_GAMES);

export enum ErrorCode {
  LOGIN_REQUIRED = 'LOGIN_REQUIRED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CAPACITY_FULL = 'CAPACITY_FULL',
  ACTIVE_PLAY_CONFLICT = 'ACTIVE_PLAY_CONFLICT',
  CALL_CLOSED = 'CALL_CLOSED',
  PUBLISH_LIMIT = 'PUBLISH_LIMIT',
  INVALID_INPUT = 'INVALID_INPUT',
  RATE_LIMITED = 'RATE_LIMITED',
}

export const ErrorCodeToHttpStatus: Record<ErrorCode, number> = {
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
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export const SocketEventNames = {
  MESSAGE_CREATED: 'message.created',
  MESSAGE_DELETED: 'message.deleted',
  PRESENCE_CHANGED: 'presence.changed',
  RECRUITMENT_UPDATED: 'recruitment.updated',
  TEAM_UPDATED: 'team.updated',
  ROOM_UPDATED: 'room.updated',
  CALL_UPDATED: 'call.updated',
  NOTIFICATION_CREATED: 'notification.created',
  NOTIFICATION_READ: 'notification.read',
} as const;

export type SocketEventName = (typeof SocketEventNames)[keyof typeof SocketEventNames];

export const IdSchema = z
  .string()
  .min(1, 'ID must be a non-empty string')
  .refine(s => s.trim().length > 0, 'ID cannot be whitespace only');
export type Id = z.infer<typeof IdSchema>;

export const IsoDateTimeSchema = z
  .string()
  .datetime({ message: 'Must be a valid UTC ISO string ending in Z' });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

export const IdempotencyHeaderSchema = z.string().min(1).optional();
export const IdempotencyKeySchema = z.string().min(1).optional();

export const CustomStatusSchema = z.enum([
  'LOOKING_FOR_TEAM',
  'PLAYING',
  'JUST_CHATTING',
]);
export type CustomStatus = z.infer<typeof CustomStatusSchema>;

export const PresenceStatusSchema = z.enum(['ONLINE', 'OFFLINE']);
export type PresenceStatus = z.infer<typeof PresenceStatusSchema>;

export const GameSchema = z.object({
  id: IdSchema,
  title: GameTitleSchema,
  lobbyRoomId: IdSchema,
  description: z.string().max(500).optional(),
  iconUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
});
export type GameDTO = z.infer<typeof GameSchema>;

export const PlayerCapacitySchema = z
  .number()
  .int()
  .min(1, 'Minimum player capacity is 1')
  .max(10, 'Maximum player capacity is 10');
export type PlayerCapacity = z.infer<typeof PlayerCapacitySchema>;

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(50),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export function createPageSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable().optional(),
    hasMore: z.boolean(),
  });
}

export type Page<T> = {
  items: T[];
  nextCursor?: string | null;
  hasMore: boolean;
};

export const ListGamesQuerySchema = z.object({
  search: z.string().optional(),
});
export type ListGamesQuery = z.infer<typeof ListGamesQuerySchema>;

export const ListOnlineUsersQuerySchema = z.object({
  gameTitle: GameTitleSchema.optional(),
  limit: z.number().int().min(1).max(50).default(50),
});
export type ListOnlineUsersQuery = z.infer<typeof ListOnlineUsersQuerySchema>;
