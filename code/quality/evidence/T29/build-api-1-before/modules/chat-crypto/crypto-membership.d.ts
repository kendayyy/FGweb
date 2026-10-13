import type { PoolClient } from 'pg';
export declare function ensurePrivateCryptoState(db: PoolClient, conversationId: string): Promise<any>;
export declare function cryptoMemberJoined(db: PoolClient, conversationId: string, userId: string): Promise<void>;
export declare function cryptoMemberLeft(db: PoolClient, conversationId: string, userId: string): Promise<void>;
export declare function retirePrivateCryptoConversation(db: PoolClient, conversationId: string): Promise<boolean>;
