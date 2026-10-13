import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@fg/database';
import { ProfileDTO, PrivateProfileDTO, GameDTO, InterestsResponse, GameProfileDTO, UpdateProfileRequest, OnboardingRequest, UpdateInterestsRequest, UpdateGameProfileRequest } from '@fg/contracts';
export declare class ProfilesService implements OnModuleInit, OnModuleDestroy {
    private db;
    private pool?;
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    setDb(db: NodePgDatabase<typeof schema>): void;
    private checkReservedName;
    private initDatabase;
    getPublicProfile(userId: string): Promise<ProfileDTO>;
    getPrivateProfile(userId: string): Promise<PrivateProfileDTO>;
    getGames(search?: string): Promise<GameDTO[]>;
    updateProfile(userId: string, body: UpdateProfileRequest, userImage?: string | null): Promise<PrivateProfileDTO>;
    onboarding(userId: string, body: OnboardingRequest, userImage?: string | null): Promise<PrivateProfileDTO>;
    updateInterests(userId: string, body: UpdateInterestsRequest): Promise<InterestsResponse>;
    updateGameProfile(userId: string, gameId: string, body: UpdateGameProfileRequest): Promise<GameProfileDTO>;
}
