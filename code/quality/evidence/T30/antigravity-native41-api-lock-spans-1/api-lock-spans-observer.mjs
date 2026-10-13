import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';

/**
 * FG T30 — Minimal API-Child Owned Observation via AsyncLocalStorage
 * 
 * Correlates CallLifecycleService and CallsService method executions to
 * technical monotonically increasing span indices, PostgreSQL backend PIDs,
 * in-transaction lock acquisitions, and native LiveKit SDK awaited RPC spans.
 * 
 * Strict Invariants:
 * 1. ALS.run(ctx, () => Reflect.apply(original, this, args)) returns the EXACT original
 *    promise, value, or synchronous error without async wrapper or replacement promise.
 * 2. Side handlers return undefined and never throw. Original promises/callbacks/errors
 *    are returned to callers with exact identity preserved.
 * 3. No arbitrary SQL, query parameters, result rows, identities, tokens, URLs, or secrets.
 * 4. Patched Pool extends OriginalPool with super(...args) and binds per-client query methods
 *    via its own pool 'connect' event WeakMap (NO connect override).
 * 5. Bounded buffer <= 5,000 records / 1 MiB with synchronous flush on stop.
 */

export const als = new AsyncLocalStorage();

let spanSequence = 0;
export function createSpanContext(owner) {
  const parent = als.getStore();
  const spanIndex = ++spanSequence;
  return {
    spanIndex,
    parentSpanIndex: parent ? parent.spanIndex : null,
    owner,
    backendPid: null,
  };
}

let sampleCount = 0;
let failureCount = 0;
let droppedCount = 0;
let isStopped = false;
let timerStopped = false;
let histogramDisabled = false;
let evidenceDir = '';

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

export function flushSpansSync() {
  if (recordBuffer.length === 0 || !evidenceDir) return;
  try {
    const payload = recordBuffer.join('\n') + '\n';
    fs.appendFileSync(`${evidenceDir}/api-lock-spans.jsonl`, payload, 'utf8');
  } catch {
    failureCount++;
  } finally {
    recordBuffer.length = 0;
    currentBufferBytes = 0;
  }
}

// -----------------------------------------------------------------------------
// 1. PostgreSQL Pool & Client Instrumentation
// -----------------------------------------------------------------------------
const registeredPools = new Set();
const clientPoolMap = new WeakMap();
const clientActiveLocks = new WeakMap();
let nextPoolIndex = 0;

export function instrumentOwnedApiPools(pg, evidence) {
  evidenceDir = evidence;
  const OrigPool = pg.Pool;

  class PatchedPool extends OrigPool {
    constructor(...args) {
      super(...args);
      const poolIndex = ++nextPoolIndex;
      this.__fg_pool_index = poolIndex;
      registeredPools.add(this);

      this.on('connect', (client) => {
        try {
          clientPoolMap.set(client, poolIndex);
          clientActiveLocks.set(client, { roomAcquired: null, groupAcquired: null });
        } catch {
          failureCount++;
        }
      });
    }
  }

  // Preserve static properties
  for (const prop of Object.getOwnPropertyNames(OrigPool)) {
    if (!Object.prototype.hasOwnProperty.call(PatchedPool, prop)) {
      try {
        const desc = Object.getOwnPropertyDescriptor(OrigPool, prop);
        if (desc) Object.defineProperty(PatchedPool, prop, desc);
      } catch {}
    }
  }

  pg.Pool = PatchedPool;

  const origQuery = pg.Client.prototype.query;
  pg.Client.prototype.query = function (...args) {
    const lastArg = args[args.length - 1];
    // Exact callback / submittable passthrough without substitution
    if (typeof lastArg === 'function') {
      return origQuery.apply(this, args);
    }

    const ctx = als.getStore();
    const backendPid = typeof this.processID === 'number' ? this.processID : Number(this.processID) || null;
    if (ctx && backendPid && !ctx.backendPid) {
      ctx.backendPid = backendPid;
    }

    let kind = 'other';
    let lockMode = 'none';
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
      else if (/SELECT\s+.*FROM\s+rooms/i.test(queryText) && /FOR\s+(?:UPDATE|SHARE)/i.test(queryText)) {
        kind = 'lock-room';
        lockMode = /FOR\s+SHARE/i.test(queryText) ? 'share' : 'update';
      } else if (/SELECT\s+.*FROM\s+call_groups/i.test(queryText) && /FOR\s+(?:UPDATE|SHARE)/i.test(queryText)) {
        kind = 'lock-group';
        lockMode = /FOR\s+SHARE/i.test(queryText) ? 'share' : 'update';
      } else if (/SELECT\s+.*FROM\s+call_members/i.test(queryText) && /FOR\s+(?:UPDATE|SHARE)/i.test(queryText)) {
        kind = 'lock-member';
        lockMode = /FOR\s+SHARE/i.test(queryText) ? 'share' : 'update';
      } else if (/fg_live_call_admission_policy_v1/i.test(queryText) || (/call_restrictions/i.test(queryText) && /call_publish_slots/i.test(queryText))) {
        kind = 'policy';
      } else if (/fg_live_call_admissions?_v1/i.test(queryText) || (/call_admissions/i.test(queryText) && /call_members/i.test(queryText))) {
        kind = 'live-lease';
      }
    } catch {
      failureCount++;
    }

    const poolIndex = clientPoolMap.get(this) ?? null;
    const startedAt = new Date().toISOString();
    const startMonotonic = performance.now();

    const recordCompletion = (ok, err) => {
      try {
        const completedAt = new Date().toISOString();
        const durationMs = Math.round((performance.now() - startMonotonic) * 100) / 100;
        let sqlState = null;
        if (err && typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) {
          sqlState = err.code;
        }

        const lockState = clientActiveLocks.get(this) || { roomAcquired: null, groupAcquired: null };
        const nowMonotonic = performance.now();
        if (ok) {
          if (kind === 'lock-room' && lockMode === 'update') lockState.roomAcquired = nowMonotonic;
          if (kind === 'lock-group' && lockMode === 'update') lockState.groupAcquired = nowMonotonic;
        }

        let roomHoldMs = null;
        let groupHoldMs = null;
        if (kind === 'commit' || kind === 'rollback') {
          if (lockState.roomAcquired !== null) {
            roomHoldMs = Math.round((nowMonotonic - lockState.roomAcquired) * 100) / 100;
            lockState.roomAcquired = null;
          }
          if (lockState.groupAcquired !== null) {
            groupHoldMs = Math.round((nowMonotonic - lockState.groupAcquired) * 100) / 100;
            lockState.groupAcquired = null;
          }
        }

        bufferRecord({
          type: 'query',
          kind,
          lockMode,
          startedAt,
          completedAt,
          durationMs,
          roomHoldMs,
          groupHoldMs,
          poolIndex,
          backendPid,
          spanIndex: ctx ? ctx.spanIndex : null,
          parentSpanIndex: ctx ? ctx.parentSpanIndex : null,
          owner: ctx ? ctx.owner : 'unassociated',
          ok,
          sqlState,
        });
      } catch {
        failureCount++;
      }
    };

    let result;
    try {
      result = origQuery.apply(this, args);
    } catch (syncErr) {
      recordCompletion(false, syncErr);
      throw syncErr;
    }

    if (result && typeof result.then === 'function') {
      result.then(
        () => { recordCompletion(true, null); },
        (err) => { recordCompletion(false, err); }
      );
      return result; // EXACT original promise returned!
    }

    return result;
  };
}

// -----------------------------------------------------------------------------
// 2. RoomServiceClient SDK Instrumentation
// -----------------------------------------------------------------------------
const SAFE_RPC_METHODS = new Set([
  'listRooms',
  'listParticipants',
  'getParticipant',
  'updateParticipant',
  'removeParticipant',
  'deleteRoom',
]);

const TWIRP_CODES = new Set([
  'canceled',
  'unknown',
  'invalid_argument',
  'deadline_exceeded',
  'not_found',
  'already_exists',
  'permission_denied',
  'unauthenticated',
  'resource_exhausted',
  'failed_precondition',
  'aborted',
  'out_of_range',
  'unimplemented',
  'internal',
  'unavailable',
  'data_loss',
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
  if (typeof err.status === 'string' && /^[1-5][0-9]{2}$/.test(err.status)) {
    return err.status;
  }
  return 'other';
}

export function instrumentRoomServiceClient(RoomServiceClient, evidence) {
  evidenceDir = evidence;

  for (const method of SAFE_RPC_METHODS) {
    const origMethod = RoomServiceClient.prototype[method];
    if (typeof origMethod !== 'function') continue;

    RoomServiceClient.prototype[method] = function (...args) {
      const ctx = als.getStore();
      const startedAt = new Date().toISOString();
      const startMonotonic = performance.now();

      const recordCompletion = (ok, err) => {
        try {
          const completedAt = new Date().toISOString();
          const durationMs = Math.round((performance.now() - startMonotonic) * 100) / 100;
          bufferRecord({
            type: 'rpc',
            method,
            startedAt,
            completedAt,
            durationMs,
            spanIndex: ctx ? ctx.spanIndex : null,
            parentSpanIndex: ctx ? ctx.parentSpanIndex : null,
            owner: ctx ? ctx.owner : 'unassociated',
            backendPid: ctx ? ctx.backendPid : null,
            ok,
            code: sanitizeRpcCode(err),
          });
        } catch {
          failureCount++;
        }
      };

      let result;
      try {
        result = origMethod.apply(this, args);
      } catch (syncErr) {
        recordCompletion(false, syncErr);
        throw syncErr;
      }

      if (result && typeof result.then === 'function') {
        result.then(
          () => { recordCompletion(true, null); },
          (err) => { recordCompletion(false, err); }
        );
        return result; // EXACT original promise returned!
      }

      return result;
    };
  }
}

// -----------------------------------------------------------------------------
// 3. Service Method Wrapping via AsyncLocalStorage
// -----------------------------------------------------------------------------
export function instrumentOwnedApiServices({ CallsService, CallLifecycleService }) {
  if (CallsService && CallsService.prototype) {
    for (const methodName of ['list', 'participants', 'withControlGroup']) {
      const orig = CallsService.prototype[methodName];
      if (typeof orig === 'function') {
        CallsService.prototype[methodName] = function (...args) {
          const ctx = createSpanContext(`CallsService.${methodName}`);
          return als.run(ctx, () => Reflect.apply(orig, this, args));
        };
      }
    }
  }

  if (CallLifecycleService && CallLifecycleService.prototype) {
    const origReconcile = CallLifecycleService.prototype.reconcileGroup;
    if (typeof origReconcile === 'function') {
      CallLifecycleService.prototype.reconcileGroup = function (...args) {
        const ctx = createSpanContext('CallLifecycleService.reconcileGroup');
        return als.run(ctx, () => Reflect.apply(origReconcile, this, args));
      };
    }
  }
}

// -----------------------------------------------------------------------------
// 4. Periodic Sampler & Explicit Stop
// -----------------------------------------------------------------------------
let sampleTimer = null;
let lastCpuUsage = null;
let lastSampleTime = 0;
let histogram = null;

export function startApiLockSpansObserver(evidence) {
  evidenceDir = evidence;
  histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  lastCpuUsage = process.cpuUsage();
  lastSampleTime = performance.now();

  sampleTimer = setInterval(() => {
    if (isStopped) return;
    try {
      sampleCount++;
      const now = performance.now();
      const elapsedMs = Math.round((now - lastSampleTime) * 100) / 100;
      lastSampleTime = now;

      const currentCpu = process.cpuUsage();
      const cpuDelta = {
        user: currentCpu.user - lastCpuUsage.user,
        system: currentCpu.system - lastCpuUsage.system,
      };
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
          ended: Boolean(pool.ended),
        });
      }

      bufferRecord({
        type: 'metric',
        recordedAt: new Date().toISOString(),
        elapsedMs,
        cpuUserMs: Math.round(cpuDelta.user / 1000),
        cpuSystemMs: Math.round(cpuDelta.system / 1000),
        eventLoopMeanMs,
        eventLoopMaxMs,
        eventLoopP99Ms,
        pools,
      });

      flushSpansSync();
    } catch {
      failureCount++;
    }
  }, 1000);
  sampleTimer.unref();

  return async function stopApiLockSpansObserver() {
    if (isStopped) return getHealth();
    isStopped = true;

    if (sampleTimer) {
      clearInterval(sampleTimer);
      sampleTimer = null;
      timerStopped = true;
    }

    if (histogram) {
      try {
        histogram.disable();
        histogramDisabled = true;
      } catch {
        failureCount++;
      }
    }

    flushSpansSync();

    const health = getHealth();
    try {
      fs.writeFileSync(`${evidenceDir}/api-lock-spans-health.json`, JSON.stringify(health, null, 2) + '\n', { flag: 'w' });
    } catch {
      failureCount++;
      health.failureCount = failureCount;
      health.observationComplete = false;
    }

    return health;
  };
}

function getHealth() {
  const observationComplete = Boolean(
    sampleCount > 0 &&
    failureCount === 0 &&
    droppedCount === 0 &&
    timerStopped &&
    histogramDisabled
  );
  return {
    recordedAt: new Date().toISOString(),
    sampleCount,
    failureCount,
    droppedCount,
    timerStopped,
    histogramDisabled,
    observationComplete,
  };
}
