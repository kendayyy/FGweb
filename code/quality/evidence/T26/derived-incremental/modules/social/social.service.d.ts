import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ErrorCode, ListFriendsQuery, ListFriendRequestsQuery, ListDirectConversationsQuery, Page, ProfileDTO, PendingFriendRequestDTO, BlockDTO } from '@fg/contracts';
import { ProfilesService } from '../profiles/profiles.service.js';
export declare function socialError(code: ErrorCode, message: string): never;
export declare class SocialService implements OnModuleInit, OnModuleDestroy {
    private readonly profilesService;
    private pool;
    constructor(profilesService: ProfilesService);
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    private userExists;
    private checkActorSessionAndBan;
    private getUserSummary;
    getFriends(userId: string, query: ListFriendsQuery): Promise<Page<ProfileDTO>>;
    getFriendRequests(userId: string, query: ListFriendRequestsQuery): Promise<Page<PendingFriendRequestDTO>>;
    sendFriendRequest(actorId: string, sessionId: string, targetUserId: string): Promise<{
        requestId: string;
        status: 'PENDING';
    }>;
    respondFriendRequest(actorId: string, sessionId: string, requestId: string, action: 'ACCEPT' | 'REJECT'): Promise<{
        success: boolean;
    }>;
    removeFriend(actorId: string, sessionId: string, targetUserId: string): Promise<{
        success: boolean;
    }>;
    cancelFriendRequest(actorId: string, sessionId: string, requestId: string): Promise<{
        success: boolean;
    }>;
    getDirectConversations(actorId: string, query: ListDirectConversationsQuery): Promise<Page<{
        conversationId: string;
        peer: ProfileDTO;
    }>>;
    createDirectConversation(actorId: string, sessionId: string, recipientUserId: string): Promise<{
        conversationId: string;
    }>;
    getBlocks(actorId: string): Promise<BlockDTO[]>;
    createBlock(actorId: string, sessionId: string, blockedId: string): Promise<BlockDTO>;
    deleteBlock(actorId: string, sessionId: string, targetUserId: string): Promise<{
        success: boolean;
    }>;
}
