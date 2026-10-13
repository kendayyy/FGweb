# T30 Gateway Startup Diagnostic Evidence Review Notes (Final-1)

**Task**: FG T30 — Private Gateway Startup Evidence Persistence Refactor (Final-1)  
**Directory**: `quality/evidence/T30/antigravity-gateway-startup-evidence-final-1/`  
**Reviewer/Auditor**: Codex  
**Agent**: Antigravity (Gemini 3.6 Flash - High, sequential proposal mode, no Anti2 / no subagents)  
**Date**: 2026-10-11  

---

## 1. Summary of Concrete Changes

This proposal addresses the three concrete findings on private gateway startup diagnostic evidence persistence, building upon `review-1` while keeping `review-1` and `startup-evidence-1` immutable and unexecuted.

### 1.1 Unconditional Teardown & Explicit Cleanup Error Tracking (Finding 1)
- **Never swallow `close()` failure**: Teardown (`await close()`) is executed once, immediately after diagnostic collection and evidence writes.
- **Separate Cleanup Error Tracking**: Any error thrown during `await close()` is captured into `cleanupError` with sanitized error name and code (`slice(0, 64)`). Raw Docker error commands, stdout, stderr, or environment variables are never leaked.
- **Honest Error Aggregation**: If `cleanupError` occurs, or if diagnostic observations are incomplete, an `AggregateError` is thrown containing:
  1. The original startup readiness error (`error`), ensuring the root cause is always preserved.
  2. Safe diagnostic incompleteness summary (if observation or file writing failed).
  3. Sanitized cleanup failure (`cleanupError`).
- **Direct Throw on Complete Success**: If all diagnostic observations and evidence file writes succeed, and cleanup succeeds with no `cleanupError`, the original readiness error is rethrown directly without wrapping.

### 1.2 Collector Metadata Persistence & Strict Enumeration (Finding 2)
- **Persisted Metadata Fields**: `gateway-startup-state.json` persists `logStatuses` array, `logReadFailures` count, `inspectFailures` count, `writeFailureCount`, `logWritten` boolean, and `completeObservation` boolean.
- **Sanitized Signal Enum**: Signals from `docker logs` are validated via `parseSignal` to a strict finite enum (`SIGTERM`, `SIGKILL`, `SIGINT`, `null`, else `'UNKNOWN'`).
- **Sanitized Status**: Container process exit status is validated to finite integer via `Number.isInteger(log.status)` or `null`.
- **Sanitized Error Enum**: Error codes from `spawnSync` are restricted to safe codes (`EIO`, `ETIMEDOUT`, `ENOENT`, or `'UNKNOWN'`). Raw error messages are completely excluded.
- **Strict `completeObservation`**: `completeObservation` evaluates strictly to `Boolean(logSuccess && inspectSuccess && logWritten && writeFailureCount === 0)`. It cannot evaluate to `true` if any log read fails, any container inspection fails, log writing fails, or any filesystem write error occurs.

### 1.3 Tightened Validation & Strict Timestamp/Health Parsing (Finding 3)
- **Strict Health Enumeration**: In `parseHealthStatus`, non-empty strings not in the set (`'none'`, `'starting'`, `'healthy'`, `'unhealthy'`) return `'unknown'`. The value `'none'` is returned only if the raw field is undefined, null, or empty string.
- **Strict ISO UTC Timestamps**: In `parseIsoString`, timestamp strings must match exact bounded ISO UTC format (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/`) AND yield a finite value from `Date.parse()`. Invalid or malformed timestamps return `null`.
- **Truthful Inspection Defaults**: When inspection fails, state properties (`running`, `exitCode`, `oomKilled`, `startedAt`, `finishedAt`) remain strictly `null`, preventing fabricated boolean values.
- **Path Containment & Redaction**: Strict child directory validation beneath `quality/evidence/T30` is retained via `getValidatedEvidenceDir()`. Multi-layer redactor scrubs credentials, database URLs, auth users, and SQL queries.

---

## 2. Artifacts

| Artifact | Location | SHA-256 | Purpose |
|---|---|---|---|
| `private-gateway-shaped-fixture.mjs` | `quality/evidence/T30/antigravity-gateway-startup-evidence-final-1/` | `5146cb385a8d2697d9c2e45641756fc2103f78b7895de68f5658aeaac8d58d01` | Gateway fixture with cleanup tracking, sanitized collector metadata, and strict parsing |
| `review-notes.md` | `quality/evidence/T30/antigravity-gateway-startup-evidence-final-1/` | Document self | Technical documentation of final refactor |

---

## 3. Invariants & Preserved Baselines

- **Gateway Mechanics Unchanged**: Docker run parameters, images (`node`, `sfu`), mounts, network creation, port mappings, and teardown logic remain byte-identical to baseline.
- **Readiness Loop Unchanged**: Bounded health polling (40 iterations x 250ms) and fetch timeout (1,000ms) remain strictly unchanged.
- **Interfaces Unchanged**: Returned `{server, ws, turnPort, shaperControl, close, result, diagnostics}` signature remains identical.
- **Application & Tests Unchanged**: No modifications to application code (`apps/`), packages, build outputs, tests, task ledger, or session history.

---

## 4. Pre-Run Probes Required by Codex (Prior to Native34)

Prior to adopting this fixture for Native34, Codex must verify:

1. **Syntax Validation**: `node --check quality/evidence/T30/antigravity-gateway-startup-evidence-final-1/private-gateway-shaped-fixture.mjs`
2. **Controlled Error Probe**: Run a targeted smoke test with invalid database credentials to verify:
   - Logs (both stdout and stderr) are persisted to `gateway-startup-diagnostics.txt`.
   - `gateway-startup-state.json` contains valid `logStatuses`, `containers`, and correct failure counts.
   - Redaction masks sensitive URLs and credentials without altering SQLSTATE / error messages.
   - Resource teardown completes and any cleanup failure is reported without leaking raw command strings.
3. **Normal Smoke Test**: Verify successful startup, health check pass, and clean resource cleanup.

*Proposal-only: No tests, builds, or browser instances have been executed by Antigravity.*
