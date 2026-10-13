# T30 Refined Architecture & Implementation Plan: LiveViewer & Screen Sharing

> **Role & Phase**: Antigravity Final Refined RED Proposal (`antigravity-red-refine-1`).  
> **Status**: PROPOSAL ONLY. No application/test source writes outside proposal, no test/build/UI execution, no ledger/env/history writes in this round.  
> **Supervisor**: Codex reviews, adopts approved RED test into `apps/web/test/live-viewer.test.tsx`, runs RED verification, then Antigravity implements in this same conversation.  
> **Location**: Strictly under `code/quality/evidence/T30/antigravity-red-refine-1/**`. (All prior files in `antigravity-red-1` and `antigravity-red-review-1` remain preserved).

---

## 1. Scope, Invariants & Architectural Boundaries

1. **Sequential Execution**: T30 is the active checkpoint, sequential after T29 PASS.
2. **Single SFU Room Invariant**: Every active media session has exactly **one** LiveKit `Room` instance. Screen sharing extends this existing Room; no duplicate room or parallel session is created.
3. **Strict Reuse of T29 Contracts**:
   - `POST /api/v1/calls/:id/screen-share/claim` (Empty body `CallActionRequestSchema` -> `CallJoinSchema` / `409 CAPACITY_FULL`)
   - `POST /api/v1/calls/:id/screen-share/release` (Empty body `CallActionRequestSchema` -> `CallControlSuccessSchema`)
   - `POST /api/v1/calls/:id/moderation` (`CallModerationRequestSchema` -> `CallControlSuccessSchema`)
4. **Preserved Invariants**: Microphone publishing, local volume adjustments, presence heartbeats, call lifecycle, persistent room/team integrity, sidebar 72px, theme tokens (Dark/Light Smoke), and E2EE chat boundaries remain completely untouched.

---

## 2. Refined Interface Specifications

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

**Internal Capability Detection**:
- No caller `isMobile` prop. The component detects platform capabilities internally:
  - Mobile platform: `/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)` -> hides capture button, renders mobile view-only guidance (*"Thiết bị di động chỉ hỗ trợ xem luồng chia sẻ và dùng mic, chưa hỗ trợ phát màn hình trực tiếp."*).
  - Unsupported desktop: `typeof navigator.mediaDevices?.getDisplayMedia !== 'function'` -> hides capture button, renders unsupported notice (*"Trình duyệt hiện tại chưa hỗ trợ phát màn hình trực tiếp."*).
  - Narrow desktop viewport: Desktop browser resized to narrow width (e.g. 360px) retains desktop capture capability.

### 2.2 Extended MediaSession Interface (`apps/web/src/features/calls/media.ts`)

```typescript
import type { CallJoinDTO } from '@fg/contracts';
import type { LocalTrackPublication, ScreenShareCaptureOptions } from 'livekit-client';

export interface ScreenPublisherInfo {
  identity: string; // admission_<UUID> matching CallParticipantSchema.mediaIdentity
  trackSid: string;
}

export interface MediaSession {
  // Preserved voice baseline in calls/media.ts
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

**Clean Abstraction**:
- `ScreenPublisherInfo` exposes only `{ identity, trackSid }`. Native SDK publication objects are not leaked into the UI.
- UI looks up participant metadata (`displayName`, `avatarUrl`) from `participants.find(p => p.mediaIdentity === pub.identity)`.

---

## 3. Production Behavior & Design Decisions

### 3.1 Safe Capture-First Flow & Quota Ownership
- **Synchronous Invocation**: `navigator.mediaDevices.getDisplayMedia(...)` executes synchronously in the click handler tick before any network `await`, preserving the browser's transient user activation token.
- **Fail-Closed Quota Lifecycle**:
  1. Click "Chia sẻ màn hình" -> prompt browser capture.
  2. **If capture denied / canceled (`NotAllowedError`)**: Zero claims sent, zero releases needed. No quota leaked.
  3. **If unmounted before capture resolves**: Late resolved stream is stopped immediately via `track.stop()`. Zero claim, zero release.
  4. **If capture succeeds**: Dispatch `POST /api/v1/calls/:id/screen-share/claim`.
  5. **If claim rejected (409 CAPACITY_FULL)**: Captured track stopped immediately via `track.stop()`. No release needed (slot was never granted). Show 3-slot capacity alert.
  6. **If publish fails after successful claim**: Captured track stopped immediately, release dispatched **once**.
  7. **If claim resolves late after unmount**: Detect unmounted state, captured track stopped, release dispatched **once**. Never publish to dead room.

### 3.2 Single Video Subscription & Synchronous SDK Semantics
- In LiveKit client SDK, `RemoteTrackPublication.setSubscribed(subscribed: boolean)` is synchronous.
- When switching from Stream A to Stream B:
  1. Synchronous `streamA.setSubscribed(false)`.
  2. Detach old video element.
  3. Synchronous `streamB.setSubscribed(true)`.
  4. Attach new video element to 16:9 stage.
- Guard against stale events: If delayed `TrackSubscribed` event arrives for unselected stream, session verifies identity matches `currentSelectedScreen` before attaching.
- Selector displays static metadata (participant display name, avatar, screen icon) and zero `<video>` elements.

### 3.3 Remote Stream Lifecycle: `TrackUnpublished` vs `TrackUnsubscribed`
- `TrackUnsubscribed`: Occurs during normal switching or local mute. Detaches video element, but **does NOT remove the publisher from the selector**. Both publisher choices remain available.
- `TrackUnpublished`: Remote publisher terminates their screen share. Publication deleted from `peer.trackPublications`, publisher removed from `ScreenPublisherInfo` list. Triggers automatic fallback to remaining publisher, or empty standby state (*"Chưa có luồng chia sẻ màn hình nào trong nhóm gọi."*).
- `ParticipantDisconnected`: Removes all publications for that participant and triggers fallback.

### 3.4 Native Events & Teardown
- Native floating bar stop (`track.onended`): Dispatches release and resets button.
- Moderator stop (`LocalTrackUnpublished`): Resets local state, dispatches release.
- Leave / route change: Stops local tracks, dispatches release once, disconnects room. Persistent room (`/rooms/:id/leave`), team roster, and play session remain untouched.
- Audio independence: Remote audio tracks on `audioRoot` remain auto-subscribed regardless of screen video switching or unpublishing.

### 3.5 Keyboard Navigation & Accessibility
- `role="tablist"` with `aria-label="Danh sách luồng phát"`.
- Each stream button has `role="tab"` and `aria-selected`.
- Keyboard navigation: `ArrowRight` / `ArrowDown` (next), `ArrowLeft` / `ArrowUp` (prev), `Home` (first), `End` (last) with active element focus and selection updates.
- Stage has `role="region"` with `aria-label="Màn hình đang xem"`.

---

## 4. Planned Source Transitions (For Implementation Phase)

| Target File | Responsibility |
|-------------|----------------|
| `apps/web/test/live-viewer.test.tsx` | Vitest DOM test suite adopted from this proposal |
| `apps/web/src/features/live/LiveViewer.tsx` | Stream selector, 16:9 stage, capture-first controls, a11y keyboard (~130 LOC) |
| `apps/web/src/features/live/live.css` | Styling tokens, 16:9 ratio, selector layout, 44px hit targets (~50 LOC) |
| `apps/web/src/features/live/index.ts` | Module export barrel (~5 LOC) |
| `apps/web/src/features/calls/media.ts` | Extend `createMediaSession` with single room binding, screen video pub/sub tracking, dynacast/adaptiveStream (~35 LOC) |
| `apps/web/src/features/calls/api.ts` | Add `claimScreenShare` and `releaseScreenShare` client helpers (~10 LOC) |
| `apps/web/src/features/calls/CallPanel.tsx` | Embed `<LiveViewer>` in active call stage above people list (~15 LOC) |

---

## 5. Downstream Verification & Risks

1. **Native SFU E2E (`tests/e2e/screen-share.spec.ts`)**:
   - Real Chromium/WebKit headed multi-stream capture and switching against local LiveKit SFU with actual packet subscriptions measured.
2. **Audio Prioritization Under Network Shaping (T41)**:
   - Single-video subscription design ensures video can dynamically downscale via dynacast without compromising audio quality (audio packet loss < 2%).
