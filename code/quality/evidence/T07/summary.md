# T07 — Database Schema for Calls, Notifications & Moderation (Refactor Loop 2)

## Summary of Refactor Loop 2 Implementation
Task T07 refactor loop 2 resolves the remaining Section C issue identified in `codex-loop1-review.txt`:
- **Section C (Report Target Shape Check)**:
  - Updated `report_target_shape_check` in `packages/database/src/schema/moderation.ts` to require `reported_user_id IS NULL` when `target_type = 'MESSAGE'`:
    ```sql
    CHECK ((target_type = 'USER' AND reported_user_id IS NOT NULL AND reported_message_id IS NULL AND target_id = reported_user_id) OR (target_type = 'MESSAGE' AND reported_message_id IS NOT NULL AND reported_user_id IS NULL AND target_id = reported_message_id))
    ```
  - Re-folded constraint into `0003_complex_thunderbird.sql` and `0003_snapshot.json` to maintain **ZERO DRIFT** consistency.
  - Added positive valid MESSAGE report test (`reported_user_id IS NULL`) and negative mixed-target report test (`reported_user_id` supplied on MESSAGE report fails `23514`) in `packages/database/test/call-outbox.test.ts`.

- **Evidence Recording (`record-loop2.ps1`)**:
  - Executed `quality/evidence/T07/record-loop2.ps1` via pwsh tool. Recorded raw command logs, UTC start/end timestamps, exit codes, and SHA256 hashes for all 9 verification steps in `quality/evidence/T07/loop2-verification.json` and `loop2-*.txt`.

## Verification Checklist & Results
- **Acceptance Tests (`loop2-acceptance.txt`)**: `npm run test --workspace @fg/database -- test/call-outbox.test.ts` -> **PASS (13/13 Vitest tests passed, exit code 0)**.
- **Full Database Package Suite (`loop2-db-regression.txt`)**: `npm run test --workspace @fg/database` -> **PASS (4/4 test files passed, 36/36 tests passed, exit code 0)**.
- **Database Build (`loop2-build.txt`)**: `npm run build --workspace @fg/database` -> **PASS (exit code 0)**.
- **Independent Codex T07 Suite (`loop2-codex-t07.txt`)**: `node --test quality/evidence/T07/codex-regressions.test.mjs` -> **PASS (11/11 tests passed, exit code 0)**.
- **Independent Codex T05 Suite (`loop2-codex-t05.txt`)**: `node --test quality/evidence/T05/codex-regressions.test.mjs` -> **PASS (2/2 tests passed, exit code 0)**.
- **Independent Codex T06 Suite (`loop2-codex-t06.txt`)**: `node --test quality/evidence/T06/codex-regressions.test.mjs` -> **PASS (12/12 tests passed, exit code 0)**.
- **Typecheck (`loop2-typecheck.txt`)**: `node node_modules/typescript/bin/tsc -p quality/evidence/T07/tsconfig.check.json` -> **PASS (0 errors, exit code 0)**.
- **ESLint (`loop2-lint.txt`)**: `npm run lint` -> **PASS (0 errors, 0 warnings, exit code 0)**.
- **Migration Consistency & Zero Drift (`loop2-migration-consistency.txt`)**: `npm run db:generate --workspace @fg/database` -> **PASS ("No schema changes, nothing to migrate 😴", exit code 0)**.

## File Hashes
- `packages/database/src/schema/calls.ts`: 3B572C682CD090B969DD3AB832DD2E5E72CE07AD3E55931A9DE983FB37B178CF
- `packages/database/src/schema/notifications.ts`: 2C0D288CE517C6EED270C27358B5C62BB458078DD49AB9E46BD1D774B94644C7
- `packages/database/src/schema/moderation.ts`: 9BF1E48F3C1A5F119108525C05B15493677DE8061DE9718D1D199E73E447466B
- `packages/database/src/index.ts`: F8B2F4D0B3F5421268EA48AB1C204BB121CD1358612A946A237D14926960DB5D
- `packages/database/migrations/0003_complex_thunderbird.sql`: 8BD9125A32CA10E1E6CB5B248D81F8DB502FBE3D55C022965BB5957BB1A51870
- `packages/database/migrations/meta/0003_snapshot.json`: 2474E06B4A1D38DFEA40C6D8A93B5B61DBAAF7E2D1CEED079D865D8AF501D60F
- `packages/database/migrations/meta/_journal.json`: 98B7D6DDEAD472EA6501FE87CAAFC737F8180EF34D76A9AB395AF9BF81182947
- `packages/database/test/call-outbox.test.ts`: C25693FA693AB3C7496920848F014794908818A386F2C3F30438A762192E8D93
- `packages/database/vitest.config.ts`: 29DD26F44B07DBAC3E0C898DC7696973BCBF2DD5E4A45B69325269476E7D2180
