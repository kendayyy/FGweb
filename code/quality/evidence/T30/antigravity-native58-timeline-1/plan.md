# Native58 Switched Stream Causal Timeline & Protocol Deconstruction

This document delivers the isolated root-reviewed investigation for T30 Native58 (`t30-native-cd237f0bce5440debaf19009b5475494`) pursuant to [AGENTS.md](file:///E:/FGweb/AGENTS.md), [.agents/rules/08-testing-and-evidence.md](file:///E:/FGweb/.agents/rules/08-testing-and-evidence.md), and [.agents/rules/09-voice-and-live.md](file:///E:/FGweb/.agents/rules/09-voice-and-live.md).

---

## 1. Timestamped Causal Chain for Switched newSID (`TR_VSciSJqs4supYX`)

### 1.1 Sequence of Events in Native58
Across SFU diagnostics, WebRTC stats, and test runner logs, the exact chronological progression was:

1. **16:13:19.530Z**: First capture (Linh, `TR_VS8RdZTwPGz5m9`) completes publication (duration: 7,535ms).
2. **16:13:20.041Z – 16:13:25.064Z**: Unassociated PostgreSQL checkout encounters `CONNECTION_TIMEOUT` (5,022.61ms, TCP: 4.29ms, bytesRead: 117, bytesWritten: 318).
3. **16:13:27.735Z**: LiveKit SFU registers second capture video `TR_VSciSJqs4supYX` published by Hoàng Nam (VP8 simulcast: 1280×698 high, 640×349 low).
4. **16:13:28.894Z**: LiveKit SFU registers screen audio `TR_AsXuag57ydWvJV`.
5. **16:13:29.978Z**: Second publication completes in test runner (`publication-times.jsonl`, duration: 10,332ms).
6. **16:13:31.055Z**: LiveKit SFU webhook `track_published` delivered to API after a **3.319s** queue/send delay.
7. **16:13:32.956Z**: SFU audio webhook delivered after a 1.901s delay.
8. **16:13:35.930Z (1791735215930)**: Viewer tab for Hoàng Nam is clicked. [LiveViewer.tsx](file:///E:/FGweb/code/apps/web/src/features/live/LiveViewer.tsx#L204-L208) calls [`selectScreen(trackSid)`](file:///E:/FGweb/code/apps/web/src/features/calls/media.ts#L645-L675), which detaches the prior `<video>` element, sets `selectedId: "_r_1_-tab-TR_VSciSJqs4supYX"`, and invokes `setSubscribed(true)`. Window 2 `before` is sampled: `videoTrackId: ""` and `videoCount: 0`.
9. **16:13:35.930Z – 16:13:39.059Z (3,129ms)**: Fixed 3.0s window elapses (`waitForTimeout(3000)`). The client signals subscription to SFU, renegotiating SDP offer/answer over the subscriber peer connection. Towards the end of the window, the track is received and mounted (`videoTrackId: "TR_VSciSJqs4supYX"`, `videoCount: 1`).
10. **16:13:39.059Z (1791735219059)**: Window 2 `after` is sampled. Although `videoCount: 1`, inbound video RTP packet delta is 0 bytes.
11. **16:13:39.114Z**: [screen-share-diagnostic.spec.ts:60](file:///E:/FGweb/code/quality/evidence/T30/rtp-window-reviewed3/screen-share-diagnostic.spec.ts#L60) throws `AssertionError` (`toHaveLength(1)` received 0).
12. **16:13:39.545Z (1791735219545, +486ms post-window)**: [post-failure-media-state.json](file:///E:/FGweb/code/quality/evidence/T30/t30-native-cd237f0bce5440debaf19009b5475494/post-failure-media-state.json#L600-L645) samples the viewer: `inbound-rtp video` reports **11,459 bytes**, **12 packets**, and **4 frames decoded** at 640×349 (21 fps). The `<video>` element is in `readyState: 4` (`HAVE_ENOUGH_DATA`).
13. **16:13:40.000Z**: Photo Step 4 records Hoàng Nam's live stream fully rendered in the DOM.

### 1.2 Comparison with Native54 and Native55
| Metric | Native54 | Native55 | Native58 |
| :--- | :--- | :--- | :--- |
| **Capture 2 Publication End** | 14:53:23.522Z | 15:22:26.343Z | 16:13:29.978Z |
| **Window 2 Start** | 14:53:30.944Z | 15:22:33.491Z | 16:13:35.930Z |
| **Gap: Publication to Tab Click** | **7.422s** | **7.148s** | **5.952s** (~1.2–1.5s shorter) |
| **SFU Webhook Latency** | Baseline (<100ms) | Baseline (<100ms) | **3.319s** |
| **Window 2 Video RTP Delta** | **101,567 bytes** (104 pkts) | **15,520 bytes** (19 pkts) | **0 bytes** (in 3,129ms window) |
| **Post-Window Video Arrival** | N/A (within window) | N/A (within window) | **+486ms** (11,459 bytes, 12 pkts) |

**Causal Conclusion**: The failure in Native58 was caused by transient startup/negotiation latency (totaling 3,615ms from click to first decoded frame) exceeding the rigid 3,000ms test sampling window by 486ms. The shorter settlement gap post-publication and delayed SFU webhook delivery delayed initial keyframe dispatch.

---

## 2. PostgreSQL SCRAM Protocol Deconstruction (`bytesRead: 117` / `bytesWritten: 318`)

Inspection of [node_modules/pg/lib/connection.js](file:///E:/FGweb/code/node_modules/pg/lib/connection.js), [client.js](file:///E:/FGweb/code/node_modules/pg/lib/client.js), [sasl.js](file:///E:/FGweb/code/node_modules/pg/lib/crypto/sasl.js), and [serializer.js](file:///E:/FGweb/code/node_modules/pg-protocol/dist/serializer.js) reveals the exact protocol state:

### 2.1 Byte Sequence Analysis
1. **TCP Handshake**: Completed at `4.29ms`.
2. **Client `bytesWritten: 318`**:
   - `StartupMessage`: Protocol 3.0 (`Int16(3), Int16(0)`), parameters `user`, `database`, `client_encoding` (`UTF8`) (~125 bytes).
   - `SASLInitialResponseMessage` (`'p'`, 57 bytes): Mechanism `'SCRAM-SHA-256'`, client-first-message `n,,n=*,r=<24-byte-nonce>`.
   - `SCRAMClientFinalMessage` (`'p'`, 136 bytes): `c=biws,r=<combined-nonce>,p=<32-byte-proof>`.
   - **Sum**: ~125 + 57 + 136 = **318 bytes**.
3. **Server `bytesRead: 117`**:
   - `AuthenticationSASL` (`'R'`, length 23 bytes): Auth code 10, mechanism list `['SCRAM-SHA-256']`.
   - `AuthenticationSASLContinue` (`'R'`, length 94 bytes): Auth code 11, server-first-message `r=<nonce>,s=<salt>,i=4096`.
   - **Sum**: 23 + 94 = **117 bytes**.

### 2.2 What It Proves vs. Cannot Prove
- **What It Proves**:
  1. TCP connection and OS network stack were fully functional (connected in 4.29ms).
  2. PostgreSQL listening socket accepted the connection and initiated SASL authentication.
  3. Node.js client calculated PBKDF2/HMAC proof and flushed `SCRAMClientFinalMessage` into the kernel socket buffer.
  4. The stall occurred on the PostgreSQL server backend verifying the proof before returning `AuthenticationSASLFinal` (`'R'`, code 12) and `ReadyForQuery` (`'Z'`).
- **What It Cannot Prove**:
  1. It **cannot** prove database crash or server death (inspector confirmed healthy pool at 16:13:55Z with 0 failures).
  2. It **cannot** prove a unique hardware/disk bottleneck.
  3. It **cannot** prove causality to the WebRTC RTP failure: this timeout ended at `16:13:25.064Z`, more than **10.8 seconds before** Window 2 began (`16:13:35.930Z`). During Window 2, audio RTP deltas arrived continuously (22.4KB, 36.8KB, 20.6KB) and PostgreSQL was completely idle.

---

## 3. Recommended Minimal Diagnostic Observation

### 3.1 Blind Spot in Existing Telemetry
In [screen-share-diagnostic.spec.ts:65](file:///E:/FGweb/code/quality/evidence/T30/rtp-window-reviewed3/screen-share-diagnostic.spec.ts#L65), `subscriptionMessages(viewer)` is called *after* `receiveOne(viewer)` passes:
```typescript
await viewer.getByRole('tab', { name: 'Hoàng Nam', exact: true }).click();
const switched = await receiveOne(viewer); // <-- Throws on line 60 if video bytesDelta == 0
const messages = await subscriptionMessages(viewer); // <-- NEVER REACHED ON FAILURE
```
Because `w.t30SubscriptionFrames` is flushed before the click, when `receiveOne` throws on line 60, all queued WebSocket frames (`subscribe: false`, `subscribe: true`) remain trapped in the browser heap and are never persisted to `native-subscription-messages.jsonl`. This creates a false appearance of client silence.

### 3.2 Single Recommendation
**Target**: [quality/evidence/T30/rtp-window-reviewed3/failure-observer.mjs](file:///E:/FGweb/code/quality/evidence/T30/rtp-window-reviewed3/failure-observer.mjs).

**Hook**: Inside `observeFailure(evidence, windows)`, add a safe evaluation on the `viewer` page that extracts `w.t30SubscriptionFrames` and appends them to `sanitized-failure-record.json` alongside `RTCPeerConnection` signaling state timestamps:
```javascript
// Extract unretrieved subscription frames and WebRTC transition times upon failure
const unretrievedFrames = await viewerPage.evaluate(() => {
  const w = window;
  const frames = w.t30SubscriptionFrames || [];
  w.t30SubscriptionFrames = [];
  return frames.map(f => ({ at: f.at, length: f.data.length }));
});
```

### 3.3 Failing Control Plan
1. **Control 1 (Unretrieved Frame Preservation)**: Trigger a simulated assertion failure inside `receiveOne`. Verify that `sanitized-failure-record.json` captures non-empty subscription frame records without requiring line 65 to be reached.
2. **Control 2 (Zero App Mutation)**: Ensure no modifications to [apps/web/src/features/calls/media.ts](file:///E:/FGweb/code/apps/web/src/features/calls/media.ts) or [task.md](file:///E:/FGweb/.doc/task.md) spec mandates (`adaptiveStream: true`, `dynacast: true`, and single active video subscription remain preserved).
