import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ChatService, ChatActor } from '../chat/chat.service.js';
export declare class CryptoLegacyService implements OnModuleInit, OnModuleDestroy {
    private readonly chat;
    private readonly objects;
    private objectInitialization?;
    private schemaReady;
    private cleanupEnabled;
    private pool;
    private directory;
    private runtimeRoot;
    private realDirectory?;
    constructor(chat: ChatService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private parse;
    private publicDigest;
    private device;
    private authorizeCohort;
    private transaction;
    private image;
    private source;
    private availableCohort;
    prepare(actor: ChatActor, id: string, input: unknown): Promise<{
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
    private candidateDto;
    private ciphertext;
    private mappedImages;
    private convertedImages;
    candidateContent(actor: ChatActor, id: string, candidateId: string, attachmentId: string, input: unknown): Promise<Buffer<ArrayBufferLike>>;
    private boundCandidate;
    candidate(actor: ChatActor, id: string, candidateId: string, input: unknown): Promise<{
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
    attest(actor: ChatActor, id: string, input: unknown): Promise<{
        success: true;
    }>;
    reviewReconciliation(actor: ChatActor, id: string, input: unknown): Promise<{
        membershipRevision: number;
        sourceCount: number;
        attachmentCount: number;
        requiredDeviceClaims: number;
        candidateIds: string[];
        cohortIds?: string[] | undefined;
        conversationId: string;
        cohortId: string;
    }>;
    stageReconciliation(actor: ChatActor, id: string, input: unknown): Promise<{
        operationId: string;
        conversationId: string;
        phase: "STAGED";
        membershipRevision: number;
        nextLiveRevision: number;
        sourceCount: number;
        attachmentCount: number;
        requiredDeviceClaims: number;
        manifestSha256: string;
    }>;
    convertStagedReconciliation(actor: ChatActor, id: string, input: unknown): Promise<{
        operationId: string;
        conversationId: string;
        phase: "DB_CONVERTED";
        membershipRevision: number;
        nextLiveRevision: number;
        sourceCount: number;
        attachmentCount: number;
    }>;
    private sourceRootBinding;
    private removeSource;
    cleanupStagedReconciliation(actor: ChatActor, id: string, input: unknown): Promise<{
        operationId: string;
        conversationId: string;
        phase: "RECONCILED";
        membershipRevision: number;
        nextLiveRevision: number;
        sourceCount: number;
        attachmentCount: number;
    }>;
    private stageSnapshot;
    private validateStageRows;
    private cutoffReadiness;
    batch(actor: ChatActor, id: string, input: unknown): Promise<{
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
    content(actor: ChatActor, id: string, attachmentId: string, input: unknown): Promise<Buffer<ArrayBufferLike>>;
}
