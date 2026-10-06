import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir = 'quality/evidence/T16-FE';
const ledger = JSON.parse(fs.readFileSync('quality/tasks.json', 'utf8'));
const task = ledger.tasks.find(t => t.id === 'T16-FE');
assert.equal(task.status, 'IN_PROGRESS');
assert.equal(ledger.tasks.find(t => t.id === 'T17-BE').status, 'NOT_STARTED');
const labels = ['independent-task-final', 'independent-review-final', 'independent-lint-final', 'independent-types-final', 'independent-build-final', 'independent-full-fe-final', 'independent-native-final', 'independent-audit-after-native'];
for (const label of labels) {
  const path = `${dir}/codex-${label}.json`;
  const record = JSON.parse(fs.readFileSync(path, 'utf8'));
  assert.equal(record.exitCode, label === 'independent-full-fe-final' ? 1 : 0);
  if (!task.commands.some(c => c.evidencePath === record.evidencePath)) task.commands.push(record);
  task.evidencePaths.push(path, record.evidencePath);
}
task.status = 'BLOCKED';
task.blockers = ['Full frontend regression has 8 frozen T13 Lobby test adapter failures (60/68 PASS). Awaiting previously requested T13-FIX1 adapter-only scope approval; no fixed refactor retry limit applies.'];
task.outputsHash = null;
task.completedAt = null;
task.evidencePaths.push(`${dir}/current-review.md`, `${dir}/test-adapter-prerequisite-proposal.md`, `${dir}/resume-policy.md`);
task.evidencePaths = [...new Set(task.evidencePaths)];
fs.writeFileSync('quality/tasks.json', JSON.stringify(ledger, null, 2) + '\n');
console.log('Recorded current scope blocker and genuine independent results; preserved history, no PASS or downstream unlock.');
