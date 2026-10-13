import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ChatActor } from '../chat/chat.service.js';
export declare class CryptoDevicesService implements OnModuleInit, OnModuleDestroy {
    private schemaReady;
    private pool;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private transaction;
    private dto;
    private bumpRevisions;
    private storePrekeys;
    register(actor: ChatActor, input: unknown): Promise<{
        deviceId: string;
        deviceKeys: {
            user_id: string;
            device_id: string;
            algorithms: ("m.megolm.v1.aes-sha2" | "m.olm.v1.curve25519-aes-sha2")[];
            keys: Record<string, string>;
            signatures: Record<string, Record<string, string>>;
        };
        createdAt: string;
        revokedAt: string | null;
    }>;
    list(actor: ChatActor): Promise<{
        deviceId: string;
        deviceKeys: {
            user_id: string;
            device_id: string;
            algorithms: ("m.megolm.v1.aes-sha2" | "m.olm.v1.curve25519-aes-sha2")[];
            keys: Record<string, string>;
            signatures: Record<string, Record<string, string>>;
        };
        createdAt: string;
        revokedAt: string | null;
    }[]>;
    uploadPrekeys(actor: ChatActor, deviceId: string, input: unknown): Promise<{
        success: true;
    }>;
    revoke(actor: ChatActor, deviceId: string): Promise<{
        success: true;
    }>;
    putRecovery(actor: ChatActor, input: unknown): Promise<{
        version: 1;
        format: "MATRIX_ENCRYPTED_EXPORT";
        ciphertext: string;
        backupVersion: number;
        updatedAt: string;
    }>;
    private backupDto;
    getRecovery(actor: ChatActor): Promise<{
        version: 1;
        format: "MATRIX_ENCRYPTED_EXPORT";
        ciphertext: string;
        backupVersion: number;
        updatedAt: string;
    }>;
    deleteRecovery(actor: ChatActor): Promise<{
        success: true;
    }>;
    putIdentity(actor: ChatActor, input: unknown): Promise<{
        success: true;
    }>;
    uploadSignatures(actor: ChatActor, input: unknown): Promise<{
        success: true;
    }>;
}
