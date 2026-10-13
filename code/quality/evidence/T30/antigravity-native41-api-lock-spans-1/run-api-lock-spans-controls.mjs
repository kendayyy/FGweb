import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';

const d = 'quality/evidence/T30/antigravity-native41-api-lock-spans-1';
const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
const secret = 'T30_API_SPANS_PRIVATE_SENTINEL';
const privateValues = Object.entries(env)
  .filter(([k, v]) => /SECRET|TOKEN|PASSWORD|KEY|DATABASE_URL/.test(k) && typeof v === 'string' && v.length > 7)
  .map(([, v]) => v);

const modes = [];

for (const mode of ['healthy', 'write-io']) {
  const child = spawn(process.execPath, [d + '/probe-api-lock-spans-child.mjs', mode], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (b) => { stdout += b; });
  child.stderr.on('data', (b) => { stderr += b; });

  const exitCode = await new Promise((resolve) => child.once('exit', resolve));
  let error = null;

  try {
    assert.equal(exitCode, 0, `Process exited with code ${exitCode}, stderr: ${stderr}`);
    assert.equal(stderr, '', `Stderr not empty: ${stderr}`);
    assert(!stdout.includes(secret), 'Secret sentinel leaked in stdout');
    for (const v of privateValues) {
      assert(!stdout.includes(v), 'Private environment value leaked in stdout');
    }
    assert(!stdout.includes('pg_sleep') && !stdout.includes('SELECT '), 'Raw SQL leaked in stdout');

    const lines = stdout.trim().split(/\r?\n/);
    const healths = lines.filter((v) => v.startsWith('[FG_API_SPANS_HEALTH] ')).map((v) => JSON.parse(v.slice(v.indexOf('{'))));
    const controls = lines.filter((v) => v.startsWith('[FG_CONTROL_RESULT] ')).map((v) => JSON.parse(v.slice(v.indexOf('{'))));

    assert.equal(healths.length, 1, 'Expected exactly one health marker');
    assert.equal(controls.length, 1, 'Expected exactly one control marker');
    assert(controls[0].ok && controls[0].poolEnded, 'Control checks failed');

    const health = healths[0];
    assert(health.timerStopped && health.histogramDisabled && health.sampleCount > 0, 'Health flags invalid');
    assert.equal(health.observationComplete, mode === 'healthy', `Mismatch in observationComplete for mode ${mode}`);

    if (mode === 'write-io') {
      assert(health.failureCount > 0 && controls[0].writeFaultInjected, 'Write IO fault not reflected');
    } else {
      assert.equal(health.failureCount, 0, 'Healthy run observed failures');
      assert.equal(health.droppedCount, 0, 'Healthy run dropped records');
    }

    modes.push({
      mode,
      exitCode,
      health,
      checks: controls[0].checks,
      privacyReviewed: true,
    });
  } catch (e) {
    error = { mode, exitCode, name: e.name, message: e.message };
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
