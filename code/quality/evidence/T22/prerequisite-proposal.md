# T22 — Concrete prerequisites after T21 PASS

T21 PASS at commit78bcf08; the unchanged task checker accepts T22 prerequisites and all latest frozen outputs. Codex direct remains authorized, Anti2 paused. No T22 business source or frozen contract has been modified.

task.md explicitly requires POST /recruitments/:id/requests and POST /join-requests/:id/{approve,reject}, plus team snapshots. The frozen registry instead declares POST /recruitments/:id/join-requests and PATCH /join-requests/:id/respond with action ACCEPT/REJECT, and has a socket team snapshot but no REST read route. AppModule also has no TeamsModule wiring. Backend-only T22 cannot silently alter these frozen contracts or register its module outside its current file scope.

## Proposed T03-FIX9 before T22

Scope: packages/contracts/src/index.ts, packages/contracts/test/team-approval-transport.test.ts (new), quality/api-contract.md, quality/evidence/T03-FIX9/** and ledger/coverage metadata.

Keep all existing routes and DTO fields compatible. Add the task-required routes as aliases to the same team service:
- POST /api/v1/recruitments/:id/requests -> JoinRequestSchema, Authenticated/onboarded; actor is always session user, no applicantId accepted from the body.
- POST /api/v1/join-requests/:id/approve and /reject -> JoinRequestSchema, RoomHelperOrOwner with MANAGE_RECRUITMENT. Action derives from path; request identity is the persisted join-request id, enabling safe retries without a new idempotency field.
- GET /api/v1/play-sessions/:id -> a shared TeamSnapshotSchema containing the existing PlaySessionSchema and roster array. Export/reuse this same schema for the existing SocketTeamUpdatedPayloadSchema. Only current room members can read it; PUBLIC room visibility does not expose team data to guests/nonmembers. No extra user/provider/private account data.

Tests first: exact registry routes, permission metadata, compatibility of old routes, shared snapshot response validation and no new client-controlled actor/action override. Run contracts tests, source/consumer typechecks/build and scope audit before freezing PASS. No database schema, new feature, product decision or design change is proposed.

## T22 minimal locked-file wiring extension

Add only the TeamsModule import from ./modules/teams/teams.module.js and TeamsModule to the existing imports list in apps/api/src/app.module.ts. Preserve every current module. Then T22 owns apps/api/src/modules/teams/**, apps/api/test/team-approval.integration.spec.ts, that exact wiring and T22 evidence/ledger.

T22 must verify on real PostgreSQL: concurrent approval into two teams for one user -> one success/other409; two applicants for final seat -> one success; same request retry -> same persisted outcome; no rank barrier; owner/helper permissions; transaction rollback preserves other pending requests; immediate approval creates room membership/roster/unique active slot and cancels other immediate requests atomically; scheduled approval does not occupy or cancel immediate requests; REST privacy/session checks and compiled AppModule route verification. Do not implement invitations/lifecycle beyond reusable atomic service boundaries (T23/T24 own those tasks). Outbox inserts must be transactional and broadcasts must occur only after commit.

Approval is needed for these specific frozen contract and AppModule changes under rule07/task scope. It is not a request to change the executor. T22 stays BLOCKED until approval; no task is skipped.
