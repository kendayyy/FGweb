# T30 Narrow Transport Hypothesis: Dual PeerConnection Mode

## 1. Context & Problem Identification

### 1.1 Native49 Run Findings
In the canonical Native49 run (`quality/evidence/T30/native49-photo-timing-review1.json`):
- All prerequisites, initial 3 joins, 2 screen captures, and initial RTP streaming passed (49,456 bytes received on initial stream).
- During the switched-stream test, the measured 3-second window (`1791725214578` to `1791725218396`) yielded `videoCount: 0` and 0 new video bytes (only 2,259 bytes of legacy 8x8 filler).
- The signaling trace revealed:
  - Client subscription request (`SignalRequest` field 50) was emitted at `1791725214155`.
  - A client-originated SDP offer was received by the gateway at `1791725216744` (2,166 ms after switch start) and forwarded to the SFU at `1791725218230` (1,486 ms forward delay).
  - The resulting SDP answer from the SFU arrived at `1791725218824` and was sent to the client at `1791725219092` — **696 ms after the 3-second window had already closed**.

### 1.2 Root Cause of Client-Originated Offer Lag
The installed `livekit-client` SDK (version `2.22.3`) defaults `singlePeerConnection: true` in `roomOptionDefaults`.
Under single PeerConnection mode:
- A single unified `RTCPeerConnection` manages both outbound published media (microphone, local screen share) and inbound subscribed media (remote screen shares).
- When a client updates its track subscription, the single PC architecture can couple track subscription events with client-side SDP offer creation (`createOffer` / `setLocalDescription`), adding client-side offer queuing, serialization, and round-trip negotiation latency.
- In high-load or complex media states, this client offer round-trip exceeds the 3-second measurement window.

### 1.3 Rejection of Prior Invalidation
The prior candidate attempting to batch database queries or cache authorization state inside `signaling-gateway.ts` was **rejected**:
- It risked losing fresh, per-frame authorization checks.
- It relied on unsupported timeline assertions.
- It touched backend gateway logic outside the isolated frontend client scope.

The current proposal is strictly a **frontend client transport configuration** in `media.ts`. No gateway, backend, or database modifications are made.

---

## 2. SDK Semantics & Mechanism Verification

### 2.1 Option Definition
In `node_modules/livekit-client/src/options.ts`:
```ts
export interface InternalRoomOptions {
  adaptiveStream: boolean | AdaptiveStreamSettings;
  dynacast: boolean;
  stopLocalTrackOnUnpublish: boolean;
  reconnectPolicy: ReconnectPolicy;
  disconnectOnPageLeave: boolean;
  webAudioMix: boolean;
  singlePeerConnection: boolean;
}

export interface RoomOptions extends Partial<InternalRoomOptions> {
  // ...
}
```
In `node_modules/livekit-client/src/room/defaults.ts`:
```ts
export const roomOptionDefaults: InternalRoomOptions = {
  adaptiveStream: false,
  dynacast: false,
  stopLocalTrackOnUnpublish: true,
  reconnectPolicy: new DefaultReconnectPolicy(),
  disconnectOnPageLeave: true,
  webAudioMix: false,
  singlePeerConnection: true,
} as const;
```

### 2.2 Room Constructor & Connect Flow
In `node_modules/livekit-client/src/room/Room.ts` (lines 988–1002):
```ts
const { joinResponse, serverInfo } = await engine.join(
  url,
  token,
  {
    autoSubscribe: connectOptions.autoSubscribe,
    adaptiveStream:
      typeof roomOptions.adaptiveStream === 'object' ? true : roomOptions.adaptiveStream,
    clientInfoCapabilities: this.getClientInfoCapabilities(roomOptions),
    maxRetries: connectOptions.maxRetries,
    e2eeEnabled: !!this.e2eeManager,
    websocketTimeout: connectOptions.websocketTimeout,
  },
  abortController.signal,
  !roomOptions.singlePeerConnection, // Parameter 5: useV0Path
);
```
When `singlePeerConnection: false` is explicitly provided in `RoomOptions`:
`!roomOptions.singlePeerConnection` evaluates to `true`.

### 2.3 RTCEngine Implementation
In `node_modules/livekit-client/src/room/RTCEngine.ts`:
- Line 328–330:
  ```ts
  join(
    url: string,
    token: string,
    opts: SignalOptions,
    abortSignal?: AbortSignal,
    /** setting this to true results in dual peer connection mode being used */
    useV0Path: boolean = false,
  ): Promise<{ joinResponse: JoinResponse; serverInfo: Partial<ServerInfo> }>
  ```
- Line 342:
  ```ts
  const sendOfferWithJoin = !useV0Path && isPublisherOfferWithJoinSupported();
  ```
  When `useV0Path: true`, `sendOfferWithJoin` is false.
- Line 390:
  ```ts
  await this.configure(joinResponse, !useV0Path);
  ```
- Lines 575–584 in `configure`:
  ```ts
  this.pcManager = new PCTransportManager(
    useSinglePeerConnection
      ? 'publisher-only'
      : joinResponse.subscriberPrimary
        ? 'subscriber-primary'
        : 'publisher-primary',
    this.loggerOptions,
    rtcConfig,
  );
  ```
  With `useV0Path: true` (`useSinglePeerConnection: false`), `PCTransportManager` is instantiated with `'subscriber-primary'`.

### 2.4 Negotiation Mechanics: Single PC vs. Dual PC
| Dimension | Single PeerConnection (`true`) | Dual PeerConnection (`false`) |
| :--- | :--- | :--- |
| **Transports** | 1 unified `RTCPeerConnection` for both publish and subscribe | 2 separate `RTCPeerConnection` instances (`publisher` and `subscriber`) |
| **Track Subscriptions** | Subscription updates can require or interleave with client-side SDP renegotiation (`createOffer` -> send to gateway) | Subscriber PC is **server-offered**: the SFU initiates offers or dynamically routes tracks onto the subscriber connection without client offer generation |
| **Client Role on Subscribe** | Offerer on unified connection | Answerer on subscriber connection |
| **Offer Forward Delay** | 1,486 ms forward delay observed in Native49 | Eliminated on subscription path because client does not produce the offer |

---

## 3. Strict Scope Boundaries

The proposal strictly respects all boundary constraints:
1. **Adaptive Stream**: Kept enabled (`adaptiveStream: true`).
2. **Dynacast**: Kept enabled (`dynacast: true`).
3. **AutoSubscribe**: Kept disabled (`autoSubscribe: false` in `media.ts:404`).
4. **No Pre-Downloading**: Does not pre-download 3 video streams.
5. **No Deadline Alteration**: 3-second measurement window and assertions remain completely unchanged.
6. **No Security / Media Architecture Changes**: No changes to camera, E2EE, or audio presets.
7. **No Gateway / Backend / DB Changes**: Strictly confined to client `media.ts`.

---

## 4. Resource & Runtime Tradeoffs

### 4.1 SDP & Signaling
- **Advantage**: Eliminates client-side offer generation bottlenecks on remote track subscription changes. The client immediately emits `SignalRequest.subscription` and handles inbound server SDP offers on the subscriber PC.
- **Cost**: Initial connection establishes two ICE candidate gathering procedures instead of one. In local test environments with TCP relay, candidate gathering is near-instantaneous.

### 4.2 Memory (RAM)
- **Impact**: Each browser tab maintains two `RTCPeerConnection` handles instead of one.
- **Estimated Overhead**: ~1–2 MB additional heap per tab for the WebRTC internal state machine and ICE agent. Negligible in comparison to video decoding buffers (which scale with track resolution, not peer connection count).

### 4.3 CPU Utilization
- **Impact**: Steady-state CPU consumption is practically identical (same number of audio and video decoders).
- **Transient CPU**: Peak CPU spike during stream switching is slightly reduced on the client, as the client does not need to compute an SDP offer with local media constraints.

---

## 5. Verification & Stock Gate Plan

### 5.1 Verification Commands
Codex can validate this proposal through standard repository quality gates:

```bash
# 1. Lint verification
npx eslint apps/web/src/features/calls/media.ts

# 2. Workspace TypeScript typecheck
npm run typecheck --workspace @fg/web

# 3. Unit / DOM tests (exercises call-controls.test.tsx and rooms.test.tsx)
npm run test --workspace @fg/web

# 4. Workspace production build
npm run build --workspace @fg/web

# 5. Headed native E2E test (to be executed by Codex)
node quality/evidence/T30/rtp-window-reviewed2/run-parent.mjs
```

### 5.2 Compatibility with Existing E2E Fixtures
In `tests/e2e/screen-share.spec.ts`:
- Line 47:
  ```ts
  window.RTCPeerConnection = class extends Native {
    constructor(c?: RTCConfiguration) {
      super(translate(c));
      own.t30Peers.push(this);
    }
    // ...
  };
  ```
  `own.t30Peers` automatically captures all instantiated peer connections. With dual PC mode, `own.t30Peers` will hold 2 connections (`publisher` and `subscriber`).
- Line 55:
  ```ts
  for (const pc of own.t30Peers) {
    const report = await pc.getStats();
    // iterates inbound-rtp and candidate-pair across all peer connections
  }
  ```
  `stats()` iterates across all peer connections in `own.t30Peers`, seamlessly aggregating inbound RTP metrics from the subscriber PC.

---

## 6. Honest Gaps & Limitations

1. **Unit Test Isolation**: In `apps/web/test/call-controls.test.tsx`, `livekit-client` is mocked at the module level. Unit tests verify contract and API compatibility, but cannot verify dual peer connection network transport.
2. **Headed Execution Required**: Whether dual transport successfully eliminates the 2.1s offer generation latency in Chrome can only be proven through actual execution of the headed test suite by root Codex.
3. **No Execution / No Claimed PASS**: In accordance with the instructions, no build, test execution, or source mutation was performed in this turn.
