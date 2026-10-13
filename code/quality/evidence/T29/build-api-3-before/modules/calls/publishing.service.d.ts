import type { PoolClient } from 'pg';
import type { ParticipantInfo } from '@livekit/protocol';
import { CallsService } from './calls.service.js';
export declare class PublishingService {
    private readonly calls;
    private readonly observed;
    constructor(calls: CallsService);
    claim(user: string, session: string, id: string): Promise<{
        callId: string;
        token: string;
        sfuUrl: string;
        roomName: string;
    }>;
    release(user: string, session: string, id: string): Promise<{
        success: true;
    }>;
    forget(id: string): void;
    reconcileWithin(db: PoolClient, id: string, people: ParticipantInfo[], now: Date, ended?: {
        identity: string;
        at: number;
    }): Promise<void>;
}
