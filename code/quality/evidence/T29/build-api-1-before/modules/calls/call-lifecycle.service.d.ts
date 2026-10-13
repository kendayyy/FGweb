import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { CallsService } from './calls.service.js';
export declare class CallLifecycleService implements OnModuleInit, OnModuleDestroy {
    private readonly calls;
    private pool;
    private clock;
    private timer?;
    private running?;
    private closing;
    private readonly logger;
    constructor(calls: CallsService);
    setClock(fn?: () => number): void;
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    private configured;
    private native;
    private transaction;
    private lock;
    private release;
    private closeLocked;
    private deleteNative;
    closeIfEmpty(id: string): Promise<void>;
    receive(raw: string, authorization?: string): Promise<{
        success: boolean;
        duplicate: boolean;
    }>;
    private reconcileGroup;
    sweep(): Promise<void>;
}
