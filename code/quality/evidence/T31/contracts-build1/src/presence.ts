import { z } from 'zod';
import {
  IdSchema,
  CustomStatusSchema,
  ApiErrorResponseSchema,
} from './common.js';

export const PRESENCE_HEARTBEAT_INTERVAL_MS = 15000;
export const PRESENCE_TTL_MS = 45000;

export const ListGameOnlineUsersQuerySchema = z.object({
  limit: z.number().int().min(1).max(50).default(50),
  cursor: z.string().optional(),
});
export type ListGameOnlineUsersQuery = z.infer<typeof ListGameOnlineUsersQuerySchema>;

export const UpdateCustomStatusRequestSchema = z.object({
  customStatus: CustomStatusSchema,
}).strict();
export type UpdateCustomStatusRequest = z.infer<typeof UpdateCustomStatusRequestSchema>;

export const UpdateCustomStatusResponseSchema = z.object({
  customStatus: CustomStatusSchema,
  isOnline: z.boolean().optional(),
}).strict();
export type UpdateCustomStatusResponse = z.infer<typeof UpdateCustomStatusResponseSchema>;

export const SocketPresenceRequestSchema = z.object({
  conversationId: IdSchema,
}).strict();
export type SocketPresenceRequest = z.infer<typeof SocketPresenceRequestSchema>;

export const SocketPresenceSubscribeRequestSchema = SocketPresenceRequestSchema;
export type SocketPresenceSubscribeRequest = SocketPresenceRequest;

export const SocketPresenceUnsubscribeRequestSchema = SocketPresenceRequestSchema;
export type SocketPresenceUnsubscribeRequest = SocketPresenceRequest;

export const SocketPresenceHeartbeatRequestSchema = SocketPresenceRequestSchema;
export type SocketPresenceHeartbeatRequest = SocketPresenceRequest;

export const SocketPresenceAckSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), conversationId: IdSchema }).strict(),
  z.object({ ok: z.literal(false), error: ApiErrorResponseSchema.strict() }).strict(),
]);
export type SocketPresenceAck = z.infer<typeof SocketPresenceAckSchema>;

export const SocketPresenceSubscribeAckSchema = SocketPresenceAckSchema;
export type SocketPresenceSubscribeAck = SocketPresenceAck;

export const SocketPresenceUnsubscribeAckSchema = SocketPresenceAckSchema;
export type SocketPresenceUnsubscribeAck = SocketPresenceAck;

export const SocketPresenceHeartbeatAckSchema = SocketPresenceAckSchema;
export type SocketPresenceHeartbeatAck = SocketPresenceAck;

export const SocketScopedPresenceChangedPayloadSchema = z.object({
  conversationId: IdSchema,
  userId: IdSchema,
  customStatus: CustomStatusSchema,
  isOnline: z.boolean(),
}).strict();
export type SocketScopedPresenceChangedPayload = z.infer<typeof SocketScopedPresenceChangedPayloadSchema>;

export const SocketPresenceChangedPayloadSchema = z.object({
  userId: IdSchema,
  customStatus: CustomStatusSchema,
  isOnline: z.boolean(),
  conversationId: IdSchema.optional(),
});
export type SocketPresenceChangedPayload = z.infer<typeof SocketPresenceChangedPayloadSchema>;
