import { AuthenticatedRequest } from '../../common/session.guard.js';
import { SocialService } from './social.service.js';
export declare class SocialController {
    private readonly socialService;
    constructor(socialService: SocialService);
    getFriends(req: AuthenticatedRequest, query: unknown): Promise<import("@fg/contracts").Page<{
        id: string;
        displayName: string;
        customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
        gameProfiles: {
            gameId: string;
            gameTitle: "Liên Minh Huyền Thoại" | "Valorant" | "Teamfight Tactics (TFT)" | "Dota 2" | "Roblox" | "Liên Quân Mobile" | "Free Fire";
            inGameName?: string | undefined;
            rank?: string | undefined;
            role?: string | undefined;
            playHours?: number | undefined;
            playStyle?: string | undefined;
        }[];
        createdAt: string;
        avatarUrl?: string | null | undefined;
        bio?: string | null | undefined;
    }>>;
    getFriendRequests(req: AuthenticatedRequest, query: unknown): Promise<import("@fg/contracts").Page<{
        requestId: string;
        sender: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        };
        receiver: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        };
        status: "PENDING";
        createdAt: string;
        updatedAt: string;
    }>>;
    sendFriendRequest(req: AuthenticatedRequest, body: unknown): Promise<{
        requestId: string;
        status: "PENDING";
    }>;
    respondFriendRequest(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        success: boolean;
    }>;
    removeFriend(req: AuthenticatedRequest, userId: string, body: unknown): Promise<{
        success: boolean;
    }>;
    cancelFriendRequest(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        success: boolean;
    }>;
    getDirectConversations(req: AuthenticatedRequest, query: unknown): Promise<import("@fg/contracts").Page<{
        conversationId: string;
        peer: import("@fg/contracts").ProfileDTO;
    }>>;
    createDirectConversation(req: AuthenticatedRequest, body: unknown): Promise<{
        conversationId: string;
    }>;
    getBlocks(req: AuthenticatedRequest): Promise<{
        id: string;
        blockerId: string;
        blockedId: string;
        createdAt: string;
        blockedUser?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }[]>;
    createBlock(req: AuthenticatedRequest, body: unknown): Promise<{
        id: string;
        blockerId: string;
        blockedId: string;
        createdAt: string;
        blockedUser?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>;
    deleteBlock(req: AuthenticatedRequest, userId: string): Promise<{
        success: boolean;
    }>;
}
