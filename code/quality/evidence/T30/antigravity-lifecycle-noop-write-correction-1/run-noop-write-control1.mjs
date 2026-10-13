import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';

const runnerId = randomUUID();
const rootDir = process.cwd();
const runtimeRoot = path.resolve(rootDir, '.runtime/t30');
const tempDir = path.join(runtimeRoot, `temporary-noop-write-${runnerId}`);

fs.mkdirSync(runtimeRoot, { recursive: true });
const initialEntries = new Set(fs.readdirSync(runtimeRoot));
fs.mkdirSync(tempDir, { recursive: true });

let envValues = {};
if (fs.existsSync(path.join(rootDir, '.env.local'))) {
  envValues = parseEnv(fs.readFileSync(path.join(rootDir, '.env.local'), 'utf8'));
}

const sensitiveValues = Object.entries(envValues)
  .filter(([key, val]) => /SECRET|PASSWORD|TOKEN|KEY|DATABASE_URL/i.test(key) && typeof val === 'string' && val.length > 7)
  .map(([, val]) => val);

if (envValues.DATABASE_URL) {
  try {
    const parsedDbUrl = new URL(envValues.DATABASE_URL);
    if (parsedDbUrl.password) {
      sensitiveValues.push(decodeURIComponent(parsedDbUrl.password));
    }
  } catch {
    // Ignore URL parse error
  }
}

function sanitizeText(raw) {
  if (typeof raw !== 'string') return '';
  let sanitized = raw;
  for (const secret of sensitiveValues) {
    if (secret.length > 7) {
      sanitized = sanitized.split(secret).join('[REDACTED]');
    }
  }
  return sanitized
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@[^\s/]+/gi, 'postgresql://[REDACTED_USER_INFO]@[REDACTED_HOST]')
    .replace(/(?:session_token|auth_token)=[A-Za-z0-9%_-]+/gi, 'token=[REDACTED]');
}

const configPath = 'quality/evidence/T30/antigravity-lifecycle-noop-write-correction-1/noop-write-jest1.config.cjs';
const specPath = 'quality/evidence/T30/antigravity-lifecycle-noop-write-correction-1/noop-write-tests1/t30-lifecycle-noop-write.integration.spec.ts';

const jestArgs = [
  '--experimental-vm-modules',
  'node_modules/jest/bin/jest.js',
  '--config',
  configPath,
  '--runInBand',
  '--no-cache',
  '--runTestsByPath',
  specPath,
];

const child = spawn(process.execPath, jestArgs, {
  cwd: rootDir,
  env: {
    ...process.env,
    TEMP: tempDir,
    TMP: tempDir,
  },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let accumulatedStdout = '';
let accumulatedStderr = '';

function pipeAndSanitize(stream, isStderr) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    pending += chunk;
    const newlineIndex = pending.lastIndexOf('\n');
    if (newlineIndex >= 0) {
      const segment = pending.slice(0, newlineIndex + 1);
      const clean = sanitizeText(segment);
      if (isStderr) {
        accumulatedStderr += clean;
        process.stderr.write(clean);
      } else {
        accumulatedStdout += clean;
        process.stdout.write(clean);
      }
      pending = pending.slice(newlineIndex + 1);
    }
  });
  stream.on('end', () => {
    if (pending) {
      const clean = sanitizeText(pending);
      if (isStderr) {
        accumulatedStderr += clean;
        process.stderr.write(clean);
      } else {
        accumulatedStdout += clean;
        process.stdout.write(clean);
      }
    }
  });
}

pipeAndSanitize(child.stdout, false);
pipeAndSanitize(child.stderr, true);

const rawExitCode = await new Promise((resolve) => {
  child.once('error', (err) => {
    process.stderr.write(`Spawn error: ${err.message}\n`);
    resolve(1);
  });
  child.once('close', (code) => {
    resolve(code ?? 1);
  });
});

// Analyze outcomes against expected RED on unpatched source vs GREEN on candidate
const combinedOutput = `${accumulatedStdout}\n${accumulatedStderr}`;

const fixtureResults = {
  fixture1_firstpresence: !/✕.*Fixture 1 \(firstpresence\)/i.test(combinedOutput) && /✓.*Fixture 1 \(firstpresence\)/i.test(combinedOutput),
  fixture2_repeatedconnected_failedAsExpected: /✕.*Fixture 2 \(repeatedconnected\)/i.test(combinedOutput),
  fixture2_repeatedconnected_passed: /✓.*Fixture 2 \(repeatedconnected\)/i.test(combinedOutput),
  fixture3_reconnect: !/✕.*Fixture 3 \(reconnect\)/i.test(combinedOutput) && /✓.*Fixture 3 \(reconnect\)/i.test(combinedOutput),
  fixture4_expired_revoked: !/✕.*Fixture 4 \(expired\/revoked\)/i.test(combinedOutput) && /✓.*Fixture 4 \(expired\/revoked\)/i.test(combinedOutput),
  fixture5_absent_grace: !/✕.*Fixture 5 \(absent grace\)/i.test(combinedOutput) && /✓.*Fixture 5 \(absent grace\)/i.test(combinedOutput),
};

const isUnpatchedRedConfirmed =
  rawExitCode !== 0 &&
  fixtureResults.fixture2_repeatedconnected_failedAsExpected &&
  fixtureResults.fixture1_firstpresence &&
  fixtureResults.fixture3_reconnect &&
  fixtureResults.fixture4_expired_revoked &&
  fixtureResults.fixture5_absent_grace;

const isCandidateGreenConfirmed =
  rawExitCode === 0 &&
  fixtureResults.fixture1_firstpresence &&
  fixtureResults.fixture2_repeatedconnected_passed &&
  fixtureResults.fixture3_reconnect &&
  fixtureResults.fixture4_expired_revoked &&
  fixtureResults.fixture5_absent_grace;

// Directory cleanup and isolation verification
const removed = [];
const retained = [];

for (const name of fs.readdirSync(runtimeRoot)) {
  if (initialEntries.has(name)) continue;
  const candidatePath = path.resolve(runtimeRoot, name);
  assert.equal(path.dirname(candidatePath), runtimeRoot);
  assert(candidatePath.startsWith(runtimeRoot + path.sep));

  if (name === path.basename(tempDir)) {
    try {
      fs.rmSync(candidatePath, { recursive: true, force: true });
      removed.push(name);
    } catch {
      retained.push({ name, reason: 'Temporary run folder could not be removed' });
    }
    continue;
  }
}

const reviewRecord = {
  recordedAt: new Date().toISOString(),
  runnerId,
  specPath,
  configPath,
  rawExitCode,
  fixtureResults,
  isUnpatchedRedConfirmed,
  isCandidateGreenConfirmed,
  cleanup: {
    removed,
    retained,
    isolationClean: retained.length === 0,
  },
};

const reviewPath = path.join(
  rootDir,
  `quality/evidence/T30/antigravity-lifecycle-noop-write-correction-1/noop-write-control-review-${runnerId}.json`
);

fs.writeFileSync(reviewPath, JSON.stringify(reviewRecord, null, 2) + '\n', { flag: 'wx' });

if (retained.length > 0) {
  process.exitCode = 1;
} else if (isUnpatchedRedConfirmed) {
  // Expected RED baseline verified successfully
  process.exitCode = 0;
} else if (isCandidateGreenConfirmed) {
  // Candidate adoption verified successfully
  process.exitCode = 0;
} else {
  // Unexpected failure or unhandled state
  process.exitCode = rawExitCode;
}
