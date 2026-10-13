import { AuthenticatedRequest } from '../../common/session.guard.js';
import { RoomsService } from './rooms.service.js';
export declare class RoomsController {
    private readonly roomsService;
    constructor(roomsService: RoomsService);
    listRooms(req: AuthenticatedRequest, query: unknown): Promise<import("@fg/contracts").Page<{
        id: string;
        conversationId: string;
        name: string;
        gameId: string;
        gameTitle: "Liên Minh Huyền Thoại" | "Valorant" | "Teamfight Tactics (TFT)" | "Dota 2" | "Roblox" | "Liên Quân Mobile" | "Free Fire";
        ownerId: string;
        settings: {
            visibility: "PUBLIC" | "PRIVATE";
            invitePolicy: "OWNER_APPROVAL" | "DIRECT_MEMBER";
            playerCapacity: number;
        };
        memberCount: number;
        createdAt: string;
        updatedAt: string;
        description?: string | undefined;
        owner?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>>;
    listOwnRooms(req: AuthenticatedRequest, query: unknown): Promise<import("@fg/contracts").Page<{
        id: string;
        conversationId: string;
        name: string;
        gameId: string;
        gameTitle: "Liên Minh Huyền Thoại" | "Valorant" | "Teamfight Tactics (TFT)" | "Dota 2" | "Roblox" | "Liên Quân Mobile" | "Free Fire";
        ownerId: string;
        settings: {
            visibility: "PUBLIC" | "PRIVATE";
            invitePolicy: "OWNER_APPROVAL" | "DIRECT_MEMBER";
            playerCapacity: number;
        };
        memberCount: number;
        createdAt: string;
        updatedAt: string;
        description?: string | undefined;
        owner?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>>;
    createRoom(req: AuthenticatedRequest, body: unknown): Promise<{
        id: string;
        conversationId: string;
        name: string;
        gameId: string;
        gameTitle: "Liên Minh Huyền Thoại" | "Valorant" | "Teamfight Tactics (TFT)" | "Dota 2" | "Roblox" | "Liên Quân Mobile" | "Free Fire";
        ownerId: string;
        settings: {
            visibility: "PUBLIC" | "PRIVATE";
            invitePolicy: "OWNER_APPROVAL" | "DIRECT_MEMBER";
            playerCapacity: number;
        };
        memberCount: number;
        createdAt: string;
        updatedAt: string;
        description?: string | undefined;
        owner?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>;
    getRoomDetail(req: AuthenticatedRequest, id: string): Promise<{
        id: string;
        conversationId: string;
        name: string;
        gameId: string;
        gameTitle: "Liên Minh Huyền Thoại" | "Valorant" | "Teamfight Tactics (TFT)" | "Dota 2" | "Roblox" | "Liên Quân Mobile" | "Free Fire";
        ownerId: string;
        settings: {
            visibility: "PUBLIC" | "PRIVATE";
            invitePolicy: "OWNER_APPROVAL" | "DIRECT_MEMBER";
            playerCapacity: number;
        };
        memberCount: number;
        createdAt: string;
        updatedAt: string;
        description?: string | undefined;
        owner?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>;
    listRoomMembers(req: AuthenticatedRequest, id: string): Promise<{
        roomId: string;
        userId: string;
        role: "OWNER" | "HELPER" | "MEMBER";
        permissions: ("MANAGE_CHAT" | "MANAGE_CALLS" | "MANAGE_RECRUITMENT" | "MANAGE_MEMBERS" | "OWNER_TRANSFER" | "ROOM_DISSOLVE")[];
        joinedAt: string;
        user?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }[]>;
    updateRoomSettings(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        id: string;
        conversationId: string;
        name: string;
        gameId: string;
        gameTitle: "Liên Minh Huyền Thoại" | "Valorant" | "Teamfight Tactics (TFT)" | "Dota 2" | "Roblox" | "Liên Quân Mobile" | "Free Fire";
        ownerId: string;
        settings: {
            visibility: "PUBLIC" | "PRIVATE";
            invitePolicy: "OWNER_APPROVAL" | "DIRECT_MEMBER";
            playerCapacity: number;
        };
        memberCount: number;
        createdAt: string;
        updatedAt: string;
        description?: string | undefined;
        owner?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>;
    updateHelperPermissions(req: AuthenticatedRequest, id: string, targetUserId: string, body: unknown): Promise<{
        roomId: string;
        userId: string;
        role: "OWNER" | "HELPER" | "MEMBER";
        permissions: ("MANAGE_CHAT" | "MANAGE_CALLS" | "MANAGE_RECRUITMENT" | "MANAGE_MEMBERS" | "OWNER_TRANSFER" | "ROOM_DISSOLVE")[];
        joinedAt: string;
        user?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>;
    transferOwner(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        id: string;
        conversationId: string;
        name: string;
        gameId: string;
        gameTitle: "Liên Minh Huyền Thoại" | "Valorant" | "Teamfight Tactics (TFT)" | "Dota 2" | "Roblox" | "Liên Quân Mobile" | "Free Fire";
        ownerId: string;
        settings: {
            visibility: "PUBLIC" | "PRIVATE";
            invitePolicy: "OWNER_APPROVAL" | "DIRECT_MEMBER";
            playerCapacity: number;
        };
        memberCount: number;
        createdAt: string;
        updatedAt: string;
        description?: string | undefined;
        owner?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>;
    leaveOrRemoveMember(req: AuthenticatedRequest, id: string, targetUserId: string): Promise<{
        success: boolean;
    }>;
    dissolveRoom(req: AuthenticatedRequest, id: string): Promise<{
        success: boolean;
    }>;
}
