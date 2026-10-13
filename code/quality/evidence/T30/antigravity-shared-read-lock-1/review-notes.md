# FG T30 — Runtime Shared Read-Lock Mode Implementation Notes (antigravity-shared-read-lock-1)

## 1. Context & Diagnostic Rationale

In Native11 (`quality/evidence/T30/gateway-timing-summary-3.json`), the named prepared `QueryConfig` optimization successfully decreased `db-query:lease` p50 latency down to 9ms. However, `db-query:lock-room` continued to trigger PostgreSQL statement timeouts (error `57014`) at 3066ms and 3041ms, with p95 latency at 1426ms.

Root Cause:
- Every active participant in a call periodically runs `live(binding)` (every 1000ms) and processes incoming/outgoing signal frames via `processBatch(binding, batch)`.
- Previously, all `lockedLease` calls executed `SELECT id FROM rooms WHERE id=$1 FOR UPDATE` followed by `SELECT id FROM call_groups WHERE id=$1 FOR UPDATE`.
- Because `FOR UPDATE` is an exclusive lock, concurrent readers in the same room were forced to queue serially behind each other. During bursts of signaling or concurrent heartbeat ticks, this artificial lock serialization caused queued transactions to exceed the 3000ms statement timeout.
- In reality, neither `live()` nor `processBatch()` mutates `rooms`, `call_groups`, capacity, or slot policy records; they only inspect admission state, check publication permissions, forward frames, and update in-memory client binding policy keys.

---

## 2. Narrowly Typed Runtime Read-Lock Design

To eliminate reader serialization while maintaining complete mutual exclusion against conflicting mutations, a typed read-lock mode is introduced:

```ts
type LeaseLockMode = 'FOR UPDATE' | 'FOR SHARE';

async function lockedLease<T>(
  id: string,
  run: (db: PoolClient, lease: LiveLease) => Promise<T>,
  mode: LeaseLockMode = 'FOR UPDATE'
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL TIME ZONE 'UTC'");
    const initial = await liveLease(db, id);
    if (!initial) throw new AdmissionDenied(403);
    const lockClause = mode === 'FOR SHARE' ? 'FOR SHARE' : 'FOR UPDATE';
    await db.query(`SELECT id FROM rooms WHERE id=$1 ${lockClause}`, [initial.room_id]);
    await db.query(`SELECT id FROM call_groups WHERE id=$1 ${lockClause}`, [initial.call_group_id]);
    const current = await liveLease(db, id);
    if (!current) throw new AdmissionDenied(403);
    const result = await run(db, current);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
```

### PostgreSQL Lock Semantics
- **`FOR SHARE`**: Multiple concurrent transactions can hold `FOR SHARE` on the same rows simultaneously without blocking each other. This allows multiple participants in the same room to execute `processBatch` and `live()` concurrently.
- **Conflicts**: `FOR SHARE` strictly conflicts with and blocks `FOR UPDATE`, `FOR NO KEY UPDATE`, `UPDATE`, and `DELETE`.
- **Exclusions**: We do NOT use `FOR KEY SHARE` (which would allow concurrent `UPDATE` on non-key columns), lock-free queries, `SKIP LOCKED`, cached auth, lock upgrades, or unlocked native authorization.
- **Strict Invariants**:
  - `lockedLease` retains canonical lock acquisition ordering (`rooms` FOR SHARE/UPDATE, then `call_groups` FOR SHARE/UPDATE), eliminating deadlocks.
  - Re-evaluates fresh `liveLease` immediately after acquiring locks.
  - Re-evaluates fresh `liveLease` and `publicationPermission` under the active transaction before **every frame** in `processBatch`.
  - Same rollback, connection release, and 403 invalidation semantics.

---

## 3. Exact Changed Helper Call Sites

There are exactly 4 call sites of `lockedLease` in `signaling-gateway.ts`:

1. **`authorize(req, url)` (line 134)**:
   - Call site: `return await lockedLease(c.sub, async (db, lease) => { ... });`
   - Lock mode: **Default `'FOR UPDATE'`** (canonical exclusive lock).
2. **Upgrade Connected Admission Handshake (line 535)**:
   - Call site: `await lockedLease(lease.id, async (db, current) => { ... });`
   - Lock mode: **Default `'FOR UPDATE'`** (mutates `connected_at`, `disconnected_at`, and `expires_at` in `call_admissions`).
3. **`live(binding)` (line 163)**:
   - Call site: `return await lockedLease(binding.lease.id, async (db, lease) => { ... }, 'FOR SHARE');`
   - Lock mode: **`'FOR SHARE'`** (read-only verification of admission validity and publication permissions).
4. **`processBatch(binding, batch)` (line 322)**:
   - Call site: `await lockedLease(binding.lease.id, async (db) => { ... }, 'FOR SHARE');`
   - Lock mode: **`'FOR SHARE'`** (read-only verification and signaling frame forwarding; does not mutate room/group/capacity state).

---

## 4. Test Suite Additions & Regression Proofs

In `quality/evidence/T30/antigravity-shared-read-lock-1/t30-signaling-throughput.integration.spec.ts`:
- Preserves all **12 existing executed tests** verbatim.
- Adds `seedSecondMemberInCall` fixture helper to seed multiple active members in the same room/call group.
- Adds **Test 13**: `concurrent runtime read locks (FOR SHARE) allow other admissions in same call to progress while blocking FOR UPDATE writers`:
  1. Seeds 2 distinct admissions in the same room and call group.
  2. Client 1 sends screen `addTrack`, acquiring `FOR SHARE` and stalling at the fake SFU `GetParticipant` barrier.
  3. Client 2 sends a `ping` frame in the same call. Its `processBatch` acquires `FOR SHARE` concurrently without blocking, receiving `PONG` before the barrier is released.
  4. An external writer attempts `SELECT id FROM rooms WHERE id=$1 FOR UPDATE`. We verify via `pg_blocking_pids` that the writer is blocked by Client 1.
  5. The barrier is released; Client 1 completes its batch and releases `FOR SHARE`.
  6. The writer unblocks and successfully acquires the exclusive lock.
- Adds **Test 14**: `external writer holding room FOR UPDATE blocks runtime forwarding, then committed policy change is immediately enforced`:
  1. External writer acquires `SELECT id FROM rooms WHERE id=$1 FOR UPDATE`.
  2. Client sends screen `addTrack`. Runtime `processBatch` blocks attempting to acquire `FOR SHARE` (verified via `pg_blocking_pids`).
  3. Under the lock, external writer mutates policy (deletes screen quota slot in `call_publish_slots`) and commits.
  4. Gateway unblocks, fresh `publicationPermission` under transaction observes quota revocation, and denies `addTrack` with `RequestResponse_Reason.NOT_ALLOWED` (`'Current screen quota required'`).
  5. Upstream SFU never receives the denied frame.

---

## 5. Residual Risks & Invariants

1. **Deadlock Safety**: Both shared and exclusive lock modes acquire `rooms` followed by `call_groups` in the exact same strict hierarchy.
2. **Policy Drift Prevention**: `policyKey` and `updateParticipant` synchronization occurs under the active transaction before frames are processed, ensuring permissions always mirror database truth.
3. **Verification**: No tests or builds have been executed. No actual application files, tests, git ledger, or history have been modified. Codex will review and execute adoption and verification. No PASS claim.
