import type { Request } from 'express';
import { ChatService } from './chat.service.js';
export declare class ChatController {
    private readonly chat;
    constructor(chat: ChatService);
    game(id: string, query: Record<string, unknown>, request: Request): Promise<import("@fg/contracts").Page<{
        id: string;
        conversationId: string;
        senderId: string;
        sender: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        };
        content: string;
        attachments: {
            id: string;
            url: string;
            fileName: string;
            fileSize: number;
            mimeType: "image/jpeg" | "image/png" | "image/webp";
        }[];
        mentions: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        }[];
        mentionedUserIds: string[];
        createdAt: string;
        replyToId?: string | null | undefined;
        updatedAt?: string | undefined;
        replyToMessage?: {
            id: string;
            conversationId: string;
            senderId: string;
            sender: {
                id: string;
                displayName: string;
                customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
                avatarUrl?: string | null | undefined;
            };
            content: string;
            attachments: {
                id: string;
                url: string;
                fileName: string;
                fileSize: number;
                mimeType: "image/jpeg" | "image/png" | "image/webp";
            }[];
            mentions: {
                id: string;
                displayName: string;
                customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
                avatarUrl?: string | null | undefined;
            }[];
            mentionedUserIds: string[];
            createdAt: string;
            replyToId?: string | null | undefined;
            updatedAt?: string | undefined;
        } | null | undefined;
    }>>;
    title(query: Record<string, unknown>, request: Request): Promise<import("@fg/contracts").Page<{
        id: string;
        conversationId: string;
        senderId: string;
        sender: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        };
        content: string;
        attachments: {
            id: string;
            url: string;
            fileName: string;
            fileSize: number;
            mimeType: "image/jpeg" | "image/png" | "image/webp";
        }[];
        mentions: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        }[];
        mentionedUserIds: string[];
        createdAt: string;
        replyToId?: string | null | undefined;
        updatedAt?: string | undefined;
        replyToMessage?: {
            id: string;
            conversationId: string;
            senderId: string;
            sender: {
                id: string;
                displayName: string;
                customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
                avatarUrl?: string | null | undefined;
            };
            content: string;
            attachments: {
                id: string;
                url: string;
                fileName: string;
                fileSize: number;
                mimeType: "image/jpeg" | "image/png" | "image/webp";
            }[];
            mentions: {
                id: string;
                displayName: string;
                customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
                avatarUrl?: string | null | undefined;
            }[];
            mentionedUserIds: string[];
            createdAt: string;
            replyToId?: string | null | undefined;
            updatedAt?: string | undefined;
        } | null | undefined;
    }>>;
    history(id: string, query: Record<string, unknown>, request: Request): Promise<import("@fg/contracts").Page<{
        id: string;
        conversationId: string;
        senderId: string;
        sender: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        };
        content: string;
        attachments: {
            id: string;
            url: string;
            fileName: string;
            fileSize: number;
            mimeType: "image/jpeg" | "image/png" | "image/webp";
        }[];
        mentions: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        }[];
        mentionedUserIds: string[];
        createdAt: string;
        replyToId?: string | null | undefined;
        updatedAt?: string | undefined;
        replyToMessage?: {
            id: string;
            conversationId: string;
            senderId: string;
            sender: {
                id: string;
                displayName: string;
                customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
                avatarUrl?: string | null | undefined;
            };
            content: string;
            attachments: {
                id: string;
                url: string;
                fileName: string;
                fileSize: number;
                mimeType: "image/jpeg" | "image/png" | "image/webp";
            }[];
            mentions: {
                id: string;
                displayName: string;
                customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
                avatarUrl?: string | null | undefined;
            }[];
            mentionedUserIds: string[];
            createdAt: string;
            replyToId?: string | null | undefined;
            updatedAt?: string | undefined;
        } | null | undefined;
    }>>;
    create(id: string, body: unknown, request: Request): Promise<{
        id: string;
        conversationId: string;
        senderId: string;
        sender: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        };
        content: string;
        attachments: {
            id: string;
            url: string;
            fileName: string;
            fileSize: number;
            mimeType: "image/jpeg" | "image/png" | "image/webp";
        }[];
        mentions: {
            id: string;
            displayName: string;
            customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
            avatarUrl?: string | null | undefined;
        }[];
        mentionedUserIds: string[];
        createdAt: string;
        replyToId?: string | null | undefined;
        updatedAt?: string | undefined;
        replyToMessage?: {
            id: string;
            conversationId: string;
            senderId: string;
            sender: {
                id: string;
                displayName: string;
                customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
                avatarUrl?: string | null | undefined;
            };
            content: string;
            attachments: {
                id: string;
                url: string;
                fileName: string;
                fileSize: number;
                mimeType: "image/jpeg" | "image/png" | "image/webp";
            }[];
            mentions: {
                id: string;
                displayName: string;
                customStatus: "LOOKING_FOR_TEAM" | "PLAYING" | "JUST_CHATTING";
                avatarUrl?: string | null | undefined;
            }[];
            mentionedUserIds: string[];
            createdAt: string;
            replyToId?: string | null | undefined;
            updatedAt?: string | undefined;
        } | null | undefined;
    }>;
}
