# Plan: T30 Native49 Signaling Latency Investigation & Proposed Guardrails

## 1. Overview & Context

During test run `t30-native-883c3aabc8c44d228c8c290d16050bb8` (Native49), three participants joined, two video capture streams were active, and initial video RTP was verified (`49,456` bytes delta, `116` packets, `videoCount: 1`).
However, during the subsequent stream switch to 'Hoàng Nam' (sender), the test assertion:
```typescript
expect(after.videoCount).toBe(1);
```
failed with `Expected: 1, Received: 0` at line 60 of `screen-share-diagnostic.spec.ts`.

All 10 Supabase containers were active, and the gateway recorded **zero query errors, zero RPC errors, and zero dropped metrics**.
The failure was neither a database crash nor a statement timeout (`57014`). Instead, empirical correlation demonstrates that **gateway queue serialization delayed the renegotiation signaling cycle**, causing the SDP Answer to arrive at the viewer client at `1791725219092` — **696 ms after the 3,818 ms measurement window closed** (`1791725218396`).

---

## 2. Empirical Signaling Timeline & Latency Breakdown

Detailed in [`timeline-analysis.json`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native49-signaling-latency-1/timeline-analysis.json) and [`timeline-analysis.md`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native49-signaling-latency-1/timeline-analysis.md):

1. **Unsubscribe / Subscribe Serialization**:
   - Client sends unsubscribe (Frame 81, 59 bytes) at `1791725214155`.
   - Client sends subscribe (Frame 83, 61 bytes) at `1791725214160` (5 ms later).
   - Frame 81 forwarded at `1791725214758` (**603 ms delay**).
   - Frame 83 forwarded at `1791725215641` (**1,481 ms cumulative delay**).
2. **SDP Offer Forwarding Delay**:
   - Client sends SDP Offer at `1791725216744`.
   - Gateway forwards Offer to upstream SFU at `1791725218230` (**1,486 ms gateway delay**).
3. **SFU Response & Arrival**:
   - SFU processes Offer and sends SDP Answer at `1791725218824` (594 ms SFU round trip).
   - Gateway forwards Answer to client at `1791725219092` (**696 ms after window closed**).

**Attribution**: Gateway queue drain and serial database transactions consumed **2,967 ms** (60.1%) of the 4,937 ms signaling cycle.

---

## 3. Structural Causes Identified

1. **Excess Serial Round Trips per Batch**:
   `lockedLease` currently executes:
   - `initial = await liveLease(db, id)`
   - `SELECT id FROM rooms ... FOR SHARE`
   - `SELECT id FROM call_groups ... FOR SHARE`
   - `current = await liveLease(db, id)`
   And then `processBatch` immediately re-queries:
   - `check = await liveLeaseWithPolicy(db, id)`
   This produces **8 TCP query round-trips** for a single batch of frames.
2. **Per-Frame Re-Queries within Single Batches**:
   Inside `processBatch`, `liveLeaseWithPolicy` was called on *every individual frame* within the batch, even though all frames execute under the same transaction and connection.
3. **Cross-Direction Head-of-Line Blocking**:
   Inbound frames (from SFU) and outbound frames (from peer) share a single queue and serial transaction drain.

---

## 4. Delivered Artifacts

Under `quality/evidence/T30/antigravity-native49-signaling-latency-1/`:

| Artifact | Purpose |
|---|---|
| [`timeline-analysis.json`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native49-signaling-latency-1/timeline-analysis.json) | Machine-readable correlated timestamps, latencies, and component breakdown |
| [`timeline-analysis.md`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native49-signaling-latency-1/timeline-analysis.md) | Exhaustive causal analysis disentangling PG, lock contention, event loop, and queue serialization |
| [`gateway-observer-hook-candidate.cjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native49-signaling-latency-1/gateway-observer-hook-candidate.cjs) | Controlled observer hook capturing `subscribe` boolean, `subscriptionPermissionUpdate.allowed`, and transit latency |
| [`gateway-latency-candidate.ts`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native49-signaling-latency-1/gateway-latency-candidate.ts) | Isolated candidate for `signaling-gateway.ts` eliminating redundant queries post-lock and batch re-queries |
| [`t30-gateway-latency.integration.spec.ts`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native49-signaling-latency-1/t30-gateway-latency.integration.spec.ts) | Real PostgreSQL & NestJS integration test verifying authority snapshots, lock ordering, and fail-closed semantics |
| [`plan.md`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native49-signaling-latency-1/plan.md) | This document |

---

## 5. Safety Invariants & Guardrails

The proposed candidate and test suite strictly adhere to all project invariants:
- **Lock Order**: Always `rooms FOR SHARE/UPDATE` before `call_groups FOR SHARE/UPDATE`.
- **Fail-Closed Semantics**: If an admission is revoked (`revoked_at`), expired (`expires_at`), or banned, the transaction fails with 403, terminates bindings, and closes sockets immediately.
- **Quota & Authority**: Screen share quota checks (`call_publish_slots`) and participant verification under locks are preserved for all `addTrack` requests.
- **No Invariant Violations**:
  - No permission caching across transactions.
  - No callbacks outside locks.
  - No lowering of assertions or extension of the 3,000 ms measurement window.
  - No fake frames or disabling adaptive stream/dynacast.
- **No Premature PASS**: Native49 is an isolated diagnostic test. Canonical restoration and execution of the original test suite are required before declaring T30 PASS.

---

## 6. Honest Evidence Gaps

1. **`subscriptionPermissionUpdate` Payload**:
   The current observer did not record whether the SFU permission update was `allowed: true`. If adopted, `gateway-observer-hook-candidate.cjs` will close this gap.
2. **Sub-Millisecond Query Profiling**:
   Slow query logging only flags queries > 1,000 ms. Aggregate query latency is proven, but sub-millisecond per-query spans were not tracked individually.
3. **Hardware Utilization**:
   Mean CPU 85.20% and minimum RAM 1.88 GB correlate with host load, but are not proven to be the sole bottleneck.

---

## 7. Next Steps for Codex Review

1. Codex reviews the causal timeline and decides whether to adopt:
   - **Option A (Diagnostic First)**: Run `gateway-observer-hook-candidate.cjs` in a diagnostic run to verify `subscriptionPermissionUpdate.allowed`.
   - **Option B (Targeted Latency Guard)**: Adopt `gateway-latency-candidate.ts` and verify with `t30-gateway-latency.integration.spec.ts`.
2. Antigravity awaits Codex review decision. Working tree remains clean.
