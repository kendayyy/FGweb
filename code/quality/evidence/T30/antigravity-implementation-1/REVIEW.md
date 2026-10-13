# FG T30 — Implementation Proposal Review

## 1. Overview
- **Task**: FG T30 — Screen sharing publishing (720p30, max 3 publishers), single selected screen video subscription, stream switching, fallback, and mobile view-only guidance in `apps/web`.
- **Preceding Status**: T29 reviewed PASS. Adopted 19-test suite in `apps/web/test/live-viewer.test.tsx` verified business RED (exit code 1, missing `LiveViewer.js`, documented in `code/quality/evidence/T30/codex-t30-live-red-2.json`).
- **Scope of Proposal**: Complete exact implementation files proposed under `quality/evidence/T30/antigravity-implementation-1/**` for Codex review and adoption. Zero writes to production files, ledger, history, or git in this turn.

---

## 2. Proposed Source Files & Architecture

### `apps/web/src/features/live/LiveViewer.tsx`
- **Capture-First Flow**: `navigator.mediaDevices.getDisplayMedia` invoked synchronously in the click handler tick before any `await`, requesting 720p30 resolution (`1280x720@30fps`).
- **Zero Quota Leak**:
  - Rejection or cancellation of browser capture dialog causes zero claim and zero release.
  - Deferred capture promise unmounting before user resolution stops tracks immediately with zero claim and zero release.
  - 409 `CAPACITY_FULL` stops acquired track immediately, dispatches zero release, and presents 3-slot capacity alert (*"Đã có 3 người chia sẻ màn hình. Giới hạn tối đa là 3 luồng chia sẻ đồng thời trong một nhóm gọi."*).
  - Late claim resolving after unmount stops tracks and dispatches release once with zero local publish.
  - Publish failure after successful claim stops tracks and dispatches release once.
- **Platform & Capability Detection**:
  - Detects mobile platforms (`/Android|iPhone|iPad|iPod|Mobile/i`) to hide the capture button and show view-only guidance (*"Thiết bị di động chỉ hỗ trợ xem luồng chia sẻ và dùng mic, chưa hỗ trợ phát màn hình trực tiếp."*) while preserving viewing and microphone access.
  - Detects unsupported desktop environments (`!getDisplayMedia`) to hide the button and show guidance (*"Trình duyệt này chưa hỗ trợ phát màn hình trực tiếp."*).
  - Responsive narrow desktop viewports (e.g. 360px) retain capture capabilities.
- **Accessible Stream Selector**:
  - `role="tablist"` labeled `"Danh sách luồng phát"`.
  - Individual tabs with `role="tab"`, `aria-selected`, and static participant display names.
  - Zero video elements inside selector tabs (no expensive video previews).
  - WAI-ARIA keyboard navigation: ArrowRight, ArrowLeft, Home, and End keys with active focus retention.
- **Viewing Stage**:
  - `role="region"` labeled `"Màn hình đang xem"`.
  - Contains exactly 1 `<video>` element when a screen stream is active.
  - Standby fallback message when empty (*"Chưa có luồng chia sẻ màn hình nào trong nhóm gọi."*).

### `apps/web/src/features/live/api.ts`
- `claimScreenShare(callId, signal)`: Dispatches `POST /api/v1/calls/:id/screen-share/claim` with `{}` body validated by `CallActionRequestSchema` and parsed by `CallJoinSchema`.
- `releaseScreenShare(callId)`: Dispatches `POST /api/v1/calls/:id/screen-share/release` with `{}` body and `keepalive: true`.

### `apps/web/src/features/live/live.css`
- Responsive 16:9 aspect ratio stage, accessible focus rings, theme-token color integration (`--bg-raised`, `--bg-selected`, `--color-action`, `--text-danger`).

### `apps/web/src/features/live/index.ts`
- Feature barrel exporting `LiveViewer`, `LiveViewerProps`, `claimScreenShare`, and `releaseScreenShare`.

### `apps/web/src/features/calls/media.ts`
- **Room Configuration**: Single Room per media session extended with `adaptiveStream: true` and `dynacast: true`.
- **Audio Preservation**: Remote microphone audio remains auto-subscribed to `audioRoot` regardless of screen stream subscription state.
- **Single Screen Video Subscription**:
  - Synchronous `oldPub.setSubscribed(false)` before `newPub.setSubscribed(true)`.
  - Stale subscription guard: rejects late `TrackSubscribed` events for previously selected tracks.
  - Lifecycle distinction:
    - `TrackUnsubscribed`: Detaches video element from stage but retains publication in selector.
    - `TrackUnpublished`: Deletes publication from map and automatically triggers fallback to remaining active screen or standby.
    - `ParticipantDisconnected`: Cleans all publications for that participant and falls back.
- **Local Screen Publishing**:
  - `publishScreenTrack` publishes track with `source: Track.Source.ScreenShare`.
  - `unpublishScreenTrack` cleans track with `unpublishTrack`.
  - `LocalTrackUnpublished` listener resets local sharing state on moderator stop.

### `apps/web/src/features/calls/CallPanel.tsx`
- Mounts `<LiveViewer callId={active} actorId={actorId} session={media.current} participants={participants} />` in active call stage between people list and call actions.
- Unmounts cleanly on call leave or disconnection, triggering local track and quota release.

### `apps/web/test/live-viewer.test.tsx` (Corrected Test Proposal)
- Resolves all 5 unused mock parameters flagged in `codex-t30-proposal-lint-1.txt` (`unpublishTrack`, `setMicrophoneEnabled`, `connect`).
- Retains all 19 behavioral test cases, assertions, and shared schema fixtures intact.

---

## 3. Transition Checklist for Codex Adoption

| File Target | Action | Verification Check |
|---|---|---|
| `apps/web/src/features/live/api.ts` | Create | Export `claimScreenShare`, `releaseScreenShare` |
| `apps/web/src/features/live/live.css` | Create | Styling for `.fg-live-viewer`, `.fg-live-stage`, `.fg-live-selector` |
| `apps/web/src/features/live/LiveViewer.tsx` | Create | 720p30 capture-first, single video subscription, accessible selector |
| `apps/web/src/features/live/index.ts` | Create | Feature exports |
| `apps/web/src/features/calls/media.ts` | Replace | Single room screen pub/sub, adaptiveStream/dynacast, audio untouched |
| `apps/web/src/features/calls/CallPanel.tsx` | Update | Embed `LiveViewer` in active call stage |
| `apps/web/test/live-viewer.test.tsx` | Update | Clean 0 lint errors, 19 assertions preserved |
