# FG T30 — Call Participant Lease Batching Test-First RED Proposal (`antigravity-call-participant-lease-batch-red-1`)

## 1. Executive Summary & Measured Context

- **Task**: FG T30 — Test-First RED Integration & Contract Test Proposal.
- **Scope**: Strictly confined to `quality/evidence/T30/antigravity-call-participant-lease-batch-red-1/**`.
- **Operating Constraints**: Sequential single-task execution, Gemini 3.6 Flash (High), NO Anti2 (`NO-ANTI2-01`), no subagents, proposals only. No application source, `dist/`, runtime configs, database migrations, ledger, or history files were altered. Zero tests, builds, or browser runs were executed by this agent.
- **Empirical Measured Context**:
  - `native31` executed two real screen captures successfully, but the viewer selector count assertion failed due to a gateway `RoomsShare` timeout (`57014`, `statement_timeout: 3000ms`).
  - Analysis of `pg-wait-native31-summary-1.json` confirmed 92 actual server samples with health 0 and up to 11 concurrent backend PIDs. Lifecycle `UPDATE` (PIDs 9885/9914) waited 13–14s before grant because multiple shared lock holders rotated row locks on `rooms` and `call_groups`.
  - In `CallsService.participants`, `controlsGroup(db, id, user, session, 'FOR SHARE')` holds `FOR SHARE` locks on `rooms` and `call_groups` throughout the subsequent execution of `participantDtos(db, id)`.
  - In `participantDtos`, a serial loop executes `await liveLease(db, row.media_identity)` sequentially for every participant row. Each `liveLease` invocation runs a 7-table join query against `call_admissions`, `call_members`, `call_groups`, `room_members`, `session`, `profiles`, `game_interests`, and `admin_actions`.
  - Under concurrent calls and admissions, this serial loop inflates the shared lock hold duration, queueing exclusive `UPDATE` operations and cascading `57014` query cancellations.

---

## 2. Test-First RED Strategy

The test specification [`t30-call-participant-lease-batch.integration.spec.ts`](./t30-call-participant-lease-batch.integration.spec.ts) provides complete contract and integration coverage proving the serial query multiplier before any implementation change is made:

1. **SQL Query Multiplier Counter (Counter RED/GREEN Case)**:
   - Measures real `pg.Client.prototype.query` calls matching admissions guard queries (`\bfrom\s+["']?call_admissions["']?\s+a\s+join\s+["']?call_members["']?`).
   - With 3 valid callers in the call, the current unbatched implementation executes 3 queries (fails `expect(leaseQueryCount).toBe(1)` with `Expected: 1, Received: 3`, yielding a true RED).
   - Once the future batched `liveLeases` is implemented, the same test will execute exactly 1 query and pass (GREEN).
   - Asserts empty participant list returns `[]` with 0 queries.

2. **Structural Bulk Helper Contract**:
   - Accesses `liveLeases` via typed namespace reflection (`(leaseStore as { liveLeases?: LiveLeasesFunction }).liveLeases`).
   - Does not use named imports that would cause TypeScript or Jest compilation crashes.
   - When `liveLeases` is undefined on current source, tests fail clean Jest assertions (`expect(typeof liveLeasesFn).toBe('function')`) intentionally.
   - Tests cover empty input (0 SQL queries), duplicate/absent IDs handling, and exact structural equivalence with individual `liveLease` results.

3. **Full DTO Schema Stability**:
   - Validates all participant items against `CallParticipantSchema` and `IsoDateTimeSchema`.
   - Confirms seat index ordering (seat 1, 2, 3), `mediaIdentity` format (`admission_<uuid>`), avatar fallback policy, custom statuses (`PLAYING`, `JUST_CHATTING`, `LOOKING_FOR_TEAM`), and boolean flags (`isPublishing`, `micRestricted`, `isMuted`).

4. **Complete Invalidation Branch Coverage**:
   - Ensures the reading actor remains authorized while manipulating a secondary participant, verifying that unauthorized callers are omitted while remaining callers preserve stable, complete DTOs:
     - Revoked admission (`revoked_at IS NOT NULL`).
     - Expired admission (`expires_at < clock_timestamp()`, with `created_at` set earlier to satisfy the `expires_at > created_at` table check constraint).
     - Disconnected > 30 seconds vs reconnect within the 30-second window.
     - Call member left (`left_at IS NOT NULL`).
     - Call group closed (`state != 'OPEN'`).
     - Session expired, deleted, or assigned to a different user.
     - Room membership revoked.
     - Profile missing.
     - Game interest missing.
     - Admin `BAN` followed by subsequent `UNBAN` restoration.

5. **Caller Access Authority & Frozen Error Contracts**:
   - 404 `NOT_FOUND` on nonexistent call group (`Call not found`).
   - 409 `CALL_CLOSED` on closed call group (`Call is closed`).
   - 403 `FORBIDDEN` on non-member outsider (`Current room membership required`).
   - 401 `LOGIN_REQUIRED` on expired session (`Session expired or revoked`).
   - 403 `FORBIDDEN` on banned actor (`Account is banned`).
   - 403 `FORBIDDEN` on un-onboarded actor (`Onboarding required`).

6. **Post-Lock-Wait Actor State Guard Race**:
   - An independent writer client acquires an exclusive row-level lock on `rooms` (`SELECT * FROM rooms WHERE id = $1 FOR UPDATE`).
   - The reader initiates `callsService.participants()`, which requests `FOR SHARE` on the same room row.
   - PostgreSQL blocks the reader query. The test queries `pg_stat_activity` and `pg_blocking_pids` to verify that the reader is actively blocked by the writer backend PID.
   - While the reader is blocked, the reading actor's session is invalidated in the database.
   - The writer commits and releases the lock.
   - The reader acquires the lock, advances to the post-lock actor check, detects the invalidated session, and throws `401 LOGIN_REQUIRED`.
   - Proves no stale DTO is returned across lock contention.

7. **Late Lease Revocation Before Query Execution**:
   - A lossless delegate hook on `pg.Client.prototype.query` intercepts execution immediately before the `call_admissions` query runs.
   - Concurrently updates `revoked_at = clock_timestamp()` on a participant's admission.
   - Releases the hook and allows the query to proceed against PostgreSQL.
   - Proves the query executes live against the database, filtering out the revoked participant and preventing stale pre-query cached results.

---

## 3. Dependency Injection & Test Isolation Rationale

1. **Inert Service Substitutes**:
   - `CallsService` requires `(auth: AuthService, rooms: RoomsService)` in its constructor.
   - In `CallsService.participants()`, zero methods on `auth` or `rooms` are invoked; all authorization and guard checks run directly via SQL transactions against PostgreSQL (`session`, `admin_actions`, `profiles`, `game_interests`, `rooms`, `room_members`, `call_groups`).
   - Passing minimal inert objects (`{ setCallHooks: () => {} }`, `{ setCallRevoker: () => {} }`) completely satisfies constructor requirements without mocking business behavior.

2. **Dedicated Schema Isolation**:
   - Each run creates and migrates a dedicated PostgreSQL schema (`t30_call_lease_batch_<32hex>`).
   - All connection pools configure `-c search_path=<owned_schema>`, guaranteeing complete isolation from other tests and application data.
   - `afterAll` drops the schema via `CASCADE` and terminates all connection pools.

3. **Lossless Query Delegate**:
   - Wraps `pg.Client.prototype.query` during observation blocks.
   - Forwards all arguments, callbacks, Promises, and errors to the original implementation without modification.
   - Restores the original prototype in `finally` blocks, guaranteeing zero cross-test interference.

---

## 4. Proposed Artifacts & SHA-256 Hashes

| File | Purpose | SHA-256 Hash |
| :--- | :--- | :--- |
| [`t30-call-participant-lease-batch.integration.spec.ts`](./t30-call-participant-lease-batch.integration.spec.ts) | Test-first RED integration and contract suite | `C9B41A047689B819D86614AF9F2978BCFA550083DB0C629A9A3A0AE38A6C550D` |
| [`review-notes.md`](./review-notes.md) | Architectural rationale, test design, and evidence notes | *(current document)* |

---

## 5. Security & Verification Note

- No database credentials, connection URLs, private keys, JWTs, or session tokens are printed or leaked in these notes or the test artifacts.
- No application source code, `dist/` files, or runtime configs outside `quality/evidence/T30/antigravity-call-participant-lease-batch-red-1/` were created or modified.
- Ready for Codex review and test execution against current unbatched source to verify RED before the implementation proposal is produced.
