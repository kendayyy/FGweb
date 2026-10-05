import fs from 'node:fs';
import { createHash } from 'node:crypto';
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const ledger = JSON.parse(fs.readFileSync('quality/tasks.json'));
const baseline = JSON.parse(fs.readFileSync('quality/spec-baseline.json'));
const documents = {
  specSha256: '../.doc/01-product-spec.md',
  designSha256: '../.doc/02-frontend-design.md',
  taskSha256: '../.doc/task.md',
  mockupLobbySha256: '../.doc/mockups/01-lobby-desktop-mobile.png',
  mockupCallSha256: '../.doc/mockups/02-group-call-live.png',
};
for (const [key, file] of Object.entries(documents)) {
  if (hash(file) !== baseline.hashes[key].toLowerCase()) throw new Error(`Changed baseline: ${file}`);
}
const previous = ledger.tasks.slice(0, ledger.tasks.findIndex((t) => t.id === 'T07'));
const latest = new Map();
for (const task of previous) {
  if (task.status !== 'PASS') throw new Error(`Predecessor not PASS: ${task.id}`);
  for (const file of task.evidencePaths) fs.accessSync(file);
  for (const command of task.commands) {
    if (command.exitCode !== 0) throw new Error(`Failed predecessor command: ${task.id}`);
    if (command.evidenceSha256 && hash(command.evidencePath) !== command.evidenceSha256) {
      throw new Error(`Changed command evidence: ${command.evidencePath}`);
    }
  }
  for (const [file, digest] of Object.entries(task.outputsHash?.files || {})) latest.set(file, digest);
}
const reviewedShared = new Set([
  'packages/database/src/index.ts',
  'packages/database/migrations/meta/_journal.json',
  'packages/database/vitest.config.ts',
]);
const changes = [];
for (const [file, digest] of latest) {
  if (hash(file) === digest.toLowerCase()) continue;
  if (!reviewedShared.has(file)) throw new Error(`Unexpected predecessor output change: ${file}`);
  changes.push(file);
}
console.log(JSON.stringify({ baseline: 'PASS', immutablePredecessors: 'PASS', reviewedSharedChanges: changes }, null, 2));
