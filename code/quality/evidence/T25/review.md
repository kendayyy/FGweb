# T25 implementation review — 2026-10-08

Codex implements directly under the user's existing authorization; Anti2 remains paused. One task is active. Previous capacity prerequisites T03-FIX13/T24-FIX2 and member discovery T24-FIX1 are frozen PASS. Closure is performed only by close.mjs after real mandatory records and the unchanged proposed T26 gate succeed.

## Behavior and scope

- New actor-scoped team-roster, room-settings policy summary and invitations frontend folders. Exact integration files: RoomsPage.tsx, RecruitmentCard.tsx and App.tsx. No backend, database, frozen tests, contracts or checker changes under T25.
- Private/CLOSED room sessions use the member discovery producer, cursor pagination and the actual stored session capacity. Missing optional legacy capacity is an explicit error; mutable room configuration is never substituted.
- Public nonmember requests use PATCH join-requests/:id/respond for actual recruitment admission; current members use the session decision endpoint. Native HTTP tests discovered this distinction. No optimistic membership, roster or consent success.
- Current membership/role and exact MANAGE_RECRUITMENT gate queue/start/end controls; invitations use the existing target-to-permission contract (ROOM/MANAGE_MEMBERS versus PLAY_SESSION/MANAGE_RECRUITMENT). Being the invitation sender alone does not grant approval.
- Optional applicant names are resolved through the existing public profile API, with no private email fields. Unresolved applicants cannot be accidentally approved under indistinguishable labels. Invitation sender/recipient and known room names use actual returned data.
- Recipient consent can remain PENDING until manager approval. ROOM creates membership only; PLAY_SESSION admits roster/active slots. Empty persistent rooms still support ROOM invitations; ended sessions cannot be offered as a playing target.
- Start is manual. Leave/end require their own confirmation and do not call room/call mutations. The host uses explicit end. Persistent room settings/grant management reuses the existing native modal. Native admission refreshes existing membership/detail/own-room consumers without remounting chat.
- Private queries are actor keyed; auth cleanup cancels/removes them, mutations are aborted on scope changes and late responses ignored. Membership/status polling plus manual refresh reconciles changes; backend checks remain authoritative. No claim of instantaneous team socket updates or media capacity.
- Semantic FG tokens/Inter/approved light/dark are preserved. Narrow mobile layouts wrap rather than horizontally overflow. Native controls and navigation links have44px targets. Local browser tests are headed. Inner room-stage scrolling remains the existing room behavior and was exercised to reach the invite form on360px.

## Verification

- Behavioral RED before implementation:15 initially missing UI cases. Additional REDs cover no-session room invitations, missing optional applicant metadata and nonmember admission. The final task suite contains22 cases; all original assertions are retained.
- The real frontend configuration runs the original Rooms19, Recruitments26 and Theme19 cases unchanged, alongside22 T25 cases:86 total. Unit/component tests use test transport adapters only; production clients use native fetch and shared schemas.
- Headed real Nest AppModule/PostgreSQL/Redis/Better Auth fixture: public application and owner approval; exact helper permissions; room-private transition with independently configured capacity; ROOM consent and approval without playing admission; real capacity409 race; roster leave and manual helper start; PLAY_SESSION consent/approval; end with room1/membership5/active slots0. Two mandatory browser scenarios cover these7 flow steps and responsive/theme/mobile invitation/keyboard/44px/draft/session/socket witnesses. No fake production records or external emails are used; temporary schema and fixture presence are cleaned by the server lifecycle.
- Screenshot review inspected both themes, desktop1440px and mobile360/390px. Final Activity screenshots wait for returned data and actual names. Mobile invite controls are reachable by native scrolling and keyboard focus. Draft node and native socket IDs/events stay unchanged across resize/theme operations.
- Vite8 builds preserve historical asset paths with emptyOutDir=false. The active index points to the newest bundle. Baseline, immutable predecessor metadata/source hashes and private local configuration are audited at closure. No assertions/old snapshots/checker/historic output hashes are rewritten.
- Local main API/preview were stopped when Docker was stopped. Docker/services were restarted, and the scoped .runtime/t25/start-preview.mjs starts the existing compiled API plus Vite preview at localhost18080. Callback/origin and secrets are read from the unchanged local environment. This is a local development preview, not publication.

## Retained failed runs and actual resolutions

- roster-green-1: the fixture display name and host badge both read “Chủ đội”; fixture name became “Hoàng Nam”, preserving the host-label assertion.
- regression-1: root Vitest configuration lacks the frontend jsdom/setup cleanup. The real apps/web configuration passes unchanged original tests; no production/test workaround was added.
- web-types-1: success schema unknown handling and incompatible generic unions; corrected native success parsing using the shared registry and separate typed branches.
- unit-final-1: DOM test clicked the initially disabled loading action and checked roster before loading. Tests now wait for enabled/loaded state and retain outcome assertions.
- web-types-final-1: new DOM test used Playwright's exact option in Testing Library. Removed that unsupported option; exact string role matching is retained.
- room-invite-red-1, queue-profile-red-1, public-admission-red-1: real missing behaviors implemented and verified by subsequent passing behavioral/native tests.
- fixture-probe-1/headed-1: Docker daemon was stopped (ECONNREFUSED). services-up-1 restarts the configured services. fixture-probe-2 encountered PostgreSQL recovery57P03; probe3 passes after healthy. Cold fixture startup measured41s; only startup bounds became55/60s, with business assertions unchanged and retries0. Closed IPC is not messaged again during teardown.
- headed-2: new setup guessed a nonexistent members/permissions URL. It now uses the frozen PUT helpers/:userId contract. Native recipient, rather than a manager who is neither party, retains finalized invitation history; tests verify receiver acceptance and room access.
- headed-3: nonmember applicant name and admission path failures reproduced in new RED cases. Public profile resolution and endpoint selection fix the UI; native headed4/5 pass. Final headed6 repeats the rebuilt version with the explicit mobile44px link check. Business action timeout is15s, so future missing controls fail promptly.

Final numeric results are enforced by close.mjs against command logs and witness files. T26 is not opened until T25 PASS. PWA phone installation, production release and1,000-call/live load remain later tasks; no such claim is made here.
