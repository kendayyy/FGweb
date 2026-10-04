# T04 Task Execution & Evidence Manifest (Loop 1 Refactor)

- **Task**: T04 (Schema identity, hồ sơ và danh mục game)
- **Timestamp**: 2026-10-05T06:16:45+07:00
- **Working Directory**: `E:/FGweb/code`

## Commands & Exit Codes Recorded
1. **Database Workspace Tests**:
   - Command: `npm run test --workspace @fg/database -- test/identity.test.ts`
   - Exit Code: `0`
   - Log File: [test-pass.log](./test-pass.log)
   - Results: 6 passed / 6 tests (0 failed, 0 skipped)

2. **Database Workspace Build**:
   - Command: `npm run build --workspace @fg/database`
   - Exit Code: `0`
   - Log File: [build.log](./build.log)

3. **Codex Review Typecheck**:
   - Command: `node node_modules/typescript/bin/tsc --project .cache/t04-review-tsconfig.json`
   - Exit Code: `0`
   - Log File: [typecheck.log](./typecheck.log)

4. **Workspace Lint**:
   - Command: `npm run lint`
   - Exit Code: `0`
   - Log File: [lint.log](./lint.log)

5. **Behavior RED Phase Failure**:
   - Command: `npm run test --workspace @fg/database -- test/identity.test.ts`
   - Exit Code: `1`
   - Log File: [red-test.log](./red-test.log)
   - Failure Cause: `AssertionError: expected 'Lobby Liên Minh Huyền Thoại' to be 'Lobby'` (Lobby name exactness spec compliance).

## Summary of Fixes Applied in Refactor Loop 1
1. **Typecheck & Path Resolution**:
   - Replaced relative `.mjs` import with a robust, zero-dependency local typed env reader (`loadLocalEnv`) using `node:fs` and `node:util`.
   - Updated `db` type signature to `NodePgDatabase<typeof schema> & { $client: pg.Client }`.
   - Generics added for Better Auth `adapter.create<T>` and `adapter.findOne<T>` calls (`UserRecord`, `AccountRecord`, `SessionRecord`, `VerificationRecord`) for complete type safety without `any` or `@ts-ignore`.
   - Verified `node node_modules/typescript/bin/tsc --project .cache/t04-review-tsconfig.json` passes cleanly with exit code 0.

2. **Spec Compliance for Lobby Names & Game Seed Assertions**:
   - Updated `seedGames` in `packages/database/src/seed-games.ts` to set exact name `'Lobby'` for every game per spec section 2.
   - Added assertions verifying all 7 lobby names equal `'Lobby'`, all 7 game titles match `ALLOWED_GAMES`, 7 unique games, and 1 unique `gameId` per Lobby.
   - Verified idempotency (repeated `seedGames` returns identical game IDs and lobby IDs).

3. **PostgreSQL Specific Error Code Assertions**:
   - Added error handling helper `getPgErrorCode(err)` to inspect `err.cause?.code ?? err.code`.
   - Enforced exact PostgreSQL error code `23505` (`unique_violation`) for duplicate user email, duplicate account identity (`providerId` + `accountId`), duplicate `gameProfile` (`userId` + `gameId`), duplicate `gameInterest` (`userId` + `gameId`), and duplicate `lobbies` (`gameId`).
   - Enforced exact PostgreSQL error code `23503` (`foreign_key_violation`) for invalid FK references (`session.userId`, `gameProfiles.gameId`, `gameProfiles.userId`, `lobbies.gameId`).

4. **Better Auth Adapter Coverage for All 4 Models & Metadata**:
   - Exercised adapter `create` and `findOne` across all 4 Better Auth models: `user`, `account`, `session`, `verification` with proper date objects and fields.
   - Checked `getAuthTables({})` structure alignment with installed Better Auth 1.7.7.

5. **Migration Isolation & Safety**:
   - Preserved schema isolation (`migrationsSchema: schemaName`) on disposable schemas (`test_t04_*`).
   - Ensured cleanup in `afterAll` drops the test schema cleanly and rethrows on failure.

## Limitations & Ledger Policy
- No git commits were created.
- `code/quality/tasks.json` status remains unchanged (not marked PASS by agent; pending Codex review).
