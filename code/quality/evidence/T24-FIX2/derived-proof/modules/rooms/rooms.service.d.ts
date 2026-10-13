import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ErrorCode, CreateRoomRequest, UpdateRoomSettingsRequest, UpdateHelperPermissionsRequest, TransferRoomOwnerRequest, ListOwnRoomsQuery, RoomDTO, RoomMemberDTO, Page } from '@fg/contracts';
import { ProfilesService } from '../profiles/profiles.service.js';
export declare function roomError(code: ErrorCode, message: string): never;
export declare class RoomsService implements OnModuleInit, OnModuleDestroy {
    private readonly profilesService;
    private pool;
    constructor(profilesService: ProfilesService);
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    private checkActorSessionAndBan;
    private buildRoomDto;
    createRoom(actorId: string, sessionId: string, dto: CreateRoomRequest): Promise<RoomDTO>;
    listOwnRooms(actorId: string, sessionId: string, query: ListOwnRoomsQuery): Promise<Page<RoomDTO>>;
    getRoomDetail(actorId: string, sessionId: string, roomId: string): Promise<RoomDTO>;
    listRoomMembers(actorId: string, sessionId: string, roomId: string): Promise<RoomMemberDTO[]>;
    updateSettings(actorId: string, sessionId: string, roomId: string, dto: UpdateRoomSettingsRequest): Promise<RoomDTO>;
    updateHelperPermissions(actorId: string, sessionId: string, roomId: string, targetUserId: string, dto: UpdateHelperPermissionsRequest): Promise<RoomMemberDTO>;
    transferOwner(actorId: string, sessionId: string, roomId: string, dto: TransferRoomOwnerRequest): Promise<RoomDTO>;
    leaveOrRemoveMember(actorId: string, sessionId: string, roomId: string, targetUserId: string): Promise<{
        success: boolean;
    }>;
    dissolveRoom(actorId: string, sessionId: string, roomId: string): Promise<{
        success: boolean;
    }>;
}
