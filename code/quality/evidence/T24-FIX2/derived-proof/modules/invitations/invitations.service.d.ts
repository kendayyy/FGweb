import { type CreateInvitationRequest } from '@fg/contracts';
import { TeamsService } from '../teams/teams.service.js';
export declare class InvitationsService {
    private readonly teams;
    constructor(teams: TeamsService);
    private dto;
    private eligible;
    private actor;
    private room;
    private member;
    private manager;
    private pair;
    private lockUsers;
    private invite;
    private notify;
    private admit;
    private finalize;
    create(actor: string, session: string, body: CreateInvitationRequest): Promise<{
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
    respond(actor: string, session: string, id: string, action: 'ACCEPT' | 'REJECT'): Promise<{
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
    approve(actor: string, session: string, id: string, action: 'ACCEPT' | 'REJECT'): Promise<{
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
    mine(actor: string, session: string): Promise<({
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
}
