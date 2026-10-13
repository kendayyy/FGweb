# CHATCRYPTO-BE — cleanup lifecycle

The private and report periodic cleanup services share CryptoSweepLoop; production interval remains60seconds. One active promise prevents overlapping sweeps, repeated start is idempotent, failures retry without forwarding an error object to logging, and shutdown clears ticks before awaiting the active sweep and ending the service pool. Stop before start is safe. The timer is unref'ed and cannot keep an otherwise idle process alive.

Four behavior cases failed against the lifecycle interface with no behavior, then the implementation passed five cases. Tests use actual short Node timers and deferred promises, without fake timers or mocked DB/SDK. The fifth case starts an actual child Node process with a ten-second scheduled timer and verifies process exit within five seconds. These are lifecycle unit proofs; actual API/PostgreSQL/filesystem retention behavior remains covered by the native integration suites. Whole-consumer regression is required after adoption.

Warnings remain fixed generic strings; source IDs, bytes, filenames and raw errors are not handed to the failure callback. Dedicated index/performance/orphan and complete security review remain separate acceptance work. No main cleanup/activation or task PASS is claimed.
