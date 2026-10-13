import { OpenBaoTransit } from './openbao-transit.js';
type Role = 'lobby' | 'writer' | 'reader';
export declare class CryptoCustodyConfig {
    private readonly address;
    private readonly caFile;
    private readonly files;
    private readonly retention;
    private readFile;
    private checkedToken;
    custody(role: Role): Promise<{
        transit: OpenBaoTransit;
        retentionSeconds?: undefined;
    } | {
        transit: OpenBaoTransit;
        retentionSeconds: number;
    } | undefined>;
}
export declare class CryptoCustodyModule {
}
export {};
