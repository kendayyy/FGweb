# FG T30 — Final Implementation Refinement Review (`antigravity-implementation-final-1`)

## 1. Overview
- **Task**: FG T30 — Frontend Screen Sharing & Live Viewing in `apps/web` (720p30, optional system audio, max 3 publishers, single selected screen video subscription, stream switching, fallback, and mobile view-only guidance).
- **Process & Context**: Final refinement proposal resolving type review findings (`codex-t30-proposal-type-1.txt`), source lint findings (`codex-t30-proposal-lint-2.txt`), and architectural/layout refinements 1 through 9.
- **Constraints Applied**:
  - Full exact proposals authored exclusively under `code/quality/evidence/T30/antigravity-implementation-final-1/**`.
  - Zero writes to actual `apps/web/...` source or test files.
  - Zero writes to `tasks.json`, `.doc/history.md`, `.env`, checker scripts, or git.
  - Zero test, build, lint, UI, or browser command executions by Antigravity in this proposal round.
  - Preserved all prior proposal evidence in `antigravity-red-1/`, `antigravity-red-review-1/`, `antigravity-red-refine-1/`, `antigravity-implementation-1/`, and `antigravity-implementation-review-1/`.

---

## 2. Exact Resolution of Scoped Findings 1 through 9

### Finding 1: TS Narrowing Across Await & Safe Unpublish Arguments
- **Root Cause**: TypeScript's control flow analysis narrowed `track.readyState` to `'live'` before `await` and produced TS2367 errors when checking `track.readyState === 'ended'` after `await`. In addition, `unpublishTrack(aPub.track || aTrack)` passed potentially undefined arguments.
- **Resolution**:
  - Introduced helper function:
    ```ts
    function isTrackEnded(track: MediaStreamTrack): boolean {
      return track.readyState === 'ended';
    }
    ```
  - Used fresh `isTrackEnded(track)` function calls before and after every `await` in both `media.ts` and `LiveViewer.tsx`.
  - Guarded audio unpublish target: `const target = aPub?.track ?? aTrack; if (target) void room.localParticipant.unpublishTrack(target).catch(() => {});`.
  - Handled all background unpublish promise rejections with `.catch(() => {})`.

### Finding 2: Permission Await Timer Const & Leaked Disconnect Cleanup
- **Root Cause**: `pendingPermissionRejects` held raw reject functions, so `disconnect()` rejected without invoking `cleanup()`, leaking timers and event listeners. Declaring `let timer` without reassignment triggered ESLint `prefer-const`.
- **Resolution in `media.ts`**:
  - Maintained `pendingPermissionCleanups = new Set<() => void>()`.
  - Declared `const timer = setTimeout(...)` before registering event listeners.
  - Created `closeHandler` which calls `cleanup()` then `reject()`.
  - `cleanup()` removes `closeHandler` from the set, clears `timer`, and unregisters all event/signal listeners.
  - `disconnect()` calls all close handlers in `pendingPermissionCleanups` and clears the set immediately.

### Finding 3: `LiveViewer` State Ownership, Clean Next Calculation & Error Reporting
- **Root Cause**: `let next = null;` triggered ESLint `no-useless-assignment`. Start guard and stop logic allowed race conditions across operation boundaries. Natural stop/release errors were suppressed unless explicit.
- **Resolution in `LiveViewer.tsx`**:
  - Directly computed `const next = pubs.length === 0 ? null : (current && pubs.some(p => p.trackSid === current) ? current : pubs[0].trackSid)`.
  - Simplified start guard: `if (currentOperationRef.current) return;` after the explicit stop branch.
  - Retained `currentOperationRef.current = op` until `op.cleanup()` finishes.
  - `cleanupOp` updates UI state only if `currentOperationRef.current === op`.
  - Truthful release error reporting: whenever mounted and current operation owner, if `releaseScreenShare` fails, user is alerted.
  - Captured `op` in `onEnded` listener: `if (currentOperationRef.current === op) void cleanupOp(op)`. Removed listener during cleanup.

### Finding 4: Precise Local Track Unpublication Matching & Audio Preservation
- **Root Cause**: `handleLocalTrackUnpublished` previously cleared system audio handles before cleanup and detached main video unconditionally even when watching a remote stream.
- **Resolution in `media.ts`**:
  - Matched ONLY current video publication by native non-empty SID, wrapper, or raw media stream track:
    ```ts
    const isCurrentVideo =
      Boolean(localVideoPub?.trackSid && pubOrTrack.trackSid && pubOrTrack.trackSid === localVideoPub.trackSid) ||
      Boolean(localVideoPub?.track && pubOrTrack.track && pubOrTrack.track === localVideoPub.track) ||
      Boolean(localVideoTrack && pubOrTrack.track && pubOrTrack.track === localVideoTrack);
    ```
  - Stopped raw video and audio capture immediately.
  - Cleared video handles while PRESERVING `localAudioTrack` and `localAudioPub` so subsequent unpublish calls retain valid handles.
  - Detached stage video ONLY `if (attachedRecord?.isLocal)`. Remote streams being viewed are never detached when local sharing stops.

### Finding 5: `unpublishScreenTracks` Selective Detach & Independent Rollback
- **Root Cause**: `unpublishScreenTracks` cleared stage video unconditionally, blanking remote streams. Partial publication rollback only attempted one unpublish.
- **Resolution in `media.ts`**:
  - Detached stage video ONLY `if (attachedRecord?.isLocal)`.
  - Independent `try / catch` blocks for `unpublishTrack(aTarget)` and `unpublishTrack(vTarget)` ensuring both are attempted even if one throws.
  - Revoking `ScreenShareAudio` stops and unpublishes system audio only without dropping video or mic.

### Finding 6: Native SDK Publication Verification & No Fake Previews
- **Root Cause**: Production code relied on `new MediaStream([track])` fallback masking deficient test mocks.
- **Resolution in `media.ts`**:
  - Verified `videoPub` returned by SDK has non-empty SID and video track wrapper (`videoPub.track`), rolling back if invalid.
  - `attachVideo` accepts `RemoteTrack | LocalVideoTrack` ONLY (`track.attach()`, `track.detach(element)`).
  - Set `muted = true` and `playsinline = true` for local video preview.
  - Removed all `new MediaStream` fallback branches from production code.

### Finding 7: Realistic External SDK Mock Publication Wrapper
- **Root Cause**: Test mock cast raw tracks directly to `MockRemoteTrack`, lacking native `attach`/`detach` and realistic publication shapes.
- **Resolution in `live-viewer.test.tsx`**:
  - Implemented `makeLocalPublication(rawTrack, source)` helper:
    - Wrapper includes `kind`, `source`, unique SID, `mediaStreamTrack = rawTrack`, `attach` and `detach` managing DOM elements, and `stop` delegating to raw track.
    - Publication wrapper SID is unique per publish call.
  - `unpublishTrack` matches publication, wrapper, or underlying raw `mediaStreamTrack`, emitting native `LocalTrackUnpublished(pub, localParticipant)`.
  - Exported `makeLocalPublication` on `mockTransport` for deferred publish resolution in test cases.
  - Set `mockTrack.readyState = 'live'`; calling `mockTrack.stop()` updates `mockTrack.readyState = 'ended'`.

### Finding 8: Comprehensive Edge Test Suite (33 Cases, Original 27 Intact)
- **Resolution in `live-viewer.test.tsx`**:
  - Kept all original 19 RED cases + 8 review-1 cases (total 27 cases) with identical assertions.
  - Added Case 28: Raw capture ends while native SDK publish is in-flight (verifies rollback, track stop, and single release).
  - Added Case 29: Local preview attaches exactly one muted `playsinline` video without remote subscriptions.
  - Added Case 30: Stop local sharing while watching remote stream preserves remote video and subscription.
  - Added Case 31: Screen unpublication preserves and cleans system audio handle.
  - Added Case 32: Stale old unpublication event with obsolete SID does not cancel active share.
  - Added Case 33: Pending permission await removes timers and listeners on session disconnect.

### Finding 9: Approved Design 7 Layout Order & Controls Portal Slot
- **Root Cause**: `CallPanel` rendered avatars (`ul.fg-call-people`) before `LiveViewer`, violating design 7 order (selector -> video -> avatars -> actions).
- **Resolution in `CallPanel.tsx`, `LiveViewer.tsx` & `live.css`**:
  - Moved `LiveViewer` mount BEFORE the people list inside `.fg-call-stage`.
  - Added optional `controlsTarget?: HTMLElement | null` prop to `LiveViewer`.
  - In `CallPanel`, created state callback ref `const [controlsTarget, setControlsTarget] = useState<HTMLDivElement | null>(null);` rendering `<div ref={setControlsTarget} className="fg-call-live-controls"/>` between Mic and Leave buttons.
  - If `controlsTarget` is provided, `LiveViewer` portals the share button into that slot via `createPortal`. If omitted (e.g. standalone unit tests), renders inline.
  - Replaced undefined `--border-hover` with `--color-focus` in `live.css`. Added scoped `.fg-call-live-controls` styling.
  - Preserved mobile view-only guidance inline in `LiveViewer`.

---

## 3. Transition Checklist for Codex Adoption

| Target File | Proposal Location | Status | Key Verifications |
|---|---|---|---|
| `apps/web/src/features/live/api.ts` | `quality/evidence/T30/antigravity-implementation-final-1/apps/web/src/features/live/api.ts` | Ready | Schema validation for claim & release |
| `apps/web/src/features/live/live.css` | `quality/evidence/T30/antigravity-implementation-final-1/apps/web/src/features/live/live.css` | Ready | Aspect-ratio 16:9, semantic tokens, portal slot styling |
| `apps/web/src/features/live/LiveViewer.tsx` | `quality/evidence/T30/antigravity-implementation-final-1/apps/web/src/features/live/LiveViewer.tsx` | Ready | `isTrackEnded`, direct next calculation, portal support, unified operation |
| `apps/web/src/features/live/index.ts` | `quality/evidence/T30/antigravity-implementation-final-1/apps/web/src/features/live/index.ts` | Ready | Clean feature barrel export |
| `apps/web/src/features/calls/media.ts` | `quality/evidence/T30/antigravity-implementation-final-1/apps/web/src/features/calls/media.ts` | Ready | TS narrowing fixed, permission await timer const & cleanup, selective detach, audio handle preserved |
| `apps/web/src/features/calls/CallPanel.tsx` | `quality/evidence/T30/antigravity-implementation-final-1/apps/web/src/features/calls/CallPanel.tsx` | Ready | Design 7 order (viewer before people), controlsTarget slot |
| `apps/web/test/live-viewer.test.tsx` | `quality/evidence/T30/antigravity-implementation-final-1/apps/web/test/live-viewer.test.tsx` | Ready | Realistic SDK mock wrapper, 33 cases (original 27 intact) |

---

## 4. Pending Verification Status
- **Antigravity Status**: All proposed files authored cleanly in `quality/evidence/T30/antigravity-implementation-final-1/`. No execution commands run by Antigravity in this turn per protocol.
- **Pending Actions for Codex**:
  1. Review proposed files against codebase.
  2. Adopt proposed files into `code/apps/web/...`.
  3. Execute unit/DOM tests (`npm run test -- apps/web/test/live-viewer.test.tsx`).
  4. Execute headed E2E tests with Telegram bridge streaming receipt.
  5. Close task T30 upon verification.
