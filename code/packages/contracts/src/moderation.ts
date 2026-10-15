import {PrivateProfileSchema} from './profiles.js';
import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';
import { UserSummarySchema } from './profiles.js';

export const ReportTargetTypeSchema = z.enum(['USER', 'MESSAGE', 'FEED_POST', 'FEED_COMMENT']);
export type ReportTargetType = z.infer<typeof ReportTargetTypeSchema>;

export const ReportStatusSchema = z.enum(['PENDING', 'RESOLVED', 'DISMISSED']);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const ReportSchema = z.object({
  id: IdSchema,
  reporterId: IdSchema,
  targetType: ReportTargetTypeSchema,
  targetId: IdSchema,
  reason: z.string().min(1, 'Reason is required').max(200),
  details: z.string().max(1000).optional(),
  status: ReportStatusSchema.default('PENDING'),
  createdAt: IsoDateTimeSchema,
});
export type ReportDTO = z.infer<typeof ReportSchema>;

export const CreateReportRequestSchema = z.object({
  targetType: ReportTargetTypeSchema,
  targetId: IdSchema,
  reason: z.string().min(1, 'Reason is required').max(200),
  details: z.string().max(1000).optional(),
});
export type CreateReportRequest = z.infer<typeof CreateReportRequestSchema>;

export const BlockSchema = z.object({
  id: IdSchema,
  blockerId: IdSchema,
  blockedId: IdSchema,
  blockedUser: UserSummarySchema.optional(),
  createdAt: IsoDateTimeSchema,
});
export type BlockDTO = z.infer<typeof BlockSchema>;

export const CreateBlockRequestSchema = z.object({
  blockedId: IdSchema,
});
export type CreateBlockRequest = z.infer<typeof CreateBlockRequestSchema>;

export const SendFriendRequestSchema = z.object({
  targetUserId: IdSchema,
});
export type SendFriendRequest = z.infer<typeof SendFriendRequestSchema>;

export const ListFriendsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(50),
});
export type ListFriendsQuery = z.infer<typeof ListFriendsQuerySchema>;

export const ListFriendRequestsQuerySchema = z.object({
  direction: z.enum(['INCOMING', 'OUTGOING']).default('INCOMING'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(50),
});
export type ListFriendRequestsQuery = z.infer<typeof ListFriendRequestsQuerySchema>;

export const PendingFriendRequestSchema = z.object({
  requestId: IdSchema,
  sender: UserSummarySchema,
  receiver: UserSummarySchema,
  status: z.literal('PENDING'),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type PendingFriendRequestDTO = z.infer<typeof PendingFriendRequestSchema>;
export type PendingFriendRequest = PendingFriendRequestDTO;

export const RespondFriendRequestSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
});
export type RespondFriendRequest = z.infer<typeof RespondFriendRequestSchema>;

export const RemoveFriendSchema = z.object({
  friendUserId: IdSchema,
});
export type RemoveFriendRequest = z.infer<typeof RemoveFriendSchema>;

export const CancelFriendRequestSchema = z.object({
  requestId: IdSchema,
});
export type CancelFriendRequest = z.infer<typeof CancelFriendRequestSchema>;

export const CreateDirectConversationSchema = z.object({
  recipientUserId: IdSchema,
});
export type CreateDirectConversationRequest = z.infer<typeof CreateDirectConversationSchema>;

export const ListDirectConversationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(50),
});
export type ListDirectConversationsQuery = z.infer<typeof ListDirectConversationsQuerySchema>;

export const ListAdminReportsQuerySchema = z.object({
  status: ReportStatusSchema.optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(50),
});
export type ListAdminReportsQuery = z.infer<typeof ListAdminReportsQuerySchema>;

export const UpdateAdminReportSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
});
export type UpdateAdminReportRequest = z.infer<typeof UpdateAdminReportSchema>;

export const ListAdminUsersQuerySchema = z.object({
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(50),
});
export type ListAdminUsersQuery = z.infer<typeof ListAdminUsersQuerySchema>;

export const AdminUserActionRequestSchema = z.object({
  action: z.enum(['BAN', 'UNBAN']),
  reason: z.string().max(300).optional(),
});
export type AdminUserActionRequest = z.infer<typeof AdminUserActionRequestSchema>;

// Sole-admin response only; never a public or current-user role grant.
export const AdminUserListItemSchema=PrivateProfileSchema.extend({banned:z.boolean()}).strict();
export type AdminUserListItem=z.infer<typeof AdminUserListItemSchema>;

// T38 confirmation reason; strict empty-body calls remain backward compatible.
export const DeleteMessageRequestSchema=z.object({reason:z.string().min(1).max(300).refine(value=>value.trim().length>0,'Reason must not be blank').optional()}).strict();
export type DeleteMessageRequest=z.infer<typeof DeleteMessageRequestSchema>;
