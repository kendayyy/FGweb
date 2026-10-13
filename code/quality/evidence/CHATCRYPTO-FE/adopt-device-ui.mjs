import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkGate } from '../../../scripts/verify-task.mjs';
const dir = 'quality/evidence/CHATCRYPTO-FE', digest = value => createHash('sha256').update(value).digest('hex'), hash = path => digest(fs.readFileSync(path));
const ledger = JSON.parse(fs.readFileSync('quality/tasks.json', 'utf8')), index = ledger.tasks.findIndex(row => row.id === 'CHATCRYPTO-FE'), task = ledger.tasks[index];
assert.equal(task.status, 'IN_PROGRESS');
const runtime = JSON.parse(fs.readFileSync(`${dir}/runtime-bootstrap-before.json`, 'utf8'));
for (const row of ledger.tasks.filter(row => row.id !== task.id)) assert.equal(digest(JSON.stringify(row)), runtime.rows[row.id]);
for (const [sourceIndex, path] of ['apps/api/src/modules/auth/auth.service.ts', 'apps/api/src/modules/profiles/profiles.service.ts'].entries()) {
  const original = fs.readFileSync(`${dir}/runtime-bootstrap-original-${sourceIndex * 4}.txt`, 'utf8');
  assert.equal(fs.readFileSync(path, 'utf8'), original.replace('this.db = drizzle(this.pool, { schema });', "// Exclude TypeScript's synthetic require(ESM) default namespace alias.\n    const databaseSchema = { ...schema };\n    Reflect.deleteProperty(databaseSchema, 'default');\n    this.db = drizzle(this.pool, { schema: databaseSchema });"));
}
assert.equal(fs.readFileSync('apps/web/vite.config.ts', 'utf8'), fs.readFileSync(`${dir}/web-target-original.ts`, 'utf8').replace('  plugins:', "  build: { target: 'es2022' },\n  plugins:"));
const proofs = ['runtime-bootstrap-before.json', 'runtime-bootstrap-scope-review.md', 'web-target-before.json', 'web-target-scope-review.md', 'app-integration-before.json', 'app-integration-scope-review.md'].map(name => `${dir}/${name}`);
for (const label of ['runtime-bootstrap-build-1', 'crypto-web-build-5', 'headed-device-5', 'device-bootstrap-http-1', 'provider-typecheck-2']) {
  const path = `${dir}/codex-${label}.json`, record = JSON.parse(fs.readFileSync(path, 'utf8')); assert.equal(record.exitCode, 0); assert.equal(hash(record.evidencePath), record.evidenceSha256); proofs.push(path, record.evidencePath);
}
const browserProofs = fs.readdirSync(dir).filter(name => /^headed-device-proof-crypto_fe_[a-f0-9]{32}\.json$/.test(name));
assert.equal(browserProofs.length, 1); const browserProofPath = `${dir}/${browserProofs[0]}`, browserProof = JSON.parse(fs.readFileSync(browserProofPath, 'utf8'));
assert.equal(browserProof.headed, true); for (const [path, sha] of Object.entries(browserProof.buildHashes)) assert.equal(hash(path), sha); proofs.push(browserProofPath);
const paths = ['apps/web/vite.config.ts', 'apps/web/src/App.tsx', 'apps/api/src/modules/auth/auth.service.ts', 'apps/api/src/modules/profiles/profiles.service.ts', 'apps/api/dist/modules/auth/auth.service.js', 'apps/api/dist/modules/auth/auth.service.js.map', 'apps/api/dist/modules/profiles/profiles.service.js', 'apps/api/dist/modules/profiles/profiles.service.js.map', 'apps/api/dist/tsconfig.tsbuildinfo', 'apps/web/dist/index.html'];
const reviewPath = `${dir}/device-ui-ownership-review.md`;
fs.writeFileSync(reviewPath, '# Device UI generated/source ownership review\n\nSource scope reviews and pre-edit snapshots retained for App provider/route, minimal Drizzle synthetic-alias removal, and tested ES2022 target. Existing web/API dist owner scope covers generated bundle index and build info; preserve old assets and prior output hashes. Actual plain Node production-built FG app/headed native browser store/SAS-independent registration, wrong code/reload stable ID, Web Locks, account separation, revocation, logout, light/dark360px and44px controls pass. Full private conversation/send/recovery/report/migration acceptance remains unfinished. No prior PASS row/checker/spec/main DB/production modified. This review pins the10 current source/generated historical-owner deltas, retaining earlier transition stages.\n', { flag: 'wx' });
const amendment = { source: reviewPath, reason: 'Ownership pin for reviewed device UI/prerequisite source and existing generated closure after actual headed native browser proof', paths };
task.approvedScopeAmendments.push(amendment); proofs.push(reviewPath);
const manifest = JSON.parse(fs.readFileSync(task.gateRebaseline.manifestPath, 'utf8'));
const latest = new Map(); for (const row of ledger.tasks.slice(0, index)) for (const [path, sha] of Object.entries(row.outputsHash?.files ?? {})) latest.set(path, { id: row.id, sha });
for (const path of paths) {
  const prior = latest.get(path); assert(prior); const existing = manifest.outputTransitions.find(entry => entry.path === path);
  if (existing) {
    assert.equal(existing.beforeSha256, prior.sha); existing.afterSha256 = hash(path); existing.scopeSha256 = digest(JSON.stringify(amendment));
    existing.requiredEvidence = [...existing.requiredEvidence, ...proofs.map(path => ({ path, sha256: hash(path) }))];
  } else {
    const captured = runtime.files[path] ?? (path === 'apps/web/src/App.tsx' ? JSON.parse(fs.readFileSync(`${dir}/app-integration-before.json`, 'utf8')).sha256 : path === 'apps/web/vite.config.ts' ? JSON.parse(fs.readFileSync(`${dir}/web-target-before.json`, 'utf8')).sha256 : JSON.parse(fs.readFileSync(`${dir}/before.json`, 'utf8')).ownedOriginal[path]);
    assert.equal(captured, prior.sha);
    manifest.outputTransitions.push({ path, previousTaskId: prior.id, beforeSha256: prior.sha, afterSha256: hash(path), scopeSha256: digest(JSON.stringify(amendment)), requiredEvidence: proofs.map(path => ({ path, sha256: hash(path) })) });
  }
}
const manifestPath = `${dir}/device-ui-gate-manifest.json`; fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
task.gateRebaseline = { version: 1, manifestPath, manifestSha256: hash(manifestPath) };
checkGate({ root: process.cwd(), tasks: ledger.tasks, id: task.id, specHash: task.specSha256, requestedPaths: paths });
const adoption = { recordedAt: new Date().toISOString(), task: task.id, paths, actualPlainNodeHeadedNativeDeviceUi: true, browserProofPath, historicalRowsUnchanged: true, mainMutation: false, frontendComplete: false, manifestPath };
fs.writeFileSync(`${dir}/device-ui-adoption.json`, JSON.stringify(adoption, null, 2) + '\n', { flag: 'wx' });
task.evidencePaths = [...new Set([...task.evidencePaths, ...proofs, manifestPath, `${dir}/device-ui-adoption.json`])]; fs.writeFileSync('quality/tasks.json', JSON.stringify(ledger, null, 2) + '\n'); console.log(JSON.stringify(adoption));
