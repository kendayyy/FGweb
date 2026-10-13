import type { Request, Response } from 'express';
import { ChatService } from '../chat/chat.service.js';
import { CryptoRelayService } from './crypto-relay.service.js';
export declare class CryptoRelayController {
    private readonly chat;
    private readonly relay;
    constructor(chat: ChatService, relay: CryptoRelayService);
    state(req: Request, id: string): Promise<{
        conversationId: string;
        matrixRoomId: string;
        matrixUserId: string;
        mode: "E2EE" | "LOBBY_AEAD";
        membershipRevision: number;
        migrationState: "RECONCILED" | "LEGACY_PENDING" | "MIGRATING";
        historyStatus: "UNKNOWN" | "KNOWN";
        eligibleDeviceIds: string[];
        legacyCohorts?: {
            cohortId: string;
            sourceCount: number;
            members: {
                userId: string;
                deviceIds: string[];
            }[];
        }[] | undefined;
    }>;
    keys(req: Request, body: unknown): Promise<{
        membershipRevision: number;
        users: {
            userId: string;
            matrixUserId: string;
            devices: {
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
            }[];
            identityKeys: {
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
            } | null;
        }[];
    }>;
    claim(req: Request, body: unknown): Promise<{
        membershipRevision: number;
        keys: {
            userId: string;
            deviceId: string;
            keyId: string;
            signedKey: {
                key: string;
                signatures: Record<string, Record<string, string>>;
            };
        }[];
    }>;
    verification(req: Request, body: unknown): Promise<{
        success: true;
    }>;
    toDevice(req: Request, body: unknown): Promise<{
        success: true;
    }>;
    sync(req: Request, query: unknown): Promise<{
        oneTimeKeyCounts: {
            signed_curve25519: number;
        };
        encrypted: {
            items: unknown[];
            nextCursor: string | null;
            hasMore: boolean;
        };
        verification: {
            id: string;
            conversationId: string;
            membershipRevision: number;
            senderUserId: string;
            senderDeviceId: string;
            event: {
                eventType: "m.room_key.withheld";
                content: {
                    algorithm: "m.megolm.v1.aes-sha2";
                    code: "m.blacklisted" | "m.unverified" | "m.unauthorised" | "m.unavailable" | "m.no_olm";
                    sender_key: string;
                    from_device?: string | undefined;
                    reason?: string | undefined;
                    room_id?: string | undefined;
                    session_id?: string | undefined;
                };
            } | {
                eventType: "m.key.verification.request";
                content: {
                    from_device: string;
                    methods: "m.sas.v1"[];
                    timestamp: number;
                    transaction_id: string;
                };
            } | {
                eventType: "m.key.verification.ready";
                content: {
                    from_device: string;
                    methods: "m.sas.v1"[];
                    transaction_id: string;
                };
            } | {
                eventType: "m.key.verification.start";
                content: {
                    from_device: string;
                    method: "m.sas.v1";
                    key_agreement_protocols: string[];
                    hashes: string[];
                    message_authentication_codes: string[];
                    short_authentication_string: string[];
                    transaction_id: string;
                };
            } | {
                eventType: "m.key.verification.accept";
                content: {
                    key_agreement_protocol: string;
                    hash: string;
                    message_authentication_code: string;
                    short_authentication_string: string[];
                    commitment: string;
                    transaction_id: string;
                    method?: "m.sas.v1" | undefined;
                };
            } | {
                eventType: "m.key.verification.key";
                content: {
                    key: string;
                    transaction_id: string;
                };
            } | {
                eventType: "m.key.verification.mac";
                content: {
                    mac: Record<string, string>;
                    keys: string;
                    transaction_id: string;
                };
            } | {
                eventType: "m.key.verification.done";
                content: {
                    transaction_id: string;
                };
            } | {
                eventType: "m.key.verification.cancel";
                content: {
                    code: string;
                    reason: string;
                    transaction_id: string;
                };
            };
            createdAt: string;
            cohortId?: string | undefined;
        }[];
        verificationCursor: string | null;
    }>;
    ack(req: Request, body: unknown): Promise<{
        success: true;
    }>;
    message(req: Request, id: string, body: unknown): Promise<{
        origin: "LIVE";
        id: string;
        conversationId: string;
        senderId: string;
        clientMessageId: string;
        deviceId: string;
        membershipRevision: number;
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
        createdAt: string;
        attachmentIds: string[];
        mentionedUserIds?: string[] | undefined;
    } | {
        origin: "LEGACY_IMPORT";
        importProvenance: {
            candidateId: string;
            cohortId: string;
            originalSha256: string;
            importerUserId: string;
            importerDeviceId: string;
        };
        id: string;
        conversationId: string;
        senderId: string;
        clientMessageId: string;
        deviceId: string;
        membershipRevision: number;
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
        createdAt: string;
        attachmentIds: string[];
    }>;
    history(req: Request, id: string, query: unknown): Promise<{
        items: ({
            origin: "LIVE";
            id: string;
            conversationId: string;
            senderId: string;
            clientMessageId: string;
            deviceId: string;
            membershipRevision: number;
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
            createdAt: string;
            attachmentIds: string[];
            mentionedUserIds?: string[] | undefined;
        } | {
            origin: "LEGACY_IMPORT";
            importProvenance: {
                candidateId: string;
                cohortId: string;
                originalSha256: string;
                importerUserId: string;
                importerDeviceId: string;
            };
            id: string;
            conversationId: string;
            senderId: string;
            clientMessageId: string;
            deviceId: string;
            membershipRevision: number;
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
            createdAt: string;
            attachmentIds: string[];
        })[];
        hasMore: boolean;
        nextCursor: string | null;
    }>;
    upload(req: Request, id: string, body: Record<string, unknown>, file?: {
        buffer: Buffer;
        size: number;
    }): Promise<{
        id: string;
        conversationId: string;
        ciphertextSize: number;
        ciphertextSha256: string;
        expiresAt?: string | undefined;
    }>;
    object(req: Request, id: string, attachmentId: string, res: Response): Promise<void>;
}
