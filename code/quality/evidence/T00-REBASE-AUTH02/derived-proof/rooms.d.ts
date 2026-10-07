import { z } from 'zod';
export declare const RoomVisibilitySchema: z.ZodEnum<{
    PUBLIC: "PUBLIC";
    PRIVATE: "PRIVATE";
}>;
export type RoomVisibility = z.infer<typeof RoomVisibilitySchema>;
export declare const InvitePolicySchema: z.ZodEnum<{
    OWNER_APPROVAL: "OWNER_APPROVAL";
    DIRECT_MEMBER: "DIRECT_MEMBER";
}>;
export type InvitePolicy = z.infer<typeof InvitePolicySchema>;
export declare const HelperPermission: z.ZodEnum<{
    MANAGE_CHAT: "MANAGE_CHAT";
    MANAGE_CALLS: "MANAGE_CALLS";
    MANAGE_RECRUITMENT: "MANAGE_RECRUITMENT";
    MANAGE_MEMBERS: "MANAGE_MEMBERS";
}>;
export type HelperPermissionType = z.infer<typeof HelperPermission>;
export declare const OwnerPermission: z.ZodEnum<{
    OWNER_TRANSFER: "OWNER_TRANSFER";
    ROOM_DISSOLVE: "ROOM_DISSOLVE";
}>;
export type OwnerPermissionType = z.infer<typeof OwnerPermission>;
export declare const PermissionSchema: z.ZodEnum<{
    MANAGE_CHAT: "MANAGE_CHAT";
    MANAGE_CALLS: "MANAGE_CALLS";
    MANAGE_RECRUITMENT: "MANAGE_RECRUITMENT";
    MANAGE_MEMBERS: "MANAGE_MEMBERS";
    OWNER_TRANSFER: "OWNER_TRANSFER";
    ROOM_DISSOLVE: "ROOM_DISSOLVE";
}>;
export type Permission = z.infer<typeof PermissionSchema>;
export declare const RoomMemberRoleSchema: z.ZodEnum<{
    OWNER: "OWNER";
    HELPER: "HELPER";
    MEMBER: "MEMBER";
}>;
export type RoomMemberRole = z.infer<typeof RoomMemberRoleSchema>;
export declare const RoomMemberSchema: z.ZodObject<{
    roomId: z.ZodString;
    userId: z.ZodString;
    user: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>;
    role: z.ZodEnum<{
        OWNER: "OWNER";
        HELPER: "HELPER";
        MEMBER: "MEMBER";
    }>;
    permissions: z.ZodDefault<z.ZodArray<z.ZodEnum<{
        MANAGE_CHAT: "MANAGE_CHAT";
        MANAGE_CALLS: "MANAGE_CALLS";
        MANAGE_RECRUITMENT: "MANAGE_RECRUITMENT";
        MANAGE_MEMBERS: "MANAGE_MEMBERS";
        OWNER_TRANSFER: "OWNER_TRANSFER";
        ROOM_DISSOLVE: "ROOM_DISSOLVE";
    }>>>;
    joinedAt: z.ZodString;
}, z.core.$strip>;
export type RoomMemberDTO = z.infer<typeof RoomMemberSchema>;
export declare const RoomSettingsSchema: z.ZodObject<{
    visibility: z.ZodDefault<z.ZodEnum<{
        PUBLIC: "PUBLIC";
        PRIVATE: "PRIVATE";
    }>>;
    invitePolicy: z.ZodDefault<z.ZodEnum<{
        OWNER_APPROVAL: "OWNER_APPROVAL";
        DIRECT_MEMBER: "DIRECT_MEMBER";
    }>>;
    playerCapacity: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type RoomSettingsDTO = z.infer<typeof RoomSettingsSchema>;
export declare const RoomSchema: z.ZodObject<{
    id: z.ZodString;
    conversationId: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    gameId: z.ZodString;
    gameTitle: z.ZodEnum<{
        "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
        Valorant: "Valorant";
        "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
        "Dota 2": "Dota 2";
        Roblox: "Roblox";
        "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
        "Free Fire": "Free Fire";
    }>;
    ownerId: z.ZodString;
    owner: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>;
    settings: z.ZodObject<{
        visibility: z.ZodDefault<z.ZodEnum<{
            PUBLIC: "PUBLIC";
            PRIVATE: "PRIVATE";
        }>>;
        invitePolicy: z.ZodDefault<z.ZodEnum<{
            OWNER_APPROVAL: "OWNER_APPROVAL";
            DIRECT_MEMBER: "DIRECT_MEMBER";
        }>>;
        playerCapacity: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    memberCount: z.ZodNumber;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type RoomDTO = z.infer<typeof RoomSchema>;
export declare const CreateRoomRequestSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    gameId: z.ZodString;
    gameTitle: z.ZodEnum<{
        "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
        Valorant: "Valorant";
        "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
        "Dota 2": "Dota 2";
        Roblox: "Roblox";
        "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
        "Free Fire": "Free Fire";
    }>;
    visibility: z.ZodDefault<z.ZodEnum<{
        PUBLIC: "PUBLIC";
        PRIVATE: "PRIVATE";
    }>>;
    invitePolicy: z.ZodDefault<z.ZodEnum<{
        OWNER_APPROVAL: "OWNER_APPROVAL";
        DIRECT_MEMBER: "DIRECT_MEMBER";
    }>>;
    playerCapacity: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;
export declare const UpdateRoomSettingsRequestSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    visibility: z.ZodOptional<z.ZodEnum<{
        PUBLIC: "PUBLIC";
        PRIVATE: "PRIVATE";
    }>>;
    invitePolicy: z.ZodOptional<z.ZodEnum<{
        OWNER_APPROVAL: "OWNER_APPROVAL";
        DIRECT_MEMBER: "DIRECT_MEMBER";
    }>>;
    playerCapacity: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type UpdateRoomSettingsRequest = z.infer<typeof UpdateRoomSettingsRequestSchema>;
export declare const UpdateHelperPermissionsRequestSchema: z.ZodObject<{
    permissions: z.ZodArray<z.ZodEnum<{
        MANAGE_CHAT: "MANAGE_CHAT";
        MANAGE_CALLS: "MANAGE_CALLS";
        MANAGE_RECRUITMENT: "MANAGE_RECRUITMENT";
        MANAGE_MEMBERS: "MANAGE_MEMBERS";
    }>>;
}, z.core.$strip>;
export type UpdateHelperPermissionsRequest = z.infer<typeof UpdateHelperPermissionsRequestSchema>;
export declare const ListOwnRoomsQuerySchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type ListOwnRoomsQuery = z.infer<typeof ListOwnRoomsQuerySchema>;
export declare const TransferRoomOwnerSchema: z.ZodObject<{
    newOwnerId: z.ZodString;
}, z.core.$strip>;
export type TransferRoomOwnerRequest = z.infer<typeof TransferRoomOwnerSchema>;
