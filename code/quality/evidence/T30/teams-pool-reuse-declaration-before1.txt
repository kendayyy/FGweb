import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PoolClient } from 'pg';
import { JoinRequestDTO, TeamSnapshotDTO } from '@fg/contracts';
type Room = {
    id: string;
    owner_id: string;
    visibility: string;
    conversation_id: string;
};
export declare class TeamsService implements OnModuleInit, OnModuleDestroy {
    private pool;
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    transaction<T>(run: (db: PoolClient) => Promise<T>): Promise<T>;
    private dto;
    private lockUsers;
    private eligible;
    private actor;
    private room;
    private member;
    private card;
    private play;
    private notify;
    apply(userId: string, sessionId: string, id: string): Promise<JoinRequestDTO>;
    admit(db: PoolClient, room: Room, playSessionId: string, userId: string, excludeJoinRequestId?: string): Promise<void>;
    respond(userId: string, sessionId: string, id: string, action: 'ACCEPT' | 'REJECT'): Promise<JoinRequestDTO>;
    cancel(userId: string, sessionId: string, id: string): Promise<{
        success: boolean;
    }>;
    mine(userId: string, sessionId: string): Promise<{
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
    requests(userId: string, sessionId: string, id: string): Promise<{
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
    snapshot(userId: string, sessionId: string, id: string): Promise<TeamSnapshotDTO>;
}
export {};
