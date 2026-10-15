# T38 — moderation, private support and sole-admin frontend implementation plan

> Execute inline with superpowers:executing-plans; direct Codex only, one sequential checkpoint, existing master checkout. Standing human instructions authorize completing every approved task without another routine approval loop. The approved product specification and mockup05 are binding; no redesign, delegation, Antigravity or cockpit.

**Goal:** Ship real user reporting/support and permission-safe admin support/report/account actions with current revocation, draft-safe errors and visible message retraction.

**Architecture:** Import locked shared schemas and existing API endpoints. A server-authorized capability probe gates the admin menu and routes; client names/roles never grant access. Isolated actor-scoped React state, abort/generation guards, lifecycle cleanup, server response validation and current Socket.IO subscriptions protect private support/notes. Reuse FG tokens, controls, focus behavior and existing encrypted-report consent flow. Exact additive delete-reason integration closes a current interface gap without changing prior task rows/evidence.

**Tech stack:** Existing React19.3, TypeScript5.9, React Router7, React Query5, Zod4, Socket.IO4, Vite8, Vitest5/Testing Library and installed Playwright/Chrome. No dependency installation.

**Spec:** .doc/task.md T38, .doc/01-product-spec.md sections8/16/17, .doc/02-frontend-design.md13 and approved .doc/mockups/05-admin-support-desktop.png. T37 PASS and verified GitHub b5af312c8e2adbae1c4d7b95d1c0430eca7a2473 are prerequisites. SUPPORT-AUTH-ONLY-01 remains binding.

## Constraints and decisions

- Preserve narrow72px game sidebar, canonical FG logo, Inter and approved light/dark tokens. Admin desktop follows sidebar/inbox/chat/detail-notes hierarchy;390/360mobile uses explicit pane/back navigation rather than squeezing columns.
- Guests can discover support/login but cannot send/read private history. Only server-authorized sole admin sees Quản trị. No simulated presence, inbox counts, support answers, account provisioning or request success.
- MeDTO contains no admin flag. Probe the existing no-store GET /admin/support/requests?limit=1, validate its shared response and retain only capability for navigation.403/401/current socket disconnect clears admin/private state immediately; reconnect reprobes server authority. No new identity claim, backend role route or client name comparison.
- User support uses shared user projections only; admin notes/audit never enter its request path/state/DOM. Server unread/status are canonical. Lists support server kind/status filters and bounded pagination; any text/unread filter explicitly applies to loaded items, without pretending unsupported server search exists.
- Sending/error/retry preserve drafts and scoped client keys; server receipts appear only after successful validated commits. Status uses expectedVersion, conflicts reload canonical state; internal notes and audit paginate independently. No in-memory or cached response from an old actor/selection can refill a cleared pane.
- Generic metadata reporting never automatically discloses E2EE plaintext. Preserve the existing explicit selection/preview/consent ReportPanel. Admin may explicitly read only disclosed report evidence through existing audited crypto-custody APIs; mark user-supplied content unverified and never fetch the private conversation.
- Ban and delete have focus-safe confirmation and a reason; cancel performs no mutation. The current DELETE handler accepts only strict{}, so extend its shared request with optional bounded reason, store supplied reason in the same audit, retain{}compatibility and all old authority/migration checks. This exact integration is required by T38's approved reason acceptance; no broader moderation policy change.
- Reflect real block policy: block hides Lobby messages and denies future DM/invites, and does not promise removal from shared rooms or deletion of previously received content. Read the real block producer before final copy. Existing friend/DM behavior and warning are preserved.
- Message-deleted events validate shared context, retract loaded Lobby/private rows and reply/report/image views, and reject late stale message/history resurrection within the current view. Reset actor/conversation state and remove only this feature's handlers on cleanup; preserve active call/device/recovery/session and draft behavior.
- Every real local UI/E2E run is headed Chrome/Chromium with captureUiStep at start, assertion groups, error and end, using privacy-reviewed synthetic actors and separate Telegram receipt verification. DOM unit/component tests and API/DB may run in background. Four actual viewports1440x900/1280x800/390x844/360x800 and both themes are reviewed.
- Do not apply migrations to main, provision/change real kingame credentials, purchase services, publish production, alter checker/dependency lock or start Feed/T39 before legitimate completion and verified Git backup.

## Exact file responsibilities / scope review

- New apps/web/src/features/moderation/**: strict transport/errors, context-safe report/delete dialogs, message actions, retraction helpers and scoped CSS.
- New apps/web/src/features/admin/**: server capability/lifecycle boundary, admin shell, reports/users/actions/disclosed-evidence views and CSS.
- New apps/web/src/features/support/**: strict user/admin API clients, actor-scoped support workspace, realtime/recovery, form/message/status/read/notes/audit state and responsive CSS.
- Exact web integration: App.tsx; features/auth/HeaderAuthWidget.tsx; features/lobby/{LobbyPage.tsx,useLobbyChat.ts}; features/chat/RichMessage.tsx; features/friends/PeerSocialControls.tsx; features/crypto/PrivateChatPane.tsx; features/rooms/RoomsPage.tsx. Add another exact path only after evidence-backed scope review.
- Exact compatible delete-reason integration: packages/contracts/src/{moderation,index}.ts and apps/api/src/modules/moderation/moderation.service.ts. Owned contract/API tests under quality/evidence/T38/**; no frozen original test rewriting.
- New apps/web/test/{moderation,support,admin,moderation-retraction}.test.tsx and tests/e2e/moderation-support.spec.ts; owned headed/API fixtures/drivers/proofs under quality/evidence/T38/**. Any frozen integration/config/build output changes require exact adoption.
- Canonical apps/web/dist/**, apps/api/dist/**, packages/contracts/dist/** only through source-pinned owned builds and exact review; quality/{api-contract,spec-coverage}.md for truthful mapping; local .runtime/t38/** and .cache/t38/**. Root .doc/history.md records actual work.

## Sequential implementation

- [ ] Record preparation/history, approved sources/mockup hashes, actual predecessor Git receipt, exact scope and89priorPASS/original snapshots. Stock gate must accept before business code.
- [ ] Write/observe meaningful REDs for report cancel/reason/context/error, admin denied/spoofed role, confirmation actions, strict support projections/receipts and actor/selection/revoke races. Component tests use transport fixtures only; native headed proof is separate.
- [ ] Write/observe delete-reason contract and native API/audit RED. Implement only optional compatible shared request/audit integration through exact reviewed adoption; verify{}and supplied reason/validation/ACL/rollback before UI use.
- [ ] Implement shared safe dialogs/report/delete actions and server-derived admin boundary/navigation. Integrate real block warning and current Lobby/private retraction with tests for late history/message/image/reply state.
- [ ] Implement authenticated support create/list/chat/read/status and admin inbox/notes/audit. Preserve owner/admin separation, retries, bounded pagination, stale-response/actor cleanup and genuine server receipts. Add current-authority realtime with REST recovery and no fabricated presence.
- [ ] Implement admin report resolution/users/ban confirmation and explicit disclosed evidence read/image handling. Errors preserve drafts; denial clears all private data. Review mockup hierarchy and mobile panes using actual app.
- [ ] Run focused tests/lint/types, meaningful existing regressions and owned source-pinned builds serially. Retain every RED/failure and explain any compatibility harness change without lowering assertions.
- [ ] Run actual headed real API/PG/Redis E2E with synthetic verified credentials/sole-admin fixture, Telegram capture and separate receipt checks, keyboard/focus/revoke/offline/ownership tests and four viewport/theme screenshots. No actual user/secret content in screenshots/public evidence.
- [ ] Direct Codex source/evidence review; original files/89priorPASS/checker/env/lock/baselines/gate/41historicaltables and owned resource cleanup verified. Update API/coverage/history, close only on actual acceptance; scoped staged public blob scan, normal master commit/push and remote SHA verification before T38-FEED-DATA.

## Review focus

Late report/support/status/note responses after logout, role loss, account switch or request change must not restore old sensitive state. A successful late commit still needs server idempotency on retry. Socket disconnect and stalled delivery must fail closed for private/admin panes. Deleted-message events must not mix conversations or permit cached/image/reply resurrection. A forged client kingame name/role must not render protected data or issue authorized mutations. Screenshot/Telegram results and real backend assertions remain distinct from UI snapshots or synthetic fixture provisioning.
