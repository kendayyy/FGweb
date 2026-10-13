import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ChatActor } from '../chat/chat.service.js';
export declare class PrivateNotificationsService implements OnModuleInit, OnModuleDestroy {
    private pool;
    private ready;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private actor;
    private dto;
    private binding;
    private notice;
    private finalNotices;
    private select;
    list(actor: ChatActor, input: unknown): Promise<{
        items: {
            id: string;
            userId: string;
            type: "DM" | "MENTION" | "FRIEND_INVITE" | "ROOM_INVITE" | "TEAM_INVITE" | "JOIN_REQUEST" | "JOIN_REQUEST_RESULT" | "REMINDER_10MIN";
            title: string;
            body: string;
            isRead: boolean;
            createdAt: string;
            data?: {
                conversationId: string;
                messageId: string;
                senderId: string;
            } | {
                conversationId: string;
                messageId: string;
                mentionerId: string;
            } | {
                requestId: string;
                senderId: string;
            } | {
                invitationId: string;
                roomId: string;
                senderId: string;
            } | {
                invitationId: string;
                roomId: string;
                playSessionId: string;
                senderId: string;
            } | {
                requestId: string;
                recruitmentId: string;
                applicantId: string;
            } | {
                requestId: string;
                recruitmentId: string;
                result: "ACCEPTED" | "REJECTED";
            } | {
                playSessionId: string;
                roomId: string;
                scheduledAt: string;
            } | undefined;
        }[];
        hasMore: boolean;
        nextCursor: string | null;
    }>;
    recipient(id: string): Promise<string | null>;
    realtimeNotice(actor: ChatActor, id: string): Promise<{
        id: string;
        userId: string;
        type: "DM" | "MENTION" | "FRIEND_INVITE" | "ROOM_INVITE" | "TEAM_INVITE" | "JOIN_REQUEST" | "JOIN_REQUEST_RESULT" | "REMINDER_10MIN";
        title: string;
        body: string;
        isRead: boolean;
        createdAt: string;
        data?: {
            conversationId: string;
            messageId: string;
            senderId: string;
        } | {
            conversationId: string;
            messageId: string;
            mentionerId: string;
        } | {
            requestId: string;
            senderId: string;
        } | {
            invitationId: string;
            roomId: string;
            senderId: string;
        } | {
            invitationId: string;
            roomId: string;
            playSessionId: string;
            senderId: string;
        } | {
            requestId: string;
            recruitmentId: string;
            applicantId: string;
        } | {
            requestId: string;
            recruitmentId: string;
            result: "ACCEPTED" | "REJECTED";
        } | {
            playSessionId: string;
            roomId: string;
            scheduledAt: string;
        } | undefined;
    } | null>;
    dispatch(publish: (id: string) => Promise<void>): Promise<void>;
}
