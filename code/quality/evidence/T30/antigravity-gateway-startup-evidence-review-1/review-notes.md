# T30 Gateway Startup Diagnostic Evidence Review Notes (Review-1)

**Task**: FG T30 — Private Gateway Startup Evidence Persistence Refactor (Review-1)  
**Directory**: `quality/evidence/T30/antigravity-gateway-startup-evidence-review-1/`  
**Reviewer/Auditor**: Codex  
**Agent**: Antigravity (Gemini 3.6 Flash - High, sequential proposal mode, no Anti2 / no subagents)  
**Date**: 2026-10-11  

---

## 1. Summary of Concrete Changes

This proposal refactors private gateway startup diagnostic persistence, addressing all four findings from `gateway-startup-evidence-source-review-rejected-1.json` while keeping Round 1 (`gateway-startup-evidence-1`) immutable and unexecuted.

### 1.1 Explicit Log Capture Metadata & Delegated Diagnostics (Finding 1)
- Added internal `collectDiagnostics()` returning `{ text, statuses }`.
- Public `diagnostics()` continues returning a `string` by delegating to `collectDiagnostics().text`.
- For each container, `spawnSync('docker', ['logs', container])` captures combined stdout and stderr once.
- Metadata records `index`, `status` (integer or `null`), `signal`, `error` (`'EIO'`, `'ETIMEDOUT'`, `'ENOENT'`, or `'UNKNOWN'`), and `logCaptureStatus` (`'success'` if `status === 0 && !error`, else `'failed'`).
- `completeObservation` requires `logCaptureStatus === 'success'` across all containers; nonempty text is no longer equated with success.

### 1.2 Truthful Container Inspection & Strict Evidence Path Containment (Finding 2)
- On successful inspection, boolean fields (`running`, `oomKilled`) are set strictly if boolean; `exitCode` is set only if finite integer; timestamps (`startedAt`, `finishedAt`) are validated as ISO strings; `healthStatus` is mapped to finite enum (`'none'`, `'starting'`, `'healthy'`, `'unhealthy'`).
- On inspect failure, `running`, `oomKilled`, `exitCode`, `startedAt`, and `finishedAt` are set to `null`, and `healthStatus` to `'unknown'`. No fabricated booleans.
- Excludes container IDs, names, commands, environment variables, network settings, and raw health logs.
- `getValidatedEvidenceDir()` enforces that `FG_T30_EVIDENCE_DIR` must resolve to an immediate direct child of `quality/evidence/T30` with basename matching `/^[a-z0-9][a-z0-9_-]{0,100}$/i`. Task root itself and path traversal are rejected.

### 1.3 Independent Diagnostic Writes & Honest Error Aggregation (Finding 3)
- Writes for `gateway-startup-diagnostics.txt` and `gateway-startup-state.json` are attempted independently. If the first fails, the second still proceeds with `logWritten: false` and incremented `writeFailureCount`.
- Teardown (`close()`) is unconditionally executed even if diagnostic gathering or file writing fails.
- If all observations and writes succeed, the exact original startup error is thrown.
- If any diagnostic step fails, throws `AggregateError([originalError, diagnosticFailure])` with safe diagnostic counters, honestly identifying missing evidence without concealing the original readiness error or claiming complete observation.

### 1.4 Comprehensive Multi-Layer Redaction (Finding 4)
- `createRedactor()` gathers sensitive inputs: LiveKit `key` and `secret`, original and rewritten `databaseURL`, encoded and decoded passwords, database usernames, and scoped search_path schema names (`t30_screen_[a-f0-9]+`).
- Sanitizes tokens (`access_token=[REDACTED]`, `[JWT REDACTED]`).
- Redacts database auth user patterns (`user "[REDACTED]"`), while safely preserving error phrases and SQLSTATE codes.
- Sanitizes raw SQL statements (`[SQL REDACTED]`) and parameter arrays.
- Emits zero private credentials, database URLs, or user passwords. Logs are not printed in notes or chat.

---

## 2. Artifacts

| Artifact | Location | SHA-256 | Purpose |
|---|---|---|---|
| `private-gateway-shaped-fixture.mjs` | `quality/evidence/T30/antigravity-gateway-startup-evidence-review-1/` | `400231ca75f725028186dc321bd0815441df477c72bb46cbf01edf95500cf589` | Gateway fixture with pre-teardown diagnostics, container state metadata, and strict evidence containment |
| `review-notes.md` | `quality/evidence/T30/antigravity-gateway-startup-evidence-review-1/` | Document self | Technical review documentation |

---

## 3. Invariants & Preserved Baselines

- **Gateway Mechanics Unchanged**: Docker run arguments, images (`node`, `sfu`), mounts, environment, port allocations, and teardown logic remain byte-identical.
- **Readiness Loop Unchanged**: Bounded health polling (40 iterations x 250ms) and fetch timeout (1,000ms) remain strictly unchanged with no retry extension.
- **Interfaces Unchanged**: Returned `{server, ws, turnPort, shaperControl, close, result, diagnostics}` object signature remains identical.
- **Application & Tests Unchanged**: No edits to application source (`apps/`), packages, built outputs, tests, ledger, or history.

---

## 4. Pre-Run Probes Required by Codex (Prior to Native34)

The underlying cause of Native33 startup failure remains unestablished because previous logs were removed during teardown. Before adopting this fixture for Native34, Codex must verify:

1. **Syntax Validation**: `node --check quality/evidence/T30/antigravity-gateway-startup-evidence-review-1/private-gateway-shaped-fixture.mjs`
2. **Controlled Probe**: Run a targeted smoke test with an invalid database credential to verify that:
   - Both stdout and stderr are captured and written to the evidence directory before container removal.
   - Redaction masks role/password while retaining the auth error code and phrase.
   - Container states accurately report exit codes, and cleanup completes cleanly.
3. **Normal Smoke Test**: Verify successful startup, health check pass, and normal teardown.

*Proposal-only: No tests or builds have been executed by Antigravity.*
