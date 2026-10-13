import { AuthenticatedRequest } from '../../common/session.guard.js';
import { PlaySessionsService } from './play-sessions.service.js';
export declare class PlaySessionsController {
    private readonly service;
    constructor(service: PlaySessionsService);
    listRoom(req: AuthenticatedRequest, id: string, raw: Record<string, unknown>): Promise<import("@fg/contracts").Page<{
        id: string;
        roomId: string;
        hostUserId: string;
        timingType: "scheduledAt" | "now";
        state: "ACTIVE" | "SCHEDULED" | "ENDED";
        createdAt: string;
        updatedAt: string;
        playerCapacity?: number | undefined;
        scheduledAt?: string | undefined;
    }>>;
    join(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        id: string;
        recruitmentId: string;
        applicantId: string;
        status: "ACCEPTED" | "PENDING" | "REJECTED" | "CANCELLED";
        createdAt: string;
        applicant?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>;
    requests(req: AuthenticatedRequest, id: string): Promise<{
        id: string;
        recruitmentId: string;
        applicantId: string;
        status: "ACCEPTED" | "PENDING" | "REJECTED" | "CANCELLED";
        createdAt: string;
        applicant?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }[]>;
    respond(req: AuthenticatedRequest, id: string, requestId: string, body: unknown): Promise<{
        id: string;
        recruitmentId: string;
        applicantId: string;
        status: "ACCEPTED" | "PENDING" | "REJECTED" | "CANCELLED";
        createdAt: string;
        applicant?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>;
    start(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        id: string;
        roomId: string;
        hostUserId: string;
        timingType: "scheduledAt" | "now";
        state: "ACTIVE" | "SCHEDULED" | "ENDED";
        createdAt: string;
        updatedAt: string;
        playerCapacity?: number | undefined;
        scheduledAt?: string | undefined;
    }>;
    leave(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        success: boolean;
    }>;
    end(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        id: string;
        roomId: string;
        hostUserId: string;
        timingType: "scheduledAt" | "now";
        state: "ACTIVE" | "SCHEDULED" | "ENDED";
        createdAt: string;
        updatedAt: string;
        playerCapacity?: number | undefined;
        scheduledAt?: string | undefined;
    }>;
}
