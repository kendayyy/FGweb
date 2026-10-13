import { AuthenticatedRequest } from '../../common/session.guard.js';
import { InvitationsService } from './invitations.service.js';
export declare class InvitationsController {
    private readonly service;
    constructor(service: InvitationsService);
    mine(req: AuthenticatedRequest): Promise<({
        id: string;
        targetType: "ROOM";
        senderId: string;
        receiverId: string;
        roomId: string;
        status: "ACCEPTED" | "PENDING" | "REJECTED" | "CANCELLED";
        createdAt: string;
        sender?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        receiver?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        recipientAcceptedAt?: string | undefined;
    } | {
        id: string;
        targetType: "PLAY_SESSION";
        senderId: string;
        receiverId: string;
        roomId: string;
        playSessionId: string;
        status: "ACCEPTED" | "PENDING" | "REJECTED" | "CANCELLED";
        createdAt: string;
        sender?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        receiver?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        recipientAcceptedAt?: string | undefined;
    })[]>;
    create(req: AuthenticatedRequest, body: unknown): Promise<{
        id: string;
        targetType: "ROOM";
        senderId: string;
        receiverId: string;
        roomId: string;
        status: "ACCEPTED" | "PENDING" | "REJECTED" | "CANCELLED";
        createdAt: string;
        sender?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        receiver?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        recipientAcceptedAt?: string | undefined;
    } | {
        id: string;
        targetType: "PLAY_SESSION";
        senderId: string;
        receiverId: string;
        roomId: string;
        playSessionId: string;
        status: "ACCEPTED" | "PENDING" | "REJECTED" | "CANCELLED";
        createdAt: string;
        sender?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        receiver?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        recipientAcceptedAt?: string | undefined;
    }>;
    respond(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        id: string;
        targetType: "ROOM";
        senderId: string;
        receiverId: string;
        roomId: string;
        status: "ACCEPTED" | "PENDING" | "REJECTED" | "CANCELLED";
        createdAt: string;
        sender?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        receiver?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        recipientAcceptedAt?: string | undefined;
    } | {
        id: string;
        targetType: "PLAY_SESSION";
        senderId: string;
        receiverId: string;
        roomId: string;
        playSessionId: string;
        status: "ACCEPTED" | "PENDING" | "REJECTED" | "CANCELLED";
        createdAt: string;
        sender?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        receiver?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        recipientAcceptedAt?: string | undefined;
    }>;
    approve(req: AuthenticatedRequest, id: string, body: unknown): Promise<{
        id: string;
        targetType: "ROOM";
        senderId: string;
        receiverId: string;
        roomId: string;
        status: "ACCEPTED" | "PENDING" | "REJECTED" | "CANCELLED";
        createdAt: string;
        sender?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        receiver?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        recipientAcceptedAt?: string | undefined;
    } | {
        id: string;
        targetType: "PLAY_SESSION";
        senderId: string;
        receiverId: string;
        roomId: string;
        playSessionId: string;
        status: "ACCEPTED" | "PENDING" | "REJECTED" | "CANCELLED";
        createdAt: string;
        sender?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        receiver?: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        } | undefined;
        recipientAcceptedAt?: string | undefined;
    }>;
}
