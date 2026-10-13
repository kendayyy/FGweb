import { OnModuleInit } from '@nestjs/common';
import { OpenBaoTransit } from './openbao-transit.js';
import { CryptoObjectStore } from './crypto-object-store.js';
export declare const LOBBY_CUSTODY = "FG_LOBBY_CUSTODY";
export declare class LobbyCipher implements OnModuleInit {
    private readonly custody?;
    readonly objects: CryptoObjectStore;
    constructor(custody?: {
        transit: OpenBaoTransit;
    } | undefined);
    onModuleInit(): Promise<void>;
    private transit;
    encodeMessage(input: unknown): Promise<{
        version: 1;
        protocol: "OPENBAO_TRANSIT_AES256GCM";
        keyId: "fg-lobby" | "fg-report";
        keyVersion: number;
        ciphertext: string;
    }>;
    decodeMessage(row: {
        id: string;
        conversation_id: string;
        crypto_envelope: unknown;
    }): Promise<{
        version: 1;
        conversationId: string;
        messageId: string;
        content: string;
        attachments: {
            id: string;
            fileName: "image.webp";
            fileSize: number;
            mimeType: "image/webp";
        }[];
    }>;
    encodeImage(bytes: Buffer, conversationId: string, id: string): Promise<{
        version: 1;
        protocol: "OPENBAO_TRANSIT_AES256GCM";
        keyId: "fg-lobby" | "fg-report";
        keyVersion: number;
        ciphertext: string;
    }>;
    readImage(row: {
        id: string;
        conversation_id: string;
        object_key: string;
        envelope: unknown;
        ciphertext_size: number;
        ciphertext_sha256: string;
    }): Promise<Buffer<ArrayBufferLike>>;
}
