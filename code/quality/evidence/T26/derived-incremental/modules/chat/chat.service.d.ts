import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import type { IncomingHttpHeaders } from 'node:http';
import { MessageDTO, CreateMessageRequest, ListMessagesQuery, Page, ErrorCode } from '@fg/contracts';
import { AuthService } from '../auth/auth.service.js';
export type ChatActor = {
    userId: string;
    sessionId: string;
} | null;
export declare function chatError(code: ErrorCode, message: string): never;
type Queryable = Pool | PoolClient;
export declare function lockSocialPair(db: Queryable, firstId: string, secondId: string): Promise<void>;
export declare class ChatService implements OnModuleInit, OnModuleDestroy {
    private readonly auth;
    private pool;
    constructor(auth: AuthService);
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    actor(headers: IncomingHttpHeaders): Promise<ChatActor>;
    conversation(id: string, db?: Queryable): Promise<{
        id: string;
        kind: string;
        lobby_id: string | null;
        user1_id: string | null;
        user2_id: string | null;
    }>;
    authorize(conversationId: string, actor: ChatActor, db?: Queryable, write?: boolean): Promise<string>;
    lobby(gameId: string): Promise<string>;
    lobbyTitle(title: string): Promise<string>;
    private dto;
    history(id: string, query: ListMessagesQuery, actor: ChatActor): Promise<Page<MessageDTO>>;
    create(id: string, input: CreateMessageRequest, actor: ChatActor): Promise<{
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
    committedMessage(messageId: string): Promise<{
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
    dispatch(publish: (messageId: string) => Promise<void>): Promise<void>;
}
export {};
