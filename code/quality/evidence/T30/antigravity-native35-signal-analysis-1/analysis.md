# T30 Native35 Signal Analysis & Performance Root Cause Investigation

**Task**: FG T30 — Private Gateway Signal Disconnection & Lock Contention Analysis  
**Directory**: `quality/evidence/T30/antigravity-native35-signal-analysis-1/`  
**Reviewer/Auditor**: Codex  
**Agent**: Antigravity (Gemini 3.6 Flash - High, sequential analysis mode, no Anti2 / no subagents)  
**Date**: 2026-10-11  

---

## 1. Verified Facts vs. Source Inference

### 1.1 Verified Historical and Empirical Facts
1. **Native32 Execution**:
   - Both real browser captures succeeded at requested 1280x720@30fps (actual 1280x698@30fps viewport).
   - Viewer established 2 tabs, first actual video RTP arrived, and TURN relay was verified.
   - Run failed only because the inspector fixture connection cold-startup failed before the first track switch.
   - The inspector client reservation has since been verified across 6 isolated smoke tests (idle, active, state, and fault probes).
2. **Native34 Execution (Diagnostic Run with Observation Wrappers)**:
   - Three participants joined (6800ms, 5437ms, 7129ms); first screen share completed in 13524ms.
   - Second share failed the 45000ms deadline asserting visible "Stop sharing" control.
   - Database telemetry recorded two actual PostgreSQL error `57014` (`query_canceled` due to `statement_timeout = 3000ms`) inside gateway room lock operations (`selectRoomsShare` / `selectRoomsUpdate`), accompanied by API `GET /api/rooms/...` 500 errors.
   - PostgreSQL lock inspection captured:
     - `PID 29959` (owned gateway) holding locks on `rooms`, `call_groups`, and related tables in `commit` (xactAge: 803ms).
     - `PID 30092` (`call-lifecycle.service.js`) waiting on lock `transactionid` for `selectRoomsUpdate` (xactAge: 2897ms, queryAge: 2811ms), blocked by `PID 29959`.
     - `PID 29965` (owned gateway) and `PID 30141` (`teams.service.js`) waiting on lock `tuple` for `selectRoomsShare` (xactAge: 2400ms / 3273ms), blocked by `PID 30092`.
     - `PID 30033` (`teams.service.js` / room queries) in state `idleInTransaction` waiting on `ClientRead` (xactAge: 415ms).
3. **Native35 Execution (Canonical Run without Diagnostic Wrappers)**:
   - Both real screen captures succeeded (1st share: 8881ms; 2nd share: 15752ms).
   - Joins completed in 4270ms, 3791ms, 4278ms.
   - Viewer tabs: expected 2 tabs, actual 0 after unchanged 5000ms deadline.
   - Browser WebSockets closed abruptly at 06:08:53Z and 06:09:07Z, triggering reconnect attempts returning HTTP 502/503.
   - Native LiveKit logs recorded timeouts and three `could-not-restart-participant` errors.
   - Absence of logged 57014 errors in Native35 is an artifact of the absence of diagnostic interceptors, not proof of query health.
   - Full post-run cleanup passed (all 5 owned cleanup flags `true`, inspector healthy, temp runtime cleared).

### 1.2 Source-Derived Inferences
1. **WebSocket Termination Trigger**:
   - In `signaling-gateway.ts`, if any database query in `lockedLease`, `scheduleDrain`, or `live` throws an error that is not an `AdmissionDenied(403)` (such as PG error `57014`), the catch block ungracefully executes `closeBinding(binding)`.
   - `closeBinding` immediately executes `binding.peer.terminate()` and `binding.upstream.terminate()`.
   - This abruptly terminates the browser's signaling connection and the SFU's peer connection, matching the exact disconnect timestamps (06:08:53Z and 06:09:07Z) and subsequent 502/503 responses observed in Native35.
2. **Head-of-Line PostgreSQL Lock Queuing**:
   - In PostgreSQL, when transaction B requests `FOR UPDATE` on a row currently held `FOR SHARE` by transaction A, transaction B waits.
   - Crucially, any subsequent transaction C requesting `FOR SHARE` on the same row *queues behind transaction B* on the tuple lock to prevent exclusive lock starvation.
   - When `call-lifecycle.service.ts` sweeps every 1000ms and requests `SELECT id FROM rooms WHERE id=$1 FOR UPDATE`, it gets queued behind gateway `FOR SHARE` transactions.
   - Once `call-lifecycle` is queued, all subsequent gateway frame processing batches and periodic `live()` checks requesting `FOR SHARE` are blocked behind `call-lifecycle`.
   - Because the gateway pool has `statement_timeout: 3000ms`, any query waiting more than 3 seconds is aborted with `57014`, tearing down the connection.

---

## 2. Exact Root Cause Candidates & Source Locations

### 2.1 Candidate 1: Query Amplification & Lock Duration in `signaling-gateway.ts`
- **Location**: [`apps/api/src/modules/calls/signaling-gateway.ts`](file:///E:/FGweb/code/apps/api/src/modules/calls/signaling-gateway.ts#L138-L163) (lines 138–163, 357–392)
- **Mechanism**:
  1. **Redundant `liveLease` in `lockedLease`**:
     - Line 147: `const initial = await liveLease(db, id);` (heavy 6-table join + 2 subqueries).
     - Lines 150–151: Locks `rooms` and `call_groups` `FOR SHARE`.
     - Line 152: `const current = await liveLease(db, id);` (runs the exact same query a second time).
  2. **Per-Frame Query Multiplication in `processBatch`**:
     - Lines 360–391: Inside `lockedLease` holding `FOR SHARE` on `rooms` and `call_groups`:
       - For frame 0: executes `await liveLease(db, binding.lease.id)` (a third time for the same lease!).
       - For each frame in `batch` (up to 8 frames): executes `liveLease` AND `publicationPermission` (`call_restrictions` + `call_publish_slots`).
       - For an 8-frame batch, this generates up to **18 SQL round-trips** on a single pool client while holding `FOR SHARE` locks open.
  3. **Synchronous REST Native Calls inside Open Transaction**:
     - Line 375: `await native.updateParticipant(current.room_name, current.id, { permission });`
     - Line 337: `const peer = await native.getParticipant(lease.room_name, lease.id);`
     - While HTTP calls to the SFU occur, the PostgreSQL client remains in `idleInTransaction` or active transaction holding locks on `rooms` and `call_groups`.
  4. **Timeout Expiry**:
     - Line 45: `statement_timeout: 3000`. When lock queues or batch execution exceed 3000ms, Postgres emits `57014`, triggering `closeBinding` and destroying the call.

### 2.2 Candidate 2: N+1 Sequential Queries Holding Open Transactions in `rooms.service.ts`
- **Location**: [`apps/api/src/modules/rooms/rooms.service.ts`](file:///E:/FGweb/code/apps/api/src/modules/rooms/rooms.service.ts#L218-L286) (lines 218–286)
- **Mechanism**:
  1. In `listOwnRooms`, a transaction is opened (`BEGIN`).
  2. The initial query joins `room_members` and `rooms` with `WHERE rm.user_id = $1` and `FOR SHARE OF rm`.
  3. Lines 242–270: Executes `Promise.all` calling `profilesService.getPublicProfile(row.owner_id)` for each room, holding the transaction in `idleInTransaction` while performing external profile queries.
  4. Lines 275–283: Loops through `rawItems` and runs sequential queries:
     `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 FOR SHARE`
     for each room individually, multiplying round-trips and extending lock hold times across rooms that are concurrently touched by call operations.

### 2.3 Candidate 3: Uncoordinated Concurrency between 1-Second Sweep and Webhook in `call-lifecycle.service.ts`
- **Location**: [`apps/api/src/modules/calls/call-lifecycle.service.ts`](file:///E:/FGweb/code/apps/api/src/modules/calls/call-lifecycle.service.ts#L25) (lines 25, 59–73, 74–104)
- **Mechanism**:
  1. Line 25: `this.timer = setInterval(..., 1000)` executes `this.sweep()`.
  2. Line 72: Incoming LiveKit webhooks (`receive()`) asynchronously invoke `this.reconcileGroup(id)` on the same group.
  3. Both paths concurrently execute `lock(db, id)`:
     `SELECT id FROM rooms WHERE id=$1 FOR UPDATE`
     `SELECT id, room_id, state FROM call_groups WHERE id=$1 FOR UPDATE`
  4. Inside the `FOR UPDATE` transaction, both paths invoke synchronous Twirp HTTP calls (`native.listRooms`, `native.listParticipants`) and per-member `liveLease` loops.
  5. The concurrent `FOR UPDATE` requests from the 1s timer and webhook create overlapping lock waits that block gateway `FOR SHARE` reads.

---

## 3. Rejected Alternatives

1. **Arbitrary Timeout Extensions**:
   - *Proposal*: Raising gateway `statement_timeout` (e.g., from 3s to 30s) or lengthening the 45s test deadline.
   - *Rejection Reason*: Violates frozen test contract. Hides lock contention instead of resolving the underlying lock duration. Under sustained load, longer timeouts only cause deeper request queuing and worse latency.
2. **Snapshot Caching / Skipping Fresh Checks**:
   - *Proposal*: Caching `liveLease` or `publicationPermission` results across frames or polling intervals.
   - *Rejection Reason*: Violates the core security invariant. Every frame must verify fresh server authority, current revocation status, session expiry, and publish slot quota against PostgreSQL.
3. **Suppressing Client Polling**:
   - *Proposal*: Reducing frontend `listCalls` or `listParticipants` polling frequency.
   - *Rejection Reason*: Violates frontend design and acceptance invariants. Does not fix backend lock serialization.
4. **Moving Native Authority Outside Transaction Arbitrarily**:
   - *Proposal*: Moving `native.updateParticipant` or `native.getParticipant` outside the transaction without proof.
   - *Rejection Reason*: Explicitly forbidden by prompt guidelines. Any movement of native authority requires separate proposal and formal proof that atomicity between DB quota and SFU permissions cannot diverge.

---

## 4. Proposed Minimal Refactor Strategy

### 4.1 Minimal Fresh Query Combining in `lease-store.ts` & `signaling-gateway.ts`
1. **Combine Lease Verification with Publication Policy**:
   - Project `mic_blocked`, `screen_blocked`, and `reserved` (publish slot) directly within a single combined query: `liveLeaseWithPolicy(db, id)`.
   - Returns both the validated `LiveLease` and the exact `publicationPermission` flags in **1 query** instead of 2 queries per frame.
   - Retains 100% of policy checks (`call_restrictions`, `call_publish_slots`), clock guards (`clock_timestamp()`), and ordering semantics.
2. **Eliminate Redundant Query Overlap in `lockedLease`**:
   - In `lockedLease`, retrieve `initial`, acquire `FOR SHARE` on `rooms` and `call_groups`, and verify `current`.
   - Pass `current` directly to `processBatch` frame 0 rather than immediately re-querying `liveLease` before the first frame.
   - For an 8-frame batch, reduces database queries from **18 queries down to 8 queries** (a 55% reduction in transaction hold time).

### 4.2 Eliminate N+1 Redundant Member Checks in `rooms.service.ts`
- In `listOwnRooms`, the initial query already joins `room_members rm` with `WHERE rm.user_id = $1` and locks `FOR SHARE OF rm`.
- Remove the redundant post-fetch loop executing `SELECT 1 FROM room_members ... FOR SHARE` for each item.
- Move `profilesService.getPublicProfile` fetching outside the database transaction so the client does not remain `idleInTransaction`.

### 4.3 Webhook and Sweep In-Flight Reconciliation Deduplication in `call-lifecycle.service.ts`
- Maintain a narrow in-flight Map `reconcilingGroups: Map<string, Promise<void>>`.
- If a group is currently undergoing reconciliation by `sweep()` or a webhook, coalesce concurrent calls to the same Promise rather than acquiring overlapping `FOR UPDATE` transactions on PostgreSQL.
- Preserves full scheduler authority without skipping required reconciliations.

---

## 5. Minimal Numeric Timing Instrumentation (For Canonical Gateway Verification)

To verify the exact root cause in canonical execution without a heavy diagnostic wrapper inventory, implement a lightweight numeric diagnostic probe:

- **Metrics Collected (Numeric Milliseconds Only)**:
  1. `t_lock_ms`: Duration to acquire `FOR SHARE` on `rooms` and `call_groups`.
  2. `t_batch_ms`: Duration of the entire `processBatch` transaction execution.
  3. `t_native_ms`: Cumulative time spent in native SFU HTTP calls.
  4. `err_code`: Sanitized SQLSTATE string (e.g. `'57014'`) if an error occurs.
- **Privacy & Safety**:
  - No SQL statements, table names, parameters, user IDs, or URLs are logged.
  - Emitted only on error or via bounded summary counters.

---

## 6. Targeted RED Test Plan

### Test Objective
Verify that `processBatch` maintains complete fresh authorization, revocation detection, and slot quota enforcement under real PostgreSQL rollback conditions, while verifying the reduction in per-frame query count and elimination of lock contention.

### Test Cases
1. **Per-Frame Combined Fresh Query Assertion**:
   - Assert that each frame evaluates fresh admission, session expiration, and publish quota in exactly 1 combined query.
2. **Mid-Batch Revocation Rollback**:
   - Inject admission revocation midway through a 4-frame batch. Verify that the batch immediately throws `AdmissionDenied(403)` and rolls back cleanly without orphan state.
3. **Mid-Batch Screen Quota Depletion Rollback**:
   - Delete `call_publish_slots` while an `addTrack` frame is in flight. Verify rejection with `NOT_ALLOWED` / `LIMIT_EXCEEDED` and that native tracks are not permitted.
4. **Lock Contention Under 1s Lifecycle Sweep**:
   - Run concurrent `call-lifecycle.sweep()` and gateway `processBatch` under real PostgreSQL. Verify zero `57014` errors and that total transaction hold duration stays well below the 3000ms threshold.
