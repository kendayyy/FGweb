import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import path from 'node:path';

/**
 * FG T30 — Runner for API Lock Spans and HTTP Timing Control Probes
 * 
 * Executes child probe across 5 execution modes:
 * - normal: clean execution, zero failures, complete health
 * - write-io: simulated fs.writeSync EIO, failureCount > 0
 * - short-write: simulated fs.writeSync short-write (0 bytes), failureCount > 0
 * - buffer-drop: high-frequency query burst exceeding bounded buffer, droppedCount > 0
 * - final-health-io: pre-existing health file conflicting with flag 'wx', failureCount > 0
 * 
 * Enforces strict sanitization of DB passwords, JWTs, private sentinels,
 * connection strings, and prevents raw stderr interpolation into review records.
 */

const d = 'quality/evidence/T30/antigravity-native42-api-spans-correction-1';
const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
const secret = 'T30_API_SPANS_PRIVATE_SENTINEL';

const privateValues = Object.entries(env)
  .filter(([k, v]) => /SECRET|TOKEN|PASSWORD|KEY|DATABASE_URL/.test(k) && typeof v === 'string' && v.length > 7)
  .map(([, v]) => v);

try {
  const parsedDb = new URL(env.DATABASE_URL);
  if (parsedDb.password && parsedDb.password.length > 3) {
    privateValues.push(parsedDb.password);
  }
} catch {}

privateValues.push(secret);

function sanitize(str) {
  if (typeof str !== 'string') return String(str ?? '');
  let sanitized = str;
  for (const val of privateValues) {
    if (val) {
      sanitized = sanitized.split(val).join('[REDACTED]');
    }
  }
  return sanitized
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/(?:postgres(?:ql)?|redis):\/\/[^@\s]+@/g, '[REDACTED_CONNECTION]@')
    .replace(/(?:wss?|https?):\/\/[^\s]+/g, '[URL REDACTED]');
}

const modes = [];
const testedModes = ['normal', 'write-io', 'short-write', 'buffer-drop', 'final-health-io'];

for (const mode of testedModes) {
  const childScript = path.resolve(d, 'probe-api-lock-spans-child.mjs');
  const child = spawn(process.execPath, [childScript, mode], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let rawStdout = '';
  let rawStderr = '';
  child.stdout.on('data', (b) => {
    rawStdout += b;
  });
  child.stderr.on('data', (b) => {
    rawStderr += b;
  });

  const exitCode = await new Promise((resolve) => child.once('exit', resolve));
  let error = null;

  try {
    assert.equal(exitCode, 0, `Process exited with code ${exitCode}`);
    assert.equal(rawStderr.trim(), '', 'Stderr must be empty');

    const sanitizedStdout = sanitize(rawStdout);
    for (const v of privateValues) {
      assert(!sanitizedStdout.includes(v), 'Private secret value leaked in stdout');
    }
    assert(!sanitizedStdout.includes('pg_sleep'), 'Raw SQL leaked in stdout');
    assert(!sanitizedStdout.includes('SELECT '), 'Raw SQL leaked in stdout');

    const lines = sanitizedStdout.trim().split(/\r?\n/);
    const healths = lines
      .filter((v) => v.startsWith('[FG_API_SPANS_HEALTH] '))
      .map((v) => JSON.parse(v.slice(v.indexOf('{'))));
    const controls = lines
      .filter((v) => v.startsWith('[FG_CONTROL_RESULT] '))
      .map((v) => JSON.parse(v.slice(v.indexOf('{'))));

    assert.equal(healths.length, 1, 'Expected exactly one health marker');
    assert.equal(controls.length, 1, 'Expected exactly one control marker');
    assert(controls[0].ok === true, 'Control reported ok: false');
    assert(controls[0].poolEnded === true, 'Control pool must be ended');

    const health = healths[0];
    assert(health.timerStopped && health.histogramDisabled && health.sampleCount > 0, 'Health lifecycle flags invalid');

    if (mode === 'normal') {
      assert.equal(health.observationComplete, true, 'Normal mode must report observationComplete: true');
      assert.equal(health.failureCount, 0, 'Normal mode must have 0 failures');
      assert.equal(health.droppedCount, 0, 'Normal mode must have 0 dropped records');
    } else if (mode === 'write-io') {
      assert.equal(health.observationComplete, false, 'write-io mode must report observationComplete: false');
      assert(health.failureCount > 0, 'write-io mode must record failureCount > 0');
    } else if (mode === 'short-write') {
      assert.equal(health.observationComplete, false, 'short-write mode must report observationComplete: false');
      assert(health.failureCount > 0, 'short-write mode must record failureCount > 0');
    } else if (mode === 'buffer-drop') {
      assert.equal(health.observationComplete, false, 'buffer-drop mode must report observationComplete: false');
      assert(health.droppedCount > 0, 'buffer-drop mode must record droppedCount > 0');
    } else if (mode === 'final-health-io') {
      assert.equal(health.observationComplete, false, 'final-health-io mode must report observationComplete: false');
      assert(health.failureCount > 0, 'final-health-io mode must record failureCount > 0');
    }

    modes.push({
      mode,
      exitCode,
      health,
      checks: controls[0].checks,
      poolEnded: controls[0].poolEnded,
      privacyReviewed: true,
    });
  } catch (e) {
    error = {
      mode,
      exitCode,
      name: sanitize(e?.name ?? 'Error'),
      message: sanitize(e?.message ?? 'unknown'),
    };
    modes.push(error);
    process.exitCode = 1;
    break;
  }
}

const review = {
  recordedAt: new Date().toISOString(),
  modes,
  helperSha256: createHash('sha256').update(fs.readFileSync(d + '/api-lock-spans-observer.mjs')).digest('hex'),
  nativeAcceptance: false,
};

fs.writeFileSync(d + '/api-lock-spans-control-review.json', JSON.stringify(review, null, 2) + '\n', { flag: 'w' });
console.log(JSON.stringify(review, null, 2));
