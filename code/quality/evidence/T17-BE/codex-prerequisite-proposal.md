# Reviewed prerequisites for T17-BE / T17-FE

T13-FIX1 and T16-FE PASS at commits3cbbd79 and6941e7a. T17-BE predecessor gate PASS. Antigravity read-only preflight (conversation d2be11f8-a376-48ee-ac1c-959bce7fd416, Gemini3.6 Flash (High), exit0) identified existing chat write enforcement and missing request-list contract. No implementation source changed.

Codex real compiled-API/PostgreSQL probe seeded two synthetic users, one DM and a peer block in an isolated schema. POST /api/v1/conversations/dm-ab/messages returned201 and persisted one new message despite the block; expected403 and zero new messages. RED command and cleanup evidence: codex-blocked-dm-red.json/txt. Existing REST calls ChatService.create; the current gateway has subscription/unsubscription and delivery, no message-send handler. Do not invent a websocket send path or incorrectly claim unimplemented social endpoints already reject guests. DM read/subscription participant ACL exists; new social endpoints still need implementation and tests.

## Proposed sequential order

T03-FIX6 → T12-FIX1 → T17-BE → T17-FE → remaining existing queue. One task at a time, Antigravity implements, Anti2 observes, Codex independently verifies and closes. Fixed refactor limit remains removed. No product/design/database baseline change or purchased service.

### T03-FIX6 — pending friend-request listing contract

Write: packages/contracts/src/moderation.ts, packages/contracts/src/index.ts, packages/contracts/test/social-contracts.test.ts, quality/api-contract.md, quality/evidence/T03-FIX6/**. Codex ledger/coverage only.

Add authenticated GET /api/v1/friends/requests with direction INCOMING/OUTGOING (default INCOMING), existing bounded pagination/cursor conventions, Page response. Public request DTO contains requestId, sender/receiver UserSummary, literal PENDING status and UTC createdAt/updatedAt; no email/provider/session/private profile fields. Ownership filters are backend obligations; contracts tests assert registry/request/response validation, enum/limit errors and public projection. Existing send/respond/cancel endpoints stay unchanged. Needed so T17-FE can show incoming requests to the receiver for acceptance and outgoing requests for cancellation without backend-only DTOs.

Verification: behavioral RED for missing contract registration/schema; task contracts tests, full contracts regression, build, source/test typecheck, lint, privacy/frozen baseline audit. No production backend/frontend change in this task.

### T12-FIX1 — enforce block policy in the existing DM write path

Write: apps/api/src/modules/chat/chat.service.ts (DM write enforcement only), apps/api/test/dm-block.integration.spec.ts, quality/evidence/T12-FIX1/**. Codex ledger/coverage only. Do not modify historic chat tests/evidence or assertions.

For DM writes require no block in either direction; preserve read/history/subscription rights of existing participants, old messages and room membership. Put enforcement in the existing shared write path to prevent bypass via direct POST after a DM is already created. Use a consistent canonical-pair transaction lock protocol shared with subsequent social block/request/get-or-create mutations; T17-BE implements the matching protocol, without DB schema change or global interceptor/provider override. Deny blocked new writes before message/draft/outbox effects. Maintain replay/dedup semantics and transaction rollback.

Verification: real PostgreSQL/compiled API RED → PASS for both block directions and retry, zero message/outbox/draft effects on denied new write; preserve old history and membership; unblock permits write; guest/outsider denied; test atomic ordering using the documented pair transaction lock protocol. Existing API regression, build, source/test typecheck, lint, scope/baseline/cleanup audit. End-to-end block/send race via the actual social endpoint is additionally required in T17-BE after it exists; do not claim that endpoint tested before implementation.

### T17-BE resumed scope after these prerequisites

Original social module and social.integration.spec.ts plus minimal apps/api/src/app.module.ts import/mount of SocialModule, and owned evidence. Implement the approved listing contract alongside original ten social endpoints; no copy DTOs. Current session/ban/CSRF and receiver-only response; self/outsider denial; canonical pair retry/concurrency; blocks deny new invitations/DM; owner-only private lists; history/membership preserved. Real HTTP/WS ACL and regression proof. Future room/play invitation owners must enforce the same block policy when those endpoints are built; do not fabricate invitation endpoints now.

Approval is required only for these concrete changes to locked contracts/chat ownership and the stated T17 wiring. task.md rule8 restricts allowed files; rule07 requires contract changes in their owning task. Previous approval removed the retry count but did not broaden these files.
