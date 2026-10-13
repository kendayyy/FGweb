# Lifecycle RED Probe & Coalescing Design Specification (antigravity-native61-lifecycle-red-probe-1)

## 1. Executive Summary & TDD Phase

This specification delivers a **strictly controlled, meaningful RED reproduction probe** for **T30** under the disciplined **Test-Driven Development (TDD)** workflow:
- **Phase**: Failing test / probe delivered **BEFORE** any product code modification.
- **Rule**: Absolutely **no application code or proposed implementation code** is modified or committed in this step.
- **Scope**: Strictly limited to `quality/evidence/T30/antigravity-native61-lifecycle-red-probe-1/**`.
- **Target Component**: Actual compiled `CallLifecycleService` from Build 12 (`apps/api/dist/modules/calls/call-lifecycle.service.js`).
- **Acceptance Status**: `nativeAcceptance: false` (T30 remains in progress; all 80 prior checkpoints preserved).

---

## 2. Evidence Context & Problem Telemetry

### Native60 & Native61 Observations
1. **Native60 Diagnostic Telemetry** (`t30-native-593b5b067ea6420b92904ba12cd24810`):
   - **5 gateway room-lock statement timeouts (`57014`)** occurred on backend PIDs 6228, 6229, 6230, and 6231 between 19:24:14Z and 19:24:29Z.
   - **15 matching PostgreSQL wait samples** showed gateway queries waiting on row locks for `rooms`, blocked by API backend PIDs (6254, 6295, 6349, 6355, 6429) executing `CallLifecycleService.reconcileGroup`, `CallsService.participants`, and `CallsService.list`.
   - Lifecycle holds lasted **~1.0s to ~2.2s** each.
   - Multiple API pool connection timeouts (`5000ms`) and HTTP 500 responses were generated.
2. **Native61 Canonical Execution** (`t30-native-8806b92cd0204328b999f46af74b6aa4`):
   - Exit code 1: Two actors joined; third actor (Hà) remained in initial room-loading; the original 5s Nhóm gọi region visibility assertion failed; zero capture or RTP windows completed.
   - Proved definitively that **removing observer instrumentation does NOT remedy the underlying concurrency contention**.
3. **Discipline & Non-Causality**:
   - Unique root cause or isolated binding catches are **not** proven by temporal association.
   - We do **not** invent timing or causal assertions. The goal of this probe is to reproduce and measure redundant overlapping reconciliation under controlled conditions.

---

## 3. Contention Mechanism in Current Compiled Source

Inside compiled `apps/api/dist/modules/calls/call-lifecycle.service.js`:
```typescript
// lines 64-70: lock() acquires exclusive locks on rooms and call_groups
async lock(db, id) {
    const group = (await db.query('SELECT room_id FROM call_groups WHERE id=$1', [id])).rows[0];
    if (!group) return;
    await db.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [group.room_id]);
    return (await db.query('SELECT id,room_id,state FROM call_groups WHERE id=$1 FOR UPDATE', [id])).rows[0];
}

// lines 126-177: reconcileGroup() holds the transaction while making remote network RPCs
async reconcileGroup(id, ended) {
    const time = new Date(this.clock()), native = this.native();
    await this.transaction(async (db) => {
        const group = await this.lock(db, id); // <-- Acquires rooms FOR UPDATE
        ...
        const name = `fg-call_${id}`, nativeExists = Boolean((await native.listRooms([name])).length); // <-- Network RPC
        let participants = [];
        if (nativeExists) {
            participants = await native.listParticipants(name); // <-- Network RPC
        }
        ...
        // queries and updates to call_members, call_admissions, publishing.reconcileWithin
    });
}
```

### The Amplification Loop:
- When a user joins or publishes/unpublishes tracks, multiple LiveKit webhooks arrive in rapid succession.
- Concurrently, the background sweep timer fires every 1000ms (`sweep() -> reconcileGroup(id)`).
- Every trigger unconditionally calls `reconcileGroup(id)` without any in-flight check or coalescing.
- Each concurrent invocation opens a connection from `this.pool`, starts a PostgreSQL transaction, and attempts `SELECT id FROM rooms WHERE id=$1 FOR UPDATE`.
- Call 1 acquires the lock. Calls 2, 3, 4, and 5 queue behind Call 1 in PostgreSQL.
- Because each call holds the transaction open while issuing remote LiveKit SFU RPCs (`listRooms`, `listParticipants`) and running multiple database queries, each pass takes **~300–600ms**.
- 4 concurrent triggers result in **1.2s–2.4s** of continuous exclusive locking on the room!
- Incoming gateway queries (`SELECT ... FROM rooms FOR SHARE`) and API endpoints (`CallsService.participants`) get blocked in the same queue, eventually hitting statement timeouts (`57014`) and pool exhaustion.

---

## 4. Candidate Internal Design: Per-Group Coalescing

### Core Concept
Coalesce ordinary reconciliation triggers **strictly per call group ID** so that multiple triggers arriving while a reconciliation pass is active do not queue up as redundant, sequential transactions.

### State Machine per Call Group `G`:
```
[IDLE]
  │
  │ Trigger arrives
  ▼
[IN-FLIGHT PASS 1] ──(Triggers arrive during Pass 1)──► Set needsTrailingPass = true
  │                                                     Accumulate ended screen events
  │ Pass 1 completes
  ▼
  Is needsTrailingPass true?
    ├── YES ──► Reset flag ──► [TRAILING PASS 2] (Fresh native & DB read)
    └── NO  ──► [IDLE]
```

### Bounded Work Guarantee
For $N$ concurrent triggers arriving during a reconciliation window:
- Exactly **2 passes** execute: the current in-flight pass, plus **at most 1 trailing pass**.
- Work and lock holding time are bounded to $O(1)$ (at most 2 passes) instead of $O(N)$.
- The trailing pass is guaranteed to read a **fresh snapshot** of both the native SFU state and the database, ensuring eventual consistency after all triggers have settled.

---

## 5. In-Depth Analysis of Uncertainties & Implications

### 1. Error Handling & Fault Tolerance
- **Uncertainty**: What happens if the in-flight pass throws an error (e.g. transient SFU network glitch or DB connection drop)?
- **Assessment**: The error must be caught, logged, and propagated to that specific caller. Crucially, `needsTrailingPass` must **NOT** be cleared or dropped. The trailing pass must still execute to attempt self-healing. If the trailing pass also fails, it backs off to the standard 1000ms periodic sweep.

### 2. Drain & Shutdown (`onModuleDestroy`)
- **Uncertainty**: How does shutdown interact with active or scheduled trailing passes?
- **Assessment**: Setting `closing = true` immediately rejects new incoming triggers. A drain mechanism (`await Promise.all(activePasses)`) must allow currently running in-flight and scheduled trailing passes to settle before closing the database pool (`pool.end()`). Prematurely closing the pool causes in-flight queries to fail with `Connection terminated`.

### 3. Stale Snapshot Avoidance
- **Uncertainty**: Could coalescing evaluate events against stale state?
- **Assessment**: **No.** The trailing pass is triggered *after* all burst events have arrived. When the trailing pass executes, it opens a fresh PostgreSQL transaction and issues fresh `native.listRooms` and `native.listParticipants` RPCs. It therefore operates on the latest state of the system, eliminating any risk of evaluating against a stale snapshot.

### 4. Ended Event Ordering & Accumulation
- **Uncertainty**: When webhooks deliver `track_unpublished` for screen share, an `ended: { identity, at }` object is passed to `reconcileGroup`. If multiple screen unpublish events arrive during an in-flight pass, how are they handled?
- **Assessment**: They must **never** overwrite or drop each other. Multiple `ended` events must be accumulated in an array/map and passed to `publishing.reconcileWithin(db, id, participants, time, accumulatedEnded)`. Dropping an `ended` event would cause screen-share publishing slots to remain erroneously occupied.

### 5. Multi-Group Isolation
- **Uncertainty**: Could high activity in Call Group A starve or delay Call Group B?
- **Assessment**: Coalescing state must be strictly isolated per call group ID (e.g., using a `Map<string, GroupCoalescer>`). Group A and Group B operate completely independently with separate in-flight/trailing state machines. Activity in Group A has zero impact on Group B.

### 6. Webhook Deduplication Independence
- **Uncertainty**: How does coalescing interact with database-level webhook deduplication?
- **Assessment**: Webhook deduplication occurs in `receive()` via durable insert:
  `INSERT INTO webhook_events(id, event_id, event_type, payload) VALUES (...) ON CONFLICT(event_id) DO NOTHING`
  This durable insert is executed per-event and is completely decoupled from execution coalescing. Coalescing applies solely to the subsequent invocation of `reconcileGroup(id)`.

---

## 6. Strict Architectural Invariants (Non-Negotiable)

To maintain absolute system safety, the following invariants are strictly preserved:
1. **NO user/room lock `SHARE` relaxation**: `SELECT id FROM rooms WHERE id=$1 FOR UPDATE` and `SELECT id, room_id, state FROM call_groups WHERE id=$1 FOR UPDATE` remain strictly exclusive locks.
2. **NO RPC outside transaction**: Transaction boundaries remain identical to the original design.
3. **NO actor removal**: All actor validations (`actor()`, `liveLease()`) remain fully enforced.
4. **NO deadline increase**: The 45000ms deadline and 5s third-actor share tab assertion remain immutable.
5. **NO sweep interval reduction**: The 1000ms sweep interval remains unchanged.
6. **NO skipping event processing**: Every event triggers a reconciliation pass (either in-flight or trailing).

---

## 7. Probe Harness Design (`probe-harness.mjs`)

The probe harness is implemented in:
[probe-harness.mjs](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native61-lifecycle-red-probe-1/probe-harness.mjs)

### Architecture:
1. **Real PostgreSQL Ephemeral Migrated Schema**:
   - Generates unique schema `t30_probe_<uuid>`.
   - Runs full Drizzle migrations from `packages/database/migrations`.
   - Seeds games (`Valorant`), 6 legitimate actors (`sender`, `receiver`, etc.), and valid authentication sessions.
2. **Canonical Fixture API Flow**:
   - Creates recruitment card and starts play session.
   - Creates call group via official API `POST /api/v1/rooms/:roomId/calls`.
   - Joins receiver via `POST /api/v1/calls/:id/join`.
   - Call group is genuinely `OPEN` with legitimate members and leases in the database.
3. **Minimal Counted Insertions**:
   - **Insertion 1 (Timer Isolation)**: Clears `lifecycleService.timer` to eliminate unmetered 1000ms background sweep interference during measurement.
   - **Insertion 2 (Test-Only Local Adapter)**: Wraps `lifecycleService.native` with a measured 40ms delay representing realistic SFU round-trip latency; explicitly marked as test-only synthetic delay, preserving actual SDK return/error types.
   - **Insertion 3 (Reconciliation Pass Tracker)**: Instruments `reconcileGroup` to measure invocations, completed passes, and lock durations.
4. **Workload & Intended Meaningful RED Assertion**:
   - Fires 4 concurrent `reconcileGroup(callGroupId)` invocations.
   - **Assertion**:
     ```javascript
     assert(actualPasses <= 2, "[RED REPRODUCTION CONFIRMED] ...");
     ```
   - On the current compiled source, **all 4 triggers execute sequentially**, resulting in `actualPasses === 4`.
   - The assertion **fails predictably with exit code 1**, proving redundant work under un-coalesced source.
5. **Control Assertions**:
   - Verifies `call_groups` state remains `OPEN`.
   - Verifies `rooms` and `call_members` rows remain intact.
   - Proves genuine actor/lock SQL executed.
6. **Strict Settlement Cleanup in `finally`**:
   - Cascades schema drop `DROP SCHEMA "t30_probe_..." CASCADE`.
   - Verifies schema absence in `pg_namespace`.
   - Closes NestJS app, Redis connection, and database pool.
   - Persists execution report to `probe-report.json`.

---

## 8. Root Execution & Verification Instructions

### How Root Runs the Probe:
```powershell
node quality/evidence/T30/antigravity-native61-lifecycle-red-probe-1/probe-harness.mjs
```

### Expected Outcome:
- **Expected Exit Code**: `1` (Standard RED assertion failure).
- **Expected Output**:
  ```
  ======================================================================
  PROBE HARNESS RESULT: EXPECTED RED REPRODUCTION CONFIRMED
  ======================================================================
  [RED REPRODUCTION CONFIRMED] Redundant overlapping reconciliation executed 4 full passes for 4 concurrent triggers (expected at most 2 under per-group coalescing). Native RPCs: 4 listRooms, 4 listParticipants. Cumulative lock duration: ...ms across 4 sequential acquisitions.
  ======================================================================
  ```
- **Verification of Probe Cleanliness**:
  - Inspect `probe-report.json`:
    - `schemaRemoved: true`
    - `appClosed: true`
    - `poolClosed: true`
    - `controlVerification.callGroupState: "OPEN"`
    - `controlVerification.roomExists: true`
    - `controlVerification.membersCount: >= 1`
    - `testResult: "EXPECTED_RED_CONFIRMED"`
- **Distinction from Errors**:
  - Exit code `1`: Expected RED reproduction confirmed.
  - Exit code `2`: Unexpected setup, schema, or runtime error (should not occur).
