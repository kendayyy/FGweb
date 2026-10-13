import { type AuthenticatedRequest } from '../../common/session.guard.js';
import { CallsService } from './calls.service.js';
import { PublishingService } from './publishing.service.js';
import { CallModerationService } from './call-moderation.service.js';
export declare class CallControlsController {
    private readonly publishing;
    private readonly moderation;
    private readonly calls;
    constructor(publishing: PublishingService, moderation: CallModerationService, calls: CallsService);
    claim(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        callId: string;
        token: string;
        sfuUrl: string;
        roomName: string;
    }>;
    release(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        success: true;
    }>;
    moderate(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        success: true;
    }>;
    publishToken(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        callId: string;
        token: string;
        sfuUrl: string;
        roomName: string;
    }>;
    private participant;
    mute(req: AuthenticatedRequest, id: string, target: string, body: unknown): Promise<{
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
    kick(req: AuthenticatedRequest, id: string, target: string, body: unknown): Promise<{
        success: true;
    }>;
    stop(req: AuthenticatedRequest, id: string, target: string, body: unknown): Promise<{
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
