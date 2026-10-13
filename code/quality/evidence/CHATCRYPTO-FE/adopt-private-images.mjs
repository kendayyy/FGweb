import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkGate } from '../../../scripts/verify-task.mjs';
const dir = 'quality/evidence/CHATCRYPTO-FE', digest = value => createHash('sha256').update(value).digest('hex'), hash = path => digest(fs.readFileSync(path));
const ledgerBytes = fs.readFileSync('quality/tasks.json', 'utf8'), ledger = JSON.parse(ledgerBytes);
const index = ledger.tasks.findIndex(row => row.id === 'CHATCRYPTO-FE'), task = ledger.tasks[index]; assert.equal(task.status, 'IN_PROGRESS');
const before = JSON.parse(fs.readFileSync(`${dir}/private-producer-before.json`, 'utf8'));
for (const row of ledger.tasks.filter(row => row.id !== task.id)) assert.equal(digest(JSON.stringify(row)), before.rows[row.id]);
const manifest = JSON.parse(fs.readFileSync(task.gateRebaseline.manifestPath, 'utf8'));
const roomPath = 'apps/web/src/features/rooms/RoomsPage.tsx', roomTransition = manifest.outputTransitions.find(row => row.path === roomPath); assert(roomTransition);
const currentRoom = fs.readFileSync(roomPath, 'utf8');
assert.equal(digest(currentRoom.replace("    setMobileTab('chat');", "    setReplyMessage(null);\n    setMobileTab('chat');")), roomTransition.afterSha256, 'Only remove the obsolete reset callback under existing room producer scope');
const proofs = [];
for (const label of ['private-images-http-native-1', 'private-images-lint-1', 'private-images-typecheck-5', 'crypto-web-build-9', 'headed-private-6']) {
  const path = `${dir}/codex-${label}.json`, record = JSON.parse(fs.readFileSync(path, 'utf8')); assert.equal(record.exitCode, 0); assert.equal(hash(record.evidencePath), record.evidenceSha256); proofs.push(path, record.evidencePath);
}
const proofPath = fs.readdirSync(dir).filter(name => /^headed-chat-proof-crypto_fe_[a-f0-9]{32}\.json$/.test(name)).map(name => `${dir}/${name}`).find(path => Object.entries(JSON.parse(fs.readFileSync(path, 'utf8')).buildHashes).every(([file, sha]) => hash(file) === sha));
assert(proofPath); proofs.push(proofPath);
const sourceSnapshot = `${dir}/image-headed-source.mjs`; fs.writeFileSync(sourceSnapshot, fs.readFileSync(`${dir}/headed-private-chat.mjs`), { flag: 'wx' }); proofs.push(sourceSnapshot);
const paths = [roomPath, 'apps/web/dist/index.html'], reviewPath = `${dir}/private-image-ownership-review.md`;
fs.writeFileSync(reviewPath, '# Image closure ownership review\n\nPin current generated index after actual native multipart/API/PostgreSQL image proof and actual production headed PNG→WebP→encryption→opaque upload→peer local blob display. Native tamper, unchanged image retry/dedup and no key/plaintext in DB pass. Headed valid image dimensions, invalid SVG,5MiB+1byte and genuine5001×4000 PNG rejection before upload pass; frozen executed script is included. Current typecheck5 passes after obsolete room callback removed; reconstruction hash proves exactly that one line correction under prior reviewed room scope. Current decoded LIVE response bindings include attachments/mention IDs. Preserve all old PASS rows and transition evidence stages; no complete frontend/group/recovery/report/migration/main/production claim.\n', { flag: 'wx' }); proofs.push(reviewPath);
const amendment = { source: reviewPath, reason: 'Reviewed room callback correction and generated index after actual native/headed image proof', paths }; task.approvedScopeAmendments.push(amendment);
for (const path of paths) {
  const transition = manifest.outputTransitions.find(row => row.path === path); assert(transition);
  transition.afterSha256 = hash(path); transition.scopeSha256 = digest(JSON.stringify(amendment)); transition.requiredEvidence.push(...proofs.map(path => ({ path, sha256: hash(path) })));
}
const manifestPath = `${dir}/private-image-gate-manifest.json`; fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
task.gateRebaseline = { version: 1, manifestPath, manifestSha256: hash(manifestPath) };
checkGate({ root: process.cwd(), tasks: ledger.tasks, id: task.id, specHash: task.specSha256, requestedPaths: paths });
const adoptionPath = `${dir}/private-image-adoption.json`, adoption = { recordedAt: new Date().toISOString(), paths, proofPath, historicalRowsUnchanged: true, frontendComplete: false, mainMutation: false, manifestPath };
fs.writeFileSync(adoptionPath, JSON.stringify(adoption, null, 2) + '\n', { flag: 'wx' });
task.evidencePaths = [...new Set([...task.evidencePaths, ...proofs, manifestPath, adoptionPath])]; assert.equal(fs.readFileSync('quality/tasks.json', 'utf8'), ledgerBytes);
fs.writeFileSync('quality/tasks.json', JSON.stringify(ledger, null, 2) + '\n'); console.log(JSON.stringify(adoption));
