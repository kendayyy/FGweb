import type { Pool, PoolClient } from 'pg';
export type LiveLease = {
    id: string;
    user_id: string;
    session_id: string;
    call_group_id: string;
    room_id: string;
    room_name: string;
    session_expires_at: Date;
};
export declare function liveLease(db: Pool | PoolClient, id: string): Promise<LiveLease | undefined>;
