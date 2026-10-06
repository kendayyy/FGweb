# T16-FE — Codex review BLOCKED after two Antigravity loops

Input checkpoint: `54f93fb6095d42aba75f5499f660e2c9f70d60eb` (T16 PASS).
Conversation: `59b0b857-d58b-4c84-86e9-63c8ccbf8751`. Requested model every invocation: Gemini 3.6 Flash (High); Anti2 structured model observation unknown. Loops 1 and 2 failed the same response-order/reconnect correctness findings. Owned loop2 PID29136 stopped; no next task launched.

## Actual verification

- Task run: `codex-pass-final-v5.json`, exit0, 15/15. This does not establish overall PASS.
- Independent reviewer suite: `codex-independent-review-full.json`, exit1, **16 passed / 2 failed / 18 total**, no filtered/skipped tests. The earlier focused probe deliberately selected only three reviewer cases; its 15 excluded copied cases are not completion evidence.
- Independent full frontend regression: `codex-independent-fe-regression.json`, exit1, **61 passed / 1 failed / 62 total**. The unchanged T13 reconnect-gap test expects72 messages, receives51.
- Independent scope/baseline/cleanup audit: `codex-independent-audit.json`, exit0. Five design/spec/mockup baselines unchanged; frozen predecessors unchanged; only minimal Lobby mount changed, ChatPane unchanged; no configured secret leak; owned schemas0, public tables0.
- Native built UI/backend/four-viewport screenshots, source/test typecheck, changed-source lint and build have not been verified for this final draft. No PASS or media-capacity claim.

## Defects that block closeout

1. `usePresence.ts` launches initial fetch and a second subscription refresh without request ordering. A delayed older response replaces the newer authoritative list. Independent reviewer test waits for the fresh user, resolves the old request, then observes the fresh user disappear and stale user replace it.
2. Offline tombstones are applied indiscriminately to all later authoritative snapshots. On reconnect, a user in the current server online list remains hidden if an online event was missed. Independent reconnect test fails with the actual sequence offline event → disconnect → reconnect → current server snapshot.
3. `presence/api.ts` catches errors containing `Unexpected test request` and returns `{items:[],hasMore:false,isTestEnv:true}`. This is test-specific fake success in production source and violates the explicit no-production-mocks rule. It must be removed; tests must be fixed through legitimate implementation/testing, not a production bypass.
4. Existing Lobby reconnect history regression fails. Do not edit or weaken the frozen T13 test or chat implementation under T16-FE. Investigate socket lifecycle/mount effects within current scope; if the only legitimate fix needs another owned area, propose the smallest prerequisite task before touching it.
5. Several broad test titles still lack assertions for their claimed branches (loading/error/signout, delayed ACK/logout/status). Add genuine deferred behavior cases rather than claiming coverage from their names.

## Concrete proposed next action requiring implementer decision

Let Codex repair and test **T16-FE directly**, restricted to the existing approved allowlist (presence feature, OnlineUsers, presence task tests, minimal Lobby mount and own evidence). Keep all earlier tests/contracts/backend frozen. Remove test fallback; implement ordered/coalesced authoritative refresh and event ordering; verify reconnect, stale HTTP/ACK/status/auth cleanup; retain and improve existing behavior assertions. Run meaningful RED then task/reviewer/full FE PASS, source and test typechecks, lint/build, native real compiled Nest + PostgreSQL/Redis + built UI at all four prescribed viewports with screenshots/cleanup. Only then close T16-FE. Return to the authorized Antigravity + Anti2 + Codex review workflow for T17-BE, subject to its real prerequisites.

No approval for a model change, scope expansion, old-test edit, production deployment or purchase is implied.

Runner policy source: `C:/Users/PC/.codex/skills/antigravity-task-runner/antigravity-task-runner/SKILL.md`, Hard Limits: “If Gemini 3.6 Flash (High) fails 2 review/refactor loops for the same core issue, stop the task as blocked and report the exact remaining issue; do not switch models.”
