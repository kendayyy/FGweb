# T30 Architecture & Implementation Plan: LiveViewer & Screen Sharing

> **Role & Phase**: Antigravity First RED Proposal Round (Design & Test Proposal only).  
> **Status**: PROPOSAL ONLY. No application/test source writes, build/test execution, or ledger modifications in this round.  
> **Supervisor**: Codex reviews, adopts approved RED test, executes RED verification, and gates subsequent implementation.

---

## 1. Scope & Invariants

1. **Sequential Execution**: Sequential after T29 PASS. T30 is the active checkpoint. No parallel agents or tasks.
2. **Write Scope**: Strictly constrained in this round to `code/quality/evidence/T30/antigravity-red-1/**`.
3. **No Schema or Contract Changes**: Strictly consumes existing T29 backend endpoints and shared contracts (`@fg/contracts`):
   - `POST /api/v1/calls/:id/screen-share/claim` (Empty body `CallActionRequestSchema` -> `CallJoinSchema` / `409 CAPACITY_FULL`)
   - `POST /api/v1/calls/:id/screen-share/release` (Empty body `CallActionRequestSchema` -> `CallControlSuccessSchema`)
   - `POST /api/v1/calls/:id/moderation` (`CallModerationRequestSchema` -> `CallControlSuccessSchema`)
4. **Single SFU Room Invariant**: Every active call has exactly one LiveKit `Room` per media session. Screen sharing extends this existing Room; no second room or duplicate connection is ever created.
5. **Preserved Invariants**: Microphone, local volume adjustments, presence heartbeats, call lifecycle, persistent room/team integrity, sidebar 72px, theme tokens (Dark/Light Smoke), and E2EE chat boundaries remain completely unaffected.

---

## 2. Interface Specifications

### 2.1 LiveViewer Component Interface (`apps/web/src/features/live/LiveViewer.tsx`)

```tsx
export interface LiveViewerProps {
  callId: string;
  actorId: string;
  session: MediaSession;
  participants: CallParticipantDTO[];
  isMobile?: boolean; // optional override; defaults to browser feature detection
}

export function LiveViewer(props: LiveViewerProps): React.JSX.Element;
```

**Props Semantics**:
- `callId`: Current active call group identifier.
- `actorId`: Authenticated user ID (viewer or publisher).
- `session`: Active `MediaSession` managing the LiveKit `Room`.
- `participants`: Live participant list from the call, providing display names, avatars, and moderation states.
- `isMobile`: Flag indicating whether screen capture is supported on the client platform.

### 2.2 Extended MediaSession Interface (`apps/web/src/features/calls/media.ts`)

```typescript
export interface ScreenPublisherInfo {
  identity: string; // LiveKit admission identity (e.g., 'admission_...')
  userId?: string;  // Mapped user ID from call participants
  displayName: string;
  publication: RemoteTrackPublication;
}

export interface MediaSession {
  // Existing voice capabilities (preserved unmodified)
  connect(join: CallJoinDTO): Promise<void>;
  requestMicrophone(): Promise<void>;
  setMicrophone(enabled: boolean): Promise<void>;
  setVolume(identity: string, volume: number, muted: boolean): void;
  resumeAudio(): Promise<void>;
  disconnect(): Promise<void>;

  // Extended screen sharing & live video capabilities on the SAME Room
  startScreenShare(options?: ScreenShareCaptureOptions): Promise<LocalTrackPublication | undefined>;
  stopScreenShare(): Promise<void>;
  isScreenSharing(): boolean;
  selectScreen(identity: string | null, targetElement?: HTMLMediaElement | null): Promise<void>;
  getSelectedScreenIdentity(): string | null;
  onScreenPublishers(listener: (publishers: ScreenPublisherInfo[]) => void): () => void;
  getScreenPublishers(): ScreenPublisherInfo[];
}
```

### 2.3 Frontend API Helper Additions (`apps/web/src/features/calls/api.ts`)

```typescript
import {
  CallJoinSchema,
  CallControlSuccessSchema,
  type CallJoinDTO,
  type CallControlSuccess
} from '@fg/contracts';

export const claimScreenShare = (callId: string): Promise<CallJoinDTO> =>
  request(`calls/${encodeURIComponent(callId)}/screen-share/claim`, CallJoinSchema, 'POST', {});

export const releaseScreenShare = (callId: string): Promise<CallControlSuccess> =>
  request(`calls/${encodeURIComponent(callId)}/screen-share/release`, CallControlSuccessSchema, 'POST', {});
```

---

## 3. Production Behavior & Design Decisions

### 3.1 Transient User Activation & Capture Ordering
- **Problem**: Modern browsers (Chromium, WebKit, Gecko) require transient user activation for `navigator.mediaDevices.getDisplayMedia(...)`. Making an asynchronous network request (`await claimScreenShare()`) before `getDisplayMedia` consumes or expires the activation token, causing `NotAllowedError`.
- **Solution**:
  1. User clicks the "Chia sẻ màn hình" button.
  2. `getDisplayMedia({ video: { width: 1280, height: 720, frameRate: 30 } })` is called **synchronously** in the click handler's execution tick.
  3. Once media stream is obtained, `claimScreenShare(callId)` is dispatched to reserve the slot.
  4. If `claimScreenShare` fails (e.g., 409 `CAPACITY_FULL` or 403 restriction), the acquired tracks are immediately stopped via `track.stop()`, slot cleanup is sent, and an alert is shown to the user.
  5. If the user cancels the browser capture dialog (`NotAllowedError`), any pending claim is released, acquired tracks are stopped, and the UI resets smoothly without entering an error loop.

### 3.2 Single Video Subscription with Strict Unsubscribe-Before-Subscribe
- **Bandwidth & CPU Invariant**: A viewer consumes normal call audio from all participants, but **only ONE selected screen video stream** at any time.
- **Switching Protocol**:
  1. When switching from Stream A to Stream B, the client **must await `streamA.setSubscribed(false)`** before calling `streamB.setSubscribed(true)`.
  2. Stream selector tiles display static information: publisher display name, avatar/initial, and a screen icon. **No simultaneous video preview/thumbnail decoding** is performed in the selector.
  3. Main stage is a responsive 16:9 container (`aspect-video`) hosting the single active `<video>` element.

### 3.3 Ended Stream Fallback
- When the currently selected publisher ends their share (or leaves the call):
  1. The unpublish/participant disconnect event is detected.
  2. If other active screen publishers exist in the call, the viewer automatically falls back to the next available publisher.
  3. If no screen shares remain, the stage transitions to an empty standby state ("Chưa có luồng chia sẻ màn hình nào trong nhóm gọi.").

### 3.4 Fourth Publisher & Three Screen Slots Limit
- The server enforces a maximum of 3 concurrent screen publishers per call group.
- When a 4th publisher attempts to share:
  1. Backend returns `409 CAPACITY_FULL` with message `'Screen publisher limit is three'`.
  2. Acquired screen track is stopped immediately.
  3. Quota release is dispatched.
  4. User is shown a clear Vietnamese explanation: *"Đã có 3 người chia sẻ màn hình. Giới hạn tối đa là 3 luồng chia sẻ đồng thời trong một nhóm gọi."*

### 3.5 Mobile & Unsupported Devices
- On mobile browsers (or when `navigator.mediaDevices?.getDisplayMedia` is unavailable):
  1. The "Chia sẻ màn hình" button is hidden.
  2. A clear view-only notice is displayed: *"Thiết bị di động chỉ hỗ trợ xem màn hình và dùng mic, chưa hỗ trợ phát màn hình trực tiếp."*
  3. Mobile viewers retain full capability to view shared desktop screens and participate in voice audio.

### 3.6 Teardown & Lifecycle Integrity
- When the user leaves the call, changes routes, or the component unmounts:
  1. Any local screen track is stopped (`track.stop()`).
  2. `POST /api/v1/calls/:id/screen-share/release` is called.
  3. Media session disconnects from LiveKit SFU.
  4. The persistent room, group chat, and roster remain intact (no calls to room departure or play session termination).
- Native browser "Stop sharing" button (`track.onended` event):
  - Automatically triggers `releaseScreenShare` and resets UI button to "Chia sẻ màn hình".

### 3.7 Room Options: Adaptive Stream & Dynacast
- Room is initialized with:
  ```typescript
  new Room({
    webAudioMix: false,
    adaptiveStream: true,
    dynacast: true,
  });
  ```
- Dynacast pauses video layers not currently consumed by any subscriber, minimizing server egress and client CPU usage. Adaptive stream optimizes resolution to the attached viewport size.

---

## 4. Planned Source Transitions (Future Implementation Targets)

| Target Path | Responsibility | Scope |
|-------------|----------------|-------|
| `apps/web/test/live-viewer.test.tsx` | Comprehensive Vitest DOM test suite | Adopted directly from this proposal |
| `apps/web/src/features/live/LiveViewer.tsx` | React UI component for stream selection, stage, and capture controls | New component (~120 LOC) |
| `apps/web/src/features/live/live.css` | Styling tokens, 16:9 ratio, selector layout, 44px hit targets | New stylesheet (~50 LOC) |
| `apps/web/src/features/live/index.ts` | Module re-exports | New export barrel |
| `apps/web/src/features/calls/media.ts` | Extend `createMediaSession` with screen share methods & single room binding | Extended existing module (~30 LOC) |
| `apps/web/src/features/calls/api.ts` | Add `claimScreenShare` and `releaseScreenShare` client helpers | Extended existing module (~10 LOC) |
| `apps/web/src/features/calls/CallPanel.tsx` | Embed `<LiveViewer>` within the active call stage | Extended existing module (~15 LOC) |

---

## 5. Downstream Verification & Risks

1. **Native LiveKit SFU E2E Requirement (`tests/e2e/screen-share.spec.ts`)**:
   - DOM tests substitute SDK transport via mock Room.
   - Acceptance strictly requires real Chromium/WebKit headed multi-stream capture and switching against the local LiveKit SFU with actual packet subscriptions measured.
2. **Browser Transient Activation Edge Cases**:
   - Different browser engines handle display surface selection differently. Tests verify constraints defaults (720p30) and cancellation handling.
3. **Audio Priority Under Network Shaping**:
   - In T41 load tests, video quality will degrade adaptively to ensure audio packet loss remains under 2%. The single-video subscription design is foundational to preserving this bandwidth budget.
