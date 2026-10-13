import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ListGameOnlineUsersQuery, ListOnlineUsersQuery, Page, ProfileDTO, CustomStatus } from '@fg/contracts';
import { ChatService, ChatActor } from '../chat/chat.service.js';
export declare class PresenceService implements OnModuleInit, OnModuleDestroy {
    private readonly chatService;
    private pool;
    private redis;
    private clockFn;
    private readonly logger;
    private lobbyGameIdCache;
    private sweepTimer?;
    private sweeping?;
    private closing;
    private pubsubCallback?;
    constructor(chatService: ChatService);
    setClock(fn?: () => number): void;
    get nowMs(): number;
    get ns(): string;
    private namespace;
    private component;
    setPubsubCallback(cb: (event: {
        conversationId: string;
        userId: string;
        isOnline: boolean;
    }) => Promise<void>): void;
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    private getRedis;
    getGameIdForLobby(convId: string): Promise<string | null>;
    private transition;
    addOrRenewLease(convId: string, userId: string, socketId: string, actor?: ChatActor): Promise<{
        isOnline: boolean;
        stateChanged: boolean;
    }>;
    removeLease(convId: string, userId: string, socketId: string): Promise<{
        isOnline: boolean;
        stateChanged: boolean;
    }>;
    sweepExpiredLeases(): Promise<void>;
    private pruneAuthorization;
    private performSweep;
    isUserOnlineInConv(convId: string, userId: string): Promise<boolean>;
    isUserOnlineAnywhere(userId: string): Promise<boolean>;
    getUserActiveConversations(userId: string): Promise<string[]>;
    getOnlineUserIdsForGame(gameId: string): Promise<string[]>;
    getOnlineUsersForGame(gameId: string, query: ListGameOnlineUsersQuery): Promise<Page<ProfileDTO>>;
    getOnlineUsersAll(query: ListOnlineUsersQuery): Promise<Page<ProfileDTO>>;
    getCustomStatus(userId: string): Promise<CustomStatus>;
    updateCustomStatus(actor: ChatActor, customStatusInput: unknown): Promise<{
        customStatus: CustomStatus;
        isOnline?: boolean;
    }>;
}
