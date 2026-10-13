import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkGate } from '../../../scripts/verify-task.mjs';
const dir = 'quality/evidence/CHATCRYPTO-FE';
const digest = value => createHash('sha256').update(value).digest('hex');
const hash = path => digest(fs.readFileSync(path));
const originalLedger = fs.readFileSync('quality/tasks.json', 'utf8');
const ledger = JSON.parse(originalLedger), index = ledger.tasks.findIndex(row => row.id === 'CHATCRYPTO-FE'), task = ledger.tasks[index];
assert.equal(task.status, 'IN_PROGRESS');
const beforePath = `${dir}/private-producer-before.json`, before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
for (const row of ledger.tasks.filter(row => row.id !== task.id)) assert.equal(digest(JSON.stringify(row)), before.rows[row.id]);
const proofs = [beforePath, `${dir}/private-producer-scope-review.md`];
for (const label of ['unread-metadata-unit-1', 'private-producers-typecheck-1', 'private-producers-lint-2', 'crypto-web-build-7', 'headed-private-4']) {
  const path = `${dir}/codex-${label}.json`, record = JSON.parse(fs.readFileSync(path, 'utf8'));
  assert.equal(record.exitCode, 0); assert.equal(hash(record.evidencePath), record.evidenceSha256); proofs.push(path, record.evidencePath);
}
const browserProofs = fs.readdirSync(dir).filter(name => /^headed-chat-proof-crypto_fe_[a-f0-9]{32}\.json$/.test(name)).map(name => `${dir}/${name}`);
const currentProof = browserProofs.find(path => {
  const proof = JSON.parse(fs.readFileSync(path, 'utf8'));
  return proof.headed && Object.entries(proof.buildHashes).every(([file, sha]) => hash(file) === sha);
});
assert(currentProof, 'Require actual headed proof of current build'); proofs.push(currentProof);
const paths = [...Object.keys(before.files), 'apps/web/dist/index.html'];
const reviewPath = `${dir}/private-producer-ownership-review.md`;
fs.writeFileSync(reviewPath, '# Private producer ownership review\n\nPre-edit original snapshots and exact four-source scope retained. Actual native production UI between two browser devices passes bilateral SAS, unverified send denial/draft retention, committed lost-response exact ciphertext retry/dedup, private reply/mention, real database empty plaintext, no legacy private HTTP producers and360px no message/composer overlap. Current native SDK public completion stays conditional on current trusted key. Groups/images/recovery/report/legacy acceptance still unfinished. Pin only the four reviewed sources and current generated web index; prior PASS rows/proof stages/checker/main/production remain unchanged.\n', { flag: 'wx' });
const amendment = { source: reviewPath, reason: 'Reviewed private producer ownership after actual headed DM and current bundle proof; no frontend completion claim', paths };
task.approvedScopeAmendments.push(amendment); proofs.push(reviewPath);
const manifest = JSON.parse(fs.readFileSync(task.gateRebaseline.manifestPath, 'utf8'));
const latest = new Map();
for (const row of ledger.tasks.slice(0, index)) for (const [path, sha] of Object.entries(row.outputsHash?.files ?? {})) latest.set(path, { id: row.id, sha });
for (const path of paths) {
  const prior = latest.get(path); assert(prior);
  const existing = manifest.outputTransitions.find(entry => entry.path === path);
  if (existing) {
    assert.equal(existing.beforeSha256, prior.sha); existing.afterSha256 = hash(path); existing.scopeSha256 = digest(JSON.stringify(amendment));
    existing.requiredEvidence.push(...proofs.map(path => ({ path, sha256: hash(path) })));
  } else {
    assert.equal(before.files[path], prior.sha);
    manifest.outputTransitions.push({ path, previousTaskId: prior.id, beforeSha256: prior.sha, afterSha256: hash(path), scopeSha256: digest(JSON.stringify(amendment)), requiredEvidence: proofs.map(path => ({ path, sha256: hash(path) })) });
  }
}
const manifestPath = `${dir}/private-producer-gate-manifest.json`;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
task.gateRebaseline = { version: 1, manifestPath, manifestSha256: hash(manifestPath) };
checkGate({ root: process.cwd(), tasks: ledger.tasks, id: task.id, specHash: task.specSha256, requestedPaths: paths });
const adoption = { recordedAt: new Date().toISOString(), paths, currentProof, historicalRowsUnchanged: true, frontendComplete: false, mainMutation: false, manifestPath };
const adoptionPath = `${dir}/private-producer-adoption.json`;
fs.writeFileSync(adoptionPath, JSON.stringify(adoption, null, 2) + '\n', { flag: 'wx' });
task.evidencePaths = [...new Set([...task.evidencePaths, ...proofs, manifestPath, adoptionPath])];
assert.equal(fs.readFileSync('quality/tasks.json', 'utf8'), originalLedger);
fs.writeFileSync('quality/tasks.json', JSON.stringify(ledger, null, 2) + '\n');
console.log(JSON.stringify(adoption));
