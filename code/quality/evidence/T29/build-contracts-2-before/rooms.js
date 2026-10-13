import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, PlayerCapacitySchema, GameTitleSchema } from './common.js';
import { UserSummarySchema } from './profiles.js';
export const RoomVisibilitySchema = z.enum(['PUBLIC', 'PRIVATE']);
export const InvitePolicySchema = z.enum(['OWNER_APPROVAL', 'DIRECT_MEMBER']);
export const HelperPermission = z.enum([
    'MANAGE_CHAT',
    'MANAGE_CALLS',
    'MANAGE_RECRUITMENT',
    'MANAGE_MEMBERS',
]);
export const OwnerPermission = z.enum(['OWNER_TRANSFER', 'ROOM_DISSOLVE']);
export const PermissionSchema = z.enum([
    'MANAGE_CHAT',
    'MANAGE_CALLS',
    'MANAGE_RECRUITMENT',
    'MANAGE_MEMBERS',
    'OWNER_TRANSFER',
    'ROOM_DISSOLVE',
]);
export const RoomMemberRoleSchema = z.enum(['OWNER', 'HELPER', 'MEMBER']);
export const RoomMemberSchema = z
    .object({
    roomId: IdSchema,
    userId: IdSchema,
    user: UserSummarySchema.optional(),
    role: RoomMemberRoleSchema,
    permissions: z.array(PermissionSchema).default([]),
    joinedAt: IsoDateTimeSchema,
})
    .superRefine((data, ctx) => {
    if (data.role === 'HELPER') {
        const escalated = data.permissions.filter(p => p === 'OWNER_TRANSFER' || p === 'ROOM_DISSOLVE');
        if (escalated.length > 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Helper role cannot be assigned owner-only permissions (OWNER_TRANSFER, ROOM_DISSOLVE)',
                path: ['permissions'],
            });
        }
    }
    else if (data.role === 'MEMBER') {
        if (data.permissions.length > 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Regular members cannot have elevated permissions',
                path: ['permissions'],
            });
        }
    }
});
export const RoomSettingsSchema = z.object({
    visibility: RoomVisibilitySchema.default('PUBLIC'),
    invitePolicy: InvitePolicySchema.default('OWNER_APPROVAL'),
    playerCapacity: PlayerCapacitySchema.default(5),
});
export const RoomSchema = z.object({
    id: IdSchema,
    conversationId: IdSchema,
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    gameId: IdSchema,
    gameTitle: GameTitleSchema,
    ownerId: IdSchema,
    owner: UserSummarySchema.optional(),
    settings: RoomSettingsSchema,
    memberCount: z.number().int().min(1).max(50, 'Room member count cannot exceed 50'),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
});
export const CreateRoomRequestSchema = z.object({
    name: z.string().min(1, 'Room name is required').max(100),
    description: z.string().max(500).optional(),
    gameId: IdSchema,
    gameTitle: GameTitleSchema,
    visibility: RoomVisibilitySchema.default('PUBLIC'),
    invitePolicy: InvitePolicySchema.default('OWNER_APPROVAL'),
    playerCapacity: PlayerCapacitySchema.default(5),
});
export const UpdateRoomSettingsRequestSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    visibility: RoomVisibilitySchema.optional(),
    invitePolicy: InvitePolicySchema.optional(),
    playerCapacity: PlayerCapacitySchema.optional(),
});
export const UpdateHelperPermissionsRequestSchema = z.object({
    permissions: z.array(HelperPermission),
});
export const ListOwnRoomsQuerySchema = z.object({
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(50),
});
export const TransferRoomOwnerSchema = z.object({
    newOwnerId: IdSchema,
});
