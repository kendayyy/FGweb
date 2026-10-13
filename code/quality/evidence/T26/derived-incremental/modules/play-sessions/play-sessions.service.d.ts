import { type PlaySessionDTO, type Page, type ListRoomPlaySessionsQuery } from '@fg/contracts';
import { TeamsService } from '../teams/teams.service.js';
export declare class PlaySessionsService {
    private readonly teams;
    constructor(teams: TeamsService);
    private dto;
    private joinDto;
    private eligible;
    private actor;
    private member;
    private play;
    private context;
    private card;
    private notification;
    listRoom(user: string, session: string, id: string, query: ListRoomPlaySessionsQuery): Promise<Page<PlaySessionDTO>>;
    join(user: string, session: string, id: string): Promise<{
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
    requests(user: string, session: string, id: string): Promise<{
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
    respond(user: string, session: string, id: string, requestId: string, action: 'ACCEPT' | 'REJECT'): Promise<{
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
    start(user: string, session: string, id: string): Promise<{
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
    leave(user: string, session: string, id: string): Promise<{
        success: boolean;
    }>;
    end(user: string, session: string, id: string): Promise<{
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
