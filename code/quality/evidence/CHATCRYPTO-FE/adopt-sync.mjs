import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkGate } from '../../../scripts/verify-task.mjs';
const dir = 'quality/evidence/CHATCRYPTO-FE';
const digest = value => createHash('sha256').update(value).digest('hex');
const hash = path => digest(fs.readFileSync(path));
const ledger = JSON.parse(fs.readFileSync('quality/tasks.json', 'utf8'));
const index = ledger.tasks.findIndex(row => row.id === 'CHATCRYPTO-FE'), task = ledger.tasks[index];
const before = JSON.parse(fs.readFileSync(`${dir}/sync-before.json`, 'utf8'));
assert.equal(task.status, 'IN_PROGRESS'); assert.deepEqual(task.gateRebaseline, before.gate);
for (const row of ledger.tasks.filter(row => row.id !== task.id)) assert.equal(digest(JSON.stringify(row)), before.rows[row.id]);
const amendment = task.approvedScopeAmendments.find(value => value.source === `${dir}/sync-scope-review.md`); assert(amendment);
assert.deepEqual(amendment.paths, Object.keys(before.files));
// Exact reviewed source transformation; retain all ACL/final rechecks and queue filters.
const oldRelay = fs.readFileSync(`${dir}/sync-original-3.txt`, 'utf8');
const marker = '  for(const id of new Set([...encrypted.items,...verification.items].map(row=>String(row.conversation_id))))';
const count = "  const oneTimeKeyCounts={signed_curve25519:Number((await db.query('SELECT count(*) FROM chat_crypto_one_time_keys WHERE user_id=$1 AND device_id=$2 AND claimed_at IS NULL',[userId,parsed.deviceId])).rows[0].count)};\n";
assert.equal(fs.readFileSync(amendment.paths[3], 'utf8'), oldRelay.replace(marker, count + marker).replace('return CryptoSyncResponseSchema.parse({encrypted:', 'return CryptoSyncResponseSchema.parse({oneTimeKeyCounts,encrypted:').replace('verification:verification.items.map(r=>({id:r.id,...', 'verification:verification.items.map(r=>({id:r.id,conversationId:r.conversation_id,membershipRevision:Number(r.membership_revision),...'));
const proofPaths = [`${dir}/sync-before.json`, `${dir}/sync-scope-review.md`];
for (const label of ['sync-contracts-build-1', 'sync-api-build-1', 'sync-metadata-green-1', 'sync-depletion-native-3']) {
  const path = `${dir}/codex-${label}.json`, record = JSON.parse(fs.readFileSync(path, 'utf8'));
  assert.equal(record.exitCode, 0); assert.equal(hash(record.evidencePath), record.evidenceSha256); proofPaths.push(path, record.evidencePath);
}
const latest = new Map(); for (const row of ledger.tasks.slice(0, index)) for (const [path, sha] of Object.entries(row.outputsHash?.files ?? {})) latest.set(path, { id: row.id, sha });
assert.equal(hash(before.gate.manifestPath), before.gate.manifestSha256);
const manifest = JSON.parse(fs.readFileSync(before.gate.manifestPath, 'utf8'));
const evidence = proofPaths.map(path => ({ path, sha256: hash(path) }));
const generated = task.approvedScopeAmendments.find(value => value.source === `${dir}/sync-generated-review.md`); assert(generated);
for (const path of generated.paths) {
  const existing = manifest.outputTransitions.find(entry => entry.path === path); assert(existing);
  assert(path.startsWith('apps/api/dist/')); assert.equal(existing.beforeSha256, latest.get(path).sha);
  existing.afterSha256 = hash(path); existing.scopeSha256 = digest(JSON.stringify(generated));
  existing.requiredEvidence = [...existing.requiredEvidence, ...evidence, { path: generated.source, sha256: hash(generated.source) }];
}
for (const path of amendment.paths) {
  if (hash(path) === before.files[path]) continue;
  const prior = latest.get(path); assert(prior, `No historical owner for ${path}`);
  const existing = manifest.outputTransitions.find(entry => entry.path === path);
  if (existing) {
    assert.equal(existing.afterSha256, before.files[path]); assert.equal(existing.beforeSha256, prior.sha); assert.equal(existing.previousTaskId, prior.id);
    existing.afterSha256 = hash(path); existing.scopeSha256 = digest(JSON.stringify(amendment));
    existing.requiredEvidence = [...existing.requiredEvidence, ...evidence];
  } else {
    assert.equal(prior.sha, before.files[path]);
    manifest.outputTransitions.push({ path, previousTaskId: prior.id, beforeSha256: prior.sha, afterSha256: hash(path), scopeSha256: digest(JSON.stringify(amendment)), requiredEvidence: evidence });
  }
}
const manifestPath = `${dir}/sync-gate-manifest-2.json`; fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
task.gateRebaseline = { version: 1, manifestPath, manifestSha256: hash(manifestPath) };
checkGate({ root: process.cwd(), tasks: ledger.tasks, id: task.id, specHash: task.specSha256, requestedPaths: amendment.paths });
const adoption = { recordedAt: new Date().toISOString(), task: task.id, changes: amendment.paths.filter(path => hash(path) !== before.files[path]), actualSelfCountAndContext: true, nativeDepletionRestockAndDeniedReads: true, historicalRowsUnchanged: true, mainMutation: false, headedUi: false, frontendComplete: false, manifestPath };
fs.writeFileSync(`${dir}/sync-adoption.json`, JSON.stringify(adoption, null, 2) + '\n', { flag: 'wx' });
task.evidencePaths = [...new Set([...task.evidencePaths, ...proofPaths, manifestPath, `${dir}/sync-adoption.json`])];
fs.writeFileSync('quality/tasks.json', JSON.stringify(ledger, null, 2) + '\n'); console.log(JSON.stringify(adoption));
