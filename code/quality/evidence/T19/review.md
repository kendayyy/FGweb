# T19 — Codex review: PASS

Executor changed to Codex by the user on 2026-10-07; Anti2 is paused. Antigravity quota-stop source and all unsuccessful checks are retained. Source is limited to the approved rooms feature, rooms.test.tsx and App.tsx composition. Spec/design/mockup baselines and frozen predecessor files outside this approved scope were checked.

## Verified behavior

- Permanent room list preserves all cursor pages. Deep links use the persisted RoomDTO.conversationId and require a newly fetched member-only room detail before private UI is shown.
- Real seven-game catalog IDs create real rooms; no invented game IDs or production fixtures. HTTP error status determines access denial. Denial removes history/reply/composer and disables the old socket; chat query data is evicted.
- Reconnect snapshots the pre-disconnect anchor and disables competing automatic chat refetch. Real offline browser recovery retrieves 75 persisted messages across pages, preserves the previous message and receives one real socket event without duplication.
- Owner settings, helper member-management, transfer/cancel/leave/dissolve use real APIs. Failed member removal shows the server error. Successful destructive mutations precede UI navigation. Pending actions are aborted/guarded on room/auth lifecycle; switching rooms closes the old confirmation. A false/malformed success body cannot be accepted as successful deletion.
- Settings mobile tab opens actual controls. Dialog initial focus, safe Cancel focus, Tab trap, top-only Escape and nested/outer focus restoration pass native browser checks. Room CSS is namespaced to avoid overriding Lobby/social dialogs. Inter/navy/tokens and desktop sidebar240/chat320 hierarchy are retained; mobile title wrapping and destructive contrast use existing tokens.

## Evidence and limitations

19 rooms tests and 104 full frontend tests pass; strict source/test types, changed lint and build pass. Actual compiled Nest API, PostgreSQL, Redis and built web probes cover create/reload/send, private outsider403, persisted POST403 revocation, API removal/GET403 revocation, ownership changes, member leave/dissolve, helper restrictions, 51-room pagination, ended-session retention, reconnect and keyboard/mobile behavior. Final actual screenshots at1440x900,1280x800,390x844,360x800 were visually inspected. Viewports use Chromium; this is not real iPhone/Android PWA or media-load verification.

Preserved unsuccessful runs: initial Antigravity fixtures/parser errors; original native behavioral REDs; invalid probe selectors/events and timeouts; final full-web run1 failed the frozen social Lobby test under concurrent resource use, then unmodified full-web run2 passed all104. Docker temporarily stopped before the final visual probe; restarting existing local services and rerunning the real probe passed. No tests were skipped in the final full suite. A targeted RED invocation selected the room-switch regression, then the complete19-case suite passed.

The legacy task gate passes at preflight but its post-edit invocation rejects the explicitly approved App.tsx ownership transition. Frozen checker/predecessor hashes were not changed; scoped review validates this transition, and T19 closeout records the current App hash for the next task. Original audit snapshots are retained; Codex evidence is editable under the direct-executor override, while the final audit enforces unchanged hashes outside T19 evidence and allowed source plus all predecessor/spec/design guards.

Voice/live/recruitment/PWA are retained in their later scheduled tasks. This review does not claim a1000-user media-load result.
