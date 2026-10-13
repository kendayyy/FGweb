import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { z } from 'zod';
import { CreateRecruitmentSchema, PublicRecruitmentQuerySchema, RecruitmentDTO, PublicRecruitmentDTO, Page } from '@fg/contracts';
type Create = z.infer<ReturnType<typeof CreateRecruitmentSchema>>;
type Query = z.infer<typeof PublicRecruitmentQuerySchema>;
export declare class RecruitmentsService implements OnModuleInit, OnModuleDestroy {
    private pool;
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    private dto;
    private transaction;
    private actor;
    private manage;
    create(actorId: string, sessionId: string, input: Create): Promise<RecruitmentDTO>;
    setOpen(actorId: string, sessionId: string, id: string, open: boolean): Promise<RecruitmentDTO>;
    list(query: Query, suggestions?: boolean, pathGameId?: string): Promise<Page<PublicRecruitmentDTO>>;
    publicDetail(id: string): Promise<{
        id: string;
        roomId: string;
        gameId: string;
        gameTitle: "Liên Minh Huyền Thoại" | "Valorant" | "Teamfight Tactics (TFT)" | "Dota 2" | "Roblox" | "Liên Quân Mobile" | "Free Fire";
        title: string;
        mode: string;
        playerCapacity: number;
        currentPlayers: number;
        timingType: "scheduledAt" | "now";
        createdAt: string;
        updatedAt: string;
        state: "OPEN";
        visibility: "PUBLIC";
        scheduledAt?: string | undefined;
        requirementText?: string | undefined;
        experienceName?: string | undefined;
        experienceUrl?: string | undefined;
    }>;
}
export {};
