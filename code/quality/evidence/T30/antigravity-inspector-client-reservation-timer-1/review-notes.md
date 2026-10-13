# T30 Dedicated PostgreSQL Inspector Client Reservation Review Notes (Timer Refactor)

**Task**: FG T30 — Dedicated PostgreSQL Inspector Client Reservation Timeout Cancellation  
**Directory**: `quality/evidence/T30/antigravity-inspector-client-reservation-timer-1/`  
**Reviewer/Auditor**: Codex  
**Agent**: Antigravity (Gemini 3.6 Flash - High, sequential proposal mode, no Anti2 / no subagents)  
**Date**: 2026-10-11  

---

## 1. Summary of Precise Fix

This proposal copies both proposals from `final-1` (`quality/evidence/T30/antigravity-inspector-client-reservation-final-1/`) exactly, modifying **only** the `poolEnd` timeout cleanup to prevent timer leakage.

### Bug Identified in `final-1`
In `final-1`, `Promise.race` raced `pool.end()` against a 5,000ms `setTimeout`. When `pool.end()` settled promptly, the timer handle (`tid`) was never cleared. Because `unref()` only allows the event loop to exit if idle rather than cancelling the timer, a winning `pool.end()` could still be followed after 5,000ms by the un-cancelled timer firing, which would incorrectly increment `inspectorFailureCount`, invalidate `inspectorHealthy`, and append a spurious `ETIMEDOUT` error after successful settlement and report generation.

### Solution Applied
In both diagnostic and canonical fixture variants:
1. Declared scoped `let endTimer;`.
2. Wrapped the existing `await Promise.race([...])` in a `try...finally` block.
3. Assigned `endTimer = setTimeout(...)`.
4. In `finally`, invoked `clearTimeout(endTimer)`.

```javascript
await attempt('poolEnd', async () => {
  let endTimer;
  try {
    await Promise.race([
      pool.end().then(() => {
        poolEnded = Boolean(pool.ended);
      }),
      new Promise((_, reject) => {
        endTimer = setTimeout(() => {
          inspectorFailureCount++;
          inspectorHealthy = false;
          recordSafeFailure({ code: 'ETIMEDOUT', name: 'TimeoutError' });
          reject(new Error('Pool end timed out'));
        }, 5000);
        if (endTimer.unref) endTimer.unref();
      })
    ]);
  } finally {
    clearTimeout(endTimer);
  }
});
```

Every other byte, SQL query, parameter, argument, order, guard, timeout, error code, and diagnostic handler across both files is strictly identical to `final-1`.

---

## 2. Artifacts

| Artifact | Location | SHA-256 | Purpose |
|---|---|---|---|
| `fixture-server-inspector-reserved.mjs` | `quality/evidence/T30/antigravity-inspector-client-reservation-timer-1/` | `3d19992df181efe869daffa592ed51db5492058ac5cc44e8231168de7862140b` | Diagnostic variant with scoped `endTimer` cancellation |
| `fixture-server-built-inspector-reserved.mjs` | `quality/evidence/T30/antigravity-inspector-client-reservation-timer-1/` | `8d56042f9e09a311914d7600811e725f5ba0c1e74e91e27c1a5f102c5252b2f3` | Canonical variant with scoped `endTimer` cancellation |
| `review-notes.md` | `quality/evidence/T30/antigravity-inspector-client-reservation-timer-1/` | Document self | Technical review documentation of timer fix |

---

## 3. Scope & Verification Constraints

- **No Executed Tests / Builds / Browser**: Antigravity has not executed test suites, builds, or browser runs.
- **Native Acceptance Not Proven**: Native acceptance has not been claimed or proven by this proposal alone; live execution remains subject to verification by Codex.
- **Final-1 Preserved**: `quality/evidence/T30/antigravity-inspector-client-reservation-final-1/` remains immutable and unexecuted.
