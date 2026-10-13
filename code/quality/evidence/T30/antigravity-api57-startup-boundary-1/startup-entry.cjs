'use strict';

/**
 * FG T30 — Minimal Gateway Startup Boundary Diagnostic Wrapper
 *
 * Wraps container entry execution in order to isolate process entry, preload
 * evaluation, and gateway-main.js script evaluation without altering module
 * loading order, arguments, or application source code.
 *
 * Strict Invariants:
 * 1. Builtins fs/performance marker first before loading external modules.
 * 2. Emits prefix [FG_GATEWAY_STARTUP] with strict enum metadata only.
 * 3. Never emits argv, environment, credentials, URLs, or error message strings.
 * 4. Fixed error codes only; rethrows exact caught exception identity.
 * 5. Bounded: <= 8 rows total, <= 1024 bytes per row, writeSync complete bytes loop.
 * 6. Preserves process.argv[2] exactly (/gateway/input.json).
 * 7. Loading order: original preload.cjs before gateway-main.js.
 * 8. main END is not ready; original ready log stays in listen callback.
 */

const fs = require('node:fs');
const { performance } = require('node:perf_hooks');

const start = performance.now();
let sequence = 0;

const ALLOWED_TYPES = new Set(['entry', 'begin', 'end']);
const ALLOWED_STAGES = new Set(['entry', 'preload', 'main']);

function sanitizeCode(err) {
  if (!err) return null;
  if (err.code === 'MODULE_NOT_FOUND') return 'MODULE_NOT_FOUND';
  if (err instanceof SyntaxError) return 'SYNTAX_ERROR';
  if (err instanceof TypeError) return 'TYPE_ERROR';
  return 'STARTUP_FAILED';
}

function emit(type, stage, ok = null, code = null, durationMs = null) {
  if (!ALLOWED_TYPES.has(type) || !ALLOWED_STAGES.has(stage)) {
    process.exit(2);
  }
  const row = {
    sequence: ++sequence,
    type,
    stage,
    at: new Date().toISOString(),
    elapsedMs: Math.round((performance.now() - start) * 100) / 100,
    ok,
    code,
    durationMs
  };
  const s = '[FG_GATEWAY_STARTUP] ' + JSON.stringify(row) + '\n';
  if (sequence > 8 || Buffer.byteLength(s, 'utf8') > 1024) {
    process.exit(2);
  }
  const b = Buffer.from(s, 'utf8');
  let offset = 0;
  while (offset < b.length) {
    const bytes = fs.writeSync(1, b, offset, b.length - offset);
    if (!Number.isInteger(bytes) || bytes <= 0) {
      process.exit(2);
    }
    offset += bytes;
  }
}

// 1. Process entry marker
emit('entry', 'entry');

// 2. Preload evaluation: original /gateway/preload.cjs
emit('begin', 'preload');
const preloadStart = performance.now();
try {
  require('/gateway/preload.cjs');
  if (!globalThis.__FG_GATEWAY_OBSERVER_PRELOAD__) {
    throw new Error('preload');
  }
  emit('end', 'preload', true, null, Math.round((performance.now() - preloadStart) * 100) / 100);
} catch (err) {
  const code = sanitizeCode(err);
  emit('end', 'preload', false, code, Math.round((performance.now() - preloadStart) * 100) / 100);
  throw err;
}

// 3. Main script evaluation: original compiled /gateway/app/gateway-main.js
emit('begin', 'main');
const mainStart = performance.now();
try {
  require('/gateway/app/gateway-main.js');
  emit('end', 'main', true, null, Math.round((performance.now() - mainStart) * 100) / 100);
} catch (err) {
  const code = sanitizeCode(err);
  emit('end', 'main', false, code, Math.round((performance.now() - mainStart) * 100) / 100);
  throw err;
}
