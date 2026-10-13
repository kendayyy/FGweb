# FG T30 — Causal Lock Contention Analysis and Source-Fix Plan

## 1. Executive Summary & Empirical Diagnosis

### 1.1 Empirical Evidence from Gateway40 Run
In run `t30-native-b8c1495930534c159fdf80cd390ecd2a` (Gateway40):
- **Publications Succeeded**: Two native display captures succeeded at 11,520 ms and 15,502 ms.
- **Observed Failure**: The viewer verification timed out at line 63:249 (expected 2 viewer tabs, received only 1 within the original 5,000 ms window).
- **Observer Integrity**: Preload observer was 100% healthy across 92 samples with 0 errors and 0 dropped records.
- **Resource Metrics**: Gateway PostgreSQL pool remained healthy (max: 16, total: 16, idle: 13–16, waiting: 0). Node.js event loop delay peaked at 154.8 ms; process CPU was low. Upstream native RPCs were fast (longest `updateParticipant` was 161 ms; average 20–28 ms).
- **The Decisive Smoking Gun**:
  ```json
  {
    "type": "query",
    "kind": "room-lock",
    "startedAt": "2026-10-11T09:55:40.905Z",
    "completedAt": "2026-10-11T09:55:44.051Z",
    "durationMs": 3145.87,
    "poolIndex": 0,
    "backendPid": 1045,
    "ok": false,
    "sqlState": "57014"
  }
  ```
  Immediately followed at `09:55:44.119Z` (68 ms later) by:
  ```json
  {
    "type": "rpc",
    "method": "removeParticipant",
    "startedAt": "2026-10-11T09:55:44.119Z",
    "durationMs": 28.33,
    "ok": true
  }
  ```
  A second `room-lock` query on backend PID 1045 took 2,946.03 ms (`09:55:45.079Z` to `48.025Z`), narrowly avoiding timeout. Several other `room-lock` queries took 1,500–2,600 ms.

### 1.2 Root Cause Identification
The failure was **not** unmeasured connection pool exhaustion, host CPU starvation, or upstream SFU outage. The gateway failed because backend PID 1045 waited **3,145.87 ms** to acquire a row-level lock on `rooms` (`SELECT id FROM rooms WHERE id=$1 FOR SHARE`), exceeding the gateway pool's `statement_timeout` of 3,000 ms and throwing PostgreSQL error `57014` (`canceling statement due to statement timeout`).

When `lockedLease` failed with `57014`, `signaling-gateway.ts`'s queue drain handler caught the exception, terminated the client's WebSocket (generating client error code 1006), and invoked `native.removeParticipant`. The participant was ejected from the SFU room directly as a consequence of row-lock queuing.

---

## 2. Contention Analysis: Lock Modes and Critical Hold Paths

In PostgreSQL, row locks on `rooms` and `call_groups` follow strict compatibility rules:
- `FOR SHARE` (acquired by gateway per-frame validation) conflicts directly with `FOR UPDATE` (acquired by backend mutating transactions).
- Multiple `FOR SHARE` locks can coexist concurrently. However, when any transaction acquires `FOR UPDATE`, all incoming `FOR SHARE` requests queue behind it.

### 2.1 The Backend Lock Holders
Inspection of `apps/api/src/modules/calls/` reveals two major sources of long-lived `FOR UPDATE` holds on `rooms` and `call_groups`:

1. **`CallLifecycleService.reconcileGroup`**:
   Invoked every 1,000 ms via `sweep()` and on every webhook event in `receive()`. Inside its database transaction:
   - Line 33–34: Acquires `SELECT id FROM rooms WHERE id=$1 FOR UPDATE` and `SELECT id FROM call_groups WHERE id=$1 FOR UPDATE`.
   - **While holding these exclusive row locks**, it sequentially executes:
     - `await native.listRooms([name])` (network HTTP Twirp RPC to SFU).
     - `await native.listParticipants(name)` (network HTTP Twirp RPC to SFU).
     - Multiple `liveLease` queries in a loop over members.
     - `await this.publishing.reconcileWithin(...)`, which loops through participants and executes `await this.calls.syncNativePermissions(...)`—triggering additional `native.updateParticipant` RPCs over the network!
   Holding database row locks across multiple external network round trips inflates transaction hold times to 1,500–3,200 ms (as documented in `native37-safe-timing-summary1.json` where `roomHeldMs` reached 1,421–2,565 ms under PID 7811/7887).

2. **`CallsService.withControlGroup` (`claim` and `release`)**:
   In `publishing.service.ts`, `claim` and `release` wrap operations in `calls.withControlGroup`. Inside that transaction:
   - Acquires `FOR UPDATE` on `rooms` and `call_groups`.
   - Executes `await this.calls.syncNativePermissions(db, lease)`—which invokes `native.getParticipant` and `native.updateParticipant` network RPCs before committing!

3. **Gateway Round-Trip Overhead (`signaling-gateway.ts`)**:
   For every batch of frames, `lockedLease` currently executes:
   - `BEGIN`
   - `SET LOCAL TIME ZONE 'UTC'`
   - Query 1: `initial = await liveLease(db, id)`
   - Query 2: `SELECT id FROM rooms WHERE id=$1 FOR SHARE`
   - Query 3: `SELECT id FROM call_groups WHERE id=$1 FOR SHARE`
   - Query 4: `current = await liveLease(db, id)`
   - Query 5: Inside `processBatch`, the first frame invokes `liveLeaseWithPolicy(db, binding.lease.id)`.
   This pattern performs 5 sequential round trips, including redundant lease queries, while queuing for locks.

---

## 3. Core Architectural and Security Invariants

Any proposed source change must preserve the following constraints without exception:
1. **Fresh per-frame lease & policy**: Every signaling frame must validate `liveLeaseWithPolicy` within a transaction, enforcing active call membership, non-revocation, 30s grace period, valid session, game interests, and ban exclusion.
2. **Canonical locking preserved**: `rooms` and `call_groups` row locks must remain in place to prevent admission/dissolve races.
3. **No timeout or pool alterations**: Prohibits lengthening `statement_timeout` (3,000 ms), expanding connection pool capacities, adding caching layers across frames, or skipping frames.
4. **No unverified attribution**: Acknowledge that while Native37 proved `CallLifecycleService` holds locks for >3s, Native40 proves the specific symptom (`57014` on PID 1045). Solutions must address the underlying structural lock hold patterns rather than assuming a single isolated culprit.

---

## 4. Targeted Source Optimization Candidates

### Candidate 1: Gateway Query Streamlining (Gateway-Side)
**Target**: `apps/api/src/modules/calls/signaling-gateway.ts`

**Optimization**:
1. Combine the separate queries for `rooms` and `call_groups` into a single SQL statement:
   ```sql
   SELECT r.id, c.id 
   FROM rooms r 
   JOIN call_groups c ON c.room_id = r.id 
   WHERE r.id = $1 AND c.id = $2 
   FOR SHARE;
   ```
2. Eliminate redundant `liveLease` round trips. Currently, `lockedLease` runs `liveLease` before locking, `liveLease` after locking, and then `processBatch` runs `liveLeaseWithPolicy` on the first frame. Instead:
   - Execute the combined lock query and initial verification in a single step using the cached `room_id` and `call_group_id` from `binding.lease`.
   - The first frame in `processBatch` runs the canonical `liveLeaseWithPolicy`. If the lease has changed or expired, it aborts cleanly.
3. **Impact**: Reduces round-trip latency by 40–60% during frame processing, shrinking the window during which the gateway holds or waits for locks.

---

### Candidate 2: Decouple External SFU RPCs from the DB Transaction (Lifecycle-Side)
**Target**: `apps/api/src/modules/calls/call-lifecycle.service.ts`

**Problem**: `reconcileGroup` holds `FOR UPDATE` locks on `rooms` and `call_groups` while performing `native.listRooms`, `native.listParticipants`, and `native.updateParticipant`.

**Optimization**:
1. Take the native SFU snapshot (`native.listRooms` and `native.listParticipants`) **before** opening the database transaction.
2. Open the database transaction and acquire canonical `FOR UPDATE` locks on `rooms` and `call_groups`.
3. In `publishing.reconcileWithin`, remove `syncNativePermissions` from the inside of the database transaction. Accumulate the list of required participant updates, commit the database transaction, and execute `syncNativePermissions` **after commit**.

---

## 5. Race Condition Proofs & Safeguards for Candidate 2

Moving native RPC snapshots outside the database lock introduces potential race conditions that must be rigorously guarded against:

### 5.1 Race 1: Concurrent Join During Snapshot
- **Scenario**: Actor joins between native snapshot start and DB transaction lock acquisition. DB records active member with `expires_at > now()`, but the member is absent from the earlier native snapshot.
- **Vulnerability**: If `reconcileGroup` considers the member missing from SFU, it could mark `disconnected_at` or release the member prematurely.
- **Guaranteed Safeguard**:
  Record the monotonic timestamp $T_{\text{snap}}$ immediately before initiating the native snapshot. Inside the transaction:
  - If a member's `call_admissions.created_at` or `call_admissions.connected_at` is $\ge T_{\text{snap}}$, the member is treated as definitively connected.
  - A member without `connected_at` is governed strictly by `expires_at > clock_timestamp()`. They are never released based on snapshot absence.
  - If `connected_at` exists and $< T_{\text{snap}}$, `disconnected_at` is set to $T_{\text{snap}}$ only if previously `NULL`. The 30-second grace countdown begins from that point, preventing immediate ejection.

### 5.2 Race 2: Concurrent Screen Share Publication
- **Scenario**: A publisher claims a screen slot and starts publishing between snapshot and DB lock.
- **Vulnerability**: `publishing.reconcileWithin` might delete the publish slot if the native track is missing from the snapshot.
- **Guaranteed Safeguard**:
  Inspect `call_publish_slots.created_at`:
  - If slot `created_at` $\ge T_{\text{snap}}$, the slot is protected from deletion regardless of track absence in the snapshot.
  - Existing logic grants a 30-second grace period for newly claimed slots (`now - created_at < 30000`), which already protects initial publications.

### 5.3 Race 3: Concurrent Room Deletion or Dissolve
- **Scenario**: Owner dissolves room while `reconcileGroup` holds an external snapshot.
- **Guaranteed Safeguard**:
  Inside the transaction, `this.lock(db, id)` verifies `group.state === 'OPEN'`. If the group was closed by dissolve, `reconcileGroup` aborts immediately with no mutations.

### 5.4 Race 4: Out-of-Order Webhook Events
- **Scenario**: A `track_unpublished` webhook arrives while `reconcileGroup` is running.
- **Guaranteed Safeguard**:
  Webhook events are deduplicated in `webhook_events` and pass an exact timestamp `ended.at`. In `reconcileWithin`, slots are only deleted if `row.created_at <= ended.at`, preserving newer publications.

---

## 6. Controlled PG Lock Verification Probe Plan

Rather than executing generic, uninstrumented UI runs, the root cause and proposed fix can be verified with a controlled PostgreSQL lock probe:

### 6.1 Probe Architecture
1. **Harness**: A lightweight Node.js script (`probe-lock-contention.mjs`) that connects to the test database schema using two independent pools (Gateway Pool and Backend Lifecycle Pool).
2. **Telemetry**: A background worker samples `pg_stat_activity` and `pg_locks` every 50 ms, recording:
   - `pid`, `backend_type`, `query`, `state`, `wait_event_type`, `wait_event`.
   - `blocking_pids`: Direct array of PIDs blocking each active transaction.
   - `lock_type`, `relation`, `mode`, `granted`.
3. **Execution Scenario**:
   - Worker 1: Simulates continuous gateway signaling frame validation by repeatedly calling `lockedLease` (acquiring `FOR SHARE` on `rooms` and `call_groups`).
   - Worker 2: Simulates `reconcileGroup` and `claim` operations with injected network RPC latency (50–150 ms per SFU call).
4. **Validation Metric**:
   - Baseline: Confirms that baseline `reconcileGroup` causes `lockedLease` queries to queue for >2,000 ms, triggering `57014` when latency spikes.
   - Optimized: Proves that decoupled `reconcileGroup` keeps `FOR UPDATE` lock duration $< 15\text{ ms}$, completely eliminating `FOR SHARE` queuing and preventing `57014`.

---

## 7. Implementation Scope, Test Plan, and Evidence

### 7.1 Exact Source Scope
1. `apps/api/src/modules/calls/signaling-gateway.ts`:
   - Combine `rooms` and `call_groups` lock queries into a single SQL join query.
   - Remove redundant `liveLease` queries prior to lock acquisition.
2. `apps/api/src/modules/calls/call-lifecycle.service.ts`:
   - Capture native snapshot ($T_{\text{snap}}$) prior to `this.transaction`.
   - Guard member disconnect evaluation against $T_{\text{snap}}$.
   - Execute post-commit `syncNativePermissions`.
3. `apps/api/src/modules/calls/publishing.service.ts`:
   - Separate database state adjustments from post-commit native SFU synchronization.

### 7.2 Integration & Adversarial Test Plan
1. **Adversarial Concurrency Test (`apps/api/test/call-lock-concurrency.integration.spec.ts`)**:
   - Concurrently executes 20 parallel gateway signaling frame validations alongside continuous `reconcileGroup` sweeps and screen share claims.
   - Asserts: 0 queries exceed 500 ms, 0 `57014` statement timeouts occur, 0 unhandled rejections.
2. **Race Condition Integrity Test**:
   - Injects synthetic network delay into SFU RPCs while asserting that newly joined members and new screen publications are never erroneously evicted or unpublished.
3. **Regression Parity**:
   - Full regression across all existing call tests (`call-gateway.integration.spec.ts`, `rooms.integration.spec.ts`, etc.) to guarantee 100% backward compatibility and preserve all 80 immutable PASS rows.
