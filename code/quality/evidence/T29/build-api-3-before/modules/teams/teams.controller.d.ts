import { AuthenticatedRequest } from '../../common/session.guard.js';
import { TeamsService } from './teams.service.js';
export declare class TeamsController {
    private readonly service;
    constructor(service: TeamsService);
    mine(req: AuthenticatedRequest): Promise<{
        id: string;
        recruitmentId: string;
        applicantId: string;
        status: "ACCEPTED" | "REJECTED" | "PENDING" | "CANCELLED";
        createdAt: string;
        applicant?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }[]>;
    apply(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        id: string;
        recruitmentId: string;
        applicantId: string;
        status: "ACCEPTED" | "REJECTED" | "PENDING" | "CANCELLED";
        createdAt: string;
        applicant?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>;
    list(req: AuthenticatedRequest, id: string): Promise<{
        id: string;
        recruitmentId: string;
        applicantId: string;
        status: "ACCEPTED" | "REJECTED" | "PENDING" | "CANCELLED";
        createdAt: string;
        applicant?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }[]>;
    approve(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        id: string;
        recruitmentId: string;
        applicantId: string;
        status: "ACCEPTED" | "REJECTED" | "PENDING" | "CANCELLED";
        createdAt: string;
        applicant?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>;
    reject(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        id: string;
        recruitmentId: string;
        applicantId: string;
        status: "ACCEPTED" | "REJECTED" | "PENDING" | "CANCELLED";
        createdAt: string;
        applicant?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>;
    respond(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        id: string;
        recruitmentId: string;
        applicantId: string;
        status: "ACCEPTED" | "REJECTED" | "PENDING" | "CANCELLED";
        createdAt: string;
        applicant?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>;
    cancel(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        success: boolean;
    }>;
    snapshot(req: AuthenticatedRequest, id: string): Promise<{
        playSession: {
            id: string;
            roomId: string;
            hostUserId: string;
            timingType: "scheduledAt" | "now";
            state: "ACTIVE" | "SCHEDULED" | "ENDED";
            createdAt: string;
            updatedAt: string;
            playerCapacity?: number | undefined;
            scheduledAt?: string | undefined;
        };
        roster: {
            playSessionId: string;
            userId: string;
            slotIndex: number;
            isHost: boolean;
            joinedAt: string;
            user?: {
                id: string;
                displayName: string;
                customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
                avatarUrl?: string | null | undefined;
            } | undefined;
        }[];
    }>;
}
