# T30 Gateway Startup Diagnostic Evidence Review Notes

**Task**: FG T30 — Private Gateway Startup Evidence Persistence Refactor  
**Directory**: `quality/evidence/T30/antigravity-gateway-startup-evidence-1/`  
**Reviewer/Auditor**: Codex  
**Agent**: Antigravity (Gemini 3.6 Flash - High, sequential proposal mode, no Anti2 / no subagents)  
**Date**: 2026-10-11  

---

## 1. Problem Statement & Native33 Evidence Analysis

In Native33 (`quality/evidence/T30/native33-startup-review-1.json`), startup failed in phase `media` before API, web preview, or browser tests initialized:
```text
AssertionError [ERR_ASSERTION]: Private gateway failed to become ready; inspect sanitized diagnostics only
```

### Verified Facts
1. **Inspector Settlement & Timers**: Dedicated inspector client reservation, autocommit mode, scoped timer cancellation, and cleanup passed cleanly (`backendPid: 27075`, `failureCount: 0`, `writeFailureCount: 0`, `healthy: true`).
2. **Missing Gateway Failure Diagnostics**: In the baseline `private-gateway-shaped-fixture.mjs`, the startup `catch` block collected logs via `execFileSync('docker', ['logs', ...])` (capturing stdout only, dropping stderr) and wrote exclusively to `dir` (`.runtime/t30/gateway-${id}`). Subsequent fixture teardown and run-native cleanup removed this directory, preventing reconstruction of the root cause.
3. **Six Prior Successful Smokes**: Prior inspector smoke startups succeeded without production guard bugs; no workaround or architectural change should be applied without empirical evidence.

---

## 2. Refactored Diagnostic Persistence

To establish the root cause empirically without altering gateway execution or timeout semantics:

1. **Stdout + Stderr Capture**: Calls existing `diagnostics()` inside the catch block, which executes `spawnSync('docker', ['logs', container])`, combining both stdout and stderr.
2. **Strengthened Redaction**: Explicitly redacts `key`, `secret`, `databaseURL`, `connection.href`, `connection.password`, `orig.password`, `access_token=[REDACTED]`, and `[JWT REDACTED]`.
3. **Safe Container Inspection**:
   Inspects each container to capture safe state fields without sensitive configuration or command metadata:
   - Numeric `index`
   - `running`: boolean
   - `exitCode`: number or null
   - `oomKilled`: boolean
   - `startedAt` / `finishedAt`: ISO timestamps or null
   - `healthStatus`: Docker health enum (`'none'`, `'healthy'`, `'unhealthy'`, `'starting'`)
   - `inspectStatus`: `'inspected'` or `'failed'`
   - Excludes container IDs, names, usernames, commands, environment variables, network settings, and raw health logs.
4. **Ownership & Directory Validation**:
   `getEvidenceDir()` resolves `process.env.FG_T30_EVIDENCE_DIR` and validates that it is strictly contained beneath `quality/evidence/T30`.
5. **Persistence Before Teardown**:
   Persists `gateway-startup-diagnostics.txt` and `gateway-startup-state.json` to the validated evidence directory before invoking `await close()`.
6. **Non-Blocking Write Safety**:
   Diagnostic write errors are safely caught so they never suppress or replace the original `AssertionError` or abort `close()`.

---

## 3. Artifacts

| Artifact | Location | SHA-256 | Purpose |
|---|---|---|---|
| `private-gateway-shaped-fixture.mjs` | `quality/evidence/T30/antigravity-gateway-startup-evidence-1/` | `991710272ecda1467c8dad55216f5efd0415d7ec6e46eafd7e5cfbbda7e39dec` | Gateway fixture with pre-teardown diagnostics & container inspection persistence |
| `review-notes.md` | `quality/evidence/T30/antigravity-gateway-startup-evidence-1/` | Document self | Technical review documentation |

---

## 4. Verification Constraints & Invariants

- **No Retries or Timeout Alterations**: Bounded loop (40 iterations x 250ms), fetch timeout (1,000ms), and Docker options remain unchanged.
- **Byte-Identical Interfaces**: Returned `{server, ws, turnPort, shaperControl, close, result, diagnostics}` remains identical.
- **Native Acceptance Not Proven**: Native acceptance is not claimed or proven by this proposal alone. Actual Native33 failure cause remains unestablished pending diagnostic capture in Native34.
- **Proposal Only**: Zero test executions, builds, or browser sessions were run.
