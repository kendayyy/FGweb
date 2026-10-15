# T38-FEED-BE direct Codex acceptance review

Status is determined by closure.json after the final integrity gate, not by this review document alone. Unresolved blocking source findings: none.

Scope: twelve canonical Feed routes, existing purpose-aware upload endpoint, exhaustive Feed/legacy report integration and source-pinned API build. The DATA contract, migration0027, Auth/Social/Chat/crypto source and frozen prior evidence remain unchanged. Five original source integrations and compiled/doc changes use exact reviewed adoption manifests. No main migration or production activation.

Acceptance mapping:

- Public guest read and strict nickname/avatar/game projection, literal text body, signed verified/onboarded writes, current ban/session, author ownership, sole-admin reason/audit and helper denial: native core suite. JSON text safety is proven here; actual browser rendering belongs to FE.
- Immutable newest post order, filter-bound canonical cursor and real PostgreSQL microsecond ties, chronological post-bound comments, root-only replies/cross-post denial, deleted-root placeholders, denied writes after post deletion: native core suite. Counts come from real SQL relations, idempotent likes include actual two-tab concurrency. Current role/BAN/delete races use actual PostgreSQL row-lock waits.
- Genuine PNG/JPEG/WebP decoding/re-encoding, byte/pixel/signature/purpose checks, four-image/owner/expiry constraints, UTC draft expiry, transactional finalize/reorder/rollback and bound source ACL/no-store: native asset suite. Unbound/private/removed/deleted URLs are denied. Actual DB trigger, filesystem failure/missing file and truncated multipart/socket faults never report false success.
- Reproduced the old expiry rollback file-loss bug in RED and corrected commit-before-unlink. Retention includes active Feed bindings. Existing chat draft timestamps/transport remain separate. Added old upload regression uses an explicitly unmigrated public Lobby fixture; private-context draft isolation uses synthetic compatibility metadata. Neither sends private plaintext or downgrades encryption.
- FEED_POST/FEED_COMMENT report/list/resolve/deletion audit binds the true source author; legacy USER/MESSAGE, support owner/admin ACL, native crypto and BAN behavior retain the original frozen regression assertions. Existing social/profile/DM services are reused, with no Feed notifications or new transport.

Fresh verification records: `codex-feed-be-native-green-3.json`40/40, `codex-feed-be-native-regression-1.json`57/57, API no-emit types and scoped source lint exit0, source-pinned API build115 source files/345 generated files. The canonical compiled runtime record must pass20 actual HTTP/PG/Redis/file checks before closure. Failed RED and both fixture-query failures remain intact: correcting nonexistent projection columns did not change runtime code, status assertions or zero-row assertions. Final totals count97 native tests once, without counting earlier failed/focused runs twice.

Integrity requires91 prior PASS rows, every original or exact reviewed transition,41 historical table fingerprints, stock checker/gate/baselines, env/lock and build source/output hashes. All disposable app/socket/WASM/pool/schema/Redis/file cleanup receipts are retained. Final totals, command hashes and cleanup are independently checked in final-integrity-review1.json; absence of that successful record prevents closure.

API integration tests run in the background as authorized. No UI was tested in this backend checkpoint. Actual approved mockup03 layout, stale-query/auth cache protection, browser text rendering, focus/keyboard/360px behavior, visual review and headed multi-account E2E/Telegram captures belong to T38-FEED-FE. Existing T36 HTTPS runtime remains frozen. Physical PWA/E2EE/media capacity and release gates are not substituted by these backend tests.

See frontend-handoff.md for exact client behavior and limitations. Public staged blob privacy review and verified normal origin/master backup follow valid closure before the next task starts.
