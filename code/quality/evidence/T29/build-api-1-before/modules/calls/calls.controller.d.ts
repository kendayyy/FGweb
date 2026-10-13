import { AuthenticatedRequest } from '../../common/session.guard.js';
import { CallsService } from './calls.service.js';
export declare class CallsController {
    private readonly calls;
    constructor(calls: CallsService);
    create(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
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
    list(req: AuthenticatedRequest, id: string): Promise<{
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
    join(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        callId: string;
        token: string;
        sfuUrl: string;
        roomName: string;
    }>;
    leave(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        success: boolean;
    }>;
    participants(req: AuthenticatedRequest, id: string, query: Record<string, unknown>): Promise<{
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
    selfMic(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
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
}
