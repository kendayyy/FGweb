# FG T30 - TeamsService & PlaySessionsService Read-Lock Proposal Review Notes (`antigravity-team-read-lock-1`)

## 1. Diagnostic Context & Performance Hypothesis

- **Pool 15 Attribution**: Diagnostic logs and gateway timing summary 8 positively identify Pool 15 as `TeamsService`, utilized inside `PlaySessionsService` transactions.
- **Lock Contention in Native Runs**:
  - Native 18 observed room-lock wait times reaching up to 6004ms, with locks held for up to 968ms.
  - Native 19 canonical failure (`native19-photo-review.json`) revealed that during room loading before RTP, the client executed 13 GET `snapshot` calls and 5 GET `requests` calls (due to 10s UI snapshot refetch and 10s owner queue polling).
- **Core Problem Identified**:
  - Read-only operations `TeamsService.snapshot` and `PlaySessionsService.requests` were previously acquiring exclusive `FOR UPDATE` locks on `rooms`, `play_sessions`, and sorted `user` rows.
  - These exclusive locks blocked concurrent signaling readers attempting to acquire `FOR SHARE` locks on the room during WebSocket connections.
- **Architectural Optimization Hypothesis**:
  - Transitioning read-only `snapshot` and `requests` endpoints to canonical `FOR SHARE` locks allows concurrent read operations between signaling gateways and background UI polling.
  - All mutating operations strictly retain exclusive `FOR UPDATE` locks.
  - This is framed as a targeted concurrency optimization hypothesis, **not** claimed as proven complete root cause or a guarantee of full native acceptance.

---

## 2. Minimal Source Refinements (2 Classes, 6 Paths)

### A. `TeamsService` (`apps/api/src/modules/teams/teams.service.ts`)
1. **Private Typed Lock Mode**: Added private type `type LockMode = 'FOR UPDATE' | 'FOR SHARE';`.
2. **Canonical Typed Clause Interpolation**:
   - `room(db: PoolClient, id: string, mode: LockMode = 'FOR UPDATE'): Promise<Room>`
   - `play(db: PoolClient, id: string, mode: LockMode = 'FOR UPDATE'): Promise<Play>`
3. **Selective Read Sharing**:
   - `snapshot(userId, sessionId, id)`: Calls `this.room(db, located.room_id, 'FOR SHARE')` and `this.play(db, id, 'FOR SHARE')`.
4. **Mutations Preserved**:
   - `apply`, `admit`, `respond`, `cancel`, `requests`, and `mine` retain default `'FOR UPDATE'` exclusive locks.
   - All authorization checks, ban/session/onboarding validations, outbox notifications, and contract DTO mappings remain byte-identical.

### B. `PlaySessionsService` (`apps/api/src/modules/play-sessions/play-sessions.service.ts`)
1. **Private Typed Lock Mode**: Added private type `type LockMode = 'FOR UPDATE' | 'FOR SHARE';`.
2. **Canonical Lock Method Signatures**:
   - `play(db: PoolClient, id: string, mode: LockMode = 'FOR UPDATE'): Promise<Play>`
   - `context(db: PoolClient, id: string, user: string, session: string, manage=false, requireMember=true, extra: string[]=[], mode: LockMode = 'FOR UPDATE')`
   - Retains strict canonical lock order: `rooms` -> sorted `"user"` -> `play_sessions`, applying `mode` to all three levels.
3. **Selective Read Sharing**:
   - `requests(user, session, id)`: Calls `this.context(db, id, user, session, true, true, [], 'FOR SHARE')`.
4. **Mutations Preserved**:
   - `join`, `respond`, `start`, `leave`, and `end` call `context` with default exclusive `'FOR UPDATE'` locking.
   - All caller bytes, permissions, and session guards remain unchanged.

---

## 3. Integration Test Suite Architecture (`t30-team-read-lock.integration.spec.ts`)

The integration test suite comprises 20 rigorous test cases using an isolated real PostgreSQL schema (`t30_team_*`) and direct service instantiation (`TeamsService`, `PlaySessionsService`):

1. **Read Concurrency (1500ms Bound)**:
   - Proves `teamsService.snapshot` and `playSessionsService.requests` execute successfully within 1500ms while an external transaction concurrently holds `rooms` and `play_sessions` `FOR SHARE`.
   - On the previous source, these operations would block waiting for `FOR UPDATE` and exceed the deadline.
2. **Writer Exclusion via Backend PID**:
   - Intercepts the reader transaction at the roster/queue SELECT query using a test-controlled deferred barrier.
   - An independent writer transaction requests `SELECT id FROM rooms WHERE id=$1 FOR UPDATE`.
   - Proves `pg_blocking_pids` on the writer's backend PID references the reader's backend PID, and that the writer remains unfinished until the reader releases its barrier and commits.
   - Also verifies writer exclusion on `play_sessions` row.
3. **Authority Negatives**:
   - Strict assertions against `HttpException`: `getStatus()` and `(getResponse() as any).code`.
   - Validates 401 `LOGIN_REQUIRED` for expired or deleted sessions.
   - Validates 403 `FORBIDDEN` for banned users, users without onboarding, and non-member outsiders.
   - Validates 403 `FORBIDDEN` for non-manager members and helpers lacking `MANAGE_RECRUITMENT` on the queue endpoint.
   - Validates that ordinary room members who are not in the roster or management can read snapshots.
4. **Fresh Post-Lock Authorization**:
   - Reader starts and waits behind an existing writer lock.
   - While the reader is waiting, the test revokes session or deletes membership/permissions.
   - Writer commits; reader acquires lock and re-evaluates authorization, failing immediately with 401/403 without leaking protected DTOs.
5. **Teardown & Error Propagation**:
   - Complete schema drop (`DROP SCHEMA CASCADE`) and pool/client closure.
   - Restores `process.env` and `pg.Client.prototype.query`.
   - Errors during teardown are collected and propagated via `AggregateError` rather than swallowed.

---

## 4. Current Proposal Hashes & Execution Status

No application source files (`apps/`), compiled distributions (`dist/`), git ledger, or history files were modified. No test or build commands were run by this agent.

Ready for Codex to review, run gates, verify RED on old source, adopt patch, verify GREEN on new source, build API, and conduct headed native validation.
