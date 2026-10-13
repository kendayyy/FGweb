import { AuthenticatedRequest } from '../../common/session.guard.js';
import { ProfilesService } from './profiles.service.js';
export declare class ProfilesController {
    private readonly profilesService;
    constructor(profilesService: ProfilesService);
    getPublicProfile(id: string): Promise<{
        id: string;
        displayName: string;
        customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
        gameProfiles: {
            gameId: string;
            gameTitle: "Liên Minh Huyền Thoại" | "Valorant" | "Teamfight Tactics (TFT)" | "Dota 2" | "Roblox" | "Liên Quân Mobile" | "Free Fire";
            inGameName?: string | undefined;
            rank?: string | undefined;
            role?: string | undefined;
            playHours?: number | undefined;
            playStyle?: string | undefined;
        }[];
        createdAt: string;
        avatarUrl?: string | null | undefined;
        bio?: string | null | undefined;
    }>;
    getGames(query: unknown): Promise<{
        id: string;
        title: "Liên Minh Huyền Thoại" | "Valorant" | "Teamfight Tactics (TFT)" | "Dota 2" | "Roblox" | "Liên Quân Mobile" | "Free Fire";
        lobbyRoomId: string;
        description?: string | undefined;
        iconUrl?: string | undefined;
        bannerUrl?: string | undefined;
    }[]>;
    updateProfile(req: AuthenticatedRequest, body: unknown): Promise<{
        id: string;
        displayName: string;
        customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
        gameProfiles: {
            gameId: string;
            gameTitle: "Liên Minh Huyền Thoại" | "Valorant" | "Teamfight Tactics (TFT)" | "Dota 2" | "Roblox" | "Liên Quân Mobile" | "Free Fire";
            inGameName?: string | undefined;
            rank?: string | undefined;
            role?: string | undefined;
            playHours?: number | undefined;
            playStyle?: string | undefined;
        }[];
        createdAt: string;
        email: string;
        discordId: string | null;
        emailVerified: boolean;
        avatarUrl?: string | null | undefined;
        bio?: string | null | undefined;
    }>;
    onboarding(req: AuthenticatedRequest, body: unknown): Promise<{
        id: string;
        displayName: string;
        customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
        gameProfiles: {
            gameId: string;
            gameTitle: "Liên Minh Huyền Thoại" | "Valorant" | "Teamfight Tactics (TFT)" | "Dota 2" | "Roblox" | "Liên Quân Mobile" | "Free Fire";
            inGameName?: string | undefined;
            rank?: string | undefined;
            role?: string | undefined;
            playHours?: number | undefined;
            playStyle?: string | undefined;
        }[];
        createdAt: string;
        email: string;
        discordId: string | null;
        emailVerified: boolean;
        avatarUrl?: string | null | undefined;
        bio?: string | null | undefined;
    }>;
    updateInterests(req: AuthenticatedRequest, body: unknown): Promise<{
        interestedGames: ("Liên Minh Huyền Thoại" | "Valorant" | "Teamfight Tactics (TFT)" | "Dota 2" | "Roblox" | "Liên Quân Mobile" | "Free Fire")[];
    }>;
    updateGameProfile(req: AuthenticatedRequest, gameId: string, body: unknown): Promise<{
        gameId: string;
        gameTitle: "Liên Minh Huyền Thoại" | "Valorant" | "Teamfight Tactics (TFT)" | "Dota 2" | "Roblox" | "Liên Quân Mobile" | "Free Fire";
        inGameName?: string | undefined;
        rank?: string | undefined;
        role?: string | undefined;
        playHours?: number | undefined;
        playStyle?: string | undefined;
    }>;
}
