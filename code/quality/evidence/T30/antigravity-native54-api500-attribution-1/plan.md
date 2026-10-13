# FG T30 — Diagnostic Proposal: Native54 API 500 Attribution & Pool Connect Error Classification

## 1. Executive Summary & Problem Analysis

In native headed test run 54 (`t30-native-976fe15868f04d4ba61c848c2dab2f6f`), actor 3 (Minh Anh) failed the initial loader locator (`toBeVisible` at line 52/66) after 5 seconds. Concurrently, the test logged HTTP 500 errors on essential bootstrap endpoints:
- `http-room-play-sessions`: duration 5700.53ms, status 500, `pids: []`
- `http-rooms-members`: duration 5214.13ms, status 500, `pids: []`
- `http-rooms-members`: duration 11307.86ms, status 500, `pids: []`
- `http-rooms-detail`: duration 5698.73ms, status 500, `pids: []`

### Root Cause of Telemetry Blindspot
In the baseline API observer (`api43-observer-reviewed1.mjs`):
1. **Missing `Pool.connect` Instrumentation**: The observer only instruments `Pool.prototype.query` and `Client.prototype.query`. When `RoomsService.getRoomDetail` or `TeamsService.transaction` calls `const client = await this.pool.connect()`, if connection checkout exceeds `connectionTimeoutMillis: 5000`, the pool rejects the promise directly. Because `query` was never called, no database span was captured, leaving `directQueryFailures: []` and empty `pids: []`.
2. **Missing Service Context**: `instrumentOwnedApiServices` only wrapped `CallsService` and `CallLifecycleService`. It omitted `RoomsService`, `TeamsService`, and `PlaySessionsService`. Consequently, any internal pool activity was either unobserved or emitted under the fallback `'unassociated'` owner.

## 2. Proposed Diagnostic Architecture

### A. Promise-Based `Pool.prototype.connect` Wrapping
In `api-observer-attributed1.mjs`, `PatchedPool` wraps `OrigPool.prototype.connect`:
- **Callback Path**: If `typeof args[0] === 'function'`, it delegates directly to `Reflect.apply(originalPoolConnect, this, args)` without modification.
- **Promise Path**:
  - Captures start timestamp and monotonic clock.
  - Delegates via `Reflect.apply(originalPoolConnect, this, args)` and attaches side-handlers to the returned promise via `Reflect.apply(result.then, result, [onSuccess, onError])`.
  - On success, records `backendPid: client.processID` and links it to the active ALS context.
  - On failure, classifies the error into a sanitized enum.
  - Emits a `pool-connect` telemetry span to `api-lock-spans.jsonl`.
  - **Returns the exact original Promise identity** to preserve caller semantics and microtask timing.

### B. Sanitized Error Classification Enum
To strictly prevent secret leakage, query string pollution, or unbounded stack traces in telemetry, errors are classified against a fixed enum:
```typescript
type ConnectErrorCode =
  | 'ERR_POOL_ACQUIRE_TIMEOUT'   // "timeout exceeded when trying to connect"
  | 'ERR_CONNECTION_TIMEOUT'     // "Connection terminated due to connection timeout" / ETIMEDOUT
  | 'ERR_CONNECTION_REFUSED'     // ECONNREFUSED
  | 'ERR_CONNECTION_RESET'       // ECONNRESET / EPIPE
  | 'ERR_POOL_ENDED'            // "Cannot use a pool after calling end"
  | 'ERR_SQLSTATE'              // Valid 5-character PostgreSQL SQLSTATE
  | 'ERR_GENERIC_CONNECT_FAILURE';
```
No `error.message`, `error.stack`, or query parameters are ever persisted.

### C. Expanded Service Context Attribution
`SAFE_SERVICE_OWNERS` and `instrumentOwnedApiServices` are expanded to encompass:
- `RoomsService.getRoomDetail`
- `RoomsService.listRoomMembers`
- `RoomsService.listOwnRooms`
- `TeamsService.transaction`
- `TeamsService.snapshot`
- `PlaySessionsService.listRoom`

Each wrapper creates an ALS child span linked via `parentSpanIndex` to the enclosing HTTP request span (e.g. `http-rooms-detail`), establishing complete provenance from HTTP request -> service execution -> pool checkout -> query execution.

## 3. Strict Safety Invariants & Scope Boundaries

1. **Zero App Mutation**: No modifications to `apps/api/src`, contracts, or database schemas.
2. **No Timeout Alterations**: Diagnostic observes existing 5000ms timeouts; does not raise timeouts or mask root-cause latency.
3. **No Lock or Authority Weakening**: Security guards, CSRF, and PostgreSQL `FOR UPDATE`/`FOR SHARE` locks remain unaltered.
4. **No Docker/Global DB Alterations**: Supabase, Redis, and local database settings remain strictly as configured.
5. **Bounded Telemetry Buffer**: Retains 5,000 record / 1 MiB bounds with atomic write flush and strict health settlement.
6. **No Speculative Hardware Claims**: Documents observations objectively without inferring single-cause hardware bottlenecks.

## 4. Deliverables Manifest

- `api-observer-attributed1.mjs`: Attributed observer with `Pool.connect` instrumentation and expanded service wrappers.
- `fixture-server-build2-api54-reviewed1.mjs`: Test server fixture integrating attributed observer.
- `test-controls.mjs`: Real PostgreSQL pool exhaustion and timeout control tests.
- `reconstruction.proof.mjs`: Verification script comparing proposed changes against canonical baselines.
- `proposal.json`: Machine-readable proposal metadata.

## 5. Next Steps for Codex Review & Adoption

1. Root Codex reviews proposal diffs and runs `reconstruction.proof.mjs`.
2. Codex executes `test-controls.mjs` against isolated test database schema to verify attribution and enum classification under real pool exhaustion.
3. Upon review pass, Codex adopts fixture into native diagnostic test suite.
