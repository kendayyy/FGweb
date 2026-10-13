import { TrackSource } from 'livekit-server-sdk';
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
export declare function publicationSources(db: Pool | PoolClient, lease: Pick<LiveLease, 'call_group_id' | 'user_id'>): Promise<TrackSource[]>;
export declare function publicationPermission(db: Pool | PoolClient, lease: Pick<LiveLease, 'call_group_id' | 'user_id'>): Promise<{
    canSubscribe: boolean;
    canPublish: boolean;
    canPublishSources: TrackSource[];
    canPublishData: boolean;
    canUpdateMetadata: boolean;
}>;
