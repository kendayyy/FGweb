# FG T30 - TeamsService & PlaySessionsService Read-Lock Revised Proposal Review Notes (`antigravity-team-read-lock-review-1`)

## 1. Diagnostic Context & Tightened Source Guards

- **Pool 15 Attribution & Contention Review**:
  - Pool 15 positively identified as `TeamsService` database connection pool used inside `PlaySessionsService` transactions.
  - Native 18 recorded room-lock wait times up to 6004ms with hold times up to 968ms.
  - Native 19 canonical failure recorded 13 GET `snapshot` calls and 5 GET `requests` calls during initial room load before RTP due to 10s UI periodic refetch cycles.
  - Read-only queries `TeamsService.snapshot` and `PlaySessionsService.requests` were previously executing exclusive `FOR UPDATE` locks on `rooms`, `play_sessions`, and sorted `user` rows, creating heavy writer contention against fresh signaling readers attempting to acquire `FOR SHARE` locks during WebSocket room join/lease.
- **Tightened Lock Interpolation Guards**:
  - Rather than directly interpolating `${mode}`, both services now explicitly guard and bind the lock clause:
    `const lockClause = mode === 'FOR SHARE' ? 'FOR SHARE' : 'FOR UPDATE';`
  - Only literal canonical SQL clauses `'FOR SHARE'` or `'FOR UPDATE'` can ever be interpolated into the query text.
  - Public method signatures, authentication guards, transaction boundaries, query order, deadline options, and permission enforcement remain 100% untouched.
  - All mutating methods (`apply`, `admit`, `respond`, `cancel`, `mine`, `join`, `start`, `leave`, `end`) strictly retain default exclusive `'FOR UPDATE'` locking.

---

## 2. Test Architecture Corrections (`t30-team-read-lock.integration.spec.ts`)

Following review of actual `packages/database/src/schema/` definitions and migration constraints:

1. **Exact Schema Conformance & Deferred Constraints**:
   - `rooms`: Correctly includes `game_id` referencing seeded game, `conversation_id`, `owner_role: 'OWNER'`, `visibility: 'PUBLIC'`, `invite_policy: 'OWNER_APPROVAL'`, and `player_capacity: 5`.
   - `room_members`: Correctly uses `joined_at` without non-existent `created_at`/`updated_at` columns.
   - `team_members`: Correctly populates required FK fields `play_session_id`, `user_id`, `slot_index`, `player_capacity: 5`, and `is_host`.
   - `active_play_slots`: Conforms to composite FKs referencing `(play_sessions.id, state)` and `(team_members.play_session_id, user_id, slot_index)`.
   - `recruitments`: Conforms to `recruitments_room_game_fk`, `recruitments_game_title_fk`, and capacity checks (`current_players <= player_capacity`).
   - Circular owner-membership (`rooms_owner_membership_fk` DEFERRABLE INITIALLY DEFERRED): All fixture deletion and seeding runs inside a single database transaction with `SET CONSTRAINTS ALL DEFERRED`.
2. **Deterministic State Restoration in `resetAndSeedFixture`**:
   - Restores all base users' deleted/expired sessions with `INSERT INTO session ... ON CONFLICT(id) DO UPDATE SET expires_at=EXCLUDED.expires_at`.
   - Re-inserts onboarding `game_interests` (`ON CONFLICT DO NOTHING`) and `profiles` (`ON CONFLICT DO UPDATE`).
   - Resets helper permissions, room memberships, and deletes moderation BAN actions.
3. **Strict Literal Error Matching**:
   - `expectHttpError` asserts exact status code, `ErrorCode`, and the literal error message from source:
     - Expired/deleted session: `(401, LOGIN_REQUIRED, 'Session expired or revoked')`
     - Banned user: `(403, FORBIDDEN, 'Account is banned')`
     - Onboarding incomplete: `(403, FORBIDDEN, 'Onboarding required')`
     - TeamsService non-membership: `(403, FORBIDDEN, 'Room membership required')`
     - PlaySessionsService non-membership: `(403, FORBIDDEN, 'Current room membership required')`
     - PlaySessionsService non-manager queue: `(403, FORBIDDEN, 'Recruitment management permission required')`
4. **Bounded Asynchronous Waits & Fail-Safe Cleanup**:
   - All deferred waits wrapped with `awaitWithTimeout(promise, ms, label)` (independent 1500–3000ms bounds).
   - Early API rejections immediately notify and reject the barrier wait to prevent hanging.
   - Writer clients, blocker clients, transactions, and pg prototype overrides are placed inside comprehensive `try ... finally` blocks from connection acquisition.
   - Teardown failures are aggregated via `AggregateError` after attempting all cleanup steps.
5. **Precise Writer Exclusion & PID Verification**:
   - Reader PID is captured observationally from `(client as { processID?: number }).processID`.
   - Snapshot reader is paused at the final roster query (`team_members`); requests reader is paused at the final `join_requests` query (after context locks are held).
   - Verifies `pg_blocking_pids(writerPid)` contains `readerPid` and writer remains unfinished until the barrier is resolved.
6. **Deterministic Revocation Proof**:
   - Uses `pg_blocking_pids(readerPid)` containing `blockerPid` to prove the reader is actively waiting on the held room lock before revoking session/membership/grant in the blocker transaction.
   - No artificial delays used as proof of lock ordering.

---

## 3. Proposal Status & Execution Discipline

- Round 1 files in `quality/evidence/T30/antigravity-team-read-lock-1/` remain preserved.
- Revised files written exclusively to `quality/evidence/T30/antigravity-team-read-lock-review-1/`.
- No actual application code, compiled dist, git ledger, or history files were altered.
- No build or test executions were run by this agent.
- Awaiting Codex gates, review, RED on old source, patch adoption, GREEN on new source, API build, and headed native validation.
