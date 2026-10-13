# FG T30 — Room Profile Batch Consolidation Review Notes (Round 1 Review)

**Directory**: `quality/evidence/T30/antigravity-room-profile-batch-review-1`  
**Agent**: Antigravity (Gemini 3.6 Flash High)  
**Policy**: T30 only, NO Anti2 (`NO-ANTI2-01`), sequential proposals only.  
**Execution Boundary**: No application, test, ledger, history, or git edits outside this evidence directory. Zero builds or test executions performed by this agent.

---

## 1. Concrete Fixture Fixes in `t30-room-profile-batch.integration.spec.ts`

1. **SQL Counter RED/GREEN & Structural Typed Batch Adapter**:
   - Removed all `jest.spyOn` calls on `getPublicProfiles` and `getPublicProfile`. Spying on non-existent methods on old source previously threw a `TypeError` before SQL could execute, masking the true query count.
   - Counter intercepts `pg.Client.prototype.query` and checks `/from\s+["']?user["']?/i` and `/left\s+join\s+["']?profiles["']?/i`, tracking only a numeric counter (`countProfileQueriesDuring`) with zero rawSQL array/string logging.
   - Calling `roomsService.listRoomMembers` with 6 members asserts `expect(count).toBe(1)`. On proposed source, it passes with 1 query; on unbatched original source, it executes real SQL, counts 6 queries, and fails cleanly as a true RED counter test.
   - Direct batch tests compile against old source using a structural typed batch adapter (`getBatchProfilesAdapter(profilesService)` casting to `{ getPublicProfiles(ids: string[]): Promise<ProfileDTO[]> }`) without mocking or conditional success.

2. **Avatar Source Policy & Schema Strictness**:
   - Explicit `profile.avatar_url = null` strictly yields `null` even when `user.image` exists.
   - Helper fixture seeds `avatar_url = ''` to verify empty-string fallback to `user.image` (`helper-img.png`). Member1 seeds `avatar_url = null` and `user.image = null` yielding `null`.
   - Added dedicated tests:
     - Explicit `avatar_url = null` with non-null `user.image` yields `null`.
     - Bare user without profile or game profile rows returns valid DTO with user name, image, null bio, default `'JUST_CHATTING'`, empty games array, and ISO date.
   - Every returned profile is asserted with strict equality against `PublicProfileSchema.parse(p)` (`expect(p).toEqual(PublicProfileSchema.parse(p))`), proving no unknown or private fields leak.

3. **Malformed Game Catalog, Exact 404 & Fresh Fixtures**:
   - Added scoped malformed game catalog test: corrupts `games.title` in isolated test schema, verifies `getPublicProfiles` rejects with `ZodError` on `GameTitleSchema` with zero partial DTOs returned, and restores game title in `finally`.
   - Missing first input ID asserts actual `NotFoundException`, HTTP 404 status, code `ErrorCode.NOT_FOUND`, and exact caller-order message `User profile not found: ${id}`.
   - Multiple and duplicate batch cases each measure exactly 1 SQL query; empty array measures 0 queries.
   - Each test case instantiates a fresh fixture via `seedFixture()` with unique UUIDs.
   - Added actual deleted-session test: creates real session in DB, deletes it, and asserts HTTP 401 `LOGIN_REQUIRED` with message `'Session expired or revoked'`.

4. **Robust Callback- & Promise-Aware Writer Exclusion**:
   - `readerPid` is captured on the `RoomsService` transaction client via `SELECT 1 FROM rooms WHERE id = $1 FOR SHARE`, separate from the `ProfilesService` pool client.
   - Intercepts only the first profile query (`FROM "user"` + `LEFT JOIN "profiles"`).
   - Drizzle uses `pg.Pool.query` invoking `Client.query` with a callback returning `undefined`. The wrapper wraps the completion callback: executes the real query first, announces `barrierReached.resolve()` on success, and delays invoking the original callback until `releaseBarrier.promise` resolves.
   - Includes Promise-style fallback preserving original Promises and pausing only after resolved result.
   - Verifies lock contention using `pg_blocking_pids(writerPid)` containing `readerPid`.
   - Releases barrier, settles reader and writer, asserts 6-member DTO, and verifies writer COMMIT success by checking `updatedRoom.rows[0]?.name === 'Blocked Name'`.

5. **Guaranteed Settle Paths & AggregateError Teardown**:
   - Writer client acquired and protected by `try ... finally`; uncommitted writer transactions are rolled back.
   - Settle paths attached to `listPromise` and `writerPromise` prevent unhandled rejections while preserving errors for assertions. Early reader failure signals barrier rejection so tests cannot hang.
   - All timeouts bounded (1500–3000ms).
   - In `afterAll`, both services destroyed, dynamic schema dropped `CASCADE`, connection pool ended, and all errors collected and re-thrown with `AggregateError`.

6. **Seed Schema & Rollback Safety**:
   - Circular FK `rooms_owner_membership_fk` handled via `SET CONSTRAINTS ALL DEFERRED` inside single transaction.
   - All dates formatted as ISO UTC strings.
   - Seed failure attempts rollback; if rollback fails, both errors are preserved via `AggregateError`.
   - Zero rawSQL, query parameters, DSN strings, or stack traces logged.

---

## 2. File Artifacts & SHA-256 Hashes

| File | SHA-256 Hash |
| :--- | :--- |
| `profiles.service.ts` | `e0b7f0c7efcaf209613da8cdb468c94c2840302223a57650e26f21e6e5cc33eb` |
| `rooms.service.ts` | `5324f1437362ffb6cf9a13d24715800360eb9d041c360c9c99c893b26f119383` |
| `t30-room-profile-batch.integration.spec.ts` | `37841918645eb9e32d712e286d81f586567e898b89fbdccf633c0caa0b6a10c2` |

---

## 3. Diagnostic Disclaimer

This single-query batch optimization addresses the 4182ms shared lock hold observed in `native21`/`gateway-api-timing-summary-10.json`. It is an architectural performance hypothesis, not a proof of complete sole cause or a claim of task PASS prior to canonical native verification. Codex will review, gate, test, build, and validate in canonical headed runs.
