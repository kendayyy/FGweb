import { LobbyStorageEnvelopeSchema } from '@fg/contracts';
export type TransitBinding = {
    kind: 'LOBBY_MESSAGE' | 'LOBBY_IMAGE' | 'REPORT_TEXT' | 'REPORT_IMAGE';
    conversationId: string;
    objectId: string;
};
export type TransitEnvelope = ReturnType<typeof LobbyStorageEnvelopeSchema.parse>;
type TransitOptions = {
    address: string;
    ca: Buffer;
    token: () => Promise<string>;
    timeoutMs?: number;
};
export declare class TransitFailure extends Error {
    readonly reason: 'CONFIGURATION' | 'UNAVAILABLE' | 'AUTHORIZATION' | 'INTEGRITY' | 'INVALID_ENVELOPE';
    constructor(reason: 'CONFIGURATION' | 'UNAVAILABLE' | 'AUTHORIZATION' | 'INTEGRITY' | 'INVALID_ENVELOPE');
}
export declare class OpenBaoTransit {
    private readonly options;
    private readonly address;
    constructor(options: TransitOptions);
    private bindingBytes;
    private request;
    private envelope;
    encrypt(key: 'fg-lobby' | 'fg-report', plaintext: Uint8Array, binding: TransitBinding): Promise<TransitEnvelope>;
    decrypt(input: unknown, binding: TransitBinding): Promise<Buffer>;
    rewrap(input: unknown, binding: TransitBinding): Promise<TransitEnvelope>;
}
export {};
