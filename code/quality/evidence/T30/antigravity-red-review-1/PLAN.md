# T30 Architecture & Implementation Plan: LiveViewer & Screen Sharing (Refactored Proposal)

> **Role & Phase**: Antigravity Refactored RED Proposal (Review Round 1).  
> **Status**: PROPOSAL ONLY. No application/test source writes, build/test execution, or ledger modifications in this round.  
> **Supervisor**: Codex reviews, adopts approved RED test, executes RED verification, and gates subsequent implementation.  
> **Location**: Strictly under `code/quality/evidence/T30/antigravity-red-review-1/**`. (All files under `antigravity-red-1` remain preserved).

---

## 1. Scope, Invariants & Architectural Boundaries

1. **Sequential Execution**: Sequential after T29 PASS. T30 is the current task only. No parallel tasks or agents.
2. **Single SFU Room Invariant**: Every active media session has exactly **one** LiveKit `Room` instance. Screen sharing extends this existing Room; no secondary room, parallel media session, or duplicate token connection is ever established.
3. **No Schema or Backend Changes**: Strictly consumes existing T29 backend endpoints and shared contracts (`@fg/contracts`):
   - `POST /api/v1/calls/:id/screen-share/claim` (Empty body `CallActionRequestSchema` -> `CallJoinSchema` / `409 CAPACITY_FULL`)
   - `POST /api/v1/calls/:id/screen-share/release` (Empty body `CallActionRequestSchema` -> `CallControlSuccessSchema`)
   - `POST /api/v1/calls/:id/moderation` (`CallModerationRequestSchema` -> `CallControlSuccessSchema`)
4. **Preserved Invariants**: Microphone publishing, local volume preferences, presence heartbeats, call lifecycle, persistent room/team integrity, sidebar 72px, theme tokens (Dark/Light Smoke), and E2EE chat boundaries remain completely untouched.

---

## 2. Refactored Interface Specifications

### 2.1 LiveViewer Component Interface (`apps/web/src/features/live/LiveViewer.tsx`)

```tsx
import type React from 'react';
import type { CallParticipantDTO } from '@fg/contracts';
import type { MediaSession } from '../calls/media.js';

export interface LiveViewerProps {
  callId: string;
  actorId: string;
  session: MediaSession;
  participants: CallParticipantDTO[];
}

export function LiveViewer(props: LiveViewerProps): React.JSX.Element;
```

**Design Note on Capability Detection**:
- The component does **not** accept an `isMobile` prop. Caller props must not dictate server rights or feature availability.
- Instead, the component/app detects capabilities internally:
  - Mobile platform detection: Inspects user agent (`/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)`).
  - API support: Checks whether `typeof navigator.mediaDevices?.getDisplayMedia === 'function'`.
  - Viewport independence: A narrow viewport on a supported desktop browser (e.g. resized window at 360px) **does not** hide the desktop capture button. Mobile view-only guidance is reserved for actual mobile environments or browsers lacking `getDisplayMedia`.

### 2.2 Extended MediaSession Interface (`apps/web/src/features/calls/media.ts`)

```typescript
import type { CallJoinDTO } from '@fg/contracts';
import type { LocalTrackPublication, ScreenShareCaptureOptions } from 'livekit-client';

export interface ScreenPublisherInfo {
  identity: string; // admission_<UUID> matching CallParticipantSchema
  trackSid: string;
}

export interface MediaSession {
  // Preserved voice methods (existing baseline in calls/media.ts)
  connect(join: CallJoinDTO): Promise<void>;
  requestMicrophone(): Promise<void>;
  setMicrophone(enabled: boolean): Promise<void>;
  setVolume(identity: string, volume: number, muted: boolean): void;
  resumeAudio(): Promise<void>;
  disconnect(): Promise<void>;

  // Extended live screen video methods on the SAME Room instance
  startScreenShare(track?: any, options?: ScreenShareCaptureOptions): Promise<LocalTrackPublication | undefined>;
  stopScreenShare(): Promise<void>;
  isScreenSharing(): boolean;
  selectScreen(identity: string | null, targetElement?: HTMLMediaElement | null): Promise<void>;
  getSelectedScreenIdentity(): string | null;
  onScreenPublishers(listener: (publishers: ScreenPublisherInfo[]) => void): () => void;
  getScreenPublishers(): ScreenPublisherInfo[];
}
```

**Decoupled Publisher Contract**:
- `ScreenPublisherInfo` exposes only `{ identity, trackSid }`. Native LiveKit publication objects are **not** leaked into the UI layer.
- `LiveViewer` maps `identity` to the user's display name and avatar by looking up `participants.find(p => p.mediaIdentity === pub.identity)`.

---

## 3. Production Behavior & Design Decisions

### 3.1 Safe Capture-First Flow & Transient User Activation
- **Transient Activation**: `navigator.mediaDevices.getDisplayMedia({ video: { width: 1280, height: 720, frameRate: 30 } })` must execute **synchronously** in the share button's click event handler tick before any network `await`.
- **Ordering & Quota Safety**:
  1. User clicks "Chia sẻ màn hình" -> `getDisplayMedia` invoked immediately.
  2. **If user cancels / denies capture** (`NotAllowedError`):
     - Handler catches error cleanly.
     - **No claim was dispatched**, so **no release is needed** and no quota is leaked.
     - Button returns to idle "Chia sẻ màn hình".
  3. **If capture succeeds**:
     - Local track is acquired.
     - Dispatch `POST /api/v1/calls/:id/screen-share/claim`.
  4. **If claim is rejected** (409 `CAPACITY_FULL` — 4th publisher):
     - Acquired track is stopped immediately via `track.stop()`.
     - Server never granted a slot, so no release is dispatched.
     - Display clear Vietnamese alert: *"Đã có 3 người chia sẻ màn hình. Giới hạn tối đa là 3 luồng chia sẻ đồng thời trong một nhóm gọi."*
  5. **If claim succeeds** (201 `CallJoinDTO`):
     - Publish track to LiveKit room via `session.startScreenShare(track)`.
     - If publishing fails: stop track immediately and dispatch `POST .../screen-share/release` **once**.
  6. **Late claim response after unmount**:
     - If component unmounts while HTTP claim is in-flight:
     - When claim resolves 201, cleanup logic detects unmounted state, stops track, and dispatches release **once**. Never publishes to dead room.

### 3.2 Single Video Subscription & Synchronous SDK Semantics
- **Subscription Rule**: In LiveKit client SDK, `RemoteTrackPublication.setSubscribed(subscribed: boolean)` is synchronous.
- **Switching Sequence**:
  - When switching from Stream A to Stream B:
    1. Call `streamA.setSubscribed(false)`.
    2. Detach old track element.
    3. Call `streamB.setSubscribed(true)`.
    4. Attach new track element to the main stage `<video>`.
  - Guard against late `TrackSubscribed` events: If a delayed `TrackSubscribed` event arrives for a previously unselected track, `MediaSession` verifies that the participant identity matches `currentSelectedScreen` before attaching.
- **Static Selector Tiles**: Stream selector tiles contain names from `participants`, icons, and active indicators. **No simultaneous video preview elements** are created.

### 3.3 Ended Stream Fallback
- When the currently selected stream ends (`TrackUnsubscribed` or `ParticipantDisconnected`):
  - Automatically falls back to the next remaining publisher in `session.getScreenPublishers()`.
  - If no streams remain, transitions to empty standby state (*"Chưa có luồng chia sẻ màn hình nào trong nhóm gọi."*).

### 3.4 Platform Guidance & Viewport Independence
- **Mobile Browsers**:
  - Capture button hidden.
  - View-only notice rendered: *"Thiết bị di động chỉ hỗ trợ xem luồng chia sẻ và dùng mic, chưa hỗ trợ phát màn hình trực tiếp."*
  - Remote stream viewing and microphone participation remain fully functional.
- **Unsupported Desktop Browsers**:
  - If `getDisplayMedia` is unavailable, capture button hidden and notice displayed: *"Trình duyệt hiện tại chưa hỗ trợ phát màn hình trực tiếp."*
- **Narrow Desktop Viewport**:
  - Desktop browsers resized to mobile widths (e.g. 360px) retain the desktop "Chia sẻ màn hình" button. CSS width alone does not disable desktop capture capabilities.

### 3.5 Native Events & Teardown Integrity
- **Native Browser Floating Bar Stop (`track.onended`)**:
  - When user stops capture via the browser UI, `track.onended` dispatches release and resets button.
- **Moderator Stop (`LocalTrackUnpublished`)**:
  - When moderator stops user's screen share, session detects local track removal, resets state, and dispatches release.
- **Call Leave / Route Change**:
  - Unmount cleans up local tracks, dispatches release once, and disconnects LiveKit room.
  - Persistent room (`/rooms/:id/leave`), roster, and play session remain untouched.
- **Independent Audio**:
  - Remote audio tracks are auto-subscribed on `audioRoot` regardless of screen video subscription state.

### 3.6 Keyboard Navigation & Accessibility
- `role="tablist"` with `aria-label="Danh sách luồng phát"`.
- Each stream button has `role="tab"` and `aria-selected`.
- Keyboard navigation:
  - `ArrowRight` / `ArrowDown`: Moves focus and selection to next tab.
  - `ArrowLeft` / `ArrowUp`: Moves focus and selection to previous tab.
  - `Home`: Moves focus and selection to first tab.
  - `End`: Moves focus and selection to last tab.
- Main stage has `role="region"` with `aria-label="Màn hình đang xem"`.
- Action buttons have `aria-label` and `aria-pressed`.

---

## 4. Planned Source Transitions (Future Implementation Targets)

| Target File | Responsibility | Scope |
|-------------|----------------|-------|
| `apps/web/test/live-viewer.test.tsx` | Comprehensive Vitest DOM test suite | Adopted from this proposal |
| `apps/web/src/features/live/LiveViewer.tsx` | Stream selector, 16:9 stage, capture-first controls, a11y keyboard | New component (~130 LOC) |
| `apps/web/src/features/live/live.css` | Styling tokens, 16:9 ratio, selector layout, 44px hit targets | New stylesheet (~50 LOC) |
| `apps/web/src/features/live/index.ts` | Module export barrel | New export barrel |
| `apps/web/src/features/calls/media.ts` | Extend `createMediaSession` with single room binding, screen video pub/sub tracking, dynacast/adaptiveStream | Extended existing module (~35 LOC) |
| `apps/web/src/features/calls/api.ts` | Add `claimScreenShare` and `releaseScreenShare` client helpers | Extended existing module (~10 LOC) |
| `apps/web/src/features/calls/CallPanel.tsx` | Embed `<LiveViewer>` in active call stage above people list | Extended existing module (~15 LOC) |

---

## 5. Downstream Verification & Risks

1. **Real Native SFU E2E Test (`tests/e2e/screen-share.spec.ts`)**:
   - The DOM test suite exercises real `createMediaSession` and `LiveViewer` with a mocked transport boundary.
   - Acceptance strictly requires real Chromium/WebKit headed multi-stream capture and switching against the local LiveKit SFU with actual packet subscriptions measured.
2. **Audio Prioritization Under Network Shaping (T41)**:
   - Single-video subscription design ensures video can dynamically downscale via dynacast without compromising audio quality (audio packet loss < 2%).
