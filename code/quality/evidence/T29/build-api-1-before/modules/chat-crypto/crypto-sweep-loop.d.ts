export declare class CryptoSweepLoop {
    private readonly run;
    private readonly failed;
    private readonly intervalMs;
    private timer?;
    private active?;
    private stopped;
    constructor(run: () => Promise<void>, failed: () => void, intervalMs?: number);
    start(): void;
    stop(): Promise<void>;
}
