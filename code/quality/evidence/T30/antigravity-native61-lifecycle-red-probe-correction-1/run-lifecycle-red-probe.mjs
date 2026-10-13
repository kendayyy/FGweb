import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');

const evidenceRel = 'quality/evidence/T30/antigravity-native61-lifecycle-red-probe-correction-1';
const evidenceDir = path.resolve(root, evidenceRel);

// Choose adapted fixture script
const rootFixture = path.resolve(root, 'quality/evidence/T30/fixture-server-lifecycle-probe-reviewed1.mjs');
const proposalFixture = path.resolve(__dirname, 'fixture-server-lifecycle-probe-reviewed1.mjs');
const fixtureScript = fs.existsSync(rootFixture) ? rootFixture : proposalFixture;

const executionReport = {
  recordedAt: new Date().toISOString(),
  target: 'CallLifecycleService-RED-Probe',
  fixtureScriptUsed: path.relative(root, fixtureScript),
  evidenceDir: evidenceRel,
  milestones: {
    childForked: false,
    childReady: false,
    callCreated: false,
    actorJoined: false,
    probeSent: false,
    probeCompleted: false,
    inspectVerified: false,
    childStopped: false
  },
  probeMetrics: null,
  cleanupSettlement: {
    schemaRemoved: false,
    mediaRemoved: false,
    presenceRemoved: false,
    appClosed: false,
    webClosed: false,
    inspectorHealthy: false,
    cleanupSettled: false
  },
  testResult: 'PENDING',
  exitCode: 2
};

function sanitizeError(err) {
  if (!err) return null;
  return {
    name: typeof err.name === 'string' ? err.name.slice(0, 64) : 'Error',
    code: typeof err.code === 'string' ? err.code.slice(0, 64) : 'UNKNOWN',
    message: typeof err.message === 'string' ? err.message.slice(0, 256) : String(err).slice(0, 256)
  };
}

let child = null;
let startupTimer = null;
let cleanupTimer = null;
let intendedRedConfirmed = false;
let intendedRedMessage = null;

async function sendChildMessage(msg) {
  assert(child && child.connected, 'Child fixture process is not connected');
  return new Promise((resolve, reject) => {
    const id = msg.id || Math.random().toString(36).slice(2);
    const onMessage = (reply) => {
      if (reply && reply.id === id) {
        child.removeListener('message', onMessage);
        resolve(reply);
      }
    };
    child.on('message', onMessage);
    child.send({...msg, id});
  });
}

try {
  // 1. Fork adapted fixture server child process
  child = fork(fixtureScript, [], {
    cwd: root,
    env: {
      ...process.env,
      FG_T30_EVIDENCE_DIR: evidenceRel
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  executionReport.milestones.childForked = true;

  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});

  // 2. Await child ready with 90s startup deadline
  const readyPayload = await new Promise((resolve, reject) => {
    startupTimer = setTimeout(() => {
      reject(new Error('STARTUP_DEADLINE_EXCEEDED_90S'));
    }, 90000);
    if (startupTimer.unref) startupTimer.unref();

    child.on('message', (msg) => {
      if (msg.kind === 'ready') {
        clearTimeout(startupTimer);
        resolve(msg);
      } else if (msg.kind === 'failed') {
        clearTimeout(startupTimer);
        reject(new Error(`CHILD_STARTUP_FAILED: phase=${msg.phase} name=${msg.name} code=${msg.code}`));
      }
    });

    child.once('exit', (code, signal) => {
      clearTimeout(startupTimer);
      reject(new Error(`CHILD_UNEXPECTED_EARLY_EXIT: code=${code} signal=${signal}`));
    });
  });

  executionReport.milestones.childReady = true;
  const {origin, actors, roomId} = readyPayload;
  assert(origin && actors?.sender && actors?.receiver && roomId, 'Malformed ready payload from child fixture');

  // 3. HTTP Call Creation via official API endpoint
  const callRes = await fetch(`${origin}/api/v1/rooms/${roomId}/calls`, {
    method: 'POST',
    headers: {
      Cookie: `better-auth.session_token=${actors.sender.cookie}`,
      Origin: origin,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  assert.equal(callRes.status, 201, `Failed to create call group (HTTP ${callRes.status})`);
  const callGroup = await callRes.json();
  const callGroupId = callGroup.id;
  assert(callGroupId, 'Created call group missing ID');
  executionReport.milestones.callCreated = true;

  // 4. HTTP Call Join for receiver
  const joinRes = await fetch(`${origin}/api/v1/calls/${callGroupId}/join`, {
    method: 'POST',
    headers: {
      Cookie: `better-auth.session_token=${actors.receiver.cookie}`,
      Origin: origin,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  assert.equal(joinRes.status, 200, `Failed to join call group (HTTP ${joinRes.status})`);
  executionReport.milestones.actorJoined = true;

  // 5. Send IPC lifecycle-probe message
  executionReport.milestones.probeSent = true;
  const probeReply = await sendChildMessage({
    kind: 'lifecycle-probe',
    callGroupId,
    roomId
  });
  assert(probeReply && probeReply.ok, `Lifecycle probe failed on child fixture: ${probeReply?.error}`);
  executionReport.milestones.probeCompleted = true;

  executionReport.probeMetrics = {
    requestedCount: probeReply.requestedCount,
    completedCount: probeReply.completedCount,
    failedCount: probeReply.failedCount,
    durationMs: probeReply.durationMs,
    actualListRoomsCalls: probeReply.actualListRoomsCalls,
    actualListParticipantsCalls: probeReply.actualListParticipantsCalls,
    blockingSamplesCount: probeReply.blockingSamples?.length ?? 0
  };

  // 6. Inspect database state to confirm canonical row integrity
  const inspectReply = await sendChildMessage({kind: 'inspect'});
  assert(inspectReply && !inspectReply.failed, 'Retained inspector query failed');
  assert.equal(inspectReply.open_calls, 1, 'Expected 1 open call group');
  assert(inspectReply.callers >= 1, 'Expected at least 1 joined caller');
  executionReport.milestones.inspectVerified = true;

  // 7. INTENDED MEANINGFUL RED ASSERTION
  // Candidate coalescing design guarantees that for a fixed concurrent burst of 4 triggers,
  // work is bounded to at most 1 in-flight pass + 1 fresh trailing pass (<= 2 listRooms reads).
  // Current un-coalesced source executes all 4 triggers redundantly (actualListRoomsCalls === 4).
  const maxBoundedPasses = 2;
  const actualReads = probeReply.actualListRoomsCalls;

  try {
    assert(
      actualReads <= maxBoundedPasses,
      `[RED REPRODUCTION CONFIRMED] Fixed burst of ${probeReply.requestedCount} concurrent triggers executed ${actualReads} listRooms passes (expected <= ${maxBoundedPasses} under per-group coalescing). ` +
      `All ${probeReply.completedCount} callers resolved in ${probeReply.durationMs.toFixed(1)}ms. PG blocking samples observed: ${probeReply.blockingSamples?.length ?? 0}.`
    );
    // If assertion unexpectedly passes before sourcefix:
    executionReport.testResult = 'UNEXPECTED_PASS_BEFORE_SOURCEFIX';
  } catch (err) {
    if (err instanceof assert.AssertionError && err.message.includes('[RED REPRODUCTION CONFIRMED]')) {
      intendedRedConfirmed = true;
      intendedRedMessage = err.message;
      executionReport.testResult = 'EXPECTED_RED_CONFIRMED';
      executionReport.intendedRedMessage = err.message;
    } else {
      throw err;
    }
  }

} catch (err) {
  executionReport.testResult = 'SETUP_OR_RUNTIME_ERROR';
  executionReport.runtimeError = sanitizeError(err);
  console.error('Probe encountered unexpected error:', sanitizeError(err));
} finally {
  // 8. Controlled Child Teardown with 60s cleanup deadline
  if (child && child.connected) {
    try {
      child.send({kind: 'stop'});
      await new Promise((resolve) => {
        cleanupTimer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 60000);
        if (cleanupTimer.unref) cleanupTimer.unref();

        child.once('exit', () => {
          clearTimeout(cleanupTimer);
          resolve();
        });
      });
      executionReport.milestones.childStopped = true;
    } catch {}
  }

  // 9. Verify canonical cleanup settlement from persisted evidence
  const cleanupFile = path.resolve(evidenceDir, 'cleanup.json');
  const lifecycleFile = path.resolve(evidenceDir, 'inspector-lifecycle.json');

  let cleanupClean = false;
  try {
    if (fs.existsSync(cleanupFile)) {
      const c = JSON.parse(fs.readFileSync(cleanupFile, 'utf8'));
      executionReport.cleanupSettlement.schemaRemoved = Boolean(c.schemaRemoved);
      executionReport.cleanupSettlement.mediaRemoved = Boolean(c.mediaRemoved);
      executionReport.cleanupSettlement.presenceRemoved = Boolean(c.presenceRemoved);
      executionReport.cleanupSettlement.appClosed = Boolean(c.appClosed);
      executionReport.cleanupSettlement.webClosed = Boolean(c.webClosed);
    }
    if (fs.existsSync(lifecycleFile)) {
      const l = JSON.parse(fs.readFileSync(lifecycleFile, 'utf8'));
      executionReport.cleanupSettlement.inspectorHealthy = Boolean(l.healthy && l.failureCount === 0);
    }

    const cs = executionReport.cleanupSettlement;
    cleanupClean = Boolean(
      cs.schemaRemoved &&
      cs.mediaRemoved &&
      cs.presenceRemoved &&
      cs.appClosed &&
      cs.webClosed &&
      cs.inspectorHealthy
    );
    executionReport.cleanupSettlement.cleanupSettled = cleanupClean;
  } catch {}

  // 10. Determine exit code: Cleanup failures MUST override RED with exit code 2
  let exitCode = 2;
  if (!cleanupClean) {
    executionReport.testResult = 'CLEANUP_SETTLEMENT_FAILED';
    exitCode = 2;
    console.error('ERROR: Cleanup settlement verification failed. Overriding test outcome with exit code 2.');
  } else if (intendedRedConfirmed) {
    exitCode = 1;
    console.log('\n======================================================================');
    console.log('PARENT PROBE RESULT: EXPECTED RED REPRODUCTION CONFIRMED (Exit Code 1)');
    console.log('======================================================================');
    console.log(intendedRedMessage);
    console.log('======================================================================\n');
  } else if (executionReport.testResult === 'UNEXPECTED_PASS_BEFORE_SOURCEFIX') {
    exitCode = 0;
    console.log('NOTICE: Probe assertion passed unexpectedly before sourcefix (Exit Code 0).');
  } else {
    exitCode = 2;
    console.error('ERROR: Probe setup or runtime error occurred (Exit Code 2).');
  }

  executionReport.exitCode = exitCode;

  // 11. Write sanitized report safely with flag 'wx' (or fallback to fresh timestamp file)
  const reportPath = path.resolve(evidenceDir, 'probe-report.json');
  try {
    fs.writeFileSync(reportPath, JSON.stringify(executionReport, null, 2) + '\n', {flag: 'wx'});
  } catch {
    // If file already exists, write with timestamp suffix to avoid overwrite
    const tsReportPath = path.resolve(evidenceDir, `probe-report-${Date.now()}.json`);
    try {
      fs.writeFileSync(tsReportPath, JSON.stringify(executionReport, null, 2) + '\n', {flag: 'wx'});
    } catch {}
  }

  process.exit(exitCode);
}
