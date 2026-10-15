# T37 — Moderation and private support backend implementation plan

> Execute inline with superpowers:executing-plans; direct Codex only, no delegation or concurrent checkpoint. The approved product spec/task handoff is binding. Existing master checkout is retained under the explicit sequential/public-backup workflow; no new worktree or service purchase.

**Goal:** Implement authenticated private support and sole-admin moderation/report/ban APIs with durable committed realtime and current revocation, preserving existing encrypted chat, recovery and media authority.

**Spec:** .doc/01-product-spec.md sections3/10/16/17; .doc/task.md T37, SUPPORT-ADMIN-01, SUPPORT-AUTH-ONLY-01 and CHATCRYPTO-BAN-T37-01; design13. T36-SUPPORT-DATA PASS and verified remote645696169d0373aec1c891bd8253c9f9bb30a4d5 are prerequisites.

**Architecture:** Reuse locked shared contracts and auth/admin guards, actual PostgreSQL transactions and Redis signals. Support has separate service/controller/gateway, strict owner/admin projections, transactional idempotency, bounded pagination and monotonic read state. Durable outbox stores identifiers and event kind, never plaintext note/message bodies in Redis. Every subscription and emission rechecks current session/ban/owner/admin. Moderation retains encrypted source rows behind tombstones; normal history/object/realtime paths must deny removed content. Ban/unban owns atomic audit/session/call revocation and private membership epoch/interval transitions; broadcast/native reconciliation follow commit and durable retry.

**Technical rulings:** Backend acceptance requires durable support/deletion/revocation jobs and a target-linked moderation audit, which current0025tables do not provide. Add reviewed migration0026 with matching Drizzle exports/tests, without rewriting0025 or applying to main. Tombstones preserve private ciphertext/report/reply bindings instead of deleting evidence/history roots. No admin reads undisclosed E2EE source; existing CryptoReportsService alone reads actively disclosed evidence. Admin provisioning was completed by its earlier checkpoint and is not repeated here. Synthetic privileged fixtures are disposable and never prove the real kingame account is provisioned.

## Scope to pin before implementation

- New backend directories: apps/api/src/modules/support/** and modules/moderation/**.
- Reviewed integration: apps/api/src/app.module.ts; modules/realtime/{realtime.gateway,realtime.module}.ts; modules/chat/chat.service.ts; modules/chat-crypto/{crypto-relay.service,crypto-membership}.ts; modules/uploads/uploads.service.ts; modules/calls/calls.service.ts only if required for native post-commit reconciliation. Read existing guards/auth/session without silently changing policy.
- Tests: apps/api/test/support.integration.spec.ts, moderation.integration.spec.ts and moderation-crypto.integration.spec.ts; packages/database/test/moderation-support-migration.test.ts. Any owned compatibility/native drivers remain under quality/evidence/T37/ and preserve original assertions.
- Additive data: packages/database/src/schema/moderation-support.ts, src/index.ts, migrations/0026_moderation_support_delivery.sql, migrations/meta/_journal.json. Shared existing moderation contracts/index only when strict request/deletion/audit DTO compatibility requires it; packages/contracts/src/{moderation,index}.ts and test/moderation-support.test.ts.
- Exact compiled outputs packages/{contracts,database}/dist/** and apps/api/dist/**; quality/api-contract.md, spec-coverage.md, quality/evidence/T37/**; local .runtime/t37/** and .cache/t37/**.
- Root history only records actual work. No frontend, production, main migration, paid capacity tests or unrelated Telegram bridge edits.

## Sequential work

- [ ] Read current spec/history/rules/contracts/auth/report/crypto/call lock order; record scope and exact predecessor gate/88priorPASS/original snapshots before business code.
- [ ] RED real API/PG support tests for guest, owner/admin split, strict inputs, idempotency/conflicts, unread/status/notes pagination, receipt-after-commit rollback and realtime multi-tab/revoke. Add only missing implementation after observing RED.
- [ ] RED migration/outbox and moderation tests; add0026schema/SQL/journal through exact adoption. Implement report creation/list/resolve and safe message deletion with same-transaction audit and retraction outbox; no undisclosed E2EE reads.
- [ ] RED ban producer/native crypto cases: sole admin, repeated BAN/UNBAN, session expiry/login denial, device/recovery preservation, epoch intervals, stale session/history denial, rollback and lock contention. Implement lock-ordered producer and after-commit durable revocation/native retry.
- [ ] Integrate only exact reviewed changes to shared predecessors; build source-pinned package/API outputs in owned copies and adopt exact bytes. Run relevant unchanged auth/chat/crypto/call/delivery regressions serially; all failed attempts remain.
- [ ] Review real API/PG/Redis/native evidence, historical41table fingerprints, source/originals/88priorPASS/checker/env/lock/gate and bounded cleanup; update API/coverage/history, close only when acceptance actually passes. Scoped public blob/private-value scan, commit/push master and verify remote before T38.

No UI test is required for this backend checkpoint; any actual UI/E2E introduced for native validation must be headed and publish captureUiStep screenshots with privacy masking and separate Telegram receipt checks. API/PG/socket/native protocol tests may run in background under TEST-VISIBILITY-01. No paused approval loop is added: human already directs complete sequential implementation and approved this written product plan; routine technical decisions above are recorded for review.
