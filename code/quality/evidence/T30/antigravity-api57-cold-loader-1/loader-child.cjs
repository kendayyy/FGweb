'use strict';

/**
 * FG T30 — Isolated Cold Loader Boundary Diagnostic Child
 * 
 * Measures cold module resolution and V8 parsing timings for bind-mounted packages
 * rooted in /gateway/app without invoking createSignalingGateway or establishing DB/network connections.
 * 
 * Strict Invariants:
 * 1. Safe bounded stage begin/end monotonic durations for each dependency.
 * 2. Uses createRequire rooted at /gateway/app/gateway-main.js to match exact compiled CJS resolution.
 * 3. Never constructs signaling gateway, connects to PostgreSQL, or listens on network sockets.
 * 4. Sanitized error codes only (whitelisted enums); zero raw payloads or file paths.
 * 5. Bounded output payload size (fail-closed if > 64 KiB).
 */

const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { createRequire } = require('node:module');

const entryTime = performance.now();
const entryStartedAt = new Date().toISOString();

const ALLOWED_MODES = new Set(['without-preload', 'with-preload']);
const ALLOWED_ERROR_CODES = new Set([
  'MODULE_NOT_FOUND',
  'SYNTAX_ERROR',
  'TYPE_ERROR',
  'STAGE_LOAD_FAILED',
  'OUTPUT_WRITE_FAILED',
  'INVALID_ARGUMENTS',
  'UNKNOWN_CHILD_ERROR'
]);

function sanitizeErrorCode(err) {
  if (!err) return null;
  if (typeof err.code === 'string' && ALLOWED_ERROR_CODES.has(err.code)) {
    return err.code;
  }
  if (err instanceof SyntaxError) return 'SYNTAX_ERROR';
  if (err instanceof TypeError) return 'TYPE_ERROR';
  return 'UNKNOWN_CHILD_ERROR';
}

const outputPath = process.argv[2];
const mode = process.argv[3] || 'without-preload';

const result = {
  mode: ALLOWED_MODES.has(mode) ? mode : 'without-preload',
  entryStartedAt,
  entryMonotonicMs: Math.round(entryTime * 100) / 100,
  preloadInstalled: Boolean(globalThis.__FG_GATEWAY_OBSERVER_PRELOAD__),
  stages: [],
  totalDurationMs: 0,
  allOk: false,
  errorCode: null
};

if (!outputPath || !ALLOWED_MODES.has(mode)) {
  result.errorCode = 'INVALID_ARGUMENTS';
  try {
    if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
  } catch {}
  process.exit(1);
}

try {
  // Use createRequire rooted at /gateway/app/gateway-main.js to match exact resolution context of gateway-main.js
  const appRequire = createRequire('/gateway/app/gateway-main.js');
  const stageDefs = [
    { name: 'pg', target: 'pg' },
    { name: 'livekit_sdk', target: 'livekit-server-sdk' },
    { name: 'livekit_protocol', target: '@livekit/protocol' },
    { name: 'ws', target: 'ws' },
    { name: 'lease_store', target: './lease-store.js' },
    { name: 'signaling_gateway', target: './signaling-gateway.js' }
  ];

  const overallStart = performance.now();

  for (const def of stageDefs) {
    const startedAt = new Date().toISOString();
    const stageStart = performance.now();
    let stageOk = false;
    let stageError = null;

    try {
      const loadedModule = appRequire(def.target);
      if (loadedModule && (typeof loadedModule === 'object' || typeof loadedModule === 'function')) {
        stageOk = true;
      } else {
        stageError = 'STAGE_LOAD_FAILED';
      }
    } catch (stageErr) {
      stageError = sanitizeErrorCode(stageErr);
    }

    const stageEnd = performance.now();
    const durationMs = Math.round((stageEnd - stageStart) * 100) / 100;

    result.stages.push({
      stage: def.name,
      startedAt,
      durationMs,
      ok: stageOk,
      errorCode: stageError
    });

    if (!stageOk) {
      result.errorCode = stageError;
      break;
    }
  }

  const overallEnd = performance.now();
  result.totalDurationMs = Math.round((overallEnd - overallStart) * 100) / 100;
  result.allOk = result.stages.length === stageDefs.length && result.stages.every(s => s.ok);

} catch (err) {
  result.errorCode = sanitizeErrorCode(err);
  result.allOk = false;
} finally {
  try {
    const serialized = JSON.stringify(result, null, 2) + '\n';
    if (serialized.length > 64 * 1024) {
      throw new Error('Result payload exceeded maximum bounded length');
    }
    fs.writeFileSync(outputPath, serialized, { flag: 'w' });
  } catch {
    process.exit(1);
  }
}

process.exit(result.allOk ? 0 : 1);
