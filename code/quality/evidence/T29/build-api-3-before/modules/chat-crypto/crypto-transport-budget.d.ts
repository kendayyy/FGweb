import type { PoolClient } from 'pg';
export type CryptoTransportBudget = {
    maxRows: number;
    maxPayloadBytes: number;
};
export type CryptoTransportAddition = {
    senderId: string;
    recipientId: string;
    payload: unknown;
};
export declare function cryptoTransportBudget(env?: NodeJS.ProcessEnv): CryptoTransportBudget;
export declare function lockCryptoTransportBudget(db: PoolClient, additions: Pick<CryptoTransportAddition, 'senderId' | 'recipientId'>[]): Promise<void>;
export declare function enforceCryptoTransportBudget(db: PoolClient, additions: CryptoTransportAddition[], budget: CryptoTransportBudget): Promise<void>;
