# FG T30 — Diagnostic Plan: Corrected API Lock Spans & HTTP Before-Guard Timing

## 1. Context and Diagnostic Objective

During FG T30 native automated runs (e.g. Canonical Native36 and Diagnostic Native37), the second actor ("Linh") experienced an initial 5,000ms locator timeout waiting for the viewer room call region. Subsequent analysis in `native41-mount-path-review1.json` revealed:
- `CallPanel.tsx` renders the call region unconditionally, even while call group lists are loading.
- Parent `RoomsPage.tsx` gates rendering on initial auth (`/api/v1/me`) and active room detail (`/api/v1/rooms/:id`).
- Consequently, list queries alone cannot be presumed as the sole root cause of the initial region absence; HTTP start/finish timing before Nest guards must be captured.
- Codex rejected the previous draft (`native42-api-spans-draft-rejection1.json`, 10 findings). This corrected proposal directly resolves all 10 findings.

---

## 2. Rejection Findings & Corrective Implementations

### Finding 1: HTTP Before-Guard Timing
- **Problem**: `CallPanel` renders region unconditionally while list loading; auth and room-detail gating were unobserved.
- **Correction**: Implemented `instrumentHttpTimingMiddleware(app)` in `api-lock-spans-observer.mjs`. It registers before Nest routing and guards execute. Wraps requests for `/api/v1/me`, `/games`, `/rooms/own`, `/rooms/:id`, `/rooms/:id/members`, `/rooms/:id/calls`, `/rooms/:id/play-sessions`, and `/calls/:id/participants` in `AsyncLocalStorage` context and measures wall-clock duration from request receipt to socket finish/close.

### Finding 2: Service Start/End Result Spans & Identity Preservation
- **Problem**: Service wrappers emitted no start/end spans; only fake classes were tested, leaving promise/args/this/sync-throw identity unverified.
- **Correction**: `instrumentOwnedApiServices` instruments `CallsService.list`, `CallsService.participants`, `CallsService.withControlGroup`, and `CallLifecycleService.reconcileGroup`, emitting distinct `service-start` and `service-end` records with duration, PID sets, and safe status codes. Original `this`, arguments, return values, sync throws, and async rejections are strictly preserved.

### Finding 3: Control Emits `poolEnded` Before Teardown
- **Problem**: In previous control child, `poolEnded: pool.ended` was emitted before `await pool.end()` completed, causing normal assertions to fail by construction.
- **Correction**: In `probe-api-lock-spans-child.mjs`, `await pool.end()` is executed and verified to complete before logging `[FG_CONTROL_RESULT]` and `[FG_API_SPANS_HEALTH]`.

### Finding 4: Bounded Buffer & IO Fault Accounting
- **Problem**: Append operations hid short-write accounting; health overwrote files without `wx`; drop and IO failure modes were untested.
- **Correction**: Bounded buffer (5,000 records / 1 MiB) with `droppedCount` accounting. Synchronous flushing uses `fs.openSync` and loop `fs.writeSync` handling partial writes. Health record uses `{ flag: 'wx' }`. Added 5 distinct control modes: `normal`, `write-io`, `short-write`, `buffer-drop`, and `final-health-io`.

### Finding 5: Lock State Resets & Accurate PID Tracking
- **Problem**: Lock state reset on failed commit/rollback but not on `BEGIN`; client PIDs in callback queries were unassociated.
- **Correction**: `BEGIN` unconditionally resets active lock tracking. Locks are only marked acquired on successful query execution. Hold durations are calculated only upon successful `COMMIT` or `ROLLBACK`. All client PIDs are collected in `ctx.pids` Set across all query execution paths.

### Finding 6: Duplicate Install Guards & Whitelisted Owners
- **Problem**: Instrumentation lacked duplicate install guards; arbitrary context owners could leak; thenable attachment errors could alter results.
- **Correction**: Added `globalThis.__FG_API_LOCK_SPANS_INSTALLED__` guard; `startApiLockSpansObserver` throws if already running. Whitelisted `SAFE_SERVICE_OWNERS` with fallback to `'unassociated'`. Side handlers return `undefined` and catch internal errors without re-throwing.

### Finding 7: Fixture Stop Completeness Enforcement
- **Problem**: Fixture stop reported false completeness without throwing when observers were uninitialized or incomplete.
- **Correction**: `cleanup()` in `fixture-server-native42-api-spans.mjs` strictly asserts `health.observationComplete === true` and throws an error if any observer reports failures or incomplete settlement.

### Finding 8: Path Independence & Canonical Imports
- **Problem**: Relative parent imports broke when running from nested proposal directories.
- **Correction**: Created `resolveEvidenceModule` helper that dynamically resolves sibling helpers whether executed directly from `quality/evidence/T30/antigravity-native42-api-spans-correction-1/` or canonically from `quality/evidence/T30/`. All workspace imports use `pathToFileURL(path.resolve(...)).href`.

### Finding 9: Inspect Protocol Modeling on Proven Probe
- **Problem**: Fixture smoke lacked real inspect transitions, finite timeouts, and settled runtime cleanup.
- **Correction**: `smoke-fixture-api-spans.mjs` is directly modeled on proven `probe-native38-metrics-fixture1-normal.mjs`. Validates built SPA HTML/CSP, assets hashes, real WebSocket handshake, retained inspector over idle, and inspect transition from 0 callers $\to$ 1 caller after API admission. Settles all 5 owned runtime resources.

### Finding 10: Strict Privacy & Sanitization
- **Problem**: Control buffered raw stderr and arbitrary errors into review records, risking secret leaks.
- **Correction**: Complete sanitization pipeline in `run-api-lock-spans-controls.mjs` and `smoke-fixture-api-spans.mjs`. Redacts all environment secrets, DB passwords, JWT tokens, connection URLs, and generic URLs. Prohibits raw stderr and raw SQL statements from entering review artifacts.

---

## 3. File Inventory in Proposal Directory

All files are located in `quality/evidence/T30/antigravity-native42-api-spans-correction-1/`:

1. `api-lock-spans-observer.mjs`:
   - Duplicate installation guard.
   - HTTP before-guard timing middleware (`instrumentHttpTimingMiddleware`).
   - PostgreSQL query and pool instrumentation with lock tracking and PID accumulation.
   - LiveKit RoomServiceClient SDK instrumentation for all 6 RPC methods.
   - Service method wrapping for `CallsService` and `CallLifecycleService` with start/end result spans.
   - 1Hz CPU, event loop, and pool metrics sampling with bounded buffer and short-write handling.
2. `fixture-server-native42-api-spans.mjs`:
   - Dual-mode module resolution (`resolveEvidenceModule`).
   - Early pool and SFU instrumentation.
   - HTTP middleware registration before `app.listen()`.
   - Strict cleanup assertions verifying complete observer health.
3. `probe-api-lock-spans-child.mjs`:
   - Tests 5 execution modes (`normal`, `write-io`, `short-write`, `buffer-drop`, `final-health-io`).
   - Asserts exact identity across PG, SDK, and service methods.
   - Verifies `await pool.end()` completes before reporting result.
4. `run-api-lock-spans-controls.mjs`:
   - Spawns and validates child probes across all 5 modes.
   - Strict sanitization preventing secret or raw SQL leakage.
   - Emits `api-lock-spans-control-review.json`.
5. `smoke-fixture-api-spans.mjs`:
   - Proven smoke verification modeled on `probe-native38-metrics-fixture1-normal.mjs`.
   - Full inspect protocol (0 callers $\to$ 1 caller).
   - Verifies clean settlement of all 5 runtime resources and inspector lifecycle.
6. `plan.md`:
   - Diagnostic plan and architectural overview.

---

## 4. Invariants and Boundaries

1. **No Code / Application Mutations**: All files are diagnostic tools confined to `quality/evidence/T30/antigravity-native42-api-spans-correction-1/`. No production code or tests are altered.
2. **Observation Only**: This instrumentation diagnoses the causal factors of the initial 5,000ms locator timeout; it does not claim to fix timing or alter native acceptance gates.
3. **Identity Preservation**: Telemetry is purely side-channel. Return values, promises, arguments, `this`, sync exceptions, and rejections are identical to un-instrumented execution.
4. **Zero Secret Leakage**: Query parameters, SQL strings, row contents, user IDs, and auth tokens are excluded from all persisted telemetry.
