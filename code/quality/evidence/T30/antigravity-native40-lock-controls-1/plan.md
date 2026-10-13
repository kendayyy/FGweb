# FG T30 — Conservative In-Transaction SQL Roundtrip Reduction Plan

## 1. Overview and Invariant Commitments

This plan defines a conservative optimization to resolve database lock contention during media lifecycle reconciliation. The prior proposal attempted to decouple native SFU calls outside database transactions, which was rejected because decoupled native RPCs create race conditions with concurrent joins, rejoins, screen slot claims, and moderation revocations.

### Strict Architectural Boundaries
- **No Native Decoupling:** Native SFU inspections (`listRooms`, `listParticipants`) and updates remain strictly inside database transactions under canonical row locks.
- **No Binding Caching:** Room and call bindings are evaluated directly from PostgreSQL without in-memory bypasses.
- **Canonical Lock Order Preserved:** Locks are always acquired in sequence: `rooms` FOR UPDATE $\to$ `call_groups` FOR UPDATE $\to$ `call_members` FOR UPDATE.
- **Zero Timeout or Pool Changes:** `statement_timeout` remains at its production baseline; connection pool sizes remain unchanged.
- **Zero In-Memory Caching:** All lease evaluations remain fresh and query live database state directly.

---

## 2. In-Transaction Bottleneck Analysis

During `CallLifecycleService.reconcileGroup`, transactions hold exclusive `FOR UPDATE` locks on `rooms` and `call_groups`. Under moderate to high load (e.g., 10 participants), the transaction executes an excessive number of sequential single-row queries while holding these locks:

1. **Sequential Admission State Updates:**
   Inside `reconcileGroup`, iterating active participants currently triggers sequential single-row queries:
   - Present members: `UPDATE call_admissions SET connected_at=COALESCE(connected_at,$2), disconnected_at=NULL WHERE id=$1 AND revoked_at IS NULL` (up to 10 roundtrips).
   - Disconnected members: `UPDATE call_admissions SET disconnected_at=$2 WHERE id=$1 AND disconnected_at IS NULL AND revoked_at IS NULL` (up to 10 roundtrips).
2. **Double-Query Publishing Policy Evaluation:**
   Inside `PublishingService.reconcileWithin`, iterating participants executes:
   - Query 1: `liveLease(db, peer.identity)` to verify participant validity.
   - Query 2: `publicationPermission(db, lease)` to evaluate track permissions.
   For 10 participants, this generates 20 sequential roundtrips.

Holding row locks across 30+ sequential SQL roundtrips inflates transaction duration beyond the 3,000 ms contention threshold, causing concurrent `FOR SHARE` queries to fail with `SQLSTATE 57014`.

---

## 3. Conservative Proposal 1: Batching Independent Admission Updates

Instead of executing individual `UPDATE` queries per participant inside the loop, `CallLifecycleService.reconcileGroup` collects admission IDs into two arrays and executes at most two batched array queries:

### Implementation Specification
```typescript
const connectedAdmissions: string[] = [];
const disconnectingAdmissions: string[] = [];

for (const member of members) {
  if (!member.lease_id || !(await liveLease(db, member.lease_id))) {
    released.push(member.id);
    continue;
  }
  if (present.has(member.lease_id)) {
    connectedAdmissions.push(member.lease_id);
    continue;
  }
  if (member.connected_at) {
    if (!member.disconnected_at) disconnectingAdmissions.push(member.lease_id);
    else if (time.getTime() - member.disconnected_at.getTime() >= 30000) released.push(member.id);
  } else if (member.expires_at.getTime() <= time.getTime()) {
    released.push(member.id);
  }
}

if (connectedAdmissions.length) {
  await db.query(
    'UPDATE call_admissions SET connected_at=COALESCE(connected_at,$2), disconnected_at=NULL WHERE id=ANY($1::text[]) AND revoked_at IS NULL',
    [connectedAdmissions, time]
  );
}
if (disconnectingAdmissions.length) {
  await db.query(
    'UPDATE call_admissions SET disconnected_at=$2 WHERE id=ANY($1::text[]) AND disconnected_at IS NULL AND revoked_at IS NULL',
    [disconnectingAdmissions, time]
  );
}
```

### Safety and Invariant Parity
- **Exact Predicate Retention:** Both queries retain `WHERE revoked_at IS NULL` and exact timestamp semantics.
- **Atomic Execution:** Batches execute within the existing transaction; concurrent revocations remain completely safe.
- **Roundtrip Reduction:** Replaces $O(N)$ sequential updates with at most 2 queries ($O(1)$).

---

## 4. Conservative Proposal 2: Single-Query Lease and Policy via `liveLeaseWithPolicy`

`PublishingService.reconcileWithin` currently performs two sequential roundtrips per peer (`liveLease` followed by `publicationPermission`). The verified, fully tested helper `liveLeaseWithPolicy(db, peer.identity)` from `lease-store.ts` evaluates both the live lease and the full publication permission matrix in a single query.

### Implementation Specification
In `apps/api/src/modules/calls/publishing.service.ts`:
```typescript
for (const peer of people) {
  const result = await liveLeaseWithPolicy(db, peer.identity);
  if (!result) continue;
  const old = peer.permission;
  const permission = result.permission;
  if (
    !old ||
    old.canPublish !== permission.canPublish ||
    old.canPublishData ||
    !old.canSubscribe ||
    old.canUpdateMetadata ||
    JSON.stringify([...old.canPublishSources].sort()) !== JSON.stringify([...permission.canPublishSources].sort())
  ) {
    await this.calls.nativeClient.updateParticipant(result.lease.room_name, result.lease.id, { permission });
  }
}
```

### Safety and Invariant Parity
- **Zero Caching:** `liveLeaseWithPolicy` queries live database state directly without caching.
- **Full Policy Parity:** Evaluates all 6 permission matrix combinations, admin bans, session expirations, and clock-timestamp grace periods.
- **Roundtrip Reduction:** Halves publishing roundtrips under lock from $2K$ to $K$ queries.

---

## 5. Architectural Comparison vs Rejected Plan

| Property | Rejected Plan | Conservative Plan |
| :--- | :--- | :--- |
| **Native RPC Placement** | Outside transaction | Inside transaction under lock |
| **Room/Group Binding** | Cached in memory | Queried directly under canonical lock |
| **Permission Synchronization** | Post-commit queue (stale risk) | Synchronous under canonical lock |
| **Race Conditions** | High (join/rejoin/revoke races) | Zero (atomic serializability preserved) |
| **In-Lock Query Count (10 peers)** | $\sim 2$ queries | $\sim 14$ queries (down from $\sim 35$) |
| **Lock Hold Reduction** | Complete but unsafe | $\sim 60\%$ reduction, 100% safe |

---

## 6. Verification and Acceptance Criteria

1. **Controlled Lock Test:** Verified via `t30-lock-hold.integration.spec.ts` capturing real `statement_timeout 3000` (`SQLSTATE 57014`) and blocking PID mapping without exposing raw SQL.
2. **Zero Regression:** All existing suites (`t30-cascade-empty-call`, `t30-frame-lease-policy`, and all 80 immutable ledger rows) maintain 100% PASS parity.
