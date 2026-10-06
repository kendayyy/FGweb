# T20 — Concrete prerequisite proposal

T19 PASS commit dc11c57; the T20 task checker passed. No T20 business source has been written.

## Missing contracts

task.md requires GET /games/:id/recruitments, suggestions and PATCH reopen; the frozen route registry only declares GET /recruitments, POST /recruitments and PATCH close. CreateRecruitmentSchema has no roomId selector, so it cannot express the approved choice between an existing permanent room and a new room. The backend currently has no RecruitmentsModule registered in AppModule.

## Proposed T03-FIX8 (contracts only, before T20)

Write scope:
- packages/contracts/src/teams.ts
- packages/contracts/src/index.ts
- packages/contracts/test/recruitment-transport.test.ts (new)
- quality/api-contract.md
- quality/evidence/T03-FIX8/** and task ledger/coverage metadata.

Add an optional opaque roomId to create: present selects an existing room; absent creates a new permanent public room owned by the authenticated creator. Existing room use requires owner or helper MANAGE_RECRUITMENT and matching game; private rooms cannot publish public cards. Preserve the existing public query/response schemas and prohibit exposure of private room chat/conversation IDs. Explicitly declare GET /api/v1/games/:id/recruitments and GET /api/v1/games/:id/recruitments/suggestions (exact game/mode; public OPEN non-full cards) plus PATCH /api/v1/recruitments/:id/reopen with existing management permissions/RecruitmentDTO. Keep existing routes compatible.

Close/reopen changes recruitment availability only. Reopen an ENDED play session is rejected; a new POST can recruit for a new session within the same room, preserving membership/chat. Closing a card alone does not end a play session or release an active slot. No new media/product feature or design change.

Tests first: registry presence and request/response validation; existing/new room selection; legacy compatibility; guest public projection forbids private discovery; scheduled request clock remains evaluated per request. Verify contracts suite, consumer typechecks and build; freeze reviewed hashes.

## T20 wiring extension

Only add import of ./modules/recruitments/recruitments.module.js and add RecruitmentsModule to the existing imports list in apps/api/src/app.module.ts. This is a specifically identified locked file outside the original module/test scope. Preserve every existing module.

Then T20 writes only apps/api/src/modules/recruitments/**, apps/api/test/recruitments.integration.spec.ts, this exact AppModule wiring, and T20 evidence/ledger. PostgreSQL integration tests must prove public/private filtering, non-full suggestions/order, occupied owner409, concurrent now creation, fresh session in retained room, close/reopen and permission/session checks. T21 stays closed until verified T20 PASS. If implementation reveals a required database migration, propose it in its owning task rather than mutating frozen database files here.

Rule 07 requires contract changes in their owning task; the original T20 scope is backend only. User confirmation is required for this concrete scope extension, not for switching the executor (already authorized).
