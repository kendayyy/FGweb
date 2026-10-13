# FG T30 — Signaling Gateway Throughput & Transaction Batching Implementation Notes

## 1. Overview & Root Cause Analysis

### Background
During T30 Native6 real-browser E2E screen share verification with the native LiveKit SFU, client negotiation encountered timeouts. Diagnostic evidence collected in `quality/evidence/T30/gateway-timing-summary-1.json` revealed:
- Database lease transactions: count 293, p50 188ms, p95 1501ms, max 4492ms.
- Outbound frame queue: count 86, p50 191ms, p95 9177ms, max 10406ms.
- Inbound frame queue: count 85, p50 1ms, p95 2010ms, max 2556ms.

### Root Cause
In the canonical `apps/api/src/modules/calls/signaling-gateway.ts`, every single inbound and outbound WebSocket frame triggered an independent `lockedLease` transaction:
```ts
// Canonical per-frame transaction acquisition:
incoming = incoming.then(async () => {
  if (await live(current)) {
    observePublication(current, data, binary);
    send(current.peer, data, binary);
  }
});
outgoing = outgoing.then(async () => {
  await forwardClient(own, data, binary); // Acquired another lockedLease per frame
});
```
Each transaction executed:
1. `BEGIN`
2. `SET LOCAL TIME ZONE 'UTC'`
3. `liveLease(db, id)` query
4. `SELECT id FROM rooms WHERE id=$1 FOR UPDATE`
5. `SELECT id FROM call_groups WHERE id=$1 FOR UPDATE`
6. `liveLease(db, id)` recheck
7. `COMMIT`

Because incoming and outgoing frame chains operated concurrently, they contended for the exact same database row locks (`rooms` and `call_groups`). During initial WebRTC connection setup—when LiveKit client and SFU exchange a burst of ~50–100 messages (SDP offer, answer, ICE trickle candidates, participant info)—this serialized database transaction latency accumulated to >9–10 seconds, exceeding client-side WebRTC negotiation deadlines.

---

## 2. Architecture & Invariants

The proposed implementation under `quality/evidence/T30/antigravity-signaling-batch-1/apps/api/src/modules/calls/signaling-gateway.ts` introduces guard transaction batching with the following strict invariants:

### 1. Single Unified Bounded Queue
- Inbound and outbound frames for a given `Binding` share a single queue:
  ```ts
  type Binding = {
    lease: LiveLease;
    peer: WebSocket;
    upstream: WebSocket;
    policyKey: string;
    queue: QueuedFrame[];
    queueBytes: number;
    draining: boolean;
    drainPromise: Promise<void>;
    closed: boolean;
  };
  ```
- Strict chronological interleaving of bidirectional signaling frames is maintained.

### 2. Transaction Batching (Max 16 Frames)
- `scheduleDrain` drains up to 16 frames per batch (`batch = queue.splice(0, Math.min(16, queue.length))`).
- The entire batch of 16 frames is processed inside a single `lockedLease` transaction.
- Coalescing reduces database transactions by up to ~16x during burst negotiation, drastically eliminating lock contention.

### 3. Queue Capacity Boundaries (<= 256 Frames, <= 1 MiB)
- In `enqueue`:
  ```ts
  if (binding.queue.length >= 256 || binding.queueBytes + byteLength > 1024 * 1024) {
    closeBinding(binding);
    return;
  }
  ```
- If a client or upstream sends frames faster than drain capacity or exceeds 1 MiB total buffered bytes, the gateway immediately closes the binding, clearing the queue and preventing memory leaks or unbounded growth.

### 4. Canonical Lock Ordering & Authority Recheck
- Each batch acquires `lockedLease` using the canonical lock order:
  `SELECT id FROM rooms WHERE id=$1 FOR UPDATE` followed by `SELECT id FROM call_groups WHERE id=$1 FOR UPDATE`.
- `liveLease` is verified both before acquiring locks and after locks are held.
- All frames in a batch are processed while that lock remains active. No cached lease or time-based bypass is introduced.

### 5. Derived Publication Permission Under Lock
- Publication permissions (`canPublishSources`) are derived once under lock per batch.
- If policy has changed (`policyKey !== binding.policyKey`), native SFU participant policy is updated via `native.updateParticipant`.
- Revoked screen sources are pruned from `pendingPublications`.

### 6. Non-Nesting `processClientFrame` Helper
- Canonical `forwardClient` previously called `lockedLease`, which would cause a nested transaction deadlock if invoked inside a batch.
- Refactored `processClientFrame` as a helper accepting `(db, binding, lease, permission, data, binary)`.
- It directly uses the existing batch transaction client `db`, lease, and derived permissions without nested transactions.

### 7. Strict Track Verification Preserved
- Preserves exact CID validation (`track.cid.length <= 256`).
- Preserves exact track type and track source checks (video for screen share, audio for mic / screen share audio).
- Enforces maximum 1 native track per screen quota/source.
- Preserves secondary codec verification (same verified native track SID allowed).
- Preserves pending publication updates (`pendingPublications.set(key, { slotId, cid })`) and resolution via `observePublication`.

### 8. Initial Handshake Preservation
- Frames queued during initial upstream WebSocket connection and `join` SignalResponse arrival remain guarded and dispatched under the initial `lockedLease` transaction.

### 9. Periodic Revalidation & Teardown
- Polling `live()` interval (1s) continues to revalidate active leases and synchronize policies.
- Explicit closure and error handlers (`ended`, `closeBinding`) ensure sockets are terminated, `disconnected_at` timestamps recorded, and pending publications cleared.
- No unhandled promise rejections exist in the drain promise chain.

### 10. Privacy & Cleanliness
- No credentials, JWTs, or signaling payloads are logged.
- Zero changes to SQL migrations, database schemas, or LiveKit protocol definitions.

---

## 3. Test Fixture Design & Assumptions

The new integration test proposal `quality/evidence/T30/antigravity-signaling-batch-1/apps/api/test/t30-signaling-throughput.integration.spec.ts` verifies these guarantees:

### 1. Dedicated Real PostgreSQL Schema
- Operates on schema `t30_throughput_<uuid>`, applying full Drizzle migrations and seed data.
- Exercises genuine database row locking, foreign key constraints, and transactional consistency.

### 2. Upstream Fake SFU Adapter
- Provides an HTTP and WebSocket server simulating LiveKit SFU:
  - Answers Twirp RPC requests (`/twirp/livekit.RoomService/UpdateParticipant`, `GetParticipant`, `RemoveParticipant`).
  - Implements `/rtc` WebSocket upgrade emitting native `SignalResponse` (`join`, `trackPublished`, `trackUnpublished`).
  - Records all forwarded `SignalRequest` frames for deterministic verification.

### 3. Test Observer Hook
- The gateway exports an optional `testObserver?: { onBatch?: (size: number) => void; onTransaction?: () => void; }` in `GatewayOptions`.
- Allows test code to assert that a burst of 16 frames resulted in strictly fewer transactions (proving batch drainage), without introducing any production overhead or mock bypasses.

### 4. Test Scenarios Covered
1. **Throughput & Batching**: Burst of 16 frames processed in reduced transactions with exact chronological ordering preserved.
2. **Quota Denial**: `SCREEN_SHARE` denied with `NOT_ALLOWED` (`Current screen quota required`) when `call_publish_slots` is empty; 0 frames reach SFU.
3. **Quota Granted & Pending CID**: `SCREEN_SHARE` allowed and forwarded with matching CID when slot exists in `call_publish_slots`.
4. **Duplicate Screen Track Denial**: Second screen track with different CID denied with `LIMIT_EXCEEDED` (`One native track per screen quota/source`).
5. **Secondary Codec Extension**: Track with matching native SID allowed through for secondary codec transmission.
6. **Revocation / Admin Ban While Queued**: Detecting revocation invalidates lease, terminates connection, and drops queued frames.
7. **Queue Overflow Cleanup**: Burst exceeding 256 queued frames immediately terminates connection without memory leak.
8. **Malformed Frame Cleanup**: Invalid protobuf bytes trigger 400 error and clean socket termination.

---

## 4. Unresolved Risks & Next Steps

1. **Proposed-Only Confinement**:
   All artifacts remain strictly inside `quality/evidence/T30/antigravity-signaling-batch-1/**`. No modifications have been made to production code (`apps/api/src/`), existing tests, compiled dist, or git tracking.
2. **Execution Gate**:
   Per the task instructions, no build, test, or browser commands were executed during this proposal step.
3. **Final Acceptance**:
   While the integration test validates transaction reduction and guard correctness against the fake SFU adapter, genuine end-to-end acceptance requires Codex review, adoption, and a headed browser E2E run (`Native6`) against the live SFU container to confirm elimination of the negotiation timeout in practice.
