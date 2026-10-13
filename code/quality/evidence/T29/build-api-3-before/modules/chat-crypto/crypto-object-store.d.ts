import type { PoolClient } from 'pg';
export declare function lockCryptoObjectWrite(db: PoolClient, key: string): Promise<void>;
export declare class CryptoObjectStore {
    private readonly maximumBytes;
    private directory;
    private scan?;
    constructor(maximumBytes?: number);
    initialize(): Promise<void>;
    private location;
    put(key: string, bytes: Buffer): Promise<void>;
    read(key: string): Promise<Buffer<ArrayBufferLike>>;
    remove(key: string): Promise<void>;
    scanCandidates(): Promise<string[]>;
    closeScan(): Promise<void>;
}
