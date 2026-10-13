import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkGate } from '../../../scripts/verify-task.mjs';
const stage = process.argv[2]; assert.match(stage, /^[a-z0-9-]+$/);
const dir = 'quality/evidence/CHATCRYPTO-FE', digest = x => createHash('sha256').update(x).digest('hex'), hash = p => digest(fs.readFileSync(p));
const bytes = fs.readFileSync('quality/tasks.json', 'utf8'), ledger = JSON.parse(bytes), task = ledger.tasks.find(t => t.id === 'CHATCRYPTO-FE');
assert.equal(task.status, 'IN_PROGRESS');
const before = JSON.parse(fs.readFileSync(`${dir}/active-membership-before.json`, 'utf8'));
for (const row of ledger.tasks.filter(t => t.id !== task.id)) assert.equal(digest(JSON.stringify(row)), before.rows[row.id]);
const manifestPath = `${dir}/${stage}-gate-manifest.json`, manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const adoption = JSON.parse(fs.readFileSync(`${dir}/${stage}-adoption.json`, 'utf8'));
assert.deepEqual(adoption.paths, ['apps/web/dist/index.html']);
const review = `${dir}/${stage}-ownership-review.md`, amendment = { source: review, reason: `Reviewed generated index after actual native/headed ${stage} proof`, paths: adoption.paths };
const transition = manifest.outputTransitions.find(t => t.path === adoption.paths[0]);
assert.equal(transition.scopeSha256, digest(JSON.stringify(amendment)));
assert.equal(transition.afterSha256, hash(adoption.paths[0]));
for (const proof of transition.requiredEvidence) assert.equal(hash(proof.path), proof.sha256);
task.approvedScopeAmendments.push(amendment);
task.gateRebaseline = { version: 1, manifestPath, manifestSha256: hash(manifestPath) };
task.evidencePaths = [...new Set([...task.evidencePaths, ...transition.requiredEvidence.map(p => p.path), manifestPath, `${dir}/${stage}-adoption.json`])];
checkGate({ root: process.cwd(), tasks: ledger.tasks, id: task.id, specHash: task.specSha256, requestedPaths: adoption.paths });
for (let attempt = 0; attempt < 5; attempt++) {
  assert.equal(fs.readFileSync('quality/tasks.json', 'utf8'), bytes, 'Concurrent ledger edit; do not overwrite');
  try { fs.writeFileSync('quality/tasks.json', JSON.stringify(ledger, null, 2) + '\n'); break; }
  catch (error) { if (error.code !== 'UNKNOWN' || attempt === 4) throw error; await new Promise(resolve => setTimeout(resolve, 250)); }
}
console.log(JSON.stringify({ stage, actualExistingImmutableProofsRevalidated: true, unchangedGatePassed: true, ledgerWriteRecovered: true, frontendComplete: false }));
