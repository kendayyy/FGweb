import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {parseEnv} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';

const runnerId = randomUUID();
const d = 'quality/evidence/T30/antigravity-native46-combined-correlation-1';
const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));

const privateValues = Object.entries(env)
  .filter(([k, v]) => /SECRET|TOKEN|PASSWORD|KEY|DATABASE_URL/.test(k) && typeof v === 'string' && v.length > 7)
  .map(([, v]) => v);

if (env.DATABASE_URL) {
  try {
    const url = new URL(env.DATABASE_URL);
    if (url.password) privateValues.push(decodeURIComponent(url.password));
  } catch {}
}

const sanitize = (s) => {
  for (const v of privateValues) s = s.split(v).join('[REDACTED]');
  return s
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/(?:postgres(?:ql)?|redis):\/\/[^@\s]+@/g, '[REDACTED_CONNECTION]@');
};

const probes = [
  { mode: 'normal', script: path.join(d, 'probe-combined-fixture1-normal.mjs'), expectedExit: 0 },
  { mode: 'fault', script: path.join(d, 'probe-combined-fixture1-fault.mjs'), expectedExit: 0 },
];

const results = [];

for (const probe of probes) {
  const child = spawn(process.execPath, [probe.script, 'diagnostic'], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stdout.on('data', (s) => {
    stdout += sanitize(s);
    process.stdout.write(sanitize(s));
  });
  child.stderr.on('data', (s) => {
    stderr += sanitize(s);
    process.stderr.write(sanitize(s));
  });

  const timeout = setTimeout(() => child.kill(), 180000);
  const exitCode = await new Promise((resolve) => {
    child.once('error', () => resolve(1));
    child.once('close', (code) => resolve(code ?? 1));
  });
  clearTimeout(timeout);

  results.push({
    mode: probe.mode,
    script: probe.script,
    exitCode,
    expectedExit: probe.expectedExit,
    passed: exitCode === probe.expectedExit,
  });

  if (exitCode !== probe.expectedExit) {
    process.exitCode = 1;
    break;
  }
}

const reviewRecord = {
  recordedAt: new Date().toISOString(),
  runnerId,
  results,
  allPassed: results.every((r) => r.passed),
  fixtureSha256: createHash('sha256')
    .update(fs.readFileSync(path.join(d, 'fixture-server-combined-reviewed1.mjs')))
    .digest('hex'),
  nativeAcceptance: false,
};

fs.writeFileSync(
  path.join(d, `combined-controls-review-${runnerId}.json`),
  JSON.stringify(reviewRecord, null, 2) + '\n',
  { flag: 'wx' }
);

if (process.exitCode) {
  process.exitCode = 1;
} else {
  process.exitCode = 0;
}
