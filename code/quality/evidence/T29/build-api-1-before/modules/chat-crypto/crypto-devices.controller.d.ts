import type { Request } from 'express';
import { ChatService } from '../chat/chat.service.js';
import { CryptoDevicesService } from './crypto-devices.service.js';
export declare class CryptoDevicesController {
    private readonly chat;
    private readonly devices;
    constructor(chat: ChatService, devices: CryptoDevicesService);
    register(req: Request, body: unknown): Promise<{
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
    list(req: Request): Promise<{
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
    revoke(req: Request, deviceId: string): Promise<{
        success: true;
    }>;
    prekeys(req: Request, deviceId: string, body: unknown): Promise<{
        success: true;
    }>;
    putRecovery(req: Request, body: unknown): Promise<{
        version: 1;
        format: "MATRIX_ENCRYPTED_EXPORT";
        ciphertext: string;
        backupVersion: number;
        updatedAt: string;
    }>;
    getRecovery(req: Request): Promise<{
        version: 1;
        format: "MATRIX_ENCRYPTED_EXPORT";
        ciphertext: string;
        backupVersion: number;
        updatedAt: string;
    }>;
    deleteRecovery(req: Request): Promise<{
        success: true;
    }>;
    identity(req: Request, body: unknown): Promise<{
        success: true;
    }>;
    signatures(req: Request, body: unknown): Promise<{
        success: true;
    }>;
}
