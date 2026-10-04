import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, PlayerCapacitySchema, GameTitleSchema } from './common.js';
import { UserSummarySchema } from './profiles.js';

export const RoomVisibilitySchema = z.enum(['PUBLIC', 'PRIVATE']);
export type RoomVisibility = z.infer<typeof RoomVisibilitySchema>;

export const InvitePolicySchema = z.enum(['OWNER_APPROVAL', 'DIRECT_MEMBER']);
export type InvitePolicy = z.infer<typeof InvitePolicySchema>;

export const HelperPermission = z.enum([
  'MANAGE_CHAT',
  'MANAGE_CALLS',
  'MANAGE_RECRUITMENT',
  'MANAGE_MEMBERS',
]);
export type HelperPermissionType = z.infer<typeof HelperPermission>;

export const OwnerPermission = z.enum(['OWNER_TRANSFER', 'ROOM_DISSOLVE']);
export type OwnerPermissionType = z.infer<typeof OwnerPermission>;

export const PermissionSchema = z.enum([
  'MANAGE_CHAT',
  'MANAGE_CALLS',
  'MANAGE_RECRUITMENT',
  'MANAGE_MEMBERS',
  'OWNER_TRANSFER',
  'ROOM_DISSOLVE',
]);
export type Permission = z.infer<typeof PermissionSchema>;

export const RoomMemberRoleSchema = z.enum(['OWNER', 'HELPER', 'MEMBER']);
export type RoomMemberRole = z.infer<typeof RoomMemberRoleSchema>;

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
      const escalated = data.permissions.filter(
        p => p === 'OWNER_TRANSFER' || p === 'ROOM_DISSOLVE'
      );
      if (escalated.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Helper role cannot be assigned owner-only permissions (OWNER_TRANSFER, ROOM_DISSOLVE)',
          path: ['permissions'],
        });
      }
    } else if (data.role === 'MEMBER') {
      if (data.permissions.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Regular members cannot have elevated permissions',
          path: ['permissions'],
        });
      }
    }
  });
export type RoomMemberDTO = z.infer<typeof RoomMemberSchema>;

export const RoomSettingsSchema = z.object({
  visibility: RoomVisibilitySchema.default('PUBLIC'),
  invitePolicy: InvitePolicySchema.default('OWNER_APPROVAL'),
  playerCapacity: PlayerCapacitySchema.default(5),
});
export type RoomSettingsDTO = z.infer<typeof RoomSettingsSchema>;

export const RoomSchema = z.object({
  id: IdSchema,
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
export type RoomDTO = z.infer<typeof RoomSchema>;

export const CreateRoomRequestSchema = z.object({
  name: z.string().min(1, 'Room name is required').max(100),
  description: z.string().max(500).optional(),
  gameId: IdSchema,
  gameTitle: GameTitleSchema,
  visibility: RoomVisibilitySchema.default('PUBLIC'),
  invitePolicy: InvitePolicySchema.default('OWNER_APPROVAL'),
  playerCapacity: PlayerCapacitySchema.default(5),
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const UpdateRoomSettingsRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  visibility: RoomVisibilitySchema.optional(),
  invitePolicy: InvitePolicySchema.optional(),
  playerCapacity: PlayerCapacitySchema.optional(),
});
export type UpdateRoomSettingsRequest = z.infer<typeof UpdateRoomSettingsRequestSchema>;

export const UpdateHelperPermissionsRequestSchema = z.object({
  permissions: z.array(HelperPermission),
});
export type UpdateHelperPermissionsRequest = z.infer<typeof UpdateHelperPermissionsRequestSchema>;

export const ListOwnRoomsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(50),
});
export type ListOwnRoomsQuery = z.infer<typeof ListOwnRoomsQuerySchema>;

export const TransferRoomOwnerSchema = z.object({
  newOwnerId: IdSchema,
});
export type TransferRoomOwnerRequest = z.infer<typeof TransferRoomOwnerSchema>;
