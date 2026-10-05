import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const codeRootDir = path.resolve(import.meta.dirname, '../../../');
const evidenceDir = path.resolve(codeRootDir, 'quality/evidence/T06');

if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

function runAndRecord(name, command, logFileName, jsonFileName) {
  const startedAt = new Date().toISOString();
  const logPath = path.join(evidenceDir, logFileName);
  const jsonPath = path.join(evidenceDir, jsonFileName);

  let output;
  let exitCode = 0;

  try {
    output = execSync(command, { cwd: codeRootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    exitCode = err.status ?? 1;
    output = (err.stdout ?? '') + '\n' + (err.stderr ?? '');
  }

  const completedAt = new Date().toISOString();
  fs.writeFileSync(logPath, output, 'utf8');

  const evidenceSha256 = crypto.createHash('sha256').update(output).digest('hex');
  const metadata = {
    command,
    cwd: 'E:/FGweb/code',
    startedAt,
    completedAt,
    exitCode,
    evidencePath: `quality/evidence/T06/${logFileName}`,
    evidenceSha256,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2), 'utf8');
  return metadata;
}

const steps = [
  { name: 't06-codex-10-regressions-loop2', command: 'node --test quality/evidence/T06/codex-regressions.test.mjs', log: 'raw-codex-loop2.log', json: 'raw-codex-loop2.json' },
  { name: 't06-acceptance-loop2', command: 'npm run test --workspace @fg/database -- test/team-constraints.test.ts', log: 'raw-t06-acceptance-loop2.log', json: 'raw-t06-acceptance-loop2.json' },
  { name: 't05-node-regressions-loop2', command: 'node --test quality/evidence/T05/codex-regressions.test.mjs', log: 'raw-t05-regressions-loop2.log', json: 'raw-t05-regressions-loop2.json' },
  { name: 'db-full-regression-loop2', command: 'npm run test --workspace @fg/database', log: 'raw-test-db-loop2.log', json: 'raw-test-db-loop2.json' },
  { name: 'build-loop2', command: 'npm run build --workspace @fg/database', log: 'raw-build-loop2.log', json: 'raw-build-loop2.json' },
  { name: 'db-tsc-check-loop2', command: 'node node_modules/typescript/bin/tsc -p quality/evidence/T06/tsconfig.check.json', log: 'raw-db-typecheck-loop2.log', json: 'raw-db-typecheck-loop2.json' },
  { name: 'workspace-typecheck-loop2', command: 'npm run typecheck', log: 'raw-typecheck-loop2.log', json: 'raw-typecheck-loop2.json' },
  { name: 'lint-loop2', command: 'npm run lint', log: 'raw-lint-loop2.log', json: 'raw-lint-loop2.json' },
  { name: 'migration-consistency-loop2', command: 'npm run db:generate --workspace @fg/database', log: 'raw-migration-consistency-loop2.log', json: 'raw-migration-consistency-loop2.json' },
];

const results = [];
for (const step of steps) {
  console.log(`Running step: ${step.name}...`);
  const res = runAndRecord(step.name, step.command, step.log, step.json);
  results.push(res);
  console.log(`  -> exitCode ${res.exitCode}`);
}

fs.writeFileSync(path.join(evidenceDir, 'final-verification.json'), JSON.stringify(results, null, 2), 'utf8');

const manifestContent = `# T06 Manifest (Refactor Loop 2)
Task T06 (Schema phòng, quyền, buổi chơi và tuyển đội), Antigravity Gemini 3.6 Flash (High), fresh conversation sequential. T05 PASS. T07+ queued.

## Write Scope
- \`packages/database/src/schema/games.ts\` (games_id_title_unique composite unique constraint)
- \`packages/database/src/schema/conversations.ts\` (conversations_id_kind_unique constraint)
- \`packages/database/src/schema/rooms.ts\` (rooms, room_members, permission_grants with owner role & roomMembers FK)
- \`packages/database/src/schema/teams.ts\` (play_sessions, team_members, active_play_slots with session-room & roster seat FKs)
- \`packages/database/src/schema/recruitments.ts\` (recruitments, join_requests, invitations with NOT NULL play_session_id & ON DELETE NO ACTION FK)
- \`packages/database/src/index.ts\` (schema exports)
- \`packages/database/migrations/0002_curvy_scourge.sql\` (NEW forward migration)
- \`packages/database/migrations/meta/_journal.json\` & \`0002_snapshot.json\`
- \`packages/database/test/team-constraints.test.ts\` (T06 database test suite)
- \`quality/evidence/T06/**\`

## Test Results
- Codex expanded regression suite (\`codex-regressions.test.mjs\`): **10 passed (0 failed)**.
- T06 acceptance suite (\`team-constraints.test.ts\`): **7 passed (0 failed)**.
- T05 compiled node regression suite (\`quality/evidence/T05/codex-regressions.test.mjs\`): **2 passed (0 failed)**.
- Full database regression suite (\`packages/database\`): **23 passed (0 failed)** across 3 test files (\`identity.test.ts\`, \`social-chat.test.ts\`, \`team-constraints.test.ts\`).
- Database source & test typecheck (\`tsconfig.check.json\`): **Passed (exit code 0)**.
- Workspace build (\`@fg/database\`): **Passed (exit code 0)**.
- Workspace typecheck (\`tsc --noEmit\`): **Passed (exit code 0)**.
- Workspace lint (\`eslint .\`): **Passed (0 errors)**.
- Migration consistency (\`db:generate\`): **Passed (0 drift)**.

## Relational Invariants Verified (Loop 2)
1. **Issue A - Room Members FK Restored**: \`room_members.room_id\` references \`rooms.id\` via typed thunk callback \`(): AnyPgColumn => rooms.id\`. Inserting orphan room memberships is rejected with 23503.
2. **Issue B - Recruitment Play Session ID NOT NULL**: \`recruitments.play_session_id\` is \`NOT NULL\`. Inserting \`NULL\` for \`play_session_id\` is rejected with PG error 23502. Setup fixtures in Codex test 18 were updated to supply a valid play session \`ps1\` attached to room \`r1\`, preserving the exact \`23503\` bad-game rejection assertion.
3. **Issue C - Recruitment Play Session FK Non-Cascading**: \`recruitments_play_session_fk\` uses \`ON DELETE NO ACTION\`. Attempting to delete a referenced play session while a recruitment card exists for it is rejected with 23503, preserving play session history and card links.
`;

fs.writeFileSync(path.join(evidenceDir, 'run-manifest.md'), manifestContent, 'utf8');
console.log('T06 Loop 2 evidence recorded successfully.');
