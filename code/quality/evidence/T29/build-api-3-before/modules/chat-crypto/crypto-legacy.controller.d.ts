import type { Request, Response } from 'express';
import { ChatService } from '../chat/chat.service.js';
import { CryptoLegacyService } from './crypto-legacy.service.js';
import { CryptoRelayService } from './crypto-relay.service.js';
export declare class CryptoLegacyController {
    private readonly chat;
    private readonly legacy;
    private readonly relay;
    constructor(chat: ChatService, legacy: CryptoLegacyService, relay: CryptoRelayService);
    upload(req: Request, id: string, body: Record<string, unknown>, res: Response, file?: {
        buffer: Buffer;
        size: number;
    }): Promise<{
        id: string;
        conversationId: string;
        ciphertextSize: number;
        ciphertextSha256: string;
        expiresAt?: string | undefined;
    }>;
    prepare(req: Request, id: string, body: unknown, res: Response): Promise<{
        candidateId: string;
        messageId: string;
        conversationId: string;
        cohortId: string;
        membershipRevision: number;
        originalSha256: string;
        envelopeSha256: string;
        importerUserId: string;
        importerDeviceId: string;
        envelope: {
            version: 1;
            protocol: "MATRIX_MEGOLM";
            event: {
                algorithm: "m.megolm.v1.aes-sha2";
                ciphertext: string;
                session_id: string;
                sender_key?: string | undefined;
                device_id?: string | undefined;
            };
        };
        attachmentIds: string[];
        preparedAt: string;
        state: "PREPARED";
    }>;
    candidateContent(req: Request, id: string, candidateId: string, attachmentId: string, query: unknown, res: Response): Promise<void>;
    candidate(req: Request, id: string, candidateId: string, query: unknown, res: Response): Promise<{
        candidateId: string;
        messageId: string;
        conversationId: string;
        cohortId: string;
        membershipRevision: number;
        originalSha256: string;
        envelopeSha256: string;
        importerUserId: string;
        importerDeviceId: string;
        envelope: {
            version: 1;
            protocol: "MATRIX_MEGOLM";
            event: {
                algorithm: "m.megolm.v1.aes-sha2";
                ciphertext: string;
                session_id: string;
                sender_key?: string | undefined;
                device_id?: string | undefined;
            };
        };
        attachmentIds: string[];
        preparedAt: string;
        state: "PREPARED";
    }>;
    attest(req: Request, id: string, body: unknown, res: Response): Promise<{
        success: true;
    }>;
    batch(req: Request, id: string, query: unknown, res: Response): Promise<{
        items: {
            messageId: string;
            originalSha256: string;
            createdAt: string;
            senderId: string;
            content: string;
            attachmentIds: string[];
            sourceManifest: {
                version: 1;
                conversationId: string;
                messageId: string;
                senderId: string;
                clientMessageId: string;
                type: "IMAGE" | "TEXT";
                content: string;
                replyToId: string | null;
                mentionedUserIds: string[];
                createdAt: string;
                updatedAt: string;
                attachments: {
                    id: string;
                    fileName: string;
                    fileSize: number;
                    mimeType: "image/jpeg" | "image/png" | "image/webp";
                    plaintextSha256: string;
                }[];
            };
        }[];
        hasMore: boolean;
        nextCursor: string | null;
    }>;
    content(req: Request, id: string, attachmentId: string, query: unknown, res: Response): Promise<void>;
}
