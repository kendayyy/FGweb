# FG T30 — Implementation Refinement Review 3 (`antigravity-implementation-refine-1`)

## 1. Overview
- **Task**: FG T30 — Frontend Screen Sharing & Live Viewing in `apps/web` (720p30, optional system audio, max 3 publishers, single selected screen video subscription, stream switching, fallback, and mobile view-only guidance).
- **Process & Context**: Sequential proposal round 3 addressing Codex review findings A through F.
- **Constraints Applied**:
  - Full exact proposals authored exclusively under `code/quality/evidence/T30/antigravity-implementation-refine-1/**`.
  - Zero writes to actual `apps/web/...` source or test files.
  - Zero writes to `tasks.json`, `.doc/history.md`, `.env`, checker scripts, or git.
  - Zero test, build, lint, UI, or browser command executions in this proposal round.
  - All prior proposal files in `antigravity-red-1/`, `antigravity-red-review-1/`, `antigravity-red-refine-1/`, `antigravity-implementation-1/`, and `antigravity-implementation-review-1/` preserved unchanged.

---

## 2. Resolution of Critical Findings A through F

### Finding A: Authoritative Selection & Pure State Updates
- **Problem**: `onScreenPublishers` previously used `setSelectedSid((current) => { ... })` and immediately called `session.selectScreen(targetSid)`. Because React state updates can be deferred or batched, `targetSid` in the outer closure was either stale or null, leading to desynchronized media selection and impure updater side-effects.
- **Solution in `LiveViewer.tsx`**:
  - Introduced authoritative `selectedSidRef.current: React.MutableRefObject<string | null>`.
  - In `onScreenPublishers`, next selection is determined synchronously using `selectedSidRef.current` and the incoming list of publishers.
  - Writes `selectedSidRef.current = nextSid`, calls pure `setSelectedSid(nextSid)`, and calls `session.selectScreen(nextSid)` exactly once outside any state updater.
  - User tab clicks in `handleSelect` and initial mounting synchronize through the same `selectedSidRef.current`.

### Finding B: Unified Single `ShareOperation` Lifecycle & In-Flight Ownership
- **Problem**: Loose refs (`hasClaimed`, `capturedStream`, `isBusy`) allowed race conditions between capture prompt, HTTP claim, native publication, stop sharing, and unmount. Old catch/finally handlers could release a new stream or permit concurrent captures.
- **Solution in `LiveViewer.tsx`**:
  - Encapsulated share operations into a single immutable record type `ShareOperation`:
    ```ts
    interface ShareOperation {
      id: number;
      stream: MediaStream;
      claimed: boolean;
      cancelled: boolean;
      settled: boolean;
      startSettledPromise: Promise<void>;
      resolveStartSettled: () => void;
      cleanupPromise: Promise<void> | null;
      cleanup: () => Promise<void>;
      abortController: AbortController;
    }
    ```
  - `currentOperationRef.current` holds the active operation.
  - Click handler synchronously captures `navigator.mediaDevices.getDisplayMedia` in a `try/catch` block before any `await`. If the browser throws synchronously, it is caught immediately without unhandled rejection.
  - If unmounted or cancelled while capture is pending, the late resolved stream is stopped immediately with zero claim and zero release.
  - HTTP claim is dispatched without an abort signal on the fetch so that server grants are never orphaned. If cancelled before claim finishes, once claim resolves `op.claimed = true`, then `op.cleanup()` releases it once.
  - Native track-ended listener while HTTP claim is pending stops tracks, cleans up, and dispatches release once without attempting local publish.
  - `startSettledPromise` ensures that `stopSharing` or `unmount` awaits completion of any in-flight startup flow before executing cleanup, preventing overlap between old teardown and new captures.
  - Active stop failures truthfully display an alert (*"Không thể giải phóng vị trí phát màn hình. Vui lòng thử lại."*).

### Finding C: Native Permission Check & Bounded Await in `media.ts`
- **Problem**: `awaitScreenPublishPermission` previously risked hanging if native permissions were granted prior to listener registration. In addition, protobuf permissions required typed verification rather than string comparisons.
- **Solution in `media.ts`**:
  - `checkPermission(source)` checks `room.localParticipant?.permissions`:
    - Returns `false` if `!perms || perms.canPublish !== true`.
    - Returns `true` if `perms.canPublishSources` is empty or undefined (LiveKit protocol denotes unrestricted publishing).
    - Otherwise checks `perms.canPublishSources.includes(Track.sourceToProto(source))`.
  - `awaitScreenPublishPermission(signal, timeoutMs)`:
    - Registers listeners on `ParticipantPermissionsChanged`, `Disconnected`, and `signal.abort`.
    - Enqueues reject callback into `pendingPermissionRejects` so `disconnect()` rejects promptly without hanging.
    - Re-checks snapshot immediately after registering listeners to eliminate any registration race.
    - Cleans up all listeners and timeout on resolution, rejection, timeout, or abort.
  - `room.on(RoomEvent.ParticipantPermissionsChanged)`:
    - When `Track.Source.ScreenShare` is revoked, notifies local unpublished listeners to trigger slot release and stream teardown.
    - When only `Track.Source.ScreenShareAudio` is revoked, stops and unpublishes system audio only while keeping screen video active.

### Finding D: Atomic Rollback of Partial Screen Publications
- **Problem**: If video published successfully but optional system audio failed, or if cancellation occurred during publishing, partial tracks could remain published and quota leaked.
- **Solution in `media.ts`**:
  - `publishScreenTracks(videoTrack, audioTrack, signal)`:
    - Verifies `signal?.aborted` and `track.readyState !== 'ended'` before and after each publish call.
    - If system audio publish fails or is cancelled, calls `room.localParticipant.unpublishTrack` on the already published video track, resets state, and throws to trigger `op.cleanup()`.
    - If system audio is not permitted by SFU, stops `audioTrack` immediately rather than leaving an idle capture.
    - `disconnect()` cleans and stops all local audio/video tracks and publications.

### Finding E: Idempotent Single Attachment Record & Strict Remote Video Filtering
- **Problem**: Re-rendering or re-selecting streams could attach duplicate video elements or fail to detach previous tracks.
- **Solution in `media.ts` & `LiveViewer.tsx`**:
  - Maintained single `attachedRecord: AttachedVideoRecord | null = { track, element, sid, isLocal }`.
  - `attachVideo`: If `attachedRecord` matches the target SID, track, and container, returns immediately (strictly idempotent).
  - `detachAttachedVideo`: Calls `track.detach(element)` and removes element from DOM before attaching any new track.
  - Strict remote track filtering: `pub.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare`.
  - Rejects late `TrackSubscribed` events for non-selected tracks and calls `pub.setSubscribed(false)`.

### Finding F: Accessibility, Keyboard Navigation & Unique Instance IDs
- **Problem**: Duplicate DOM IDs across multiple instances could break accessibility and ARIA relationships.
- **Solution in `LiveViewer.tsx` & `live.css`**:
  - Used React `useId()` to generate unique ID prefixes:
    - Stage: `${idPrefix}-stage`
    - Tabs: `${idPrefix}-tab-${pub.trackSid}`
    - Tabpanel: `aria-labelledby={`${idPrefix}-tab-${selectedSid}`}`
  - Zero video elements inside stream selector tabs (no expensive video decoding in tabs).
  - WAI-ARIA tablist pattern with ArrowRight, ArrowLeft, Home, and End keyboard navigation and focus retention.
  - Aspect ratio 16:9 stage with responsive fallback message.
  - Tablet / iPadOS detection (`platform === 'MacIntel' && maxTouchPoints > 1`) correctly enforces view-only guidance while keeping microphone and viewing active.

---

## 3. Transition Checklist for Codex Review & Adoption

| Target File | Path in Proposal | Action | Key Verification |
|---|---|---|---|
| `apps/web/src/features/live/api.ts` | `quality/evidence/T30/antigravity-implementation-refine-1/apps/web/src/features/live/api.ts` | Create | Validates `CallControlSuccessSchema` on release, `CallJoinSchema` on claim |
| `apps/web/src/features/live/live.css` | `quality/evidence/T30/antigravity-implementation-refine-1/apps/web/src/features/live/live.css` | Create | Aspect-ratio 16:9, semantic tokens, horizontal scrolling tabs, reduced-motion |
| `apps/web/src/features/live/LiveViewer.tsx` | `quality/evidence/T30/antigravity-implementation-refine-1/apps/web/src/features/live/LiveViewer.tsx` | Create | Authoritative selection ref, unified `ShareOperation`, iPadOS touch detection, `useId()` |
| `apps/web/src/features/live/index.ts` | `quality/evidence/T30/antigravity-implementation-refine-1/apps/web/src/features/live/index.ts` | Create | Feature barrel export |
| `apps/web/src/features/calls/media.ts` | `quality/evidence/T30/antigravity-implementation-refine-1/apps/web/src/features/calls/media.ts` | Replace | Single room, atomic publish rollback, bounded permission await, idempotent attachment |
| `apps/web/src/features/calls/CallPanel.tsx` | `quality/evidence/T30/antigravity-implementation-refine-1/apps/web/src/features/calls/CallPanel.tsx` | Update | Exactly two modified lines embedding `LiveViewer` in active call stage |
| `apps/web/test/live-viewer.test.tsx` | `quality/evidence/T30/antigravity-implementation-refine-1/apps/web/test/live-viewer.test.tsx` | Replace | 27 tests (original 19 intact), 0 lint errors, tests findings A–F |

---

## 4. Verification Status
- **Proposals Authoring**: Complete in `quality/evidence/T30/antigravity-implementation-refine-1/**`.
- **Command & Test Execution**: Zero commands run in this turn per protocol. No premature claims of PASS.
- **Next Step**: Await Codex review, adoption of proposed source and test files, headed UI / E2E test execution, Telegram bridge capture, and closing review.
