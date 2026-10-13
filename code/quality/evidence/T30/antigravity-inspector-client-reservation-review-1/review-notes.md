# T30 Dedicated PostgreSQL Inspector Client Reservation Review Notes (Round 2)

**Task**: FG T30 — Dedicated PostgreSQL Inspector Client Reservation Refactor  
**Directory**: `quality/evidence/T30/antigravity-inspector-client-reservation-review-1/`  
**Reviewer/Auditor**: Codex  
**Agent**: Antigravity (Gemini 3.6 Flash - High, sequential proposal mode, no Anti2 / no subagents)  
**Date**: 2026-10-11  

---

## 1. Problem Statement & Verified Runtime Evidence

In Native32 (`quality/evidence/T30/codex-headed-t30-native-32.txt`, built API run 9), both real media captures completed successfully (15,374ms and 21,041ms) with RTP video, dual audio, and TURN relay established. However, the first frozen `ask('inspect')` call failed at `04:44:25.772Z` with:

```text
Connection terminated due to connection timeout
```

### Verified Facts
1. **Driver Source Line**: In installed `node_modules/pg-pool/index.js` (lines 255–278), this specific error string is thrown solely by `newClient()` when `client.connect(...)` exceeds `this.options.connectionTimeoutMillis` (configured as 5,000ms).
2. **On-Demand Acquisition**: The baseline test fixture called `pool.query(...)` inside `message.kind === 'inspect'`, which requested a client on demand.
3. **No Saturation Inferences Claimed**: Native32 sampled gateway status, API observer health, and screenshot receipts, but did **not** sample pool idle eviction counts or CPU saturation during that specific interval. Therefore, only the **connection startup timeout mechanism** is verified by source code and error messages; idle eviction or server load are hypotheses, not proven facts.

### Goal
Pre-allocate and hold **ONE** dedicated `PoolClient` from the fixture's existing PostgreSQL pool during startup (in autocommit mode, zero held transaction locks). Direct the three inspection queries to `inspectorClient.query`, bypassing on-demand TCP handshakes, while providing comprehensive error handling, lifetime tracking, and robust cleanup.

---

## 2. Resolution of Round 1 Rejected Findings

In `inspector-client-reservation-source-review-rejected-1.json`, Codex identified seven specific defects in Round 1. All seven have been rigorously resolved in this refactor:

### Finding 1: Canonical Gateway Import & Shaper Operations
- **Defect in Round 1**: Canonical imported `./private-gateway-fixture.mjs` instead of `./private-gateway-shaped-fixture.mjs`, and placed a defensive guard on `fixture.shaperControl`.
- **Resolution**: Both `fixture-server-inspector-reserved.mjs` (diagnostic) and `fixture-server-built-inspector-reserved.mjs` (canonical) import `./private-gateway-shaped-fixture.mjs`. In both variants, `fixture.diagnostics()` and `fetch(fixture.shaperControl + '/stats')` are executed unconditionally during media cleanup, and `shape`/`shaping-stats` IPC messages operate unconditionally. Canonical retains zero observation modules.

### Finding 2: Safe Release Semantics & `pool.end()` Deadlock Prevention
- **Defect in Round 1**: `inspectorReleased = true` was set before `release(true)`, and release exceptions were swallowed. An unreleased client could cause `pool.end()` to hang indefinitely.
- **Resolution**:
  - `inspectorExpectedEnd = true` is marked immediately before `release(true)`.
  - `inspectorReleased = true` is set **only** after `release(true)` returns successfully.
  - If `release(true)` throws:
    1. `inspectorReleased` remains `false`.
    2. `inspectorHealthy = false`, `inspectorFailureCount++`, and the error is recorded.
    3. The client socket stream is forcibly destroyed/ended (`inspectorClient.connection.stream.destroy()` or `inspectorClient.end()`).
    4. To prevent `pool.end()` from deadlocking on an unreturned client (as `pool._clients` remains non-empty in `pg-pool`), the client is safely removed from `pool._clients`.
    5. The error is re-thrown inside `attempt('inspectorRelease', ...)`, ensuring it is aggregated in cleanup errors without preventing subsequent cleanup steps (schema drop, redis teardown, etc.).

### Finding 3: Lifetime Unexpected Client `end` Accounting
- **Defect in Round 1**: `client.once('end')` only set `inspectorFailed = true` without incrementing `failureCount` or invalidating health if no further inspect calls occurred.
- **Resolution**:
  - `inspectorClient.on('end', ...)` tracks `actualSocketEnded = true`.
  - If `!inspectorExpectedEnd` when `'end'` fires, it is an **unexpected termination**:
    - `inspectorHealthy = false;`
    - `inspectorFailureCount++;`
    - Safe diagnostic failure is recorded.
  - In `cleanup()`, cleanup waits up to 5,000ms (`inspectorSocketEndWait`) for the actual client `'end'` event to settle after release, truthfully verifying socket closure.

### Finding 4: Lifetime `on('error')` Handler
- **Defect in Round 1**: Used `once('error')`, which would leave subsequent client errors unhandled.
- **Resolution**:
  - Attached with `inspectorClient.on('error', ...)`, persisting for the client's entire lifetime.
  - Every error sets `inspectorHealthy = false`, increments `inspectorFailureCount++`, and safely logs allowlisted error fields (`name`, `code`, `backendPid`).

### Finding 5: Robust Diagnostic Writes & Guaranteed IPC Failure Delivery
- **Defect in Round 1**: Diagnostic file write failures were swallowed or could prevent failed IPC delivery.
- **Resolution**:
  - Diagnostic append operations are wrapped in safe `try/catch`. If writing fails, it increments `inspectorWriteFailureCount++` and sets `inspectorHealthy = false` without crashing the event handler.
  - In `message.kind === 'inspect'`, the `catch (error)` block **guarantees** `process.send?.({ id: message.id, failed: true, name, code })` even if appending to `inspection-failures.jsonl` throws.
  - Zero raw SQL, parameters, connection strings, schema names, or secrets are leaked.

### Finding 6: Explicit Separation of `actualSocketEnded` and `poolEnded`
- **Defect in Round 1**: `poolEnded` was equated with socket termination.
- **Resolution**:
  - `actualSocketEnded` and `poolEnded` are tracked as independent boolean flags.
  - `actualSocketEnded` is proven by the underlying client's `'end'` event.
  - `poolEnded` is set to `Boolean(pool.ended)` after `await pool.end()`.
  - Both are separately recorded in `inspector-lifecycle.json`.

### Finding 7: Honest Failure Reporting & Exit Code 1
- **Defect in Round 1**: Cleanup could exit with code 0 despite unrecorded diagnostic or inspector failures.
- **Resolution**:
  - At the end of `cleanup()`, if `inspectorFailureCount > 0 || inspectorWriteFailureCount > 0 || !inspectorHealthy`, an error is pushed into `errors`.
  - Any aggregated cleanup error causes `cleanup()` to throw.
  - `message.kind === 'stop'` catches the error, writes `${evidence}/cleanup-failure.json`, and terminates with `process.exit(1)`.
  - `healthy: isHealthy` in `inspector-lifecycle.json` is `true` **only** if zero client failures, zero write failures, client released, socket ended, and pool ended.

---

## 3. Detailed Technical Architecture & Invariants

### 3.1 Reservation Lifecycle
```
[Startup: migrations & seed]
       │
       ▼
[Pool initialized (max: 20, connectTimeout: 5000ms)]
       │
       ▼
[Actors & sessions seeded]
       │
       ▼
inspectorClient = await pool.connect();
inspectorReserved = true;
inspectorHealthy = true;
inspectorPid = Number(inspectorClient.processID);
inspectorClient.on('error', handleClientError);
inspectorClient.on('end', handleClientEnd);
       │
       ▼
[Redis & Media Gateway initialized]
       │
       ▼
[API & Web servers started]
       │
       ▼
process.send({ kind: 'ready', ..., inspectorPid });
```

### 3.2 Inspection Execution
In `message.kind === 'inspect'`:
1. Check: `if (!inspectorHealthy || !inspectorClient || inspectorReleased || inspectorFailureCount > 0) throw new Error('Inspector client unavailable');`
2. Run Query 1: `await inspectorClient.query('SELECT ...')` (rooms, members, play_state, play_slots, callers, open_calls)
3. Run Query 2: `await inspectorClient.query('SELECT user_id, is_muted FROM call_members ...')`
4. Run SFU calls: `sfu.listRooms()`, `sfu.listParticipants()` (LiveKit REST API)
5. Run Query 3: `await inspectorClient.query('SELECT count(*)::int AS count FROM call_publish_slots')`
6. Return state with `inspectorPid`.

### 3.3 Teardown Sequence & Invariants
```
[cleanup() triggered]
       │
       ▼
1. Stop PG Wait Sampler (diagnostic only)
2. Close NestJS API App
3. Destroy Web sockets & Close Web server
4. Media diagnostics & Shaper stats (unconditional)
5. Media containers & network removal
6. Redis presence cleanup & redis.quit()
7. Inspector Release:
   - inspectorExpectedEnd = true;
   - inspectorClient.release(true);
   - If throw: destroy socket, remove from pool._clients, record failure.
8. Inspector Socket End Wait:
   - Await client 'end' event (bounded <= 5000ms).
9. Database:
   - DROP SCHEMA "<schema>" CASCADE
   - pool.end()
10. Write cleanup.json
11. Write inspector-lifecycle.json
12. Check API Owner Health (diagnostic only)
13. Aggregate errors:
    - If inspectorFailureCount > 0 or inspectorWriteFailureCount > 0 or !inspectorHealthy:
      throw AggregateError -> exit(1) with cleanup-failure.json
    - Else:
      exit(0)
```

---

## 4. Installed Driver Semantics (`node_modules/pg-pool`)

A detailed audit of `node_modules/pg-pool/index.js` confirms:
1. **`pool._clients`**: An internal array tracking all allocated `Client` instances.
2. **`pool._idle`**: An array of idle client items with timeout handles.
3. **`_pulseQueue()` on Ending**:
   ```javascript
   if (this.ending) {
     if (this._idle.length) {
       this._idle.slice().map((item) => { this._remove(item.client) })
     }
     if (!this._clients.length) {
       this.ended = true
       this._endCallback()
     }
     return
   }
   ```
4. **The Deadlock Risk**:
   If an acquired client is never returned or if `client.release()` throws before `_remove()` can filter it out of `this._clients`, `this._clients.length` will remain `> 0`. Calling `pool.end()` marks `this.ending = true`, but `_endCallback()` is never invoked, hanging the process until external timeout.
5. **The Fallback Solution**:
   If `release(true)` throws, our proposal catches the error, forcibly terminates the socket stream, and explicitly prunes `inspectorClient` from `pool._clients`. This ensures `pool.end()` settles cleanly and all Docker containers/schemas can be torn down, while honestly reporting exit code 1.

---

## 5. Artifact Summary & SHA-256 Signatures

| Artifact | Location | SHA-256 | Purpose |
|---|---|---|---|
| `fixture-server-inspector-reserved.mjs` | `quality/evidence/T30/antigravity-inspector-client-reservation-review-1/` | `17dd023476f443517cc78abcbe16bbd81b6918039954b5f43eb25eb7f356e90e` | Diagnostic variant with PG wait sampler & API owner observation |
| `fixture-server-built-inspector-reserved.mjs` | `quality/evidence/T30/antigravity-inspector-client-reservation-review-1/` | `c11c22b7d76b6abcdc26e39622f38f480b310931ce502c6846f5de520cc8da7b` | Canonical production variant with zero observation modules |
| `review-notes.md` | `quality/evidence/T30/antigravity-inspector-client-reservation-review-1/` | Document self | Technical documentation & audit trail |

---

## 6. Pre-Run Verification Checklist for Codex

Before adopting these fixtures into the test pipeline for Headed33, Codex should verify:

1. **Static Syntax**:
   - `node --check quality/evidence/T30/antigravity-inspector-client-reservation-review-1/fixture-server-inspector-reserved.mjs`
   - `node --check quality/evidence/T30/antigravity-inspector-client-reservation-review-1/fixture-server-built-inspector-reserved.mjs`
2. **Idle Survival Test**:
   - Start the fixture in a test harness.
   - Wait >10 seconds (exceeding `idleTimeoutMillis: 10000`).
   - Dispatch `ask('inspect')`.
   - Verify inspection executes immediately on the same `inspectorPid` and accurately reads live schema records.
3. **Failure Teardown Test**:
   - Start fixture, forcibly terminate the inspector client connection, and issue `stop`.
   - Verify `inspectorFailureCount > 0`, `inspector-lifecycle.json` records `healthy: false`, `cleanup-failure.json` is generated, and process exits with `1`.
   - Verify PostgreSQL schema and Docker containers are successfully removed.
4. **Adoption**:
   - Point test execution to the approved fixture variant for Headed33.
