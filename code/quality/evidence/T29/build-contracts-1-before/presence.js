import { z } from 'zod';
import { IdSchema, CustomStatusSchema, ApiErrorResponseSchema, } from './common.js';
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 15000;
export const PRESENCE_TTL_MS = 45000;
export const ListGameOnlineUsersQuerySchema = z.object({
    limit: z.number().int().min(1).max(50).default(50),
    cursor: z.string().optional(),
});
export const UpdateCustomStatusRequestSchema = z.object({
    customStatus: CustomStatusSchema,
}).strict();
export const UpdateCustomStatusResponseSchema = z.object({
    customStatus: CustomStatusSchema,
    isOnline: z.boolean().optional(),
}).strict();
export const SocketPresenceRequestSchema = z.object({
    conversationId: IdSchema,
}).strict();
export const SocketPresenceSubscribeRequestSchema = SocketPresenceRequestSchema;
export const SocketPresenceUnsubscribeRequestSchema = SocketPresenceRequestSchema;
export const SocketPresenceHeartbeatRequestSchema = SocketPresenceRequestSchema;
export const SocketPresenceAckSchema = z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), conversationId: IdSchema }).strict(),
    z.object({ ok: z.literal(false), error: ApiErrorResponseSchema.strict() }).strict(),
]);
export const SocketPresenceSubscribeAckSchema = SocketPresenceAckSchema;
export const SocketPresenceUnsubscribeAckSchema = SocketPresenceAckSchema;
export const SocketPresenceHeartbeatAckSchema = SocketPresenceAckSchema;
export const SocketScopedPresenceChangedPayloadSchema = z.object({
    conversationId: IdSchema,
    userId: IdSchema,
    customStatus: CustomStatusSchema,
    isOnline: z.boolean(),
}).strict();
export const SocketPresenceChangedPayloadSchema = z.object({
    userId: IdSchema,
    customStatus: CustomStatusSchema,
    isOnline: z.boolean(),
    conversationId: IdSchema.optional(),
});
