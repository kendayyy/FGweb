import { AuthenticatedRequest } from '../../common/session.guard.js';
import { RoomsService } from '../rooms/rooms.service.js';
export declare class PermissionsController {
    private readonly rooms;
    constructor(rooms: RoomsService);
    settings(req: AuthenticatedRequest, id: string): Promise<{
        visibility: "PUBLIC" | "PRIVATE";
        invitePolicy: "OWNER_APPROVAL" | "DIRECT_MEMBER";
        playerCapacity: number;
    }>;
    grants(req: AuthenticatedRequest, id: string, userId: string, body: unknown): Promise<{
        roomId: string;
        userId: string;
        role: "OWNER" | "HELPER" | "MEMBER";
        permissions: ("MANAGE_CHAT" | "MANAGE_CALLS" | "MANAGE_RECRUITMENT" | "MANAGE_MEMBERS" | "OWNER_TRANSFER" | "ROOM_DISSOLVE")[];
        joinedAt: string;
        user?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
    }>;
}
