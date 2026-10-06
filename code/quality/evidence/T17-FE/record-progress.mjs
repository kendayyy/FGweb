import fs from 'node:fs';
import assert from 'node:assert/strict';
const path = 'quality/tasks.json', ledger = JSON.parse(fs.readFileSync(path, 'utf8'));
const task = ledger.tasks.find(t => t.id === 'T17-FE');
assert.equal(task.status, 'IN_PROGRESS');
const labels = ['refactor13-scope-audit', 'refactor14-scope-audit', 'request-pagination-red-1', 'request-pagination-review-2', 'dm-page2-red-1', 'independent-task-tests-8', 'independent-test-types-8', 'changed-lint-6', 'independent-web-build-12', 'native-request-pagination-review-1', 'native-friend-removal-page2-red-1', 'independent-web-build-13', 'native-friend-removal-page2-review-2'];
for (const label of labels) {
  const json = `quality/evidence/T17-FE/codex-${label}.json`, record = JSON.parse(fs.readFileSync(json, 'utf8'));
  if (!task.commands.some(c => c.evidencePath === record.evidencePath)) task.commands.push(record);
  for (const evidence of [json, record.evidencePath]) if (!task.evidencePaths.includes(evidence)) task.evidencePaths.push(evidence);
}
for (const evidence of ['quality/evidence/T17-FE/codex-review-refactor-14.md', 'quality/evidence/T17-FE/refactor-14-interruption.json']) if (!task.evidencePaths.includes(evidence)) task.evidencePaths.push(evidence);
assert.equal(ledger.tasks.find(t => t.id === 'T18').status, 'NOT_STARTED');
fs.writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n');
console.log(JSON.stringify({ task: task.id, status: task.status, recordedCommands: task.commands.length, nextTask: 'T18 NOT_STARTED' }));
