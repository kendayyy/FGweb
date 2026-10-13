import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import path from 'node:path';

/**
 * FG T30 — Smoke Verification Script for Instrumented API Spans Fixture Server
 * 
 * Proposed (NOT executed by proposal agent; for Codex review and test verification).
 * Verifies that the fixture server starts, establishes API spans observation, handles
 * inspect commands, and achieves clean, verified settlement across all diagnostic helpers.
 */

const evidenceDir = `quality/evidence/T30/antigravity-native41-api-lock-spans-1/smoke-fixture-run`;
fs.mkdirSync(evidenceDir, { recursive: true });

async function runFixtureSmoke(testName = 'normal') {
  const fixturePath = path.resolve('quality/evidence/T30/antigravity-native41-api-lock-spans-1/fixture-server-native41-api-spans.mjs');

  const child = fork(fixturePath, [], {
    env: {
      ...process.env,
      FG_T30_EVIDENCE_DIR: evidenceDir,
    },
    stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (d) => { stdout += d; });
  child.stderr?.on('data', (d) => { stderr += d; });

  const outcome = await new Promise((resolve) => {
    let readyReceived = false;
    let inspectReceived = false;

    child.on('message', async (msg) => {
      if (msg.kind === 'phase') {
        // Track lifecycle phases
      } else if (msg.kind === 'ready') {
        readyReceived = true;
        // Verify ready payload
        assert(msg.origin);
        assert(msg.actors);
        assert(msg.roomId);
        assert(msg.inspectorPid > 0);

        // Send inspect request
        child.send({ kind: 'inspect', id: 'smoke-inspect-1' });
      } else if (msg.id === 'smoke-inspect-1') {
        inspectReceived = true;
        assert.equal(msg.failed, undefined);
        assert(Number(msg.rooms) >= 1);
        assert(Number(msg.members) >= 1);

        // Request clean shutdown
        child.send({ kind: 'stop' });
      } else if (msg.kind === 'failed') {
        resolve({ ok: false, phase: msg.phase, name: msg.name, message: msg.message });
      }
    });

    child.once('exit', (code) => {
      resolve({
        ok: code === 0 && readyReceived && inspectReceived,
        exitCode: code,
        readyReceived,
        inspectReceived,
      });
    });
  });

  if (!outcome.ok) {
    throw new Error(`Fixture smoke run failed: ${JSON.stringify(outcome)}\nStderr: ${stderr}`);
  }

  // Verify diagnostic outputs
  const cleanupFile = `${evidenceDir}/cleanup.json`;
  assert(fs.existsSync(cleanupFile), 'cleanup.json missing');
  const cleanup = JSON.parse(fs.readFileSync(cleanupFile, 'utf8'));
  assert(cleanup.appClosed, 'appClosed not true');
  assert(cleanup.schemaRemoved, 'schemaRemoved not true');
  assert(cleanup.apiSpansObserverStopped, 'apiSpansObserverStopped not true');

  const spansHealthFile = `${evidenceDir}/api-lock-spans-health.json`;
  assert(fs.existsSync(spansHealthFile), 'api-lock-spans-health.json missing');
  const spansHealth = JSON.parse(fs.readFileSync(spansHealthFile, 'utf8'));
  assert(spansHealth.observationComplete, 'api spans observationComplete not true');
  assert.equal(spansHealth.failureCount, 0);

  const inspectorFile = `${evidenceDir}/inspector-lifecycle.json`;
  assert(fs.existsSync(inspectorFile), 'inspector-lifecycle.json missing');
  const inspector = JSON.parse(fs.readFileSync(inspectorFile, 'utf8'));
  assert(inspector.healthy && inspector.released && inspector.poolEnded);

  return { testName, outcome, cleanup, spansHealth, inspector };
}

if (process.argv[1] && process.argv[1].endsWith('smoke-fixture-api-spans.mjs')) {
  runFixtureSmoke()
    .then((res) => {
      console.log('[SMOKE_RESULT] ' + JSON.stringify(res, null, 2));
    })
    .catch((err) => {
      console.error('[SMOKE_FAILED]', err);
      process.exit(1);
    });
}
