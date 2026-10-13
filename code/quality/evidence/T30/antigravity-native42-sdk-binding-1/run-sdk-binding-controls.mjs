import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import path from 'node:path';

/**
 * FG T30 — SDK Binding Control Runner
 * 
 * Demonstrates:
 * 1. Helper2 RED: Helper2 only wraps ESM RoomServiceClient, creating an instrumentation coverage gap
 *    for all compiled CJS calls under transaction (0 CJS RPC records recorded).
 * 2. Observer3 GREEN: Observer3 accepts both constructors, capturing in-transaction PID binding,
 *    post-commit clearing, and distinct concurrent contexts across both ESM and compiled CJS calls.
 * 
 * Strictly sanitizes private tokens, database credentials, and raw SQL queries.
 */

const d = 'quality/evidence/T30';
const proposalDir = `${d}/antigravity-native42-sdk-binding-1`;
const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));

const privateValues = Object.entries(env)
  .filter(([k, v]) => /SECRET|TOKEN|PASSWORD|KEY|DATABASE_URL/.test(k) && typeof v === 'string' && v.length > 7)
  .map(([, v]) => v);

try {
  const url = new URL(env.DATABASE_URL);
  if (url.password) privateValues.push(decodeURIComponent(url.password));
} catch {}

const sanitize = (str) => {
  if (typeof str !== 'string') return String(str ?? '');
  let s = str;
  for (const v of privateValues) {
    if (v) s = s.split(v).join('[REDACTED]');
  }
  return s
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/(?:postgres(?:ql)?|redis):\/\/[^@\s]+@/g, '[REDACTED_CONNECTION]@')
    .replace(/(?:wss?|https?):\/\/[^\s]+/g, '[URL REDACTED]');
};

const configurations = [
  {
    helper: 'api42-observer-reviewed2.mjs',
    label: 'helper2-red',
    expectedCoverageGap: true,
  },
  {
    helper: 'antigravity-native42-sdk-binding-1/api-lock-spans-observer3.mjs',
    label: 'observer3-green',
    expectedCoverageGap: false,
  },
];

const runs = [];

for (const config of configurations) {
  const childScript = path.resolve(proposalDir, 'probe-sdk-binding-child.mjs');
  const child = spawn(process.execPath, [childScript, config.helper, config.label], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const timeout = setTimeout(() => child.kill(), 30000);
  const exitCode = await new Promise((resolve) => {
    child.once('error', () => resolve(1));
    child.once('close', (code) => resolve(code ?? 1));
  });
  clearTimeout(timeout);

  let reviewed;
  try {
    assert.equal(exitCode, 0, `Control process failed with exitCode ${exitCode}`);
    assert.equal(stderr.trim(), '', 'Stderr must be empty');

    const sanitizedStdout = sanitize(stdout);
    for (const val of privateValues) {
      assert(!sanitizedStdout.includes(val), 'Private value leaked in stdout');
    }
    assert(!sanitizedStdout.includes('SELECT ') && !sanitizedStdout.includes('pg_sleep'), 'Raw SQL leaked in stdout');

    const lines = sanitizedStdout.trim().split(/\r?\n/);
    const resultLine = lines.find((l) => l.startsWith('[FG_CONTROL_RESULT] '));
    assert(resultLine, 'Missing [FG_CONTROL_RESULT] line');
    const result = JSON.parse(resultLine.slice('[FG_CONTROL_RESULT] '.length));

    assert.equal(result.failedChecks.length, 0, `Checks failed: ${result.failedChecks.join(', ')}`);
    assert.equal(result.fatalControlFailure, false);
    assert(Object.values(result.cleanup).every(Boolean), 'Cleanup incomplete');

    if (config.expectedCoverageGap) {
      assert.equal(result.checks.helper2_cjs_coverage_gap_confirmed, true);
    } else {
      assert.equal(result.checks.observer3_in_tx_rpc_pid_bound, true);
      assert.equal(result.checks.observer3_post_commit_cleared_binding, true);
      assert.equal(result.checks.observer3_concurrent_distinct_pids, true);
      assert.equal(result.checks.observer3_health_complete, true);
    }

    reviewed = {
      label: config.label,
      helper: config.helper,
      exitCode,
      passedChecksCount: Object.keys(result.checks).length,
      coverageGapConfirmed: config.expectedCoverageGap,
      allConstructorsObserved: !config.expectedCoverageGap,
      privacyReviewed: true,
    };
  } catch (err) {
    reviewed = {
      label: config.label,
      helper: config.helper,
      exitCode,
      controlAccepted: false,
      reason: sanitize(err?.message ?? 'Assertion failed'),
    };
    process.exitCode = 1;
  }

  runs.push(reviewed);
  if (process.exitCode) break;
}

const review = {
  recordedAt: new Date().toISOString(),
  runs,
  observer3Sha256: createHash('sha256')
    .update(fs.readFileSync(`${proposalDir}/api-lock-spans-observer3.mjs`))
    .digest('hex'),
  nativeAcceptance: false,
};

fs.writeFileSync(`${proposalDir}/sdk-binding-control-review.json`, JSON.stringify(review, null, 2) + '\n', {
  flag: 'wx',
});
console.log(JSON.stringify(review, null, 2));
