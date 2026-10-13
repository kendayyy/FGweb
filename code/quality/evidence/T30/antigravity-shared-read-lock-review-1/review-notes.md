# FG T30 — Shared Read-Lock Round 2 Review Notes (antigravity-shared-read-lock-review-1)

## 1. Status & Honesty Disclosure

The Round 1 proposed test file (`quality/evidence/T30/antigravity-shared-read-lock-1/t30-signaling-throughput.integration.spec.ts`) was **rejected by Codex review prior to execution** due to:
1. An overly lenient 8000ms deadline in the concurrent reader test that could allow PONG to be recorded after the first client timed out on native RPC (3000ms timeout), risking false concurrency proof.
2. Missing writer lock coverage for `call_groups`.
3. Inaccurate assertion message expecting `'Current screen quota required'` instead of canonical `'Current publication source denied'`.
4. Resource cleanup hazards where blocked database clients or unreleased RPC barriers could hang tests upon assertion failures.

The Round 1 application source proposal (`signaling-gateway.ts`) was accepted in principle. Its bytes have been preserved 100% identically in this folder without modification.

No production code, test suites, database migrations, git ledger, or history files were altered. No build or test commands were executed. There is no claim of task PASS or native acceptance.

---

## 2. Source Proposal Invariants (Byte-Identical to Round 1)

The source file [`signaling-gateway.ts`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-shared-read-lock-review-1/signaling-gateway.ts) maintains:
- `type LeaseLockMode = 'FOR UPDATE' | 'FOR SHARE';`
- Default `lockedLease` mode: canonical room then group `'FOR UPDATE'` for `authorize()` and connected WebSocket upgrade handshakes.
- Read-only runtime mode: canonical room then group `'FOR SHARE'` for `live(binding)` and `processBatch(binding, batch)`.
- Re-checks fresh `liveLease` and `publicationPermission` under the active transaction before every frame.
- Bounded 8-frame batches, 256 queued frames / 1 MiB limits, and all canonical timeouts (3s SQL, 2s pool connection, 3s native RPC, 5s join).

---

## 3. Round 2 Test Suite Corrections

The test file [`t30-signaling-throughput.integration.spec.ts`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-shared-read-lock-review-1/t30-signaling-throughput.integration.spec.ts):

1. **Preserves All 12 Existing Executed Callbacks**:
   - Tests 1–12 (32 PING/PONG, mid-batch revoke/ban/expire, screen quota denial, screen quota permit, duplicate track denial, queue overflow, malformed frame, and warm prepared statement freshness) are preserved verbatim with untouched assertions and timeouts.
2. **Concurrent Reader & Writer Probe (`it.each(['rooms', 'call_groups'] as const)`) — 2 Cases**:
   - Both clients join the gateway before triggering the screen share addTrack frame.
   - Client 1 sends screen `addTrack`, acquiring `FOR SHARE` and stalling at the fake SFU `GetParticipant` barrier.
   - Client 2 sends a PING frame in the same call. The test asserts that PONG arrives within **<= 1500ms** while explicitly verifying that `barrierReleased === false` and `client1.closed === false`.
   - External writer attempts exclusive locking:
     - For `rooms`: writer executes `SELECT id FROM rooms WHERE id=$1 FOR UPDATE`.
     - For `call_groups`: writer executes `SELECT id FROM rooms WHERE id=$1 FOR SHARE` followed by `SELECT id FROM call_groups WHERE id=$1 FOR UPDATE` to isolate contention on the call group.
   - Real `pg_blocking_pids` confirms the writer is blocked by the transaction held by Client 1 while `barrierReleased === false` and `client1.closed === false`.
   - Bounded execution completes within ~500–700ms, well before the 3000ms native RPC deadline.
   - Barrier is released: Client 1's `addTrack` forwards to upstream SFU, Client 1 remains open, and the writer unblocks and completes.
   - Uses distinct synthetic user IDs per variant (`shared-rooms-user-*` and `shared-call_groups-user-*`).
3. **External Writer Blocking & Committed Policy Denial — 1 Case**:
   - External writer holds `FOR UPDATE` on `rooms` and `call_groups`.
   - Client sends screen `addTrack`; runtime `processBatch` is proven blocked on the writer via `pg_blocking_pids`.
   - Under lock, writer deletes `call_publish_slots` and commits.
   - Gateway unblocks and evaluates `publicationPermission`. In `processClientFrame`, `!permission.canPublishSources.includes(track.source)` evaluates to `true` first, correctly returning `RequestResponse_Reason.NOT_ALLOWED` with `'Current publication source denied'`.
   - Asserts upstream SFU never receives the denied frame.
4. **Cleanup Robustness in `finally`**:
   - Releases RPC barrier first (`rpcReleaseFn?.()`), ensuring native handlers never deadlock.
   - Terminates client WebSockets.
   - Releases writer connection with error suppression on rollback.
   - Awaits `writerPromise.catch(() => {})` to eliminate unhandled promise rejections.
   - Closes gateway and fake SFU.
5. **Expected Executed Case Count**:
   - 12 existing + 2 parameterized reader cases + 1 external writer case = **15 total executed test cases**.

---

## 4. Proposed Files & SHA-256 Hashes

| Proposal File | SHA-256 | Notes |
| :--- | :--- | :--- |
| `quality/evidence/T30/antigravity-shared-read-lock-review-1/signaling-gateway.ts` | `dc7469277194c2f2fae3b6dd8b35f75d454f61c59f263daab8975e3cec95de67` | Exact byte-identical copy of round 1 proposal |
| `quality/evidence/T30/antigravity-shared-read-lock-review-1/t30-signaling-throughput.integration.spec.ts` | `89d1f3a3a5ebf5b4dbda993e71ed0dc3c2584e20bb240f1cb5c22fe3d4efe809` | 15 total executed test cases; robust bounded concurrency proofs |
| `quality/evidence/T30/antigravity-shared-read-lock-review-1/review-notes.md` | `41781c422b01743f32ec71bb9ed8a397ea2017fdea7b8f21c2e90d0bd17a1b67` | Documentation of round 2 review resolution |
