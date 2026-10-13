import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';

/**
 * FG T30 — Read-Only Owned API/PG/SDK Error-Origin Observer
 * 
 * Specifically designed to capture exact thrown errors and transaction/pool timing
 * causing HTTP 500 responses (such as POST screen-share/claim, GET play-sessions, GET calls).
 * 
 * Strict Invariants:
 * 1. Read-only observation: preserves all arguments, returns, thrown errors, and HTTP status codes.
 * 2. Exact error identity: caught errors are re-thrown and rejected without modification, wrapping, or reclassification.
 * 3. Sanitized telemetry: captures fixed enums, method names, durationMs, PG SQL states (57014, 53300, etc.),
 *    SDK Twirp codes, and positive integer PIDs. ZERO tokens, cookies, passwords, emails, URLs, query params, or raw SQL.
 * 4. Bound to owned instances: hooks only instrumented app, pools, clients, and services.
 * 5. Complete prototype and listener restoration on normal close AND startup-failure paths.
 * 6. Short-write resilient buffer flush; observer IO failures increment failureCount without crashing application.
 * 7. Zero unhandled promise rejections or ignored rejecting finally blocks.
 */

if (globalThis.__FG_ERROR_ORIGIN_OBSERVER_INSTALLED__) {
  throw new Error('Duplicate API error origin observer installation detected');
}
globalThis.__FG_ERROR_ORIGIN_OBSERVER_INSTALLED__ = true;

export const als = new AsyncLocalStorage();

const SAFE_ROUTES = new Set([
  'http-me',
  'http-games',
  'http-rooms-own',
  'http-rooms-detail',
  'http-rooms-members',
  'http-rooms-calls',
  'http-room-play-sessions',
  'http-calls-claim',
  'http-calls-release',
  'http-calls-publish-token',
  'http-calls-moderation',
  'http-call-participants',
  'http-calls-join',
  'http-calls-leave',
  'http-calls-self-mic',
  'unassociated',
]);

const SAFE_SERVICES = new Set([
  'CallsService.create',
  'CallsService.list',
  'CallsService.join',
  'CallsService.leave',
  'CallsService.selfMic',
  'CallsService.withControlGroup',
  'CallsService.reconcile',
  'PublishingService.claim',
  'PublishingService.release',
  'PublishingService.reconcileWithin',
  'CallLifecycleService.reconcileGroup',
  'CallLifecycleService.reconcilePass',
  'CallLifecycleService.sweep',
  'CallLifecycleService.receive',
  'RoomsService.getRoomDetail',
  'RoomsService.listRoomMembers',
  'RoomsService.listOwnRooms',
  'PlaySessionsService.listRoom',
  'unassociated',
]);

let spanSequence = 0;
export function createSpanContext(owner, parentSpanIndex = null) {
  const safeOwner = SAFE_SERVICES.has(owner) || SAFE_ROUTES.has(owner) ? owner : 'unassociated';
  const parent = als.getStore();
  const spanIndex = ++spanSequence;
  return {
    spanIndex,
    parentSpanIndex: parentSpanIndex !== null ? parentSpanIndex : (parent ? parent.spanIndex : null),
    owner: safeOwner,
    pids: new Set(),
    activeTransactions: new Map(),
    lastError: null,
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
  let fd = null;
  try {
    const payload = recordBuffer.join('\n') + '\n';
    const buf = Buffer.from(payload, 'utf8');
    fd = fs.openSync(`${evidenceDir}/api-error-origins.jsonl`, 'a');
    let written = 0;
    let attempts = 0;
    while (written < buf.length && attempts++ < 4) {
      const bytes = fs.writeSync(fd, buf, written, buf.length - written);
      if (!Number.isInteger(bytes) || bytes <= 0 || bytes > buf.length - written) {
        failureCount++;
        break;
      }
      written += bytes;
    }
    if (written !== buf.length) failureCount++;
  } catch {
    failureCount++;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { failureCount++; }
    }
    recordBuffer.length = 0;
    currentBufferBytes = 0;
  }
}

function observeResult(result, complete, recordSync = true) {
  try {
    const then = result?.then;
    if (typeof then === 'function') {
      Reflect.apply(then, result, [
        () => {
          try { complete(true, null); } catch { failureCount++; }
        },
        error => {
          try { complete(false, error); } catch { failureCount++; }
        }
      ]);
    } else if (recordSync) {
      complete(true, null);
    }
  } catch {
    failureCount++;
  }
}

// -----------------------------------------------------------------------------
// 1. Error Sanitization Helpers
// -----------------------------------------------------------------------------
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

export function sanitizeRpcCode(err) {
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

export function sanitizeConnectErrorCode(error) {
  if (!error) return null;
  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message : '';
  if (message === 'timeout exceeded when trying to connect') return 'POOL_ACQUIRE_TIMEOUT';
  if (message === 'Connection terminated due to connection timeout' || code === 'ETIMEDOUT') return 'CONNECTION_TIMEOUT';
  if (code === 'ECONNREFUSED') return 'CONNECTION_REFUSED';
  if (['ECONNRESET', 'EPIPE'].includes(code)) return 'CONNECTION_RESET';
  if (message === 'Cannot use a pool after calling end on the pool') return 'POOL_ENDED';
  if (/^[0-9A-Z]{5}$/.test(code)) return code;
  return 'UNKNOWN_FAILURE';
}

export function sanitizeErrorOrigin(error) {
  if (!error) return null;
  let origin = 'unknown';
  let sqlState = null;
  let rpcCode = null;
  let httpStatus = null;
  const name = typeof error.name === 'string' ? error.name : 'Error';

  if (typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) {
    sqlState = error.code;
    origin = error.code === '57014' ? 'pg-statement-timeout'
      : error.code === '53300' ? 'pg-too-many-connections'
      : error.code === '40001' ? 'pg-serialization-failure'
      : error.code === '40P01' ? 'pg-deadlock'
      : 'pg-sqlstate';
  } else if (error.message === 'timeout exceeded when trying to connect') {
    origin = 'pg-pool-acquire-timeout';
  } else if (typeof error.status === 'number' && error.status >= 100 && error.status <= 599) {
    httpStatus = error.status;
    origin = error.status >= 500 ? 'http-server-error' : 'http-client-error';
  }

  const rpc = sanitizeRpcCode(error);
  if (rpc && rpc !== 'other') {
    rpcCode = rpc;
    origin = 'livekit-sdk-rpc';
  }

  return {
    origin,
    name,
    sqlState,
    rpcCode,
    httpStatus,
  };
}

// -----------------------------------------------------------------------------
// 2. HTTP Timing & Error Origin Middleware
// -----------------------------------------------------------------------------
function mapRoute(req) {
  const method = req.method;
  const rawPath = typeof req.path === 'string' ? req.path : String(req.url ?? '').split('?')[0];
  if (method === 'POST') {
    if (/\/api\/v1\/calls\/[^/]+\/screen-share\/claim$/.test(rawPath)) return 'http-calls-claim';
    if (/\/api\/v1\/calls\/[^/]+\/screen-share\/release$/.test(rawPath)) return 'http-calls-release';
    if (/\/api\/v1\/calls\/[^/]+\/publish-token$/.test(rawPath)) return 'http-calls-publish-token';
    if (/\/api\/v1\/calls\/[^/]+\/moderation$/.test(rawPath)) return 'http-calls-moderation';
    if (/\/api\/v1\/calls\/[^/]+\/join$/.test(rawPath)) return 'http-calls-join';
    if (/\/api\/v1\/calls\/[^/]+\/leave$/.test(rawPath)) return 'http-calls-leave';
    if (/\/api\/v1\/calls\/[^/]+\/self-mic$/.test(rawPath)) return 'http-calls-self-mic';
  } else if (method === 'GET') {
    if (rawPath === '/api/v1/me') return 'http-me';
    if (rawPath === '/api/v1/games') return 'http-games';
    if (rawPath === '/api/v1/rooms/own' || rawPath === '/api/v1/rooms') return 'http-rooms-own';
    if (/^\/api\/v1\/rooms\/[^/]+\/members$/.test(rawPath)) return 'http-rooms-members';
    if (/^\/api\/v1\/rooms\/[^/]+\/calls$/.test(rawPath)) return 'http-rooms-calls';
    if (/^\/api\/v1\/rooms\/[^/]+\/play-sessions$/.test(rawPath)) return 'http-room-play-sessions';
    if (/^\/api\/v1\/rooms\/[^/]+$/.test(rawPath)) return 'http-rooms-detail';
    if (/^\/api\/v1\/calls\/[^/]+\/participants$/.test(rawPath)) return 'http-call-participants';
  }
  return null;
}

export function instrumentHttpMiddleware(app) {
  app.use((req, res, next) => {
    let continueInContext = null;
    try {
      const route = mapRoute(req);
      if (route !== null) {
        const ctx = createSpanContext(route);
        const startedAt = new Date().toISOString();
        const startMonotonic = performance.now();
        let emitted = false;

        const recordHttp = (finishVsClose) => {
          if (emitted) return;
          emitted = true;
          try {
            const completedAt = new Date().toISOString();
            const durationMs = Math.round((performance.now() - startMonotonic) * 100) / 100;
            const status = typeof res.statusCode === 'number' ? res.statusCode : 0;
            const errOrigin = ctx.lastError ? sanitizeErrorOrigin(ctx.lastError) : null;

            bufferRecord({
              type: 'http-error-origin',
              route,
              spanIndex: ctx.spanIndex,
              startedAt,
              completedAt,
              durationMs,
              status,
              finished: finishVsClose,
              pids: Array.from(ctx.pids),
              errorOrigin: errOrigin?.origin ?? null,
              errorName: errOrigin?.name ?? null,
              sqlState: errOrigin?.sqlState ?? null,
              rpcCode: errOrigin?.rpcCode ?? null,
            });
          } catch {
            failureCount++;
          }
        };

        res.once('finish', () => recordHttp(true));
        res.once('close', () => recordHttp(false));
        continueInContext = ctx;
      }
    } catch {
      failureCount++;
    }
    return continueInContext ? als.run(continueInContext, () => next()) : next();
  });
}

// -----------------------------------------------------------------------------
// 3. PostgreSQL Pool & Client Instrumentation
// -----------------------------------------------------------------------------
const registeredPools = new Set();
const poolMetadata = new WeakMap();
const clientPoolMap = new WeakMap();
const clientActiveLocks = new WeakMap();
let nextPoolIndex = 0;
let transactionSequence = 0;

let originalPgPool = null;
let originalPgPoolQuery = null;
let originalPgPoolConnect = null;
let originalPgClientQuery = null;
let originalPgClientConnect = null;

export function instrumentOwnedPools(pg, evidence) {
  evidenceDir = evidence;
  originalPgPool = pg.Pool;
  originalPgPoolQuery = pg.Pool.prototype.query;
  originalPgPoolConnect = pg.Pool.prototype.connect;
  originalPgClientQuery = pg.Client.prototype.query;
  originalPgClientConnect = pg.Client.prototype.connect;

  const OrigPool = pg.Pool;

  class PatchedPool extends OrigPool {
    constructor(...args) {
      super(...args);
      const poolIndex = ++nextPoolIndex;
      poolMetadata.set(this, poolIndex);
      registeredPools.add(this);

      this.on('connect', (client) => {
        try {
          clientPoolMap.set(client, poolIndex);
          clientActiveLocks.set(client, {
            roomAcquired: null,
            groupAcquired: null,
            transactionIndex: null,
            ownerContext: null,
          });
        } catch {
          failureCount++;
        }
      });
    }

    connect(...args) {
      if (typeof args.at(-1) === 'function') {
        return Reflect.apply(originalPgPoolConnect, this, args);
      }
      const ctx = als.getStore();
      const poolIndex = poolMetadata.get(this) ?? null;
      const startedAt = new Date().toISOString();
      const startMonotonic = performance.now();

      const complete = (ok, error, client) => {
        try {
          const pid = ok && Number.isSafeInteger(client?.processID) && client.processID > 0 ? client.processID : null;
          if (ctx && pid) ctx.pids.add(pid);
          if (!ok && ctx && error) ctx.lastError = error;

          bufferRecord({
            type: 'pool-connect',
            poolIndex,
            backendPid: pid,
            spanIndex: ctx?.spanIndex ?? null,
            parentSpanIndex: ctx?.parentSpanIndex ?? null,
            owner: ctx?.owner ?? 'unassociated',
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: Math.round((performance.now() - startMonotonic) * 100) / 100,
            ok,
            errorCode: ok ? null : sanitizeConnectErrorCode(error),
            sqlState: typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : null,
          });
        } catch {
          failureCount++;
        }
      };

      let result;
      try {
        result = Reflect.apply(originalPgPoolConnect, this, args);
      } catch (error) {
        complete(false, error, null);
        throw error;
      }

      try {
        const then = result?.then;
        if (typeof then === 'function') {
          Reflect.apply(then, result, [
            client => { complete(true, null, client); },
            error => { complete(false, error, null); }
          ]);
        } else {
          failureCount++;
        }
      } catch {
        failureCount++;
      }
      return result;
    }

    query(...args) {
      if (typeof args.at(-1) === 'function' || typeof args[0]?.callback === 'function' || typeof args[0]?.submit === 'function') {
        return Reflect.apply(originalPgPoolQuery, this, args);
      }
      const ctx = als.getStore();
      const poolIndex = poolMetadata.get(this) ?? null;
      const startedAt = new Date().toISOString();
      const startMonotonic = performance.now();

      const complete = (ok, error) => {
        try {
          if (!ok && ctx && error) ctx.lastError = error;
          bufferRecord({
            type: 'pool-query',
            poolIndex,
            backendPid: null,
            spanIndex: ctx?.spanIndex ?? null,
            parentSpanIndex: ctx?.parentSpanIndex ?? null,
            owner: ctx?.owner ?? 'unassociated',
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: Math.round((performance.now() - startMonotonic) * 100) / 100,
            ok,
            errorCode: ok ? null : sanitizeConnectErrorCode(error),
            sqlState: typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : null,
          });
        } catch {
          failureCount++;
        }
      };

      let result;
      try {
        result = Reflect.apply(originalPgPoolQuery, this, args);
      } catch (error) {
        complete(false, error);
        throw error;
      }
      observeResult(result, complete, false);
      return result;
    }
  }

  // Copy static properties to PatchedPool
  for (const prop of Object.getOwnPropertyNames(OrigPool)) {
    if (!Object.prototype.hasOwnProperty.call(PatchedPool, prop)) {
      try {
        const desc = Object.getOwnPropertyDescriptor(OrigPool, prop);
        if (desc) Object.defineProperty(PatchedPool, prop, desc);
      } catch {}
    }
  }

  pg.Pool = PatchedPool;
  installClientPhases(pg);

  pg.Client.prototype.query = function (...args) {
    const lastArg = args[args.length - 1];
    if (typeof lastArg === 'function' || typeof args[0]?.callback === 'function' || typeof args[0]?.submit === 'function') {
      return Reflect.apply(originalPgClientQuery, this, args);
    }

    const ctx = als.getStore();
    const backendPid = typeof this.processID === 'number' ? this.processID : Number(this.processID) || null;
    if (ctx && backendPid) ctx.pids.add(backendPid);

    let kind = 'other';
    let lockMode = 'none';
    try {
      let queryText = '';
      if (typeof args[0] === 'string') {
        queryText = args[0];
      } else if (args[0] && typeof args[0] === 'object') {
        queryText = String(args[0].name || args[0].text || '');
      }

      if (/^\s*BEGIN\b/i.test(queryText)) {
        kind = 'begin';
      } else if (/^\s*COMMIT\b/i.test(queryText)) {
        kind = 'commit';
      } else if (/^\s*ROLLBACK\b/i.test(queryText)) {
        kind = 'rollback';
      } else if (/\b(?:FROM|JOIN)\s+rooms\b/i.test(queryText) && /\bFOR\s+(?:UPDATE|SHARE)\b/i.test(queryText)) {
        kind = 'lock-room';
        lockMode = /\bFOR\s+SHARE\b/i.test(queryText) ? 'share' : 'update';
      } else if (/\b(?:FROM|JOIN)\s+call_groups\b/i.test(queryText) && /\bFOR\s+(?:UPDATE|SHARE)\b/i.test(queryText)) {
        kind = 'lock-group';
        lockMode = /\bFOR\s+SHARE\b/i.test(queryText) ? 'share' : 'update';
      } else if (/\b(?:FROM|JOIN)\s+call_members\b/i.test(queryText) && /\bFOR\s+(?:UPDATE|SHARE)\b/i.test(queryText)) {
        kind = 'lock-member';
        lockMode = /\bFOR\s+SHARE\b/i.test(queryText) ? 'share' : 'update';
      } else if (/call_restrictions/i.test(queryText) && /call_publish_slots/i.test(queryText)) {
        kind = 'policy';
      } else if (/call_admissions/i.test(queryText) && /call_members/i.test(queryText)) {
        kind = 'live-lease';
      }
    } catch {
      failureCount++;
    }

    const poolIndex = clientPoolMap.get(this) ?? null;
    const transactionBefore = clientActiveLocks.get(this)?.transactionIndex ?? null;
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
        if (!ok && ctx && err) ctx.lastError = err;

        const lockState = clientActiveLocks.get(this) || { roomAcquired: null, groupAcquired: null };
        const nowMonotonic = performance.now();
        if (ok) {
          if (kind === 'begin') {
            if (lockState.transactionIndex !== null) {
              failureCount++;
            } else {
              lockState.roomAcquired = null;
              lockState.groupAcquired = null;
              lockState.transactionIndex = ++transactionSequence;
              lockState.ownerContext = ctx;
              if (ctx) ctx.activeTransactions.set(lockState.transactionIndex, { backendPid, transactionIndex: lockState.transactionIndex });
            }
          }
          if (kind === 'lock-room' && lockMode === 'update' && lockState.transactionIndex !== null) lockState.roomAcquired = nowMonotonic;
          if (kind === 'lock-group' && lockMode === 'update' && lockState.transactionIndex !== null) lockState.groupAcquired = nowMonotonic;
        }

        let roomHoldMs = null;
        let groupHoldMs = null;
        const transactionIndex = kind === 'begin' ? lockState.transactionIndex : transactionBefore;
        if (ok && (kind === 'commit' || kind === 'rollback')) {
          lockState.ownerContext?.activeTransactions.delete(lockState.transactionIndex);
          lockState.transactionIndex = null;
          lockState.ownerContext = null;
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
          type: 'query-error-origin',
          kind,
          lockMode,
          startedAt,
          completedAt,
          durationMs,
          roomHoldMs,
          groupHoldMs,
          transactionIndex,
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
      result = Reflect.apply(originalPgClientQuery, this, args);
    } catch (syncErr) {
      recordCompletion(false, syncErr);
      throw syncErr;
    }
    observeResult(result, recordCompletion, false);
    return result;
  };
}

// -----------------------------------------------------------------------------
// 4. Client Connection Phases (TCP -> PG Ready -> Socket Closed)
// -----------------------------------------------------------------------------
const activeClientPhases = new Set();
let clientPhaseSequence = 0;
let clientPhaseEmitted = 0;
let clientPhaseInterrupted = 0;

function installClientPhases(pg) {
  pg.Client.prototype.connect = function (...args) {
    if (isStopped) return Reflect.apply(originalPgClientConnect, this, args);
    let emit = () => {};
    let cleanup = () => {};
    try {
      if (activeClientPhases.size >= 1024) throw new Error('Connection observation bound');
      const ctx = als.getStore();
      const client = this;
      const socket = this?.connection?.stream;
      if (typeof socket?.once !== 'function' || typeof client?.once !== 'function') throw new Error('Connection observation events absent');
      const index = ++clientPhaseSequence;
      const startedAt = new Date().toISOString();
      const start = performance.now();
      let tcpAt = null, tcpMs = null, pgAt = null, pgMs = null, closedAt = null, closedMs = null, hadError = null, emitted = false;
      const own = { finish: null };
      const n = v => Number.isSafeInteger(v) && v >= 0 ? v : null;
      const elapsed = () => Math.round((performance.now() - start) * 100) / 100;

      cleanup = () => {
        activeClientPhases.delete(own);
        try {
          socket.removeListener('connect', tcp);
          socket.removeListener('close', closed);
          client.removeListener('connect', ready);
        } catch {
          failureCount++;
        }
      };

      emit = reason => {
        if (emitted || isStopped) return;
        emitted = true;
        cleanup();
        try {
          const states = new Set(['opening', 'open', 'readOnly', 'writeOnly', 'closed']);
          const raw = socket.readyState;
          if (reason === 'stopped') {
            clientPhaseInterrupted++;
            failureCount++;
          }
          bufferRecord({
            type: 'client-connection-phase',
            clientConnectionIndex: index,
            spanIndex: ctx?.spanIndex ?? null,
            parentSpanIndex: ctx?.parentSpanIndex ?? null,
            owner: SAFE_ROUTES.has(ctx?.owner) || SAFE_SERVICES.has(ctx?.owner) ? ctx.owner : 'unassociated',
            startedAt,
            completedAt: new Date().toISOString(),
            tcpConnectedAt: tcpAt,
            tcpDurationMs: tcpMs,
            pgReadyAt: pgAt,
            pgDurationMs: pgMs,
            socketClosedAt: closedAt,
            socketCloseDurationMs: closedMs,
            finalPhase: pgAt ? 'pg-ready' : closedAt ? 'socket-closed' : tcpAt ? 'tcp-connected' : 'starting',
            reason,
            backendPid: pgAt && Number.isSafeInteger(client.processID) && client.processID > 0 ? client.processID : null,
            socketReadyState: states.has(raw) ? raw : null,
            socketDestroyed: typeof socket.destroyed === 'boolean' ? socket.destroyed : null,
            bytesRead: n(socket.bytesRead),
            bytesWritten: n(socket.bytesWritten),
            socketHadError: hadError
          });
          clientPhaseEmitted++;
        } catch {
          failureCount++;
        }
      };

      function tcp() {
        try { tcpAt = new Date().toISOString(); tcpMs = elapsed(); } catch { failureCount++; }
      }
      function ready() {
        try { pgAt = new Date().toISOString(); pgMs = elapsed(); emit('pg-ready'); } catch { failureCount++; }
      }
      function closed(errorFlag) {
        try { closedAt = new Date().toISOString(); closedMs = elapsed(); hadError = typeof errorFlag === 'boolean' ? errorFlag : null; emit('socket-closed'); } catch { failureCount++; }
      }

      own.finish = () => emit('stopped');
      activeClientPhases.add(own);
      socket.once('connect', tcp);
      socket.once('close', closed);
      client.once('connect', ready);
    } catch {
      failureCount++;
      cleanup();
    }
    try {
      return Reflect.apply(originalPgClientConnect, this, args);
    } catch (error) {
      emit('sync-error');
      throw error;
    }
  };
}

// -----------------------------------------------------------------------------
// 5. RoomServiceClient SDK Instrumentation
// -----------------------------------------------------------------------------
const SAFE_RPC_METHODS = [
  'listRooms',
  'listParticipants',
  'getParticipant',
  'updateParticipant',
  'removeParticipant',
  'deleteRoom',
  'createRoom',
  'mutePublishedTrack',
];

const originalSdkMethods = new Map();

export function instrumentSdk(RoomServiceClient) {
  assert(typeof RoomServiceClient === 'function', 'Valid RoomServiceClient constructor required');
  const proto = RoomServiceClient.prototype;
  assert(proto && typeof proto === 'object', 'Valid RoomServiceClient prototype required');

  for (const method of SAFE_RPC_METHODS) {
    const origMethod = proto[method];
    if (typeof origMethod !== 'function') continue;
    originalSdkMethods.set(method, origMethod);

    proto[method] = function (...args) {
      const ctx = als.getStore();
      const binding = ctx?.activeTransactions?.size === 1 ? [...ctx.activeTransactions.values()][0] : null;
      const startedAt = new Date().toISOString();
      const startMonotonic = performance.now();

      const recordCompletion = (ok, err) => {
        try {
          const completedAt = new Date().toISOString();
          const durationMs = Math.round((performance.now() - startMonotonic) * 100) / 100;
          if (!ok && ctx && err) ctx.lastError = err;

          bufferRecord({
            type: 'rpc-error-origin',
            method,
            startedAt,
            completedAt,
            durationMs,
            spanIndex: ctx ? ctx.spanIndex : null,
            parentSpanIndex: ctx ? ctx.parentSpanIndex : null,
            owner: ctx ? ctx.owner : 'unassociated',
            backendPid: binding?.backendPid ?? null,
            transactionIndex: binding?.transactionIndex ?? null,
            ok,
            code: sanitizeRpcCode(err),
          });
        } catch {
          failureCount++;
        }
      };

      let result;
      try {
        result = Reflect.apply(origMethod, this, args);
      } catch (syncErr) {
        recordCompletion(false, syncErr);
        throw syncErr;
      }
      observeResult(result, recordCompletion);
      return result;
    };
  }
}

// -----------------------------------------------------------------------------
// 6. Service Spans Instrumentation
// -----------------------------------------------------------------------------
const originalServiceMethods = new Map();

function hookService(ServiceClass, serviceName, methodNames) {
  if (!ServiceClass || !ServiceClass.prototype) return;
  for (const name of methodNames) {
    const orig = ServiceClass.prototype[name];
    if (typeof orig !== 'function') continue;
    const key = `${serviceName}.${name}`;
    originalServiceMethods.set(key, { proto: ServiceClass.prototype, name, orig });

    ServiceClass.prototype[name] = function (...args) {
      const owner = key;
      const ctx = createSpanContext(owner);
      const startedAt = new Date().toISOString();
      const startMonotonic = performance.now();

      bufferRecord({
        type: 'service-start',
        owner,
        spanIndex: ctx.spanIndex,
        parentSpanIndex: ctx.parentSpanIndex,
        startedAt,
      });

      const recordEnd = (ok, err) => {
        try {
          const completedAt = new Date().toISOString();
          const durationMs = Math.round((performance.now() - startMonotonic) * 100) / 100;
          if (!ok && ctx && err) ctx.lastError = err;
          const errOrigin = err ? sanitizeErrorOrigin(err) : null;

          bufferRecord({
            type: 'service-end',
            owner,
            spanIndex: ctx.spanIndex,
            parentSpanIndex: ctx.parentSpanIndex,
            startedAt,
            completedAt,
            durationMs,
            ok,
            errorOrigin: errOrigin?.origin ?? null,
            errorName: errOrigin?.name ?? null,
            sqlState: errOrigin?.sqlState ?? null,
            rpcCode: errOrigin?.rpcCode ?? null,
            pids: Array.from(ctx.pids),
          });
        } catch {
          failureCount++;
        }
      };

      let result;
      try {
        result = als.run(ctx, () => Reflect.apply(orig, this, args));
      } catch (syncErr) {
        recordEnd(false, syncErr);
        throw syncErr;
      }
      observeResult(result, recordEnd);
      return result;
    };
  }
}

export function instrumentServices(services) {
  if (services.CallsService) {
    hookService(services.CallsService, 'CallsService', ['create', 'list', 'join', 'leave', 'selfMic', 'withControlGroup', 'reconcile']);
  }
  if (services.PublishingService) {
    hookService(services.PublishingService, 'PublishingService', ['claim', 'release', 'reconcileWithin']);
  }
  if (services.CallLifecycleService) {
    hookService(services.CallLifecycleService, 'CallLifecycleService', ['reconcileGroup', 'reconcilePass', 'sweep', 'receive']);
  }
  if (services.RoomsService) {
    hookService(services.RoomsService, 'RoomsService', ['getRoomDetail', 'listRoomMembers', 'listOwnRooms']);
  }
  if (services.PlaySessionsService) {
    hookService(services.PlaySessionsService, 'PlaySessionsService', ['listRoom']);
  }
}

// -----------------------------------------------------------------------------
// 7. Periodic Sampler & Stop / Restoration
// -----------------------------------------------------------------------------
let sampleTimer = null;
let lastCpuUsage = null;
let lastSampleTime = 0;
let histogram = null;
let observerStarted = false;
let savedPg = null;
let savedSdk = null;

export function installErrorOriginObserver({ app, pg, RoomServiceClient, services, evidenceDir: targetDir }) {
  if (observerStarted) {
    throw new Error('API error origin observer already started');
  }
  observerStarted = true;
  evidenceDir = targetDir;
  savedPg = pg;
  savedSdk = RoomServiceClient;

  instrumentHttpMiddleware(app);
  instrumentOwnedPools(pg, evidenceDir);
  instrumentSdk(RoomServiceClient);
  instrumentServices(services);

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
      if (Number.isFinite(histogram.mean)) eventLoopMeanMs = Math.round((histogram.mean / 1e6) * 100) / 100;
      if (Number.isFinite(histogram.max)) eventLoopMaxMs = Math.round((histogram.max / 1e6) * 100) / 100;
      const p99 = histogram.percentile(99);
      if (Number.isFinite(p99)) eventLoopP99Ms = Math.round((p99 / 1e6) * 100) / 100;
      histogram.reset();

      const pools = [];
      for (const pool of registeredPools) {
        pools.push({
          poolIndex: poolMetadata.get(pool) ?? null,
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

  return stopErrorOriginObserver;
}

export async function stopErrorOriginObserver() {
  if (isStopped) return getObserverHealth();
  isStopped = true;

  // 1. Stop active client phase listeners
  for (const own of [...activeClientPhases]) own.finish();
  activeClientPhases.clear();

  // 2. Stop sample timer
  if (sampleTimer) {
    clearInterval(sampleTimer);
    sampleTimer = null;
    timerStopped = true;
  }

  // 3. Disable histogram
  if (histogram) {
    try {
      histogram.disable();
      histogramDisabled = true;
    } catch {
      failureCount++;
    }
  }

  // 4. Restore PostgreSQL prototypes
  if (savedPg) {
    if (originalPgPool) savedPg.Pool = originalPgPool;
    if (originalPgClientQuery) savedPg.Client.prototype.query = originalPgClientQuery;
    if (originalPgClientConnect) savedPg.Client.prototype.connect = originalPgClientConnect;
  }

  // 5. Restore SDK prototypes
  if (savedSdk && savedSdk.prototype) {
    for (const [method, origMethod] of originalSdkMethods.entries()) {
      savedSdk.prototype[method] = origMethod;
    }
  }

  // 6. Restore Service prototypes
  for (const { proto, name, orig } of originalServiceMethods.values()) {
    proto[name] = orig;
  }

  // 7. Flush buffered records
  flushSpansSync();

  // 8. Write health artifact
  const health = getObserverHealth();
  try {
    if (evidenceDir) {
      fs.writeFileSync(`${evidenceDir}/api-error-origins-health.json`, JSON.stringify(health, null, 2) + '\n', { flag: 'wx' });
    }
  } catch {
    failureCount++;
    health.failureCount = failureCount;
    health.observationComplete = false;
  }

  return health;
}

export function getObserverHealth() {
  const observationComplete = Boolean(
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
