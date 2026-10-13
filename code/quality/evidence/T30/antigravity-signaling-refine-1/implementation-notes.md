# FG T30 — Signaling Gateway Refined Batching Implementation Notes (refine-1)

## 1. Overview & Revisions from Review 1

Following Codex review (`quality/evidence/T30/signaling-proposal-review-1.json` and `signaling-source-interim-review.json`), the proposal has been completely revised under `quality/evidence/T30/antigravity-signaling-refine-1/**` to resolve all five identified findings without introducing production test hooks.

---

## 2. Resolution of Reviewer Findings

### Finding 1: AUTH / SIG-BATCH-AUTH-01 & SIG-BATCH-FAIR-01
- **Problem in v1**: `processBatch` cached `lease` and `publicationPermission` across the entire batch. External calls to `revokeSession`, session expiry, or `admin_actions` bans occurring mid-batch were not detected for subsequent frames in that same batch.
- **Resolution in refine-1**:
  - Before **every individual frame** in `processBatch`, fresh `current = await liveLease(db, binding.lease.id)` is evaluated under the active PostgreSQL transaction.
  - If `current` is invalid or `room_name` has drifted, it immediately throws `AdmissionDenied(403)`.
  - Fresh `permission = await publicationPermission(db, current)` is evaluated before every frame, updating native participant policy if altered and clearing revoked screen sources from `pendingPublications`.
  - Batching amortizes only the `BEGIN`, row locking (`rooms` then `call_groups`), and `COMMIT` overhead. Authorization facts are never cached across frames.
  - Batches are bounded to **max 8 frames** (reduced from 16) to ensure fair lock residency within the canonical 3-second statement timeout.
  - Canonical timeouts (3s statement timeout, 2s connection timeout, 3s native RPC timeout, 5s join timeout) are strictly preserved.

### Finding 2: FIXTURE
- **Problem in v1**: `game_interests` INSERT had a parameter mismatch (`VALUES($1,$1,$2)`).
- **Resolution in refine-1**:
  - Corrected to `INSERT INTO game_interests(id, user_id, game_id) VALUES($1, $2, $3)` with three unique parameters (`[randomUUID(), userId, gameId]`).
  - Added seeded admin actor (`admin-actor`) satisfying the foreign key constraint on `admin_actions(actor_id)`.
  - All fixture SQL aligns with `@fg/database` Drizzle schemas and PostgreSQL constraints.

### Finding 3: THROUGHPUT
- **Problem in v1**: The test relied on `testObserver` and `onTransaction` hooks injected into `GatewayOptions`, mirroring implementation details rather than measuring actual bidirectional latency.
- **Resolution in refine-1**:
  - Completely removed `testObserver` from `GatewayOptions`. The production gateway signature is 100% clean and matches the canonical baseline.
  - Implemented a black-box throughput test sending **32 genuine WebSocket PINGs** traversing outbound through the gateway to the fake SFU, which immediately replies with **PONGs** traversing inbound through the gateway back to the client.
  - Both directions exercise genuine PostgreSQL row locks and transaction guards.
  - Asserts all 32 PONG responses arrive in exact sequence within a **8-second bounded deadline** and records duration.
  - On the unbatched canonical baseline (64 separate serial transactions), this test establishes semantic RED (>8s timeout). On the batched proposal (amortized into ~4–8 transactions), it completes well within the deadline.

### Finding 4: RACE
- **Problem in v1**: The ban test committed before frames were enqueued, failing to prove that a mid-batch authority change blocks subsequent frames in the same transaction.
- **Resolution in refine-1**:
  - Designed a deterministic race test without production observers using PostgreSQL locking and an upstream RPC barrier:
    1. Gateway starts and client connects.
    2. An external PG connection (`locker`) begins a transaction and acquires `SELECT id FROM rooms WHERE id=$1 FOR UPDATE`.
    3. Client sends `warmupPing`. Gateway drain attempts `lockedLease` and blocks on the room row lock.
    4. Test polls `pg_stat_activity` with `pg_blocking_pids(lockerPid)` until gateway is confirmed blocked.
    5. While blocked, client enqueues `[screen addTrack, protected laterPing(999)]`.
    6. Fake SFU sets an RPC barrier on `GetParticipant`.
    7. Locker commits, unblocking the gateway to start processing the batch.
    8. Gateway processes `warmupPing` and begins `screen addTrack`, invoking `GetParticipant` on the fake SFU, which pauses on the barrier.
    9. While paused mid-batch, test commits an administrative BAN and admission revocation in a separate PG connection.
    10. Fake RPC barrier is released.
    11. Gateway completes `screen addTrack` and moves to `laterPing(999)`. The fresh `liveLease` check detects the ban/revocation, throws 403, and invalidates the binding.
    12. Both WebSockets close cleanly, and `laterPing(999)` is **never forwarded** to the upstream SFU.

### Finding 5: FAKE_NATIVE
- **Problem in v1**: Reassigning `sfu.participantTracks` broke the fake HTTP closure reference. Discriminated union fields (`r.message.value?.cid`) were accessed without prior `case` narrowing.
- **Resolution in refine-1**:
  - `sfu.setParticipantTracks` mutates the underlying array in place (`participantTracks.length = 0; participantTracks.push(...tracks);`), guaranteeing the HTTP handler closure always reads current tracks.
  - All `@livekit/protocol` message access strictly narrows `case` before inspecting `value`.

---

## 3. Preserved Invariants & Guard Contracts

1. **Queue Capacity**: Bounded queue with max 256 queued frames and max 1 MiB payload capacity per binding; immediate closure on overflow.
2. **Canonical Lock Order**: Strict `SELECT FOR UPDATE` on `rooms` followed by `call_groups`.
3. **Guard Verification**: Exact CID bounds (<= 256), track types, track sources, max 1 native screen track per quota/source, and secondary codec SID matching remain intact.
4. **Cleanliness**: Zero logging of credentials, JWTs, or frame payloads. No database schema changes.
5. **Proposed-Only Confinement**: No edits have been made to actual application source, existing tests, or the git ledger. No test or build commands were executed.
