# T36-SUPPORT-DATA Implementation Plan

> Execute directly with Codex using superpowers:executing-plans. No delegation; preserve one checkpoint at a time and all historical evidence. This plan implements the approved SUPPORT-ADMIN-01 brief and the human's authenticated-only guest decision.

**Goal:** Shared support contracts and additive PostgreSQL schema/migration for private user/admin requests, chat, internal notes, read cursors, status and audit.

**Architecture:** Separate user/admin response schemas; strict client requests never accept actor/role/owner/internal fields. Five support tables hold authenticated owner requests, ordered messages, admin-only notes, same-request read cursors and structured audit. Constraints protect identity/idempotency/relationships; current session/ban/sole-admin ACL remains the responsibility of T37 APIs/realtime, not inferred from table existence.

**Stack:** Existing locked TypeScript/Zod/Drizzle/PostgreSQL17/Vitest. No installs, service purchase, main migration, backend/frontend/admin provisioning or crypto protocol change.

**Spec:** `.doc/01-product-spec.md section16`, `.doc/02-frontend-design.md section13`, `.doc/task.md T36-SUPPORT-DATA`, human reply to `call_3d708cc38222452c8bb089b2a557d437`: only signed-in accounts may send forms/chat; guests receive no private history through login links.

## Exact files

- New: `packages/contracts/src/support.ts`, `packages/contracts/test/support.test.ts`, `packages/database/src/schema/support.ts`, `packages/database/test/support-migration.test.ts`, `packages/database/migrations/0025_support_requests.sql`.
- Reviewed integration: both package `src/index.ts` exports/API registry, database migration journal, source-pinned package `dist/**`, `quality/api-contract.md`, `quality/spec-coverage.md`.
- Metadata: current spec/task guest-policy sentences and matching local `quality/spec-baseline.json` hashes, entry lineage/87priorPASS snapshots, scope/plan/evidence under this task. Never expose private baseline contents or secrets publicly.
- Runtime/cache only `.runtime/support-data/**`, `.cache/support-data/**`. No UI test in this data-only checkpoint; actual PostgreSQL tests run serially in disposable owned schemas.

## Contract choices

- Kinds FEEDBACK/BUG/CHAT; statuses NEW/IN_PROGRESS/RESOLVED. Form title1–160 Unicode code points; chat uses server label `Chat hỗ trợ`. Plain body1–4000 code points after trim, no image/HTML/attachment feature added.
- Creation accepts clientRequestId/kind/body and form title; messages accept clientMessageId/body, notes accept clientNoteId/body. Server supplies every actor, role, owner and status/version. Client idempotency IDs are bounded1–128.
- User DTOs contain request state/current unread/read cursor and public message data only. Admin detail alone contains notes and processing audit; no account email/password/provider token in either public owner summary or user payload.
- User/admin messages have a real actor; SYSTEM messages have no actor and only the fixed durable-receipt sentence. No AI answer or resolution-time promise.
- Request revision supports optimistic status changes; message sequences are positive bounded32-bit integers allocated transactionally per request. Cursors point to the exact message identity/sequence within that request. Pagination is bounded and rejects unknown input fields.
- Central API metadata declares authenticated user routes and admin-only notes/status/audit routes for T37; implementation is not claimed here. Support socket names/payload schemas remain a separate exported namespace, without altering existing chat/crypto events.

## Database choices

- `support_requests`: authenticated owner FK, unique(owner,clientRequestId), kind/title/status/version, last message sequence, UTC timestamps and resolved-state shape. No guest email/token columns.
- `support_messages`: request FK, sender USER/ADMIN/SYSTEM shape, body and client id, unique(request,sequence), same-request composite identities, idempotency for authored messages and one initial SYSTEM receipt per request. DB constraints do not assign admin privilege.
- `support_notes`: separate request/admin-author/body/client note id/timestamps; scoped idempotency and composite identity for audit links. Never included in user DTOs.
- `support_read_cursors`: unique(request,reader), OWNER/ADMIN role, last message id/sequence either both empty or an exact same-request message, UTC read timestamp. APIs must enforce reader role, monotonic upsert and current ACL.
- `support_audit`: CREATED/STATUS_CHANGED/NOTE_ADDED structured metadata, actor/role, request revision/status transition or same-request note reference; never duplicate private note bodies in audit. Status change requires a real differing prior/new status and positive revision; created/status revision uniqueness prevents duplicate event history.
- Foreign keys/indexes/length/enum/time/idempotency constraints follow existing schema style. Request-owned records cascade with their request; actor references restrict deletion, so audit authors cannot silently disappear. Account deletion policy is not expanded here.

## Sequential execution

- [ ] Record authenticated-only decision, update only matching spec/task sentences and reviewed baseline/lineage; pin exact scope/87priorPASS/originals and pass entry gate before business code.
- [ ] RED contract tests: invalid/unknown actor fields, Unicode bounds, fixed acknowledgment, user-note/audit leaks, strict admin shapes/status/read/event identities. Implement only after observing the missing-contract RED; preserve all original tests.
- [ ] RED PostgreSQL tests for missing support tables/constraints; migrate fresh and a populated pre0025 schema, preserve legacy snapshots and prove retry idempotency, FK/role/body/status/cursor/audit consistency, concurrent uniqueness and rollback. Implement additive Drizzle/SQL and exact-reviewed journal integration, then GREEN.
- [ ] Update API mapping/docs through exact reviewed adoption; source lint, type/build serially into owned output first, compare/adopt compiled bytes without bypassing frozen predecessors.
- [ ] Run full contracts plus relevant existing database regressions serially; review current spec/source/build/commands, cleanup only owned schemas and preserve historical41table fingerprints. All failures retained.
- [ ] Final review/gate/ledger/history/evidence; PASS only after acceptance, then public staged-blob privacy scan, normal origin/master push and remote SHA verification before T37.

## Review focus

1. Forged client owner/role/admin fields or admin-only payload accidentally sent to a user must fail schema validation and remain subject to T37 ACL.
2. Cursor/note/audit identity from a different request must violate the composite relationship; normal user IDs do not become admins through role strings.
3. Concurrent retries/duplicate message ordinals/status revisions must not create two durable records; rollback retains previous request/message/audit state.
4. Unicode body/title length and whitespace/system acknowledgment boundaries must agree with PostgreSQL limits without truncating or inventing content.
5. Additive migration must preserve existing auth/chat/crypto/notification rows and unrelated schemas; no test may migrate the main database or reuse live T36 human runtime data.
