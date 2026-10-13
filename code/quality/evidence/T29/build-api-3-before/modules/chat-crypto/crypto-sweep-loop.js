"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoSweepLoop = void 0;
class CryptoSweepLoop {
    run;
    failed;
    intervalMs;
    timer;
    active;
    stopped = false;
    constructor(run, failed, intervalMs = 60000) {
        this.run = run;
        this.failed = failed;
        this.intervalMs = intervalMs;
        if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0 || intervalMs > 2147483647)
            throw new Error('Invalid sweep interval');
    }
    start() {
        if (this.timer || this.stopped)
            return;
        this.timer = setInterval(() => {
            if (this.active)
                return;
            this.active = Promise.resolve().then(() => this.run()).catch(() => { try {
                this.failed();
            }
            catch { } }).finally(() => { this.active = undefined; });
        }, this.intervalMs);
        this.timer.unref();
    }
    async stop() { this.stopped = true; if (this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
    } await this.active; }
}
exports.CryptoSweepLoop = CryptoSweepLoop;
//# sourceMappingURL=crypto-sweep-loop.js.map