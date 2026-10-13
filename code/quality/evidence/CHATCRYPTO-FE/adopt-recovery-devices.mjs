import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkGate } from '../../../scripts/verify-task.mjs';
const dir = 'quality/evidence/CHATCRYPTO-FE', digest = value => createHash('sha256').update(value).digest('hex'), hash = path => digest(fs.readFileSync(path));
const ledgerBytes = fs.readFileSync('quality/tasks.json', 'utf8'), ledger = JSON.parse(ledgerBytes);
const task = ledger.tasks.find(row => row.id === 'CHATCRYPTO-FE'); assert.equal(task.status, 'IN_PROGRESS');
const before = JSON.parse(fs.readFileSync(`${dir}/private-producer-before.json`, 'utf8'));
for (const row of ledger.tasks.filter(row => row.id !== task.id)) assert.equal(digest(JSON.stringify(row)), before.rows[row.id]);
const proofs = [`${dir}/recovery-client-protocol-review.md`];
for (const label of ['recovered-history-native-green-2', 'recovery-http-native-3', 'device-controls-typecheck-1', 'device-controls-lint-1', 'crypto-web-build-11', 'headed-device-controls-1']) {
  const path = `${dir}/codex-${label}.json`, record = JSON.parse(fs.readFileSync(path, 'utf8')); assert.equal(record.exitCode, 0); assert.equal(hash(record.evidencePath), record.evidenceSha256); proofs.push(path, record.evidencePath);
}
const proofPath = fs.readdirSync(dir).filter(name => /^headed-chat-proof-crypto_fe_[a-f0-9]{32}\.json$/.test(name)).map(name => `${dir}/${name}`).find(path => Object.entries(JSON.parse(fs.readFileSync(path, 'utf8')).buildHashes).every(([file, sha]) => hash(file) === sha)); assert(proofPath); proofs.push(proofPath);
const snapshotPath = `${dir}/recovery-device-headed-source.mjs`; fs.writeFileSync(snapshotPath, fs.readFileSync(`${dir}/headed-private-chat.mjs`), { flag: 'wx' }); proofs.push(snapshotPath);
const path = 'apps/web/dist/index.html', paths = [path], reviewPath = `${dir}/recovery-device-ownership-review.md`;
fs.writeFileSync(reviewPath, '# Recovery/device generated index ownership review\n\nCurrent production build11 has native encrypted server CAS recovery and user device listing/revocation. Native correct/wrong/password/tamper/binding/new epoch evidence, actual HTTP CAS conflict/owner separation/fresh identity/no trust and visible fresh-browser restore pass. Recovered historical sender/device remains explicitly unverified; no server trust flag/private code storage. Actual UI remote revocation yields native sync403 and lock, remaining peers send/read a new epoch and no new key queue rows reach revoked device. Historical recovered provenance remains per successfully imported native machine session; persisted store reload coverage not yet complete. Transfer generated index only with current immutable executed headed source/build/native proof; all old PASS rows/source snapshots/checker/stage evidence remain. Full groups/report/legacy/frontend incomplete; no main/production/later task/PASS.\n', { flag: 'wx' }); proofs.push(reviewPath);
const amendment = { source: reviewPath, reason: 'Reviewed generated index after actual native/headed recovery and device revocation proof', paths }; task.approvedScopeAmendments.push(amendment);
const manifest = JSON.parse(fs.readFileSync(task.gateRebaseline.manifestPath, 'utf8')), transition = manifest.outputTransitions.find(row => row.path === path); assert(transition);
transition.afterSha256 = hash(path); transition.scopeSha256 = digest(JSON.stringify(amendment)); transition.requiredEvidence.push(...proofs.map(path => ({ path, sha256: hash(path) })));
const manifestPath = `${dir}/recovery-device-gate-manifest.json`; fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' }); task.gateRebaseline = { version: 1, manifestPath, manifestSha256: hash(manifestPath) };
checkGate({ root: process.cwd(), tasks: ledger.tasks, id: task.id, specHash: task.specSha256, requestedPaths: paths });
const adoptionPath = `${dir}/recovery-device-adoption.json`, adoption = { recordedAt: new Date().toISOString(), paths, proofPath, historicalRowsUnchanged: true, frontendComplete: false, mainMutation: false, manifestPath };
fs.writeFileSync(adoptionPath, JSON.stringify(adoption, null, 2) + '\n', { flag: 'wx' }); task.evidencePaths = [...new Set([...task.evidencePaths, ...proofs, manifestPath, adoptionPath])];
assert.equal(fs.readFileSync('quality/tasks.json', 'utf8'), ledgerBytes); fs.writeFileSync('quality/tasks.json', JSON.stringify(ledger, null, 2) + '\n'); console.log(JSON.stringify(adoption));
