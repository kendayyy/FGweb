'use strict';

/**
 * FG T30 — Minimal Gateway Observer Diagnostic Hook Candidate
 * 
 * Extends gateway-observer-preload-reviewed2.cjs with controlled, safe observation
 * of subscription and subscriptionPermissionUpdate payloads and per-frame gateway transit latencies.
 * 
 * Strict Invariants:
 * - Duplicate preload throws error immediately.
 * - PatchedPool extends OriginalPool with super(...args); tracks clients via own pool 'connect' event WeakMap.
 * - Client.prototype.query preserves exact callback/submittable args and return values.
 * - RoomServiceClient RPC methods wrapped with monotonic duration, preserving original promises/returns.
 * - WebSocket classifies SignalRequest / SignalResponse without mutating payload bytes or storing secrets.
 * - Safe boolean and track-count extraction for 'subscription' and 'subscriptionPermissionUpdate'.
 * - Bounded buffer <= 5,000 records / 1 MiB; droppedCount marks observation incomplete.
 * - Synchronous stdout flush on SIGUSR2 with [FG_GATEWAY_HEALTH] marker.
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
    if (!Number.isInteger(bytes) || bytes <= 0 || bytes !== buf.length - written) {
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
// 1. PostgreSQL Instrumentation (Identical to reviewed helper)
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
      else if (/SELECT\s+id\s+FROM\s+call_groups/i.test(queryText)) kind = 'call-group-lock';
      else if (/fg_live_call_admission_policy_v1/i.test(queryText)) kind = 'live-lease-policy';
      else if (/fg_live_call_admission_v1/i.test(queryText)) kind = 'live-lease';
      else if (/UPDATE\s+call_admissions/i.test(queryText)) kind = 'admission-update';
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
// 2. RoomServiceClient RPC Instrumentation (Identical to reviewed helper)
// -----------------------------------------------------------------------------
const TWIRP_CODES = new Set([
  'canceled', 'unknown', 'invalid_argument', 'deadline_exceeded',
  'not_found', 'already_exists', 'permission_denied', 'unauthenticated',
  'resource_exhausted', 'failed_precondition', 'aborted', 'out_of_range',
  'unimplemented', 'internal', 'unavailable', 'data_loss'
]);

function sanitizeRpcCode(err) {
  if (!err) return null;
  if (typeof err.code === 'string') {
    const lower = err.code.toLowerCase();
    if (TWIRP_CODES.has(lower)) return lower;
  }
  if (Number.isInteger(err.status) && err.status >= 100 && err.status <= 599) {
    return String(err.status);
  }
  return 'other';
}

try {
  const { RoomServiceClient } = require('livekit-server-sdk');

  function wrapRpcMethod(methodName) {
    const origMethod = RoomServiceClient.prototype[methodName];
    if (typeof origMethod !== 'function') return;

    RoomServiceClient.prototype[methodName] = function (...args) {
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
        result = origMethod.apply(this, args);
      } catch (syncErr) {
        try {
          const completedAt = new Date().toISOString();
          const durationMs = startMonotonic > 0 ? Math.round((performance.now() - startMonotonic) * 100) / 100 : null;
          bufferRecord({
            type: 'rpc',
            method: methodName,
            startedAt,
            completedAt,
            durationMs,
            ok: false,
            code: sanitizeRpcCode(syncErr)
          });
        } catch {
          failureCount++;
        }
        throw syncErr;
      }

      if (result && typeof result.then === 'function') {
        result.then(
          () => {
            try {
              const completedAt = new Date().toISOString();
              const durationMs = startMonotonic > 0 ? Math.round((performance.now() - startMonotonic) * 100) / 100 : null;
              bufferRecord({
                type: 'rpc',
                method: methodName,
                startedAt,
                completedAt,
                durationMs,
                ok: true,
                code: null
              });
            } catch {
              failureCount++;
            }
          },
          (err) => {
            try {
              const completedAt = new Date().toISOString();
              const durationMs = startMonotonic > 0 ? Math.round((performance.now() - startMonotonic) * 100) / 100 : null;
              bufferRecord({
                type: 'rpc',
                method: methodName,
                startedAt,
                completedAt,
                durationMs,
                ok: false,
                code: sanitizeRpcCode(err)
              });
            } catch {
              failureCount++;
            }
          }
        );
        return result;
      }

      return result;
    };
  }

  wrapRpcMethod('updateParticipant');
  wrapRpcMethod('getParticipant');
  wrapRpcMethod('removeParticipant');
} catch {
  failureCount++;
}

// -----------------------------------------------------------------------------
// 3. WebSocket Instrumentation with Controlled Payload Observation Hook
// -----------------------------------------------------------------------------
const SIGNAL_CASES = new Set([
  'offer', 'answer', 'trickle', 'addTrack', 'muteTrack', 'subscription',
  'trackSetting', 'leave', 'updateLayers', 'subscriptionPermission',
  'syncState', 'simulate', 'ping', 'updateMetadata', 'pingReq',
  'join', 'update', 'trackPublished', 'trackUnpublished', 'mute',
  'speakersChanged', 'roomUpdate', 'connectionQuality', 'streamStateUpdate',
  'subscribedQualityUpdate', 'subscriptionPermissionUpdate', 'refreshToken',
  'trackMuted', 'subscriptionResponse', 'pong', 'reconnect', 'pongResp'
]);

const socketMetaMap = new WeakMap();
let nextSocketIndex = 0;

try {
  const { WebSocket } = require('ws');
  const { SignalRequest, SignalResponse } = require('@livekit/protocol');

  function getSocketMeta(ws) {
    let meta = socketMetaMap.get(ws);
    if (!meta) {
      const role = ws._isServer === true ? 'server-peer' : (ws._isServer === false ? 'native-upstream' : 'unknown');
      meta = {
        index: nextSocketIndex++,
        role,
        seq: 0
      };
      socketMetaMap.set(ws, meta);
    }
    return meta;
  }

  function getByteCount(data) {
    if (Buffer.isBuffer(data)) return data.length;
    if (Array.isArray(data)) return data.reduce((acc, b) => acc + (b ? b.length : 0), 0);
    if (data instanceof ArrayBuffer) return data.byteLength;
    if (ArrayBuffer.isView(data)) return data.byteLength;
    if (typeof data === 'string') return Buffer.byteLength(data, 'utf8');
    return 0;
  }

  function classifyAndInspectFrame(data, isRequest) {
    try {
      const byteLen = getByteCount(data);
      if (byteLen === 0 || byteLen > 1024 * 1024) return { caseName: 'unknown' };

      const bytes = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
        ? Buffer.concat(data)
        : data instanceof ArrayBuffer
        ? Buffer.from(data)
        : ArrayBuffer.isView(data)
        ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        : null;

      if (!bytes) return { caseName: 'unknown' };

      if (isRequest) {
        const req = SignalRequest.fromBinary(bytes);
        const caseName = req.message?.case;
        if (typeof caseName === 'string' && SIGNAL_CASES.has(caseName)) {
          if (caseName === 'subscription') {
            const sub = req.message.value;
            return {
              caseName,
              subscribe: typeof sub?.subscribe === 'boolean' ? sub.subscribe : null,
              trackCount: Array.isArray(sub?.trackSids) ? sub.trackSids.length : 0
            };
          }
          return { caseName };
        }
      } else {
        const resp = SignalResponse.fromBinary(bytes);
        const caseName = resp.message?.case;
        if (typeof caseName === 'string' && SIGNAL_CASES.has(caseName)) {
          if (caseName === 'subscriptionPermissionUpdate') {
            const perm = resp.message.value;
            return {
              caseName,
              allowed: typeof perm?.allowed === 'boolean' ? perm.allowed : null,
              trackSid: typeof perm?.trackSid === 'string' && perm.trackSid.length <= 64 ? perm.trackSid : null
            };
          }
          return { caseName };
        }
      }
      return { caseName: 'unknown' };
    } catch {
      return { caseName: 'unknown' };
    }
  }

  function recordWsEvent(ws, direction, data) {
    const meta = getSocketMeta(ws);
    const byteCount = getByteCount(data);
    const isReq = (meta.role === 'native-upstream' && direction === 'send') ||
                  (meta.role === 'server-peer' && direction === 'receive');
    const inspected = classifyAndInspectFrame(data, isReq);
    
    const record = {
      type: 'ws',
      socketIndex: meta.index,
      role: meta.role,
      direction,
      case: inspected.caseName,
      byteCount,
      timestamp: Date.now(),
      seq: meta.seq++
    };

    if (inspected.subscribe !== undefined) record.subscribe = inspected.subscribe;
    if (inspected.trackCount !== undefined) record.trackCount = inspected.trackCount;
    if (inspected.allowed !== undefined) record.allowed = inspected.allowed;
    if (inspected.trackSid !== undefined) record.trackSid = inspected.trackSid;

    bufferRecord(record);
  }

  const origSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (...args) {
    try {
      recordWsEvent(this, 'send', args[0]);
    } catch {
      failureCount++;
    }
    return origSend.apply(this, args);
  };

  const origEmit = WebSocket.prototype.emit;
  WebSocket.prototype.emit = function (event, ...args) {
    if (event === 'message') {
      try {
        recordWsEvent(this, 'receive', args[0]);
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
// 4. Resource & Lifecycle Sampling (1 Hz)
// -----------------------------------------------------------------------------
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelay.enable();

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = performance.now();

const sampleInterval = setInterval(() => {
  if (isStopped || timerStopped) return;
  sampleCount++;

  const now = performance.now();
  const currentCpu = process.cpuUsage();
  const elapsedMs = now - lastCpuTime;
  lastCpuTime = now;

  const userDiffMs = (currentCpu.user - lastCpuUsage.user) / 1000;
  const sysDiffMs = (currentCpu.system - lastCpuUsage.system) / 1000;
  lastCpuUsage = currentCpu;

  const cpuPercent = elapsedMs > 0 ? Math.round(((userDiffMs + sysDiffMs) / elapsedMs) * 10000) / 100 : null;
  const mem = process.memoryUsage();

  const minLag = eventLoopDelay.min !== 0 && Number.isFinite(eventLoopDelay.min) ? Math.round(eventLoopDelay.min / 1e4) / 100 : null;
  const maxLag = eventLoopDelay.max !== 0 && Number.isFinite(eventLoopDelay.max) ? Math.round(eventLoopDelay.max / 1e4) / 100 : null;
  const meanLag = Number.isFinite(eventLoopDelay.mean) ? Math.round(eventLoopDelay.mean / 1e4) / 100 : null;
  eventLoopDelay.reset();

  bufferRecord({
    type: 'metric',
    timestamp: Date.now(),
    sampleCount,
    cpuPercent,
    rssBytes: mem.rss,
    heapUsedBytes: mem.heapUsed,
    eventLoopMinMs: minLag,
    eventLoopMaxMs: maxLag,
    eventLoopMeanMs: meanLag
  });
}, 1000);
sampleInterval.unref();

// -----------------------------------------------------------------------------
// 5. Shutdown and Flush Signal Handling
// -----------------------------------------------------------------------------
process.on('SIGUSR2', () => {
  if (isStopped) return;
  isStopped = true;
  timerStopped = true;
  clearInterval(sampleInterval);
  try {
    eventLoopDelay.disable();
    histogramDisabled = true;
  } catch {
    failureCount++;
  }
  flushBufferSync();
  const healthPayload = JSON.stringify({
    sampleCount,
    failureCount,
    droppedCount,
    timerStopped,
    histogramDisabled,
    observationComplete: droppedCount === 0 && failureCount === 0
  });
  writeStdoutSync('[FG_GATEWAY_HEALTH] ' + healthPayload + '\n');
});
