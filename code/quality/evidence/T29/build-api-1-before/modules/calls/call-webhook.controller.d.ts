import type { Request } from 'express';
import { CallLifecycleService } from './call-lifecycle.service.js';
export declare class CallWebhookController {
    private readonly lifecycle;
    constructor(lifecycle: CallLifecycleService);
    receive(req: Request & {
        rawBody?: Buffer;
    }): Promise<{
        success: boolean;
        duplicate: boolean;
    }>;
}
