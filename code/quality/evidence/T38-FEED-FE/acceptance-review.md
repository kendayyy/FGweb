# T38-FEED-FE direct Codex acceptance review

Closure status is determined by closure.json after the final integrity gate. Unresolved blocking source findings: none.

Implemented the approved spec13/design10/mockup03 interface using actual frozen Feed contracts/API: public `/feed` and detail, game/type filtering and cursor pages, owned text/image drafts, server counts/likes, root replies/placeholders, author edit/delete, exact profile/DM destinations and exhaustive report/admin source actions. Shared changes are exactly reviewed App/Lobby navigation, ReportDialog labels and AdminReportsPage source-delete controls. The Feed-only viewport frame reuses existing theme/auth widgets and keeps every existing destination and global provider. No auth/crypto/backend/contract/DB source changes, dependency changes, main migration or production activation.

Functional evidence:

- 30 Feed component/API cases cover strict DTO/identity/upload transport, literal text, guest CTA, preserved failed text/image drafts, failed-like prior counts, actual server count projection, cursor overlap/stale filter exclusion, auth cleanup, denied/deleted clearing, root reply/tombstones and modal focus. Real RED proves late like completion overwrote a newer comment count; keyed functional like-field update now preserves current state. The focused GREEN is included in485/485full web tests, not counted twice.
- Full regression uses the accepted native Vitest config from code cwd. Byte-identical previously reviewed T38 call/room harnesses preserve exact assertions, while every other original test remains included. Raw legacy failures and five workspace-cwd theme ENOENTs are retained. The focus fixture correction emulates browser trigger focus and awaits the identical scheduled focus assertion; no timeout/assertion weakening.
- Fresh canonical source typecheck/lint and source-pinned build5 pass. The final CSS-only title/chip/textarea refinement is checked by actual browser geometry and current images; JavaScript/type/runtime logic is unchanged after the485test/type/lint results.
- `codex-feed-fe-headed-e2e-7.json` passes2actual Chrome tests against real compiled API/PostgreSQL/Redis/files,19behavior groups/34final captures. Actual GUI/SQL prove upload/persisted WebP, server filtering/refresh, guest/nonowner denial, like/unlike, root/reply/counts, root deletion, author edit/retained image, exact profile/DM, offline draft/one retry, keyboard image dialog/focus, author cancel/delete/audit/404, report/current-admin source delete/resolve and account/logout. No browser network mocks or private plaintext sends.

Visual acceptance:

- Directly inspected all eight current1440x900/1280x800/390x844/360x800 dark/light overview images plus drawer/account modal. Canonical FG tokens/Inter,72px rail/game logos,280px right filters and mobile hierarchy are preserved. Mobile H1 is one line, four chips fit, and footer is genuinely fully inside viewport/bounds.
- An earlier functional workflow passed while the footer was off-screen. A separate actual frame RED observed viewport ratio0 before the Feed-only100dvh/PWA-aware frame correction. Earlier clipped input-mask artifacts and all old images remain immutable and are not final visual proof.
- Mandatory privacy masks obscure input/textarea/file controls, including background inputs behind a drawer. Those black regions are screenshot masks, not application UI; no image was edited/cropped/relabelled. Synthetic content/avatars/image bytes are fixtures, never production data.
- All 134 retained PNGs match immutable event/PNG hashes and actual separate Telegram sent receipts. Final accepted run captures are34; earlier focused/failed runs are not counted as fresh success.

Failure/cleanup integrity:

Cold startup exposed30s IPC start/stop ordering and missing cleanup; exact owned listener absence/schema/runtime recovery is retained. Child IPC now serializes start/query/stop/disconnect, with measured cold-start bounds and phase traces; suite/query/assertion timeouts remain unchanged. A later native frame failed before any viewport due an actual PG connection timeout; all cleanup flags true, three fresh read-only PG probes/Redis PING passed, and unchanged-source final suite7 actually passed. An early commentary incorrectly inferred frame success from runner advancement, was promptly corrected, and never changed ledger acceptance. Startup cases without an app viewport have zero app captures, explicitly documented.

Final integrity requires92priorPASS rows, every original or exact source/build/doc transition,41historical table fingerprints, stock checker/gate/baselines/env/lock, frozen API source and exact96canonical web build bytes. The mandated live demo pointer is separately byte-matched to its immutable current event/PNG/sent receipt; no frozen prior output is changed. All owned schemas/Redis keys/service UUID folders/browser contexts are closed; final Playwright diagnostics are preserved before exact task runtime cleanup. Final integrity/closure and public privacy-scanned normal backup remain separate gates.

No physical PWA/E2EE,1,000media capacity, real kingame provisioning or production/tunnel upgrade is claimed. Existing T36 HTTPS runtime remains frozen. T39 entry must consult qa-handoff.md, closure.json and verified github-final-sync1.json.
