import type { Request } from 'express';
import { ChatService } from '../chat/chat.service.js';
import { PrivateNotificationsService } from './private-notifications.service.js';
export declare class PrivateNotificationsController {
    private readonly chat;
    private readonly notices;
    constructor(chat: ChatService, notices: PrivateNotificationsService);
    list(req: Request, query: unknown): Promise<{
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
}
