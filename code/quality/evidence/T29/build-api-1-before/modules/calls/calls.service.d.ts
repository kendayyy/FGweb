import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RoomsService } from '../rooms/rooms.service.js';
import { AuthService } from '../auth/auth.service.js';
export declare class CallsService implements OnModuleInit, OnModuleDestroy {
    private readonly auth;
    private readonly rooms;
    private pool;
    private readonly issuedRooms;
    private afterLeave?;
    setAfterLeave(callback?: (id: string) => Promise<void>): void;
    constructor(auth: AuthService, rooms: RoomsService);
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    private config;
    private transaction;
    private actor;
    private room;
    private dto;
    create(user: string, session: string, roomId: string): Promise<{
        id: string;
        roomId: string;
        state: "OPEN" | "CLOSED";
        participantCount: number;
        publisherCount: number;
        hasExternalLive: boolean;
        createdAt: string;
        externalLive?: {
            id: string;
            callId: string;
            provider: "twitch" | "youtube";
            url: string;
            configuredBy: string;
            createdAt: string;
            title?: string | undefined;
        } | undefined;
    }>;
    list(user: string, session: string, roomId: string): Promise<{
        id: string;
        roomId: string;
        state: "OPEN" | "CLOSED";
        participantCount: number;
        publisherCount: number;
        hasExternalLive: boolean;
        createdAt: string;
        externalLive?: {
            id: string;
            callId: string;
            provider: "twitch" | "youtube";
            url: string;
            configuredBy: string;
            createdAt: string;
            title?: string | undefined;
        } | undefined;
    }[]>;
    private controlsGroup;
    private participantDtos;
    participants(user: string, session: string, id: string): Promise<{
        callId: string;
        userId: string;
        isPublishing: boolean;
        isMuted: boolean;
        joinedAt: string;
        user?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        mediaIdentity?: string | undefined;
        micRestricted?: boolean | undefined;
    }[]>;
    selfMic(user: string, session: string, id: string, muted: boolean): Promise<{
        callId: string;
        userId: string;
        isPublishing: boolean;
        isMuted: boolean;
        joinedAt: string;
        user?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        mediaIdentity?: string | undefined;
        micRestricted?: boolean | undefined;
    }>;
    private release;
    join(user: string, session: string, id: string): Promise<{
        callId: string;
        token: string;
        sfuUrl: string;
        roomName: string;
    }>;
    leave(user: string, session: string, id: string): Promise<{
        success: boolean;
    }>;
    revokeSession(sessionId: string): Promise<void>;
    private sessionDeleted;
    reconcile(): Promise<void>;
}
