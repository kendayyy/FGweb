# T38-FEED-FE implementation plan

Execute inline with Codex only, one task, approved spec13/design10/mockup03. The user already approved the design and requests sequential completion. Reuse FG tokens/Inter,72px rail, shared games/logos, existing modal focus handling, report/social/DM APIs and actual backend contracts. No new design approval or production deployment.

Architecture: route-owned FeedPage keyed by auth identity/session safety and route ID. Scoped abortable page state with monotonically increasing request epochs prevents obsolete filters/pagination/mutations from repopulating changed selections or authenticated content after logout. Use server DTO/counts, deduplicate cursor pages, clear inaccessible detail/cache immediately on401/403/404. No persistent Feed cache or sockets. Detail comments are chronological, root-only replies, preserve placeholders, text-only. All user text is React text, never HTML.

Composer preserves body/game/type/files on recoverable upload/publish failure, locks concurrent submit, uses stable client IDs for identical retries and new IDs for changed payloads. Upload sequentially to FEED_POST, retain verified draft receipts, max4 and local byte/type validation with authoritative server validation. Editable existing image IDs remain same-post only. Clear local state and revoke object URLs on identity change. Like uses actual server state; errors leave prior server counts, current operation disables duplicate clicks. Destructive actions use existing confirmed reason dialog; author edits only, current online admin deletion with reason/report context. Report labels handle all four targets exhaustively.

Layout: shared AppShell, Feed header/composer/list and280px filter panel; mobile filters above composer, one column, bottom nav Feed/Lobby/Friends/Notifications, game/room links through drawer. Existing Lobby receives Feed links and remains fully reachable. Main app adds /feed and /feed/posts/:id while preserving /. Profile uses existing /users/:id; DM creates through existing direct-conversation API then routes to Lobby's existing dm query/panel. No new DM subsystem or fake auth/notifications.

Exact originals: apps/web/src/App.tsx; apps/web/src/features/lobby/LobbyPage.tsx; apps/web/src/features/moderation/ReportDialog.tsx; apps/web/src/features/admin/AdminReportsPage.tsx. New Feed feature files, apps/web/test/feed.test.tsx and tests/e2e/feed.spec.ts. Source-pinned apps/web/dist/**, quality/spec-coverage.md, task-owned evidence/cache/runtime. Other shared files remain frozen; any necessary extra original needs an evidence-backed scope amendment before editing.

Sequential work:

1. Reviewed entry: previous BE PASS/verified remote,92priorPASS, exact scope, spec/mockup03/rules, all original/checker/env/lock pins. Record history before business code.
2. Meaningful component/API RED tests for guest/read/schema, stale filters/pages, auth unmount, preserved failed drafts/uploads, real server count response/error rollback, chronological root replies/placeholders, deleted/denied cache clearing, report target labels/DM target and focus/keyboard controls.
3. Minimal Feed API/state/composer/post/comments/navigation/report integration; exact shared source adoption and GREEN. Unit DOM tests run background, all failures retained.
4. Serialized full web regressions, web types/lint, source-pinned build. Actual disposable API/PG/Redis/filesystem + headed Chrome multi-account E2E: post/image/filter/like/comment/reply/profile/DM/edit/report/admin resolve/delete/refresh/guest/nonowner; no browser network mocks in this E2E. Authorized captureUiStep Telegram viewport groups/start/end/errors, actual receipts separate from tests.
5. Actual screenshots1440x900,1280x800,390x844,360x800, dark/light, font loaded; direct visual review against approved mockup03 hierarchy/tokens and compact rail. No image-generation redesign or physical/capacity claims.
6. Direct source/evidence review,92previousrows/originals/baselines/checker/env/lock/41historicaltables/owned cleanup, truthful traceability/history and closure only on acceptance. Public staged blob privacy review/normal GitHub backup/remote SHA before T39 gate.

Keep T36 HTTPS runtime/frozen evidence intact; no main DB migration, real admin provisioning, dependency changes, production activation or crypto protocol changes.
