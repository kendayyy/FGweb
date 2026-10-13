# T30 Dedicated PostgreSQL Inspector Client Reservation Review Notes (Final)

**Task**: FG T30 — Dedicated PostgreSQL Inspector Client Reservation Refactor  
**Directory**: `quality/evidence/T30/antigravity-inspector-client-reservation-final-1/`  
**Reviewer/Auditor**: Codex  
**Agent**: Antigravity (Gemini 3.6 Flash - High, sequential proposal mode, no Anti2 / no subagents)  
**Date**: 2026-10-11  

---

## 1. Summary of Final Proposal

This proposal refactors the dedicated inspector client reservation for FG T30, strictly incorporating the five remaining concrete findings from the Codex audit. It preserves Review-1 (`quality/evidence/T30/antigravity-inspector-client-reservation-review-1/**`) unexecuted.

### Artifacts

| Artifact | Location | SHA-256 | Purpose |
|---|---|---|---|
| `fixture-server-inspector-reserved.mjs` | `quality/evidence/T30/antigravity-inspector-client-reservation-final-1/` | `fb935f21af72c56946dfbd540b018891acfa849edd2733f9b485386a77a0ce1c` | Diagnostic variant retaining API room owner and PG wait observers |
| `fixture-server-built-inspector-reserved.mjs` | `quality/evidence/T30/antigravity-inspector-client-reservation-final-1/` | `71dc9d993f80a7b1bd3dd5f69763c4a361dc7371b8b094df6b4adf9c5a7ee5a4` | Canonical production-shaped variant with zero observation modules |
| `review-notes.md` | `quality/evidence/T30/antigravity-inspector-client-reservation-final-1/` | Document self | Concise technical audit notes & driver dependency reasoning |

---

## 2. Technical Reasoning & Resolution of Findings

### 2.1 Installed Driver Semantics (`pg-pool@3.14.0`)
- **No Manual Manipulation**: In installed `node_modules/pg-pool/index.js`, manual assignment or filtering of `pool._clients` or `pool._idle` has been completely eliminated.
- **`_remove(client, callback)` Semantics**: The installed driver method `pool._remove(client, callback)` internally removes the client from `this._idle` (clearing idle timers), filters `this._clients`, and calls `client.end(() => { this.emit('remove', client); if (callback) callback(); })`.
- **Release Fallback**: If `inspectorClient.release(true)` throws:
  1. `inspectorReleased` remains `false`, `inspectorHealthy = false`, and `inspectorFailureCount` is incremented.
  2. Membership is strictly guarded via `pool._clients.includes(inspectorClient)`. If verified, the fallback calls `pool._remove(inspectorClient, () => pool._pulseQueue())`. Any error thrown by the fallback or pulse queue is caught and counted as an inspector failure.
  3. The owned socket stream is explicitly destroyed (`inspectorClient.connection.stream.destroy()` or `inspectorClient.end()`). Any destruction error is caught and counted as an inspector failure without silent suppression.
  4. Bounded `pool.end()`: Wrapped with `Promise.race` and a 5,000ms timeout (`TimeoutError` / `ETIMEDOUT`). If driver teardown blocks, `poolEnd` fails with a recorded error, allowing report emission and remaining teardown to proceed honestly.

### 2.2 Strict Finite Allowlist for Diagnostic Names & Codes
Diagnostic outputs (`inspector-failures.jsonl`, `inspection-failures.jsonl`, `cleanup-failure.json`, and IPC responses) now use strict finite allowlists:
- **Names**: Strictly checked against `Set(['Error', 'TypeError', 'TimeoutError', 'SocketEndError'])`. Any unrecognized name falls back to `'Error'`.
- **Codes**: Allowed if matching known transport codes `Set(['EIO', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'UNKNOWN', 'UNEXPECTED_CLIENT_END', 'SOCKET_END_TIMEOUT', 'RELEASE_FAILED', 'CLEANUP_FAILED', 'INIT_FAILED'])` or PostgreSQL SQLSTATE regex `/^[0-9A-Z]{5}$/`. Any other value falls back to `'UNKNOWN'`.
- Root startup error sanitization (`[REDACTED]`) is kept distinct and unaltered.

### 2.3 Diagnostic Write Integrity & Complete Settlement Invariant
- **Lifecycle Write Failure**: If `fs.writeFileSync` in `inspectorLifecycleReport` throws, `inspectorWriteFailureCount` is incremented, `inspectorHealthy` is set to `false`, and the error is re-thrown so `attempt` records the cleanup failure.
- **Complete Settlement Enforcement**: When `inspectorReserved` is `true`, cleanup strictly enforces `settlementComplete` (`inspectorHealthy && inspectorFailureCount === 0 && inspectorWriteFailureCount === 0 && inspectorReleased && actualSocketEnded && poolEnded`). If any condition is unmet, an explicit error is added to `errors`, guaranteeing cleanup throws, writes `cleanup-failure.json` with honest counters, and exits with code 1.
- **Guaranteed Failed IPC**: In `message.kind === 'inspect'`, `process.send?.({ id, failed: true, name, code })` is guaranteed even if appending to `inspection-failures.jsonl` throws.

### 2.4 True Socket End Accounting
- **Actual Event Listener Only**: `actualSocketEnded` is set exclusively by the persistent `inspectorClient.on('end')` handler registered upon client reservation. Redundant `client._ended` property checks were removed.
- **Pre-Release Check**: If `actualSocketEnded` is already `true` (due to an earlier unexpected disconnect), cleanup skips the wait. Otherwise, it awaits the `'end'` event with a 5,000ms timeout.
- **Honest Tracking**: An unexpected client error or end occurring after the last inspect call sets `inspectorHealthy = false`, increments `inspectorFailureCount`, and invalidates settlement without requiring a subsequent inspection.

### 2.5 Baseline Preservation
- Diagnostic variant retains `startOwnedPgWaitObservation` and `instrumentOwnedApiPools`.
- Canonical variant contains zero observation modules, imports `./private-gateway-shaped-fixture.mjs`, and executes unconditional shaper stats.
- No changes to application source (`apps/`), packages (`packages/`), builds (`dist/`), test files, or ledger/history.

---

## 3. Required Pre-Run Probes for Codex (Prior to Headed33)

Before adopting the fixture for Native33, Codex must execute the following targeted probes:

1. **Syntax Verification**:
   - `node --check quality/evidence/T30/antigravity-inspector-client-reservation-final-1/fixture-server-inspector-reserved.mjs`
   - `node --check quality/evidence/T30/antigravity-inspector-client-reservation-final-1/fixture-server-built-inspector-reserved.mjs`
2. **Idle Survival & Mutation Probe**:
   - Boot fixture in test harness.
   - Wait >10 seconds (exceeding default 10s `idleTimeoutMillis`).
   - Issue `ask('inspect')` and verify query succeeds instantly on the reserved PID, accurately observing DB state mutated during the run.
3. **Failure Teardown & Accounting Probe**:
   - Simulate an unexpected client disconnect or release failure.
   - Trigger `stop` IPC.
   - Verify `settlementComplete` fails honestly, `inspectorFailureCount > 0`, `cleanup-failure.json` is generated, and process exits with code 1 while Docker/PostgreSQL schema cleanup still completes.

*Note: Native acceptance is not proven by this proposal alone and awaits verified execution by Codex.*
