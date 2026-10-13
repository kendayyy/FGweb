import { type CallModerationRequest } from '@fg/contracts';
import { CallsService } from './calls.service.js';
export declare class CallModerationService {
    private readonly calls;
    constructor(calls: CallsService);
    moderate(user: string, session: string, id: string, request: CallModerationRequest): Promise<{
        success: true;
    }>;
}
