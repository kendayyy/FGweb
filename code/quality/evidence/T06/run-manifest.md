# T06 Manifest (Refactor Loop 2)
Task T06 (Schema phòng, quyền, buổi chơi và tuyển đội), Antigravity Gemini 3.6 Flash (High), fresh conversation sequential. T05 PASS. T07+ queued.

## Write Scope
- `packages/database/src/schema/games.ts` (games_id_title_unique composite unique constraint)
- `packages/database/src/schema/conversations.ts` (conversations_id_kind_unique constraint)
- `packages/database/src/schema/rooms.ts` (rooms, room_members, permission_grants with owner role & roomMembers FK)
- `packages/database/src/schema/teams.ts` (play_sessions, team_members, active_play_slots with session-room & roster seat FKs)
- `packages/database/src/schema/recruitments.ts` (recruitments, join_requests, invitations with NOT NULL play_session_id & ON DELETE NO ACTION FK)
- `packages/database/src/index.ts` (schema exports)
- `packages/database/migrations/0002_curvy_scourge.sql` (NEW forward migration)
- `packages/database/migrations/meta/_journal.json` & `0002_snapshot.json`
- `packages/database/test/team-constraints.test.ts` (T06 database test suite)
- `quality/evidence/T06/**`

## Test Results
- Codex expanded regression suite (`codex-regressions.test.mjs`): **10 passed (0 failed)**.
- T06 acceptance suite (`team-constraints.test.ts`): **7 passed (0 failed)**.
- T05 compiled node regression suite (`quality/evidence/T05/codex-regressions.test.mjs`): **2 passed (0 failed)**.
- Full database regression suite (`packages/database`): **23 passed (0 failed)** across 3 test files (`identity.test.ts`, `social-chat.test.ts`, `team-constraints.test.ts`).
- Database source & test typecheck (`tsconfig.check.json`): **Passed (exit code 0)**.
- Workspace build (`@fg/database`): **Passed (exit code 0)**.
- Workspace typecheck (`tsc --noEmit`): **Passed (exit code 0)**.
- Workspace lint (`eslint .`): **Passed (0 errors)**.
- Migration consistency (`db:generate`): **Passed (0 drift)**.

## Relational Invariants Verified (Loop 2)
1. **Issue A - Room Members FK Restored**: `room_members.room_id` references `rooms.id` via typed thunk callback `(): AnyPgColumn => rooms.id`. Inserting orphan room memberships is rejected with 23503.
2. **Issue B - Recruitment Play Session ID NOT NULL**: `recruitments.play_session_id` is `NOT NULL`. Inserting `NULL` for `play_session_id` is rejected with PG error 23502. Setup fixtures in Codex test 18 were updated to supply a valid play session `ps1` attached to room `r1`, preserving the exact `23503` bad-game rejection assertion.
3. **Issue C - Recruitment Play Session FK Non-Cascading**: `recruitments_play_session_fk` uses `ON DELETE NO ACTION`. Attempting to delete a referenced play session while a recruitment card exists for it is rejected with 23503, preserving play session history and card links.
