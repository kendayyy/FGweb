# T30 Native49 Signaling Latency Timeline & Causal Analysis

## 1. Executive Summary

In test run `t30-native-883c3aabc8c44d228c8c290d16050bb8` (Native49), three participants joined, two video capture streams were active, and initial video RTP was verified (`49,456` bytes delta, `116` packets, `videoCount: 1`).
However, during the subsequent stream switch to 'Hoàng Nam' (sender), the test assertion:
```typescript
expect(after.videoCount).toBe(1);
```
failed with `Expected: 1, Received: 0` at line 60 of `screen-share-diagnostic.spec.ts`.

Crucially:
- The capture track remained live on the sender (216 encoded frames, 32 fps).
- The gateway and observers recorded **zero query errors, zero RPC errors, and zero dropped metrics**.
- All 10 Supabase containers were verified running.
- The failure was **not** a database timeout (`57014`), connection crash, or permission revocation.
- Instead, the failure was caused by **signaling renegotiation latency**: the SDP Answer confirming the new video track was forwarded to the viewer client at `1791725219092`, which was **696 ms after the 3,818 ms measurement window closed** (`1791725218396`).

---

## 2. Correlated Signaling Timeline

| Timestamp (Epoch ms) | Relative to Switch (ms) | Entity | Direction | Case | Size / Seq | Latency (ms) | Description |
|---|---|---|---|---|---|---|---|
| `1791725214155` | `-423` | Socket 5 (Peer) | Inbound | `subscription` | 59 bytes, seq 81 | — | Client unselects old track (`subscribe: false` for `TR_VSrzKShmnkBXFk`) |
| `1791725214160` | `-418` | Socket 5 (Peer) | Inbound | `subscription` | 61 bytes, seq 83 | — | Client selects new track (`subscribe: true` for `TR_VSXCz9gNonkGAP`) |
| `1791725214578` | `0` | Test Runner | — | `window-start` | — | — | `receiveOne` begins 3,000 ms wait; initial stats have `videoCount: 0` |
| `1791725214758` | `+180` | Socket 4 (Native) | Outbound | `subscription` | 59 bytes, seq 81 | **603** | Gateway finishes Batch 1 `lockedLease` and forwards unsubscribe to SFU |
| `1791725215641` | `+1063` | Socket 4 (Native) | Outbound | `subscription` | 61 bytes, seq 84 | **1,481** | Gateway finishes Batch 2 `lockedLease` and forwards subscribe to SFU |
| `1791725216744` | `+2166` | Socket 5 (Peer) | Inbound | `offer` | SDP Offer | — | Client generates SDP Offer for renegotiation |
| `1791725218230` | `+3652` | Socket 4 (Native) | Outbound | `offer` | SDP Offer | **1,486** | Gateway finishes Batch 3 `lockedLease` and forwards Offer to SFU |
| `1791725218396` | `+3818` | Test Runner | — | `window-end` | — | — | 3,000 ms wait expires; `expect(videoCount).toBe(1)` fails (`videoCount: 0`) |
| `1791725218824` | `+4246` | Socket 4 (Native) | Inbound | `answer` | SDP Answer | 594 (SFU) | SFU generates and sends SDP Answer back to gateway |
| `1791725219092` | `+4514` | Socket 5 (Peer) | Outbound | `answer` | SDP Answer | **268** | Gateway forwards SDP Answer to client (**+696 ms after window close**) |

---

## 3. Disentanglement of Latency Factors

### A. Gateway Queue Serialization & Serial `lockedLease`
The signaling gateway enforces access authority by executing every frame batch within a `lockedLease` PostgreSQL transaction (`FOR SHARE`). Inside `processBatch`:
1. `lockedLease` executes:
   - `pool.connect()`
   - `BEGIN`
   - `SET LOCAL TIME ZONE 'UTC'`
   - `liveLease` (initial verification)
   - `SELECT id FROM rooms WHERE id=$1 FOR SHARE`
   - `SELECT id FROM call_groups WHERE id=$1 FOR SHARE`
   - `liveLease` (post-lock verification)
2. Inside `processBatch`'s frame loop:
   - `liveLeaseWithPolicy` (fresh check on every single frame)
   - If policy key changed: `native.updateParticipant` (HTTP Twirp RPC to SFU)
   - For `addTrack`: slot quota check query + `native.getParticipant` RPC
   - For other frames: passthrough to upstream or peer
3. `COMMIT` and client release.

**Key Observation**:
Frames 81 and 83 arrived only **5 ms apart** (`1791725214155` and `1791725214160`). Because Frame 81 immediately triggered `scheduleDrain` with batch size 1, Frame 83 queued behind it. Frame 81 took **603 ms** to process. Frame 83 then took an additional **878 ms** to process.
Together, the gateway introduced **1,481 ms** of delay before the subscription reached the SFU.
Subsequently, the client SDP Offer arrived at `1791725216744` and was queued for another **1,486 ms** before forwarding at `1791725218230`.
Total gateway queue and transaction serialization delay on the critical path: **2,967 ms** (60.1% of the total 4,937 ms signaling cycle).

### B. PostgreSQL Execution vs. Lock Contention
- In earlier runs (Native40, Native46), slow queries (`57014` statement timeout) were observed due to contention with `CallLifecycleService.sweep()`, which acquires exclusive `FOR UPDATE` locks on `rooms` and `call_groups` while performing native Twirp RPCs.
- In Native49, **zero slow queries (> 1,000 ms)** were recorded during the stream switch window (`13:26:54` to `13:26:58`).
- The overhead was not a single long query, but rather the cumulative effect of **multiple consecutive 8-query transactions** running over TCP against PostgreSQL under host load.

### C. Host Metrics & Event Loop
- Host CPU utilization was high: mean **85.20%** busy across 8 logical cores, minimum available RAM **1.88 GB**.
- However, event loop drops were 0 and observer health was 100% complete. Host load increased baseline round-trip latencies, but the structural bottleneck remained the serialization of transactions.

---

## 4. The Unobserved Gap: `subscriptionPermissionUpdate`

In `native49-photo-timing-review1.json`:
```json
"subscriptionPermissionBooleanNotObserved": true
```
The gateway observer classifies WebSocket frames by protobuf case name (e.g. `case: "subscription"`, `case: "subscriptionPermissionUpdate"`), but does not inspect payload contents. Specifically:
- When a client issues `UpdateSubscription`, the LiveKit SFU responds with `subscriptionPermissionUpdate` (a ~40-byte protobuf message).
- We do not currently observe whether `allowed` was `true` or `false`, or whether the client SDK hesitated or waited on permission confirmation before generating its SDP Offer (`offerReceived` at `1791725216744`, 1,103 ms after subscription was forwarded).
- Observing this payload is required to confirm whether the delay between subscription and offer was client-side renegotiation debouncing or SFU permission handshaking.

---

## 5. Delineation of Proven vs. Unproven Factors

| Finding | Classification | Evidence / Basis |
|---|---|---|
| Gateway signaling delay pushed answer 696 ms past window | **PROVEN** | Timestamps: `offerReceived` 1791725216744, `offerForwarded` 1791725218230 (+1486ms), `answerSent` 1791725219092 (+696ms after 1791725218396). |
| Head-of-line queue delay on consecutive frames | **PROVEN** | Frames 81 & 83 arrived 5ms apart, forwarded 603ms and 1481ms later in separate serial transactions. |
| Zero database crash, zero error count, zero 57014 | **PROVEN** | `gatewayErrors: 0`, `failureCount: 0`, `readFailures: 0`, observer health complete. |
| Redundant SQL queries in `lockedLease` | **PROVEN** | Code analysis: `lockedLease` executes `liveLease` twice; `processBatch` immediately executes `liveLeaseWithPolicy` on frame 1. |
| SFU permission denial or throttling | **UNPROVEN (GAP)** | `subscriptionPermissionUpdate` payload unobserved; requires minimal diagnostic hook. |
| Host CPU being the sole cause | **UNPROVEN (GAP)** | High CPU (85.20%) correlates with delay, but does not explain structural 8-query serialization. |

---

## 6. Architectural Invariants Preserved in Proposed Solutions

All proposed solutions strictly maintain:
1. **Room & Group Lock Order**: Always `rooms FOR SHARE` followed by `call_groups FOR SHARE`.
2. **Authority Enforcement**: Fresh `liveLeaseWithPolicy` verification ensures banned, revoked, or expired sessions are denied immediately (fail-closed 403).
3. **Screen Quota Integrity**: `addTrack` verifies `call_publish_slots` and `TrackSource` restrictions under transaction lock; max 3 publishers enforced.
4. **FIFO Signaling Order**: WebSocket frame ordering within protocol is strictly maintained.
5. **No Assertion Alterations**: The 3,000 ms measurement window and `bytesDelta > 1000` assertion remain untouched.
6. **No Native PASS Claims**: Isolated diagnostic runs do not declare completion; canonical restoration and original suite pass required before final T30 close.
