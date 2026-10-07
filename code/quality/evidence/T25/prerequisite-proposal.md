# T25 prerequisite and exact wiring

Verified: rooms/detail/member DTOs contain no play session IDs. Recruitment cards contain no play session ID and public recruitment APIs intentionally omit PRIVATE/CLOSED cards. T24 snapshot/join/start/end take a known play session ID. Production T25 cannot discover current/historical sessions in a private persistent room through those APIs; do not synthesize IDs or weaken public card ACL.

Under prior human broad write/locked-file grants and current continue instruction, add owner checkpoints before T25:

1. T03-FIX12: packages/contracts/src/teams.ts, src/index.ts, test/room-play-sessions.test.ts, derived dist/**, quality/api-contract.md, evidence/T03-FIX12/**, ordinary ledger/coverage. Declare member-only GET /api/v1/rooms/:id/play-sessions, shared strict cursor/limit20(max50) schema and existing Page<PlaySessionDTO> response. Stable newest createdAt/id cursor. No new DTO, DB or privacy reduction.
2. T24-FIX1: apps/api/src/modules/play-sessions/play-sessions.controller.ts and service.ts, apps/api/test/room-play-sessions.integration.spec.ts, evidence/T24-FIX1/**. Add paginated read with current authenticated/onboarded membership, actor ban/session rechecks, stable cursor. Existing mutations unchanged; preserve all frozen T24 tests/logs. No AppModule/module/DB edits needed: existing controller is already wired.
3. T25 integration extension: only imports/render placement for owned roster/invitation components in apps/web/src/features/rooms/RoomsPage.tsx, request-action child in RecruitmentCard.tsx, global invitation/request route/widget in apps/web/src/App.tsx; new headed UI/E2E scripts in T25 evidence. Preserve original chat/room/settings logic and approved FG layout. Existing settings modal can be reused; do not duplicate owner permission logic.

Rule07 requires contract changes in their owning checkpoint. Complete RED/PASS+review for each checkpoint sequentially, then T25 DOM tests and actual headed API/DB E2E. No production mocks, guessing private play IDs, task skip or fabricated PASS.
