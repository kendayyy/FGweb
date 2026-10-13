# T30 CallLifecycleService No-Op Write Elimination Plan (Correction 1)

## 1. Executive Summary & Root Cause Analysis

During active calls, `CallLifecycleService.reconcileGroup` executes periodically (default 3000ms background sweep and event-driven triggers) to synchronize LiveKit room participants with the database state in `call_admissions` and `call_members`.

In the current baseline (`apps/api/src/modules/calls/call-lifecycle.service.ts`), the admission connection query is formulated as:
```sql
UPDATE call_admissions
SET connected_at = COALESCE(connected_at, now()),
    disconnected_at = NULL
WHERE call_member_id = ANY($1)
  AND revoked_at IS NULL;
```
When participants are actively connected and healthy, their corresponding `call_admissions` rows already satisfy:
- `connected_at IS NOT NULL`
- `disconnected_at IS NULL`

Under PostgreSQL MVCC architecture, an `UPDATE` that re-assigns identical values still:
1. Allocates a new transaction ID (`xmin`).
2. Creates a new tuple version at a new physical tuple identifier (`ctid`).
3. Marks the previous tuple version as dead, creating heap fragmentation.
4. Emits Write-Ahead Log (WAL) records for heap updates and index maintenance.

On every 3-second cycle across all concurrent active call members, this unconditional query causes continuous tuple churn and unnecessary lock contention on `call_admissions`.

---

## 2. Surgical Predicate Patch

The candidate patch adds an exact, single-predicate filter to target only rows that require an actual state mutation:

```diff
--- a/apps/api/src/modules/calls/call-lifecycle.service.ts
+++ b/apps/api/src/modules/calls/call-lifecycle.service.ts
@@ -194,7 +194,8 @@
         `UPDATE call_admissions
          SET connected_at = COALESCE(connected_at, now()),
              disconnected_at = NULL
-         WHERE call_member_id = ANY($1) AND revoked_at IS NULL`,
+         WHERE call_member_id = ANY($1) AND revoked_at IS NULL
+           AND (connected_at IS NULL OR disconnected_at IS NOT NULL)`,
         [presentMemberIds]
       );
```

### Complete State Transition Matrix

| Case | Current `connected_at` | Current `disconnected_at` | Predicate Evaluation | Action Taken | Resulting State |
|---|---|---|---|---|---|
| **1. First Presence** | `NULL` | `NULL` | `connected_at IS NULL` (TRUE) | Executes UPDATE | `connected_at = now()`, `disconnected_at = NULL` |
| **2. Steady Connected** | `Timestamp T1` | `NULL` | Both FALSE | **Zero rows updated (No-Op filtered)** | Tuple untouched; `ctid`/`xmin` stable |
| **3. Reconnect** | `Timestamp T1` | `Timestamp T2` | `disconnected_at IS NOT NULL` (TRUE) | Executes UPDATE | `connected_at = T1` (via COALESCE), `disconnected_at = NULL` |
| **4. Revoked** | Any | Any | `revoked_at IS NULL` (FALSE) | Filtered out | Member released via lifecycle checks |
| **5. Absent** | Any | Any | Not in `presentMemberIds` | Not targeted by update | Handled by disconnect/grace logic |

---

## 3. Caller & Semantic Independence Analysis

1. **Query Execution**: `CallLifecycleService.reconcileGroup` executes this query using `db.query(...)` and discards the return object (`rowCount` is not checked or branched on).
2. **Downstream Contracts**: Higher-level services (`CallsService`, `SignalingGateway`, and frontend DTOs) observe participant presence via room state, active tokens, and `call_members.left_at`.
3. **Behavioral Invariance**:
   - Newly joining users are recorded immediately upon first presence (`connected_at = now()`).
   - Reconnecting users retain their original session start timestamp while clearing their disconnection mark.
   - Active, steady users remain active without generating redundant heap writes.

---

## 4. Addressing Rejection Findings in Correction Suite

The correction suite under `quality/evidence/T30/antigravity-lifecycle-noop-write-correction-1/` resolves all findings from the previous draft:

1. **Service Integration vs. Copied SQL**:
   - `t30-lifecycle-noop-write.integration.spec.ts` imports the actual compiled `CallLifecycleService` and initializes the real NestJS application (`AppModule`).
   - All assertions execute `CallLifecycleService.reconcileGroup(callId)` directly against a real PostgreSQL instance.
2. **Valid Relational Schema**:
   - Reuses the established schema fixture from `lock-hold-tests1/t30-lock-hold.integration.spec.ts`.
   - Populates complete dependency chains: `conversations` (kind `'ROOM'`), `rooms` (with `conversation_id`, `conversation_kind`, `owner_role`), `room_members`, `call_groups`, `call_members`, and `call_admissions`.
3. **Pure JavaScript Runner**:
   - `run-noop-write-control1.mjs` is written in standard ESM JavaScript with zero TypeScript syntax, types, or imports.
   - Spawns Jest via `--experimental-vm-modules` and passes `--config noop-write-jest1.config.cjs`.
   - Real-time stream sanitization redacts database credentials, auth secrets, and JWT tokens.
4. **Verifiable Teardown & Error Proof**:
   - Creates a dedicated schema `t30_noop_corr_${uuid}` per run.
   - In `afterAll`: drops schema CASCADE, verifies schema absence via `pg_namespace`, restores environment variables, restores `RoomServiceClient` prototypes, and closes connection pools.
   - Gathers all cleanup outcomes into `noop-write-cleanup-${schemaUuid}.json` with `{ flag: 'wx' }`.
   - Throws `AggregateError` if any cleanup step encounters an issue (no swallowed errors).
5. **Coverage of 5 Independent Scenarios**:
   - **Fixture 1 (`firstpresence`)**: Validates write count 1 and setting of `connected_at`.
   - **Fixture 2 (`repeatedconnected`)**: Validates expected write count 0 and stable `ctid`/`xmin`. On current unpatched source, this test **fails (RED)** because unpatched source writes 1 row and alters tuple versions.
   - **Fixture 3 (`reconnect`)**: Validates that reconnecting after absence writes 1 row, clears `disconnected_at`, and preserves initial `connected_at`.
   - **Fixture 4 (`expired/revoked`)**: Validates that revoking an admission marks member `left_at` despite active native presence.
   - **Fixture 5 (`absent grace`)**: Validates that an absent member preserves `connected_at`, remains in call during 30s grace, is released at >=30s grace, and unconnected admissions honor `expires_at`.

---

## 5. Explicit Scope Boundaries & Non-Claims

To maintain rigorous diagnostic integrity, the following boundaries are explicitly affirmed:
1. **No Performance or Latency Claims**: Eliminating redundant tuple updates stops MVCC heap amplification, but no claims are made regarding percentage latency reductions (e.g., 60% lock latency reduction) or meeting specific millisecond thresholds.
2. **No Hardware Resource Claims**: Host CPU load (90–92%) and limited memory headroom (200–340MB) are system-level constraints; this proposal does not claim to alter external host resource saturation.
3. **No Claim on Distinct Native Blocker Scenarios**:
   - Does **not** claim to fix the third publisher slot mismatch observed in Native44 (expected 3, received 2).
   - Does **not** claim to fix the 45-second screen share stop timeout observed in Native45.
4. **Diagnostic Integrity**: This proposal is strictly limited to eliminating demonstrable database tuple churn in `CallLifecycleService` without mutating source code until Codex review and adoption.
