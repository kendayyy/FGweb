# FG T30 — Implementation Review 1 Refinements

## 1. Overview
- **Task**: FG T30 — Screen sharing publishing (720p30, optional audio, max 3 publishers), single selected screen video subscription, stream switching, fallback, and mobile view-only guidance in `apps/web`.
- **Review Round**: Implementation Proposal 2 (`antigravity-implementation-review-1`), addressing all 10 findings from Codex review.
- **Scope**: All refined files authored strictly under `quality/evidence/T30/antigravity-implementation-review-1/**`. Zero writes to repository app sources, test sources, `tasks.json`, `.doc/history.md`, `.env`, or git in this round.

---

## 2. Detailed Findings & Resolution

### Finding 1: Awaiting Local SCREEN Permission from SFU
- **Issue**: Previously, `publishScreenTrack` called `publishTrack` immediately after HTTP claim, but native LiveKit `LocalParticipant.publish` checks current SFU permissions snapshot (`canPublishSources`).
- **Resolution**:
  - Implemented `awaitScreenPublishPermission(timeoutMs = 5000)` in `media.ts`.
  - Checks current snapshot: if `room.localParticipant.permissions` already allows `Track.Source.ScreenShare` (via proto source ID 3), resolves synchronously.
  - Otherwise, listens to `RoomEvent.ParticipantPermissionsChanged` until permission update arrives from SFU.
  - Bounded with a 5000ms timeout and abort/disconnect cleanup.

### Finding 2: Optional System Audio Capture & Publication
- **Issue**: `getDisplayMedia` lacked optional audio capture and publication as `SCREEN_SHARE_AUDIO`.
- **Resolution**:
  - `LiveViewer.tsx` requests `{ video: { width: 1280, height: 720, frameRate: 30 }, audio: true }`.
  - If the user shares system audio, `stream.getAudioTracks()[0]` is passed to `session.publishScreenTracks(videoTrack, audioTrack)`.
  - Published with `source: Track.Source.ScreenShareAudio` and `audioPreset: AudioPresets.music`.
  - Local preview is muted (preventing local audio feedback/echo).
  - Microphone audio remains completely separate on `Track.Source.Microphone`.
  - Atomic publication: if audio publishing fails after video succeeds, `unpublishTrack(videoTrack)` is called to roll back, stopping all tracks and releasing quota once.

### Finding 3: Local Publisher Preview & Selector Entry
- **Issue**: Local publisher had no entry in `getScreenPublishers()`, preventing local preview.
- **Resolution**:
  - `media.ts` includes the local publication in `getScreenPublishers()` with `{ identity: localParticipant.identity, trackSid: 'local-screen', isLocal: true }`.
  - When selected, the local `MediaStreamTrack` is attached to the stage inside a muted `<video>` element.
  - Does NOT invoke `setSubscribed(true)` or create a second room.
  - Cleaned up on native `ended`, `LocalTrackUnpublished`, or permission revoke.

### Finding 4: Capture Reentrancy, In-Flight Ownership & Race Conditions
- **Issue**: Button remained clickable during async capture/claim; double clicks could leak leases; track ended while claim pending published a stopped video; unmount could double-release.
- **Resolution**:
  - Added synchronous `inFlightRef` and `busy` state immediately upon click, dropping duplicate clicks.
  - Added generation guard (`operationIdRef`) ensuring async resolutions only apply to the current active operation.
  - Wrapped `navigator.mediaDevices.getDisplayMedia` in synchronous `try / catch`.
  - Added `videoTrack.readyState === 'ended'` check when HTTP claim finishes: if user canceled sharing before claim completed, tracks are stopped, quota is released immediately, and stopped track is never published.
  - Idempotent `stopSharing` ensures quota is released exactly once.
  - Distinguishes active user stop (reports release errors to UI) vs unmount teardown (best-effort release without setting state on unmounted component).

### Finding 5: Strict Remote Filtering, Idempotent Attachment & Pure React State
- **Issue**: Remote publication check used `||` (allowing cameras); `setSubscribed(true)` plus manual attach created duplicate `<video>` elements; state updater had media side effects.
- **Resolution**:
  - Filter enforces `publication.kind === Track.Kind.Video && (publication.source === Track.Source.ScreenShare || publication.source === 'screen_share')`, excluding camera tracks.
  - Idempotent attachment: `attachVideoTrack` verifies `attachedTrackSid === sid` and container presence; duplicate `TrackSubscribed` events for the same track do not create extra `<video>` elements.
  - Stale `TrackSubscribed` events for non-selected tracks explicitly call `publication.setSubscribed(false)` and do not attach.
  - React state updaters are pure: media side-effects (`session.selectScreen`) execute outside `setSelectedSid`.

### Finding 6: Local Track Wrapper Mapping & Moderator Stop
- **Issue**: `LocalTrackUnpublished` provides a track publication wrapper, not raw `MediaStreamTrack`.
- **Resolution**:
  - Matched by `pub.source === Track.Source.ScreenShare`, `pub.track === localVideoTrack`, or `pub.trackSid === localVideoPub?.trackSid`.
  - Listens to `RoomEvent.ParticipantPermissionsChanged`: if server revokes screen sharing permission, local capture is stopped and quota released.
  - Explicit `stopSharing` clears `hasClaimedRef` before calling unpublish, preventing recursive double-release.

### Finding 7: iPad Desktop UA + Multi-Touch Detection
- **Issue**: Modern iPadOS Safari reports a desktop Mac user-agent (`MacIntel`).
- **Resolution**:
  - Added `navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1` detection in `isMobileOrTablet()`.
  - Hides capture button and displays view-only guidance (*"Thiết bị di động chỉ hỗ trợ xem luồng chia sẻ và dùng mic, chưa hỗ trợ phát màn hình trực tiếp."*).
  - Does not treat narrow desktop viewports (e.g. 360px on Windows/macOS) as mobile.

### Finding 8: Accessible CSS, Semantic Tokens & Single-Row Overflow
- **Issue**: `min-height` broke 16:9 aspect ratio at narrow width; selector wrapped vertically; hex fallbacks were used.
- **Resolution**:
  - Replaced min-height with pure `aspect-ratio: 16 / 9`.
  - `.fg-live-selector` uses `flex-wrap: nowrap; overflow-x: auto; padding: 4px;` with horizontal scrolling.
  - Tabs have `min-height: 44px; min-width: 44px;` touch targets and visible unclipped `outline: 2px solid var(--color-focus)`.
  - All hex colors removed in favor of standard FG CSS variables (`var(--bg-raised)`, `var(--border-color)`, `var(--bg-selected)`, `var(--color-action)`, etc.).
  - Added `@media (prefers-reduced-motion: reduce) { .fg-live-tab { transition: none; } }`.
  - Unique IDs per viewer instance (`live-stage-${callId}`, `live-tab-${callId}-${sid}`).

### Finding 9: CallPanel Byte-Equivalence
- **Issue**: Proposed `CallPanel.tsx` reformatted entire file.
- **Resolution**:
  - Replaced with proposal based directly on original repository `CallPanel.tsx`.
  - Keeps compact format byte-equivalent, adding only `import {LiveViewer}` and mounting `<LiveViewer .../>` in `fg-call-stage`.

### Finding 10: CallControlSuccessSchema Validation in API
- **Issue**: `releaseScreenShare` did not validate `CallControlSuccessSchema` response.
- **Resolution**:
  - `releaseScreenShare` validates `CallControlSuccessSchema.parse(await response.json())` (`{ success: true }`).
  - Maintains `credentials: 'include'`, `keepalive: true`, and empty `{}` body.

---

## 3. Test Suite Enhancements (`live-viewer.test.tsx`)
- **Preserved**: All 19 original test cases and assertions intact.
- **Lint Cleanup**: Cleaned 5 unused mock parameters (`unpublishTrack`, `setMicrophoneEnabled`, `connect`).
- **Accurate SDK Mock Transport**: Added `permissions`, `LocalTrackPublished`, `ParticipantPermissionsChanged`, `ScreenSharePresets`, and `AudioPresets`.
- **Added 5 Focused Test Cases**:
  1. *Test 20*: In-flight double click drops duplicate capture/claim.
  2. *Test 21*: Track ended while HTTP claim is pending stops track, releases slot, does not publish.
  3. *Test 22*: Permission revoke via `ParticipantPermissionsChanged` stops local capture and releases quota once.
  4. *Test 23*: Idempotent attachment: repeat selection does not create duplicate video elements.
  5. *Test 24*: iPadOS detection (`MacIntel` + `maxTouchPoints: 5`) is view-only.

---

## 4. File Manifest for Codex Adoption

| File Path in `quality/evidence/T30/antigravity-implementation-review-1/` | Target in `code/` |
|---|---|
| `apps/web/src/features/live/api.ts` | `apps/web/src/features/live/api.ts` |
| `apps/web/src/features/live/live.css` | `apps/web/src/features/live/live.css` |
| `apps/web/src/features/live/LiveViewer.tsx` | `apps/web/src/features/live/LiveViewer.tsx` |
| `apps/web/src/features/live/index.ts` | `apps/web/src/features/live/index.ts` |
| `apps/web/src/features/calls/media.ts` | `apps/web/src/features/calls/media.ts` |
| `apps/web/src/features/calls/CallPanel.tsx` | `apps/web/src/features/calls/CallPanel.tsx` |
| `apps/web/test/live-viewer.test.tsx` | `apps/web/test/live-viewer.test.tsx` |
