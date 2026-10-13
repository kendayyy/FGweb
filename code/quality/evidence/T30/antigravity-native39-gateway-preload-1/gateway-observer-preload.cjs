'use strict';

/**
 * FG T30 — Private Gateway Observer Preload
 * 
 * Non-intrusive entry-point diagnostic observer for the private signaling gateway process.
 * Launched via: node -r /gateway/preload.cjs /gateway/app/gateway-main.js /gateway/input.json
 * 
 * Invariants:
 * - NO modification of business logic, authority checks, locks, frame forwarding, or deadlines.
 * - NO pool.connect override; monitors Client.prototype.query and tracks pool instances.
 * - Passive WebSocket pass-through; WeakMap metadata; no frame alteration or queue delay.
 * - RoomServiceClient RPC pass-through preserving this, args, Promise identity, and exceptions.
 * - Strictly redacted telemetry: whitelisted enums, durations, counts only. Zero sensitive data.
 * - Synchronous stdout logging (fd 1); explicit SIGUSR2 stop; fail-safe isolation.
 */

if (globalThis.__FG_GATEWAY_OBSERVER_PRELOAD__) {
  return;
}
globalThis.__FG_GATEWAY_OBSERVER_PRELOAD__ = true;

const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { monitorEventLoopDelay } = require('node:perf_hooks');

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

function flushBufferSync() {
  if (recordBuffer.length === 0) return;
  try {
    const payload = '[FG_GATEWAY_OBSERVER] ' + recordBuffer.join('\n[FG_GATEWAY_OBSERVER] ') + '\n';
    fs.writeSync(1, payload);
  } catch {
    failureCount++;
  } finally {
    recordBuffer.length = 0;
    currentBufferBytes = 0;
  }
}

// -----------------------------------------------------------------------------
// 1. PostgreSQL Instrumentation (No pool.connect override)
// -----------------------------------------------------------------------------
const registeredPools = new Set();
let nextPoolIndex = 0;
const poolIndexMap = new WeakMap();

try {
  const pg = require('pg');

  // Track Pool instances
  const OrigPool = pg.Pool;
  function PatchedPool(options) {
    const pool = new OrigPool(options);
    const idx = nextPoolIndex++;
    poolIndexMap.set(pool, idx);
    registeredPools.add(pool);
    return pool;
  }
  PatchedPool.prototype = OrigPool.prototype;
  pg.Pool = PatchedPool;

  // Intercept Client.prototype.query
  const origQuery = pg.Client.prototype.query;
  pg.Client.prototype.query = function (...args) {
    const client = this;
    const start = performance.now();

    let kind = 'other';
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

    function recordSpan(err) {
      try {
        const durationMs = Math.round((performance.now() - start) * 100) / 100;
        let sqlState = null;
        if (err && typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) {
          sqlState = err.code;
        }
        bufferRecord({
          type: 'query',
          kind,
          durationMs,
          backendPid: Number(client.processID) || null,
          ok: !err,
          sqlState
        });
      } catch {
        failureCount++;
      }
    }

    // Check if callback form is used
    const lastArg = args[args.length - 1];
    if (typeof lastArg === 'function') {
      const origCb = lastArg;
      args[args.length - 1] = function (err, result) {
        recordSpan(err);
        return origCb.apply(this, arguments);
      };
      return origQuery.apply(this, args);
    }

    // Promise form
    try {
      const result = origQuery.apply(this, args);
      if (result && typeof result.then === 'function') {
        return result.then(
          (res) => {
            recordSpan(null);
            return res;
          },
          (err) => {
            recordSpan(err);
            throw err;
          }
        );
      }
      recordSpan(null);
      return result;
    } catch (syncErr) {
      recordSpan(syncErr);
      throw syncErr;
    }
  };
} catch {
  failureCount++;
}

// -----------------------------------------------------------------------------
// 2. WebSocket Instrumentation (WeakMap, pass-through)
// -----------------------------------------------------------------------------
const socketMetaMap = new WeakMap();
let nextSocketIndex = 0;

try {
  const { WebSocket } = require('ws');
  const { SignalRequest, SignalResponse } = require('@livekit/protocol');

  function getSocketMeta(ws) {
    let meta = socketMetaMap.get(ws);
    if (!meta) {
      meta = {
        index: nextSocketIndex++,
        role: ws.url ? 'native-upstream' : 'server-peer',
        seq: 0
      };
      socketMetaMap.set(ws, meta);
    }
    return meta;
  }

  function classifyFrame(data, isRequest) {
    try {
      const bytes = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
        ? Buffer.concat(data)
        : data instanceof ArrayBuffer
        ? Buffer.from(data)
        : null;

      if (!bytes) return 'unknown';

      if (isRequest) {
        const req = SignalRequest.fromBinary(bytes);
        return req.message.case || 'unknown';
      } else {
        const resp = SignalResponse.fromBinary(bytes);
        return resp.message.case || 'unknown';
      }
    } catch {
      // Protocol decode failures are diagnostic only, never crash or alter stream
      return 'unknown';
    }
  }

  function getByteCount(data) {
    if (Buffer.isBuffer(data)) return data.length;
    if (Array.isArray(data)) return data.reduce((acc, b) => acc + (b ? b.length : 0), 0);
    if (data instanceof ArrayBuffer) return data.byteLength;
    if (typeof data === 'string') return Buffer.byteLength(data, 'utf8');
    return 0;
  }

  const origSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (data, ...rest) {
    try {
      const meta = getSocketMeta(this);
      const isReq = meta.role === 'native-upstream';
      const caseName = classifyFrame(data, isReq);
      bufferRecord({
        type: 'ws',
        socketIndex: meta.index,
        role: meta.role,
        direction: 'send',
        case: caseName,
        byteCount: getByteCount(data),
        timestamp: Date.now(),
        seq: meta.seq++
      });
    } catch {
      failureCount++;
    }
    return origSend.apply(this, [data, ...rest]);
  };

  const origEmit = WebSocket.prototype.emit;
  WebSocket.prototype.emit = function (event, ...args) {
    if (event === 'message') {
      try {
        const meta = getSocketMeta(this);
        const data = args[0];
        const isReq = meta.role === 'server-peer';
        const caseName = classifyFrame(data, isReq);
        bufferRecord({
          type: 'ws',
          socketIndex: meta.index,
          role: meta.role,
          direction: 'receive',
          case: caseName,
          byteCount: getByteCount(data),
          timestamp: Date.now(),
          seq: meta.seq++
        });
      } catch {
        failureCount++;
      }
    }
    return origEmit.apply(this, [event, ...args]);
  };
} catch {
  failureCount++;
}

// -----------------------------------------------------------------------------
// 3. RoomServiceClient RPC Instrumentation
// -----------------------------------------------------------------------------
try {
  const { RoomServiceClient } = require('livekit-server-sdk');

  function sanitizeRpcCode(err) {
    if (!err) return null;
    if (typeof err.code === 'string' && /^[0-9A-Z_]{1,32}$/.test(err.code)) {
      return err.code;
    }
    if (Number.isInteger(err.status)) {
      return String(err.status);
    }
    return 'RPC_ERROR';
  }

  function wrapRpcMethod(methodName) {
    const origMethod = RoomServiceClient.prototype[methodName];
    if (typeof origMethod !== 'function') return;

    RoomServiceClient.prototype[methodName] = function (...args) {
      const start = performance.now();
      try {
        const promise = origMethod.apply(this, args);
        if (promise && typeof promise.then === 'function') {
          return promise.then(
            (res) => {
              try {
                const durationMs = Math.round((performance.now() - start) * 100) / 100;
                bufferRecord({
                  type: 'rpc',
                  method: methodName,
                  durationMs,
                  ok: true,
                  code: null
                });
              } catch {
                failureCount++;
              }
              return res;
            },
            (err) => {
              try {
                const durationMs = Math.round((performance.now() - start) * 100) / 100;
                bufferRecord({
                  type: 'rpc',
                  method: methodName,
                  durationMs,
                  ok: false,
                  code: sanitizeRpcCode(err)
                });
              } catch {
                failureCount++;
              }
              throw err;
            }
          );
        }
        return promise;
      } catch (syncErr) {
        try {
          const durationMs = Math.round((performance.now() - start) * 100) / 100;
          bufferRecord({
            type: 'rpc',
            method: methodName,
            durationMs,
            ok: false,
            code: sanitizeRpcCode(syncErr)
          });
        } catch {
          failureCount++;
        }
        throw syncErr;
      }
    };
  }

  wrapRpcMethod('updateParticipant');
  wrapRpcMethod('getParticipant');
  wrapRpcMethod('removeParticipant');
} catch {
  failureCount++;
}

// -----------------------------------------------------------------------------
// 4. 1 Hz Sampling Timer & Process Metrics
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

    const cpuDelta = process.cpuUsage(lastCpuUsage);
    lastCpuUsage = process.cpuUsage();

    const pools = [];
    for (const pool of registeredPools) {
      pools.push({
        poolIndex: poolIndexMap.get(pool) ?? null,
        totalCount: Number.isInteger(pool.totalCount) ? pool.totalCount : null,
        idleCount: Number.isInteger(pool.idleCount) ? pool.idleCount : null,
        waitingCount: Number.isInteger(pool.waitingCount) ? pool.waitingCount : null,
        max: pool.options && Number.isInteger(pool.options.max) ? pool.options.max : null,
        ended: Boolean(pool.ended)
      });
    }

    bufferRecord({
      type: 'metric',
      elapsedMs,
      cpuUserMs: Math.round(cpuDelta.user / 1000),
      cpuSystemMs: Math.round(cpuDelta.system / 1000),
      eventLoopMeanMs: Math.round((histogram.mean / 1e6) * 100) / 100,
      eventLoopMaxMs: Math.round((histogram.max / 1e6) * 100) / 100,
      eventLoopP99Ms: Math.round((histogram.percentile(99) / 1e6) * 100) / 100,
      pools
    });

    flushBufferSync();
  } catch {
    failureCount++;
  }
}, 1000);
sampleTimer.unref();

// -----------------------------------------------------------------------------
// 5. Explicit SIGUSR2 Stop & Final Health Marker
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

    fs.writeSync(1, '[FG_GATEWAY_HEALTH] ' + JSON.stringify(healthMarker) + '\n');
  } catch {
    failureCount++;
  }
});
