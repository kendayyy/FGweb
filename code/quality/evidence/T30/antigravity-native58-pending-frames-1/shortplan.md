# Revised Native58 Timeline & Pending Frames Observer Plan

This document delivers the corrected analysis and diagnostic proposal for Native58 pursuant to root review feedback, [AGENTS.md](file:///E:/FGweb/AGENTS.md), and [.agents/rules/08-testing-and-evidence.md](file:///E:/FGweb/.agents/rules/08-testing-and-evidence.md).

---

## 1. Factual Corrections from Root Review

1. **Before-Sample vs. Actual Click**:
   `16:13:35.930Z` is the timestamp of the test runner's `stats()` `before`-sample inside `receiveOne`, **not** the user tab click. Root gateway logs confirm that the browser had already dispatched its signaling frames earlier: the gateway received `subscribe: false` (seq 95, 59 bytes) at `16:13:35.652Z` and `subscribe: true` (seq 97, 61 bytes) at `16:13:35.653Z` (~278ms prior to the `before`-sample).
2. **Media Arrival Snapshot vs. Exact Packet Timing**:
   The post-failure snapshot at `16:13:39.545Z` proves packet arrival occurred **by** that sample timestamp (11,459 bytes, 12 packets, 4 decoded frames). It does not establish the exact millisecond of the first packet or decoded frame arrival, which occurred at an unobserved point between `16:13:39.059Z` and `16:13:39.545Z`.
3. **Socket Aggregate Bytes (`bytesRead: 117` / `bytesWritten: 318`)**:
   `bytesRead: 117` and `bytesWritten: 318` are aggregate socket byte counters across the connection lifetime. While consistent with SCRAM progression, aggregate counters alone cannot prove exact message boundaries or locate the exact server stall without genuine event telemetry.
4. **Webhook Latency Correlation**:
   The SFU webhook delivery duration of 3.319s is a system latency indicator, but cannot be asserted as the primary causal source of keyframe delay; historical baselines (<100ms in 54/55) were not verified.
5. **PostgreSQL Timeout Separation**:
   The unassociated PG connection timeout ended at `16:13:25.064Z`, ~10.866s prior to the switching window (`16:13:35.930Z`). While there was no contemporaneous overlap or direct causal link observed, timeline separation alone does not exclude indirect resource contention under heavy host load.
6. **Working Tree Status**:
   The working tree is dirty with diagnostic and test artifacts from ongoing investigations.

---

## 2. Root Gateway Timeline & Query Workload

Root gateway evidence ([native58-gateway-switch-timeline-root1.json](file:///E:/FGweb/code/quality/evidence/T30/native58-gateway-switch-timeline-root1.json) and [native58-gateway-switch-cost-root1.json](file:///E:/FGweb/code/quality/evidence/T30/native58-gateway-switch-cost-root1.json)) reveals the actual signaling progression:
- **16:13:35.652Z**: Gateway receives client `subscription` (seq 95, 59 bytes, unsubscribe).
- **16:13:35.653Z**: Gateway receives client `subscription` (seq 97, 61 bytes, subscribe).
- **16:13:36.851Z**: Gateway relays Offer 1 (seq 99, 6,485 bytes) to client; client answers at `16:13:36.971Z` (5,619 bytes).
- **16:13:37.974Z**: Gateway relays Offer 2 (seq 104, 8,980 bytes) to client; client answers at `16:13:38.111Z` (7,663 bytes).
- **16:13:38.707Z**: Client answer sent to upstream SFU — only **352ms** before the measured window closed (`16:13:39.059Z`).
- **16:13:39.203Z**: `trackSetting` (27 bytes) relayed upstream **144ms after** the window closed.
- **Query Load**: 158 queries during the window (p50: 41.64ms, p95: 140.1ms, max: 287.46ms, 0 failed, 0 RPC, gateway loop max: 33.85ms). These reflect aggregate workload without individual frame association.

Because gateway WebSocket frames record only message class, byte count, and ordinal sequence, exact track SID association is missing from gateway telemetry.

---

## 3. Single Proposed Diagnostic: Pending Frames Observer

### 3.1 Problem Addressed
In [screen-share-diagnostic.spec.ts](file:///E:/FGweb/code/quality/evidence/T30/rtp-window-reviewed3/screen-share-diagnostic.spec.ts#L65), `subscriptionMessages(viewer)` is called *after* `receiveOne(viewer)`. When `receiveOne` throws on line 60, all client subscription frames buffered in `window.t30SubscriptionFrames` remain uncollected in browser memory, leaving `native-subscription-messages.jsonl` incomplete.

### 3.2 Observer Implementation
Delivered in [failure-observer.mjs](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native58-pending-frames-1/failure-observer.mjs):
1. **Non-Destructive Read**: Evaluates `pendingFramesSnapshot` on actor pages, slicing up to 256 frames without clearing `t30SubscriptionFrames`, mutating DOM, or altering focus/visibility.
2. **In-Memory Decode**: Uses `@livekit/protocol` `SignalRequest.fromBinary()` to parse field 6 (`subscription`) messages.
3. **Strict Validation & Privacy**:
   - Validates track SIDs against `^TR_[A-Za-z0-9]+$` (5 to 64 chars, max 16 per frame).
   - Completely omits `participantSid`, tokens, raw bytes, proto payloads, SDP, and error strings.
   - Restricts actor to fixed enum (`'sender' | 'receiver' | 'viewer' | 'third' | 'fourth' | 'denied'`).
4. **Honest Accounting**: Records `sampleCount`, `decodedCount`, `droppedCount`, and `errorCount`. Any decode failure or SID violation marks `observationComplete: false`.
5. **Safe Separate Output**: Writes to `pending-subscription-frames.json` with `{ flag: 'wx' }`. Never modifies `sanitized-failure-record.json`.
6. **Budget & Error Preservation**: Operates within the 5,000ms deadline; preserves original error identity under all observer failure modes.

---

## 4. Control Plan Overview

Delivered in [control-plan.mjs](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native58-pending-frames-1/control-plan.mjs) (not executed; prepared for root execution):
- **Unit Controls**: Exercises valid subscribe/unsubscribe serialization, duplicate SIDs, participant identity omission, malformed proto bytes, non-subscription messages, invalid SID regex, count overflow (>16 SIDs), and oversize payload (>8,192 bytes).
- **Integration Controls**: Exercises normal observer persistence, browser evaluation rejection, 5,000ms deadline timeout, and file write collisions, verifying `post-failure-media-state.json` and `pending-subscription-frames.json` persistence while proving original error identity is never masked.
- **Failing Regression Control**: Proves strict rejection of un-sanitized participant identities and SID count overflows.
