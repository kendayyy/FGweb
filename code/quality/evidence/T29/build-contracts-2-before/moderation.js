import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';
import { UserSummarySchema } from './profiles.js';
export const ReportTargetTypeSchema = z.enum(['USER', 'MESSAGE']);
export const ReportStatusSchema = z.enum(['PENDING', 'RESOLVED', 'DISMISSED']);
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
export const CreateReportRequestSchema = z.object({
    targetType: ReportTargetTypeSchema,
    targetId: IdSchema,
    reason: z.string().min(1, 'Reason is required').max(200),
    details: z.string().max(1000).optional(),
});
export const BlockSchema = z.object({
    id: IdSchema,
    blockerId: IdSchema,
    blockedId: IdSchema,
    blockedUser: UserSummarySchema.optional(),
    createdAt: IsoDateTimeSchema,
});
export const CreateBlockRequestSchema = z.object({
    blockedId: IdSchema,
});
export const SendFriendRequestSchema = z.object({
    targetUserId: IdSchema,
});
export const ListFriendsQuerySchema = z.object({
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(50),
});
export const ListFriendRequestsQuerySchema = z.object({
    direction: z.enum(['INCOMING', 'OUTGOING']).default('INCOMING'),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(50),
});
export const PendingFriendRequestSchema = z.object({
    requestId: IdSchema,
    sender: UserSummarySchema,
    receiver: UserSummarySchema,
    status: z.literal('PENDING'),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
});
export const RespondFriendRequestSchema = z.object({
    action: z.enum(['ACCEPT', 'REJECT']),
});
export const RemoveFriendSchema = z.object({
    friendUserId: IdSchema,
});
export const CancelFriendRequestSchema = z.object({
    requestId: IdSchema,
});
export const CreateDirectConversationSchema = z.object({
    recipientUserId: IdSchema,
});
export const ListDirectConversationsQuerySchema = z.object({
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(50),
});
export const ListAdminReportsQuerySchema = z.object({
    status: ReportStatusSchema.optional(),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(50),
});
export const UpdateAdminReportSchema = z.object({
    status: z.enum(['RESOLVED', 'DISMISSED']),
});
export const ListAdminUsersQuerySchema = z.object({
    search: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(50),
});
export const AdminUserActionRequestSchema = z.object({
    action: z.enum(['BAN', 'UNBAN']),
    reason: z.string().max(300).optional(),
});
