import { LegacyRoundtripAttestationSchema } from '@fg/contracts';
import type { z } from 'zod';
export declare const matrixUserId: (userId: string) => string;
export declare const matrixRoomId: (conversationId: string) => string;
export declare const isWellFormedUnicode: (value: string) => boolean;
export declare function canonicalSignedPayload(value: Record<string, unknown>): string;
export declare function matrixBase64(value: string, bytes: number): Buffer;
export declare function verifyMatrixSignature(value: Record<string, unknown>, userId: string, keyId: string, publicKey: string): void;
type LegacyReceipt = z.infer<typeof LegacyRoundtripAttestationSchema>;
type LegacyReceiptBinding = Pick<LegacyReceipt, 'candidateId' | 'messageId' | 'conversationId' | 'cohortId' | 'membershipRevision' | 'originalSha256' | 'envelopeSha256' | 'attachmentDigests'>;
export declare function verifyLegacyRoundtripAttestation(input: unknown, device: {
    userId: string;
    deviceId: string;
    ed25519Key: string;
}, expected: LegacyReceiptBinding): LegacyReceipt;
export declare function verifySignedOneTimeKeys(userId: string, deviceId: string, publicKey: string, input: unknown): Record<string, {
    key: string;
    signatures: Record<string, Record<string, string>>;
}>;
export declare function verifyDeviceRegistration(userId: string, input: unknown): {
    deviceId: string;
    deviceKeys: {
        user_id: string;
        device_id: string;
        algorithms: ("m.megolm.v1.aes-sha2" | "m.olm.v1.curve25519-aes-sha2")[];
        keys: Record<string, string>;
        signatures: Record<string, Record<string, string>>;
    };
    oneTimeKeys: Record<string, {
        key: string;
        signatures: Record<string, Record<string, string>>;
    }>;
};
export declare function verifyCrossSigningIdentity(userId: string, input: unknown): {
    masterKey: {
        user_id: string;
        usage: ("master" | "self_signing" | "user_signing")[];
        keys: Record<string, string>;
        signatures?: Record<string, Record<string, string>> | undefined;
    };
    selfSigningKey: {
        user_id: string;
        usage: ("master" | "self_signing" | "user_signing")[];
        keys: Record<string, string>;
        signatures?: Record<string, Record<string, string>> | undefined;
    };
    userSigningKey: {
        user_id: string;
        usage: ("master" | "self_signing" | "user_signing")[];
        keys: Record<string, string>;
        signatures?: Record<string, Record<string, string>> | undefined;
    };
};
export {};
