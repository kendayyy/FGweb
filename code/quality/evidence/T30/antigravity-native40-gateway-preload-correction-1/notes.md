# FG T30 — Gateway Observer Preload Correction Notes

## 1. Overview & Scope

This proposal delivers corrected diagnostic observability artifacts for FG T30 under `quality/evidence/T30/antigravity-native40-gateway-preload-correction-1/`, resolving every finding in `native40-preload-draft-rejection1.json`. The implementation preserves all application code, database constraints, authority checks, and timing invariants while providing rigorous, safe telemetry for the private signaling gateway container.

---

## 2. Rejection Findings Resolution

### 1. `PatchedPool` Inheritance & Client Mapping
- Replaced the function wrapper with `class PatchedPool extends OrigPool` invoking `super(...args)`.
- Listens directly to the pool's own `'connect'` event to associate connected clients with their `poolIndex` in a `WeakMap`.
- `pool.connect` is **not** overridden.

### 2. Query Identity & Non-Intrusive Promise Observation
- Exact callback and submittable invocations: if the last argument is a function, `origQuery.apply(this, args)` is invoked directly without callback substitution or wrapping, returning the exact original object.
- Diagnostic spans only observe Promise forms and synchronous exceptions.
- Promise forms register side `.then(successHandler, errorHandler)` callbacks that safely buffer telemetry and return `undefined` (never throw). The **exact original Promise** is returned to the caller, ensuring zero unhandled side rejections and complete error identity preservation.
- Synchronous exceptions record the span and immediately re-throw the exact original error.

### 3. Absolute Timestamps & Pool Correlation
- Spans record safe ISO-8601 `startedAt` and `completedAt`, monotonic `durationMs`, `poolIndex`, `backendPid`, and safe 5-character `sqlState` (`/^[0-9A-Z]{5}$/`). Zero SQL queries, parameters, rows, or credentials are captured.

### 4. RPC Enum Standardization & Method Integrity
- Standardized RPC error codes to lower-case Twirp enums (`canceled`, `unknown`, `invalid_argument`, `deadline_exceeded`, `not_found`, `already_exists`, `permission_denied`, `unauthenticated`, `resource_exhausted`, `failed_precondition`, `aborted`, `out_of_range`, `unimplemented`, `internal`, `unavailable`, `data_loss`) or numeric HTTP status (`100`..`599`), defaulting to `'other'`.
- Missing required methods (`updateParticipant`, `getParticipant`, `removeParticipant`) immediately increments `failureCount`.

### 5. CPU Delta & Histogram Reset
- Uses a single absolute snapshot delta for `process.cpuUsage(lastCpuUsage)`.
- Calls `histogram.reset()` on every 1 Hz sample interval.
- Emits finite-null values for unavailable metrics.

### 6. WebSocket Role & Safe Frame Decode
- Uses `ws._isServer === true` for `'server-peer'` and `false` for `'native-upstream'`.
- Restricts protobuf frame names to an explicit whitelist of `SignalRequest` and `SignalResponse` case names; all others map to `'unknown'`.
- Frames exceeding 1 MiB are skipped without decoding (`'unknown'`). No raw payloads are retained.

### 7. Synchronous Write Integrity & Duplicate Guard
- `writeStdoutSync` enforces complete byte writes; partial or zero-byte returns throw and increment `failureCount`.
- Duplicate preload detection throws an error immediately before any runtime modification.

### 8. Bounded Polling in `stopGatewayObservation()`
- Replaced the one-shot 500 ms sleep with bounded polling (up to 3,000 ms at 100 ms intervals).
- Executes `docker logs` with `timeout <= 1000ms`, `maxBuffer <= 4MiB`, asserting `status === 0` and absence of execution errors.
- Enforces exactly one `[FG_GATEWAY_HEALTH]` line with a strict six-key schema: `sampleCount` ($> 0$), `failureCount` ($= 0$), `droppedCount` ($= 0$), `timerStopped` (`true`), `histogramDisabled` (`true`), `observationComplete` (`true`). Rejects unknown keys or malformed structures.

### 9. Fixture Import Alignment & Independent Teardown
- Updated `fixture-server-shaped.mjs` to import `startGatewayFixture` from `./private-gateway-observer-reviewed1.mjs`.
- Configured `private-gateway-shaped-fixture.mjs` to mount `gateway-observer-preload-reviewed1.cjs` to `/gateway/preload.cjs`.
- Preserves all canonical resource teardown steps (`mediaDiagnostics`, `mediaContainers`, `redisKeys`, `redisQuit`, `inspectorRelease`, `dropSchema`, `poolEnd`) independently upon observer failure.
