'use strict';

/**
 * FG T30 — Private Gateway Observer Preload (Corrected)
 * 
 * Non-intrusive entry-point diagnostic observer for the private signaling gateway process.
 * Launched via: node -r /gateway/preload.cjs /gateway/app/gateway-main.js /gateway/input.json
 * 
 * Strict Invariants:
 * - Duplicate preload throws error immediately before any environment modification.
 * - PatchedPool extends OriginalPool with super(...args); tracks clients via own pool 'connect' event WeakMap (NO connect override).
 * - Client.prototype.query preserves exact callback/submittable args and return values. Diagnostic spans only Promise forms/sync throws.
 * - Side Promise handlers return undefined (never throw); original Promise returned to caller; sync errors re-thrown with exact identity.
 * - Query and RPC spans capture safe ISO startedAt, completedAt, monotonic duration, poolIndex, backendPid, safe 5-char SQLSTATE.
 * - Fixed Twirp lower-case enum or HTTP status 100..599 for RPC errors. Missing required RPC methods marks failure.
 * - WebSocket uses _isServer boolean for role; explicit SignalRequest/Response enum whitelist; max 1 MiB decode; no raw payload storage.
 * - CPU single absolute snapshot delta; histogram.reset() per 1 Hz sample; finite-null unavailable values.
 * - Bounded buffer <= 5,000 records / 1 MiB; droppedCount marks observation incomplete. Partial fs.writeSync marks failure.
 * - SIGUSR2 stops timer, disables histogram, flushes buffer, emits exact [FG_GATEWAY_HEALTH] marker.
 */

if (globalThis.__FG_GATEWAY_OBSERVER_PRELOAD__) {
  throw new Error('Duplicate gateway observer preload detected');
}
globalThis.__FG_GATEWAY_OBSERVER_PRELOAD__ = true;

const fs = require('node:fs');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');

let sampleCount = 0;
let failureCount = 0;
let droppedCount = 0;
let isStopped = false;
let timerStopped = false;
let histogramDisabled = false;

const MAX_BUFFERED_RECORDS = 5000;
const MAX_BUFFERED_BYTES = 1024 * 1024;
const recordBuffer = [];
let currentBufferBytes = 0;

function bufferRecord(rec) {
  if (isStopped) return;
  try {
    const line = JSON.stringify(rec);
    const lineBytes = Buffer.byteLength(line, 'utf8') + 1;
    if (recordBuffer.length >= MAX_BUFFERED_RECORDS || currentBufferBytes + lineBytes > MAX_BUFFERED_BYTES) {
      droppedCount++;
      return;
    }
    recordBuffer.push(line);
    currentBufferBytes += lineBytes;
  } catch {
    failureCount++;
  }
}

function writeStdoutSync(str) {
  const buf = Buffer.from(str, 'utf8');
  let written = 0;
  while (written < buf.length) {
    const bytes = fs.writeSync(1, buf, written, buf.length - written);
    if (!Number.isInteger(bytes) || bytes <= 0 || bytes !== buf.length-written) {
      throw new Error('Partial or zero byte stdout write');
    }
    written += bytes;
  }
}

function flushBufferSync() {
  if (recordBuffer.length === 0) return;
  try {
    const payload = '[FG_GATEWAY_OBSERVER] ' + recordBuffer.join('\n[FG_GATEWAY_OBSERVER] ') + '\n';
    writeStdoutSync(payload);
  } catch {
    failureCount++;
  } finally {
    recordBuffer.length = 0;
    currentBufferBytes = 0;
  }
}

// -----------------------------------------------------------------------------
// 1. PostgreSQL Instrumentation (class extends OriginalPool, NO connect override)
// -----------------------------------------------------------------------------
const clientPoolIndexMap = new WeakMap();
const registeredPools = new Set();
let nextPoolIndex = 0;

try {
  const pg = require('pg');
  const OrigPool = pg.Pool;

  class PatchedPool extends OrigPool {
    constructor(...args) {
      super(...args);
      const idx = nextPoolIndex++;
      this.__fg_pool_index = idx;
      registeredPools.add(this);
      this.on('connect', (client) => {
        try {
          clientPoolIndexMap.set(client, idx);
        } catch {
          failureCount++;
        }
      });
    }
  }
  pg.Pool = PatchedPool;

  function recordQuerySpan(client, kind, startedAt, completedAt, durationMs, ok, err) {
    let sqlState = null;
    if (err && typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) {
      sqlState = err.code;
    }
    const poolIndex = clientPoolIndexMap.get(client) ?? null;
    const backendPid = Number(client.processID) || null;
    bufferRecord({
      type: 'query',
      kind,
      startedAt,
      completedAt,
      durationMs,
      poolIndex,
      backendPid,
      ok,
      sqlState
    });
  }

  const origQuery = pg.Client.prototype.query;
  pg.Client.prototype.query = function (...args) {
    const lastArg = args[args.length - 1];
    // Exact callback / submittable passthrough without substitution
    if (typeof lastArg === 'function') {
      return origQuery.apply(this, args);
    }

    let kind = 'other';
    try {
      let queryText = '';
      if (typeof args[0] === 'string') {
        queryText = args[0];
      } else if (args[0] && typeof args[0] === 'object') {
        queryText = String(args[0].name || args[0].text || '');
      }
      if (/^\s*BEGIN\b/i.test(queryText)) kind = 'begin';
      else if (/^\s*COMMIT\b/i.test(queryText)) kind = 'commit';
      else if (/^\s*ROLLBACK\b/i.test(queryText)) kind = 'rollback';
      else if (/SELECT\s+id\s+FROM\s+rooms/i.test(queryText)) kind = 'room-lock';
      else if (/SELECT\s+id\s+FROM\s+call_groups/i.test(queryText)) kind = 'group-lock';
      else if (/fg_live_call_admission_policy_v1/i.test(queryText) || (/call_restrictions/i.test(queryText) && /call_publish_slots/i.test(queryText))) kind = 'policy';
      else if (/fg_live_call_admissions?_v1/i.test(queryText) || (/call_admissions/i.test(queryText) && /call_members/i.test(queryText))) kind = 'live-lease';
    } catch {
      failureCount++;
    }

    let startedAt = null;
    let startMonotonic = 0;
    try {
      startedAt = new Date().toISOString();
      startMonotonic = performance.now();
    } catch {
      failureCount++;
    }

    let result;
    try {
      result = origQuery.apply(this, args);
    } catch (syncErr) {
      try {
        const completedAt = new Date().toISOString();
        const durationMs = startMonotonic > 0 ? Math.round((performance.now() - startMonotonic) * 100) / 100 : null;
        recordQuerySpan(this, kind, startedAt, completedAt, durationMs, false, syncErr);
      } catch {
        failureCount++;
      }
      throw syncErr;
    }

    if (result && typeof result.then === 'function') {
      // Side handlers that record telemetry and return undefined (never throw)
      result.then(
        () => {
          try {
            const completedAt = new Date().toISOString();
            const durationMs = startMonotonic > 0 ? Math.round((performance.now() - startMonotonic) * 100) / 100 : null;
            recordQuerySpan(this, kind, startedAt, completedAt, durationMs, true, null);
          } catch {
            failureCount++;
          }
        },
        (err) => {
          try {
            const completedAt = new Date().toISOString();
            const durationMs = startMonotonic > 0 ? Math.round((performance.now() - startMonotonic) * 100) / 100 : null;
            recordQuerySpan(this, kind, startedAt, completedAt, durationMs, false, err);
          } catch {
            failureCount++;
          }
        }
      );
      return result;
    }

    return result;
  };
} catch {
  failureCount++;
}

// -----------------------------------------------------------------------------
// Codex-only PG/query/metric observation; actual ESM SDK trace is a separate scoped module.
// 4. 1 Hz Sampling Timer & Process Metrics (Reset histogram, finite nulls)
// -----------------------------------------------------------------------------
let lastCpuUsage = process.cpuUsage();
let lastSampleTime = performance.now();
const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

const sampleTimer = setInterval(() => {
  if (isStopped) return;
  try {
    sampleCount++;
    const now = performance.now();
    const elapsedMs = Math.round((now - lastSampleTime) * 100) / 100;
    lastSampleTime = now;

    // Single absolute snapshot delta
    const currentCpu = process.cpuUsage();
    const cpuDelta = {user:currentCpu.user-lastCpuUsage.user,system:currentCpu.system-lastCpuUsage.system};
    lastCpuUsage = currentCpu;

    let eventLoopMeanMs = null;
    let eventLoopMaxMs = null;
    let eventLoopP99Ms = null;
    if (Number.isFinite(histogram.mean)) {
      eventLoopMeanMs = Math.round((histogram.mean / 1e6) * 100) / 100;
    }
    if (Number.isFinite(histogram.max)) {
      eventLoopMaxMs = Math.round((histogram.max / 1e6) * 100) / 100;
    }
    const p99 = histogram.percentile(99);
    if (Number.isFinite(p99)) {
      eventLoopP99Ms = Math.round((p99 / 1e6) * 100) / 100;
    }
    histogram.reset();

    const pools = [];
    for (const pool of registeredPools) {
      pools.push({
        poolIndex: pool.__fg_pool_index ?? null,
        totalCount: Number.isInteger(pool.totalCount) ? pool.totalCount : null,
        idleCount: Number.isInteger(pool.idleCount) ? pool.idleCount : null,
        waitingCount: Number.isInteger(pool.waitingCount) ? pool.waitingCount : null,
        max: pool.options && Number.isInteger(pool.options.max) ? pool.options.max : null,
        ended: Boolean(pool.ended)
      });
    }

    bufferRecord({
      type: 'metric',
      recordedAt:new Date().toISOString(),
      elapsedMs,
      cpuUserMs: Math.round(cpuDelta.user / 1000),
      cpuSystemMs: Math.round(cpuDelta.system / 1000),
      eventLoopMeanMs,
      eventLoopMaxMs,
      eventLoopP99Ms,
      pools
    });

    flushBufferSync();
  } catch {
    failureCount++;
  }
}, 1000);
sampleTimer.unref();

// -----------------------------------------------------------------------------
// 5. Explicit SIGUSR2 Stop & Strict Health Marker
// -----------------------------------------------------------------------------
process.on('SIGUSR2', () => {
  if (isStopped) return;
  isStopped = true;

  try {
    clearInterval(sampleTimer);
    timerStopped = true;
  } catch {
    failureCount++;
  }

  try {
    histogram.disable();
    histogramDisabled = true;
  } catch {
    failureCount++;
  }

  flushBufferSync();

  try {
    const observationComplete = Boolean(
      sampleCount > 0 &&
      failureCount === 0 &&
      droppedCount === 0 &&
      timerStopped &&
      histogramDisabled
    );

    const healthMarker = {
      sampleCount,
      failureCount,
      droppedCount,
      timerStopped,
      histogramDisabled,
      observationComplete
    };

    writeStdoutSync('[FG_GATEWAY_HEALTH] ' + JSON.stringify(healthMarker) + '\n');
  } catch {
    failureCount++;
  }
});
