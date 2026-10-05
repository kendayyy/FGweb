import fs from 'node:fs';
import { createHash } from 'node:crypto';
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const ledger = JSON.parse(fs.readFileSync('quality/tasks.json', 'utf8'));
const task = ledger.tasks.find((entry) => entry.id === 'T07');
const commands = JSON.parse(fs.readFileSync('quality/evidence/T07/final-verification.json', 'utf8').replace(/^\uFEFF/, ''));
if (task.status !== 'IN_PROGRESS' || commands.length !== 12) throw new Error('Unexpected closeout state');
for (const command of commands) {
  if (command.exitCode !== 0 || sha(command.evidencePath) !== command.evidenceSha256) throw new Error('Invalid command evidence');
}
const files = [
  'packages/database/src/schema/calls.ts',
  'packages/database/src/schema/notifications.ts',
  'packages/database/src/schema/moderation.ts',
  'packages/database/src/index.ts',
  'packages/database/migrations/0003_complex_thunderbird.sql',
  'packages/database/migrations/meta/0003_snapshot.json',
  'packages/database/migrations/meta/_journal.json',
  'packages/database/vitest.config.ts',
  'packages/database/test/call-outbox.test.ts',
  'quality/evidence/T07/codex-regressions.test.mjs',
  'quality/evidence/T07/tsconfig.check.json',
  'quality/evidence/T07/audit-predecessors.mjs',
];
task.commands = commands;
task.outputsHash = { specSha256: task.specSha256, files: Object.fromEntries(files.map((file) => [file, sha(file)])) };
task.evidencePaths = [...new Set([...task.evidencePaths,
  'quality/evidence/T07/codex-review.md',
  'quality/evidence/T07/final-verification.json',
  'quality/evidence/T07/predecessor-audit.txt',
  'quality/evidence/T07/codex-regressions-red.txt',
  'quality/evidence/T07/codex-expanded-red.txt',
])];
task.completedAt = new Date().toISOString();
task.blockers = [];
task.status = 'PASS';
fs.writeFileSync('quality/tasks.json', `${JSON.stringify(ledger, null, 2)}\n`);
console.log('T07 PASS recorded from 12 verified command records; historical failed evidence preserved.');
