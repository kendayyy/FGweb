# FG T30 — Diagnostic & Optimization Plan: Eliminating Unconditional No-Op Writes in `CallLifecycleService.reconcileGroup`

## 1. Context & Problem Formulation

During native automation runs (e.g. Native44 and Native45):
- Native44 failed after 3 captures when the slot-count assertion expected 3 but received 2 within 5 seconds.
- Native45 failed with a 45-second timeout on the second share stop button following WebRTC connection errors (signal closed 1006).
- Host metrics showed severe CPU saturation (90–92% mean busy) and low free memory (200–340MB minimum).
- Telemetry confirmed scoped PostgreSQL lock chains (`Lock:transactionid`, `Lock:tuple`) and I/O waits (`LWLock:WALWrite`).

### Source Finding: Unconditional Sweep UPDATEs
In [`CallLifecycleService.reconcileGroup`](file:///E:/FGweb/code/apps/api/src/modules/calls/call-lifecycle.service.ts#L87-L89):
```typescript
if(present.has(member.lease_id)){
  await db.query('UPDATE call_admissions SET connected_at=COALESCE(connected_at,$2),disconnected_at=NULL WHERE id=$1 AND revoked_at IS NULL',[member.lease_id,time]);
  continue;
}
```
During every reconciliation sweep (executed every tick and upon every webhook event), every participant currently in `present` unconditionally triggers this `UPDATE` query.

Even when the participant is already connected and `disconnected_at` is already `NULL`:
- The logical values being written are identical to existing values (`COALESCE(connected_at, $2)` evaluates to the current `connected_at`, and `disconnected_at` is already `NULL`).
- In PostgreSQL, executing an `UPDATE` without a predicate filtering unchanged rows forces the database engine to:
  1. Allocate a brand-new physical row version (tuple), updating `ctid` and `xmin`.
  2. Write an update record to the Write-Ahead Log (WAL), contributing to `LWLock:WALWrite` contention.
  3. Acquire exclusive row-level locks on `call_admissions`.
  4. Cause table and index bloat requiring aggressive vacuuming.

---

## 2. Proposed Minimal Candidate: Surgical SQL Predicate

### The Change
Add a single predicate to the `WHERE` clause:
```sql
AND (connected_at IS NULL OR disconnected_at IS NOT NULL)
```

Full updated query:
```sql
UPDATE call_admissions
SET connected_at = COALESCE(connected_at, $2), disconnected_at = NULL
WHERE id = $1
  AND revoked_at IS NULL
  AND (connected_at IS NULL OR disconnected_at IS NOT NULL)
```

### State Matrix & Transition Verification
| Participant State | `connected_at` | `disconnected_at` | Predicate Evaluation | Action Taken | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **First Presence** | `NULL` | `NULL` | `TRUE` (`connected_at IS NULL`) | Updates row, sets `connected_at = time`, `disconnected_at = NULL` | `rowCount = 1` |
| **Connected Sweep** | Non-null | `NULL` | `FALSE` | **No-op bypassed! Zero tuple written, zero WAL generated** | `rowCount = 0` |
| **Disconnected** | Non-null | Non-null | — | Handled by disconnect branch (`disconnected_at = time`) | `rowCount = 1` |
| **Reconnection** | Non-null | Non-null | `TRUE` (`disconnected_at IS NOT NULL`) | Updates row, clears `disconnected_at = NULL`, preserves original `connected_at` via `COALESCE` | `rowCount = 1` |
| **Revoked** | Any | Any | `FALSE` (`revoked_at IS NULL` fails) | Update rejected, lease invalidated, member released | `rowCount = 0` |
| **Grace Expired** | Non-null | >30s ago | — | Handled by release branch, member removed from call | Member released |

---

## 3. Rationale: In-Database Predicate vs. In-Memory Flag

1. **Atomic Evaluation**:
   Evaluating `AND (connected_at IS NULL OR disconnected_at IS NOT NULL)` in PostgreSQL at `UPDATE` execution time guarantees that concurrent status changes (such as an incoming disconnect or leave) are evaluated against current row state.
2. **Zero Memory Caching**:
   Does not introduce stateful maps or in-memory caches in JavaScript, eliminating cache invalidation bugs across multi-instance or cluster setups.
3. **No Affected Count Consumers**:
   Static analysis confirms that the return value of `await db.query(...)` in line 88 is discarded (`continue;`). No downstream logic relies on `rowCount` being 1 for already-connected members.

---

## 4. Test & Verification Plan

### Automated Proof Control
Implemented in [`t30-lifecycle-noop-write.spec.ts`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-lifecycle-noop-write-1/t30-lifecycle-noop-write.spec.ts) and executed via [`run-noop-write-control.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-lifecycle-noop-write-1/run-noop-write-control.mjs):
1. **Initial Connect**: Validates `rowCount === 1` and `connected_at` initialized. Records `ctid_1` and `xmin_1`.
2. **Baseline RED**: Executes original query on already-connected row. Demonstrates `rowCount === 1`, `ctid` mutated, and `xmin` incremented (defect confirmed).
3. **Proposed GREEN**: Executes query with surgical predicate on already-connected row. Demonstrates `rowCount === 0`, `ctid` preserved, and `xmin` preserved (zero physical tuple churn).
4. **Reconnect Parity**: Verifies that reconnecting after disconnect executes 1 write, sets `disconnected_at = NULL`, and preserves the original `connected_at` timestamp.
5. **Revocation & Grace Period**: Verifies that revoked admissions match 0 rows and expire cleanly.

---

## 5. Honest Boundaries & Non-Goals

1. **No Performance Claims Without Live Test**:
   While this change eliminates unnecessary row-version allocations and WAL writes during sweeps, we make no unproven claims regarding overall end-to-end latency reduction or native test pass rate.
2. **Slot Count Failure Independence**:
   This optimization addresses database write churn. It does not by itself fix the third publisher slot count mismatch (expected 3, received 2) or the second share stop-button timeout (45s) observed in Native44/45.
3. **Host Resource Constraints**:
   The host machine's high CPU utilization (90–92%) and memory pressure (200–340MB free) remain physical environmental constraints.
4. **Future Scope**:
   Separate diagnostic observation of the `call_publish_slots` reservation and release lifecycle is recommended to determine why the third publisher slot was not recognized within 5 seconds.
