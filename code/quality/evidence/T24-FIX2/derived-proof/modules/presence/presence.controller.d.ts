import type { Request } from 'express';
import { PresenceService } from './presence.service.js';
import { ChatService } from '../chat/chat.service.js';
import { PresenceGateway } from './presence.gateway.js';
export declare class PresenceController {
    private readonly presenceService;
    private readonly chatService;
    private readonly presenceGateway;
    constructor(presenceService: PresenceService, chatService: ChatService, presenceGateway: PresenceGateway);
    getGameOnlineUsers(id: string, query: Record<string, unknown>): Promise<import("@fg/contracts").Page<{
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
    }>>;
    getOnlineUsers(query: Record<string, unknown>): Promise<import("@fg/contracts").Page<{
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
    }>>;
    updateCustomStatus(body: unknown, req: Request): Promise<{
        customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
        isOnline?: boolean | undefined;
    }>;
}
