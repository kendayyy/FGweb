import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';

/**
 * FG T30 — Corrected Minimal API-Child Owned Observation via AsyncLocalStorage
 * 
 * Correlates initial HTTP request timing, service execution contexts,
 * PostgreSQL backend PIDs, in-transaction lock holds, and native LiveKit SDK awaited spans.
 * 
 * Strict Invariants:
 * 1. Duplicate install or start throws an error immediately before mutating prototypes.
 * 2. HTTP middleware runs BEFORE Nest guards, establishing outer ALS request spans.
 * 3. Service wrappers emit service-start and service-end result spans.
 * 4. All wrappers preserve exact arguments, this context, and returned promise/value/sync throw.
 * 5. Side handlers return undefined and never throw.
 * 6. Lock tracking resets on BEGIN and only derives hold durations upon successful COMMIT/ROLLBACK.
 * 7. Bounded buffer (5,000 records / 1 MiB); flush handles short-writes; IO errors increment failureCount.
 * 8. Zero raw SQL, query parameters, row values, or secrets in telemetry.
 */

if (globalThis.__FG_API_LOCK_SPANS_INSTALLED__) {
  throw new Error('Duplicate API lock spans observer installation detected');
}
globalThis.__FG_API_LOCK_SPANS_INSTALLED__ = true;

export const als = new AsyncLocalStorage();

const SAFE_SERVICE_OWNERS = new Set([
  'http-me',
  'http-games',
  'http-rooms-own',
  'http-rooms-detail',
  'http-rooms-members',
  'http-rooms-calls',
  'http-room-play-sessions',
  'http-call-participants',
  'http-calls-join',
  'http-calls-self-mic',
  'CallsService.list',
  'CallsService.participants',
  'CallsService.join',
  'CallsService.selfMic',
  'CallsService.withControlGroup',
  'CallLifecycleService.reconcileGroup',
  'RoomsService.getRoomDetail','RoomsService.listRoomMembers','RoomsService.listOwnRooms','TeamsService.transaction','TeamsService.snapshot','PlaySessionsService.listRoom',
  'unassociated',
]);

let spanSequence = 0;
export function createSpanContext(owner, parentSpanIndex = null) {
  const safeOwner = SAFE_SERVICE_OWNERS.has(owner) ? owner : 'unassociated';
  const parent = als.getStore();
  const spanIndex = ++spanSequence;
  return {
    spanIndex,
    parentSpanIndex: parentSpanIndex !== null ? parentSpanIndex : (parent ? parent.spanIndex : null),
    owner: safeOwner,
    pids: new Set(),
    activeTransactions: new Map(),
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
    fd = fs.openSync(`${evidenceDir}/api-lock-spans.jsonl`, 'a');
    let written = 0,attempts=0;
    while (written < buf.length && attempts++<4) {
      const bytes = fs.writeSync(fd, buf, written, buf.length - written);
      if (!Number.isInteger(bytes) || bytes <= 0 || bytes > buf.length - written) {
        failureCount++;
        break;
      }
      written += bytes;
    }
    if(written!==buf.length)failureCount++;
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

// -----------------------------------------------------------------------------
function observeResult(result,complete,recordSync=true){
  try{
    const then=result?.then;
    if(typeof then==='function')Reflect.apply(then,result,[()=>{try{complete(true,null);}catch{failureCount++;}},error=>{try{complete(false,error);}catch{failureCount++;}}]);
    else if(recordSync)complete(true,null);
  }catch{failureCount++;}
}

// 1. HTTP Before-Guard Context Middleware
// -----------------------------------------------------------------------------
export function instrumentHttpTimingMiddleware(app) {
  app.use((req, res, next) => {
    let continueInContext=null;
    try {
      const rawPath = typeof req.path === 'string' ? req.path : String(req.url ?? '').split('?')[0];
      let route = null;
      if (req.method === 'GET') {
        if (rawPath === '/api/v1/me') route = 'http-me';
        else if (rawPath === '/api/v1/games') route = 'http-games';
        else if (rawPath === '/api/v1/rooms/own' || rawPath === '/api/v1/rooms') route = 'http-rooms-own';
        else if (/^\/api\/v1\/rooms\/[^/]+\/members$/.test(rawPath)) route = 'http-rooms-members';
        else if (/^\/api\/v1\/rooms\/[^/]+\/calls$/.test(rawPath)) route = 'http-rooms-calls';
        else if (/^\/api\/v1\/rooms\/[^/]+\/play-sessions$/.test(rawPath)) route = 'http-room-play-sessions';
        else if (/^\/api\/v1\/rooms\/[^/]+$/.test(rawPath)) route = 'http-rooms-detail';
        else if (/^\/api\/v1\/calls\/[^/]+\/participants$/.test(rawPath)) route = 'http-call-participants';
      } else if (req.method === 'POST') {
        if (/^\/api\/v1\/calls\/[^/]+\/join$/.test(rawPath)) route = 'http-calls-join';
        else if (/^\/api\/v1\/calls\/[^/]+\/self-mic$/.test(rawPath)) route = 'http-calls-self-mic';
      }

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
            bufferRecord({
              type: 'http',
              route,
              spanIndex: ctx.spanIndex,
              startedAt,
              completedAt,
              durationMs,
              status,
              finished: finishVsClose,
              pids: Array.from(ctx.pids),
            });
          } catch {
            failureCount++;
          }
        };

        res.once('finish', () => recordHttp(true));
        res.once('close', () => recordHttp(false));

        continueInContext=ctx;
      }
    } catch {
      failureCount++;
    }
    return continueInContext ? als.run(continueInContext,()=>next()) : next();
  });
}

// -----------------------------------------------------------------------------
// 2. PostgreSQL Pool & Client Instrumentation
// -----------------------------------------------------------------------------
const registeredPools = new Set();
const poolMetadata=new WeakMap();
let poolsInstalled=false,sdkInstalled=false,servicesInstalled=false,transactionSequence=0;
const clientPoolMap = new WeakMap();
const clientActiveLocks = new WeakMap();
let nextPoolIndex = 0;

export function instrumentOwnedApiPools(pg, evidence) {
  if(poolsInstalled)throw new Error('Owned pool observation already installed');
  poolsInstalled=true;
  evidenceDir = evidence;
  const OrigPool = pg.Pool;

  const originalPoolQuery=OrigPool.prototype.query;const originalPoolConnect=OrigPool.prototype.connect;
  class PatchedPool extends OrigPool {
    connect(...args){
      if(typeof args.at(-1)==='function')return Reflect.apply(originalPoolConnect,this,args);
      const ctx=als.getStore(),poolIndex=poolMetadata.get(this)??null,startedAt=new Date().toISOString(),startMonotonic=performance.now();
      const complete=(ok,error,client)=>{try{const pid=ok&&Number.isSafeInteger(client?.processID)&&client.processID>0?client.processID:null;if(ctx&&pid)ctx.pids.add(pid);bufferRecord({type:'pool-connect',poolIndex,backendPid:pid,spanIndex:ctx?.spanIndex??null,parentSpanIndex:ctx?.parentSpanIndex??null,owner:ctx?.owner??'unassociated',startedAt,completedAt:new Date().toISOString(),durationMs:Math.round((performance.now()-startMonotonic)*100)/100,ok,errorCode:ok?null:sanitizeConnectErrorCode(error),sqlState:typeof error?.code==='string'&&error.code!=='EPIPE'&&/^[0-9A-Z]{5}$/.test(error.code)?error.code:null});}catch{failureCount++;}};
      let result;try{result=Reflect.apply(originalPoolConnect,this,args);}catch(error){complete(false,error,null);throw error;}
      try{const then=result?.then;if(typeof then==='function')Reflect.apply(then,result,[client=>{complete(true,null,client);},error=>{complete(false,error,null);}]);else failureCount++;}catch{failureCount++;}return result;
    }

    query(...args){
      if(typeof args.at(-1)==='function'||typeof args[0]?.callback==='function'||typeof args[0]?.submit==='function')return Reflect.apply(originalPoolQuery,this,args);
      const ctx=als.getStore(),poolIndex=poolMetadata.get(this)??null;
      const startedAt=new Date().toISOString(),startMonotonic=performance.now();
      const complete=(ok,error)=>{
        try{bufferRecord({type:'pool-query',poolIndex,backendPid:null,spanIndex:ctx?.spanIndex??null,parentSpanIndex:ctx?.parentSpanIndex??null,owner:ctx?.owner??'unassociated',startedAt,completedAt:new Date().toISOString(),durationMs:Math.round((performance.now()-startMonotonic)*100)/100,ok,errorCode:ok?null:sanitizeConnectErrorCode(error),sqlState:typeof error?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code)?error.code:null});}catch{failureCount++;}
      };
      let result;try{result=Reflect.apply(originalPoolQuery,this,args);}catch(error){complete(false,error);throw error;}
      observeResult(result,complete,false);return result;
    }
    constructor(...args) {
      super(...args);
      const poolIndex = ++nextPoolIndex;
      poolMetadata.set(this,poolIndex);
      registeredPools.add(this);

      this.on('connect', (client) => {
        try {
          clientPoolMap.set(client, poolIndex);
          clientActiveLocks.set(client, { roomAcquired: null, groupAcquired: null,transactionIndex:null,ownerContext:null });
        } catch {
          failureCount++;
        }
      });
    }
  }

  for (const prop of Object.getOwnPropertyNames(OrigPool)) {
    if (!Object.prototype.hasOwnProperty.call(PatchedPool, prop)) {
      try {
        const desc = Object.getOwnPropertyDescriptor(OrigPool, prop);
        if (desc) Object.defineProperty(PatchedPool, prop, desc);
      } catch {}
    }
  }

  pg.Pool = PatchedPool;
  installClientConnectionPhases(pg);

  const origQuery = pg.Client.prototype.query;
  pg.Client.prototype.query = function (...args) {
    const lastArg = args[args.length - 1];
    if (typeof lastArg === 'function' || typeof args[0]?.callback==='function' || typeof args[0]?.submit==='function') {
      return origQuery.apply(this, args);
    }

    const ctx = als.getStore();
    const backendPid = typeof this.processID === 'number' ? this.processID : Number(this.processID) || null;
    if (ctx && backendPid) {
      ctx.pids.add(backendPid);
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

      if (/^\s*BEGIN\b/i.test(queryText)) {
        kind = 'begin';
        // Lock state changes only after actual successful BEGIN below.
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
      } else if (/fg_live_call_admission_policy_v1/i.test(queryText) || (/\bcall_restrictions\b/i.test(queryText) && /\bcall_publish_slots\b/i.test(queryText))) {
        kind = 'policy';
      } else if (/fg_live_call_admissions?_v1/i.test(queryText) || (/\bcall_admissions\b/i.test(queryText) && /\bcall_members\b/i.test(queryText))) {
        kind = 'live-lease';
      }
    } catch {
      failureCount++;
    }

    const poolIndex = clientPoolMap.get(this) ?? null;
    const transactionBefore=clientActiveLocks.get(this)?.transactionIndex??null;
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
          if(kind==='begin'){
            if(lockState.transactionIndex!==null)failureCount++;
            else {lockState.roomAcquired=null;lockState.groupAcquired=null;lockState.transactionIndex=++transactionSequence;lockState.ownerContext=ctx;
              if(ctx)ctx.activeTransactions.set(lockState.transactionIndex,{backendPid,transactionIndex:lockState.transactionIndex});}
          }
          if (kind === 'lock-room' && lockMode === 'update' && lockState.transactionIndex!==null) lockState.roomAcquired = nowMonotonic;
          if (kind === 'lock-group' && lockMode === 'update' && lockState.transactionIndex!==null) lockState.groupAcquired = nowMonotonic;
        }

        let roomHoldMs = null;
        let groupHoldMs = null;
        const transactionIndex=kind==='begin'?lockState.transactionIndex:transactionBefore;
        if (ok && (kind === 'commit' || kind === 'rollback')) {
          lockState.ownerContext?.activeTransactions.delete(lockState.transactionIndex);
          lockState.transactionIndex=null;lockState.ownerContext=null;
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
      result = origQuery.apply(this, args);
    } catch (syncErr) {
      recordCompletion(false, syncErr);
      throw syncErr;
    }

    observeResult(result,recordCompletion,false);
    return result;
  };
}

// -----------------------------------------------------------------------------
// 3. RoomServiceClient SDK Instrumentation
// -----------------------------------------------------------------------------
const SAFE_RPC_METHODS = new Set([
  'listRooms',
  'listParticipants',
  'getParticipant',
  'updateParticipant',
  'removeParticipant',
  'deleteRoom',
  'createRoom',
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

export function instrumentRoomServiceClient(targets, evidence) {
  if (sdkInstalled) throw new Error('Owned SDK observation already installed');

  const rawList = Array.isArray(targets) ? targets : [targets];
  if (rawList.length === 0) {
    throw new TypeError('At least one RoomServiceClient constructor required');
  }

  // Pre-validate constructors and prototypes, deduplicate by identity BEFORE any prototype mutation
  const uniqueConstructors = [];
  const seenConstructors = new Set();
  const seenPrototypes = new Set();

  for (const ctor of rawList) {
    if (typeof ctor !== 'function') {
      throw new TypeError('Invalid RoomServiceClient constructor: expected function');
    }
    const proto = ctor.prototype;
    if (!proto || typeof proto !== 'object') {
      throw new TypeError('Invalid RoomServiceClient prototype: expected object');
    }
    for (const method of SAFE_RPC_METHODS) {
      if (typeof proto[method] !== 'function') {
        throw new TypeError(`Missing expected SDK method: ${method}`);
      }
    }
    if (!seenConstructors.has(ctor) && !seenPrototypes.has(proto)) {
      seenConstructors.add(ctor);
      seenPrototypes.add(proto);
      uniqueConstructors.push(ctor);
    }
  }

  sdkInstalled = true;
  evidenceDir = evidence;

  for(const RoomServiceClient of uniqueConstructors){
  for (const method of SAFE_RPC_METHODS) {
    const origMethod = RoomServiceClient.prototype[method];
    if (typeof origMethod !== 'function') continue;

    RoomServiceClient.prototype[method] = function (...args) {
      const ctx = als.getStore();
      const binding=ctx?.activeTransactions?.size===1?[...ctx.activeTransactions.values()][0]:null;
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
            backendPid:binding?.backendPid??null,
            transactionIndex:binding?.transactionIndex??null,
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

      observeResult(result,recordCompletion);
      return result;
    };
  }
  }
}

// -----------------------------------------------------------------------------
// 4. Service Method Wrapping with Result Spans
// -----------------------------------------------------------------------------
export function instrumentOwnedApiServices({ CallsService, CallLifecycleService }) {
  if(servicesInstalled)throw new Error('Owned service observation already installed');servicesInstalled=true;
  if (CallsService && CallsService.prototype) {
    for (const methodName of ['list', 'participants', 'join', 'selfMic', 'withControlGroup']) {
      const orig = CallsService.prototype[methodName];
      if (typeof orig === 'function') {
        CallsService.prototype[methodName] = function (...args) {
          const owner = `CallsService.${methodName}`;
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
              let safeCode = null;
              if (err && typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) {
                safeCode = err.code;
              } else if (err && typeof err.status === 'number' && err.status >= 100 && err.status <= 599) {
                safeCode = String(err.status);
              }
              bufferRecord({
                type: 'service-end',
                owner,
                spanIndex: ctx.spanIndex,
                parentSpanIndex: ctx.parentSpanIndex,
                startedAt,
                completedAt,
                durationMs,
                ok,
                code: safeCode,
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

          observeResult(result,recordEnd);
          return result;
        };
      }
    }
  }

  if (CallLifecycleService && CallLifecycleService.prototype) {
    const origReconcile = CallLifecycleService.prototype.reconcileGroup;
    if (typeof origReconcile === 'function') {
      CallLifecycleService.prototype.reconcileGroup = function (...args) {
        const owner = 'CallLifecycleService.reconcileGroup';
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
            let safeCode = null;
            if (err && typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) {
              safeCode = err.code;
            }
            bufferRecord({
              type: 'service-end',
              owner,
              spanIndex: ctx.spanIndex,
              parentSpanIndex: ctx.parentSpanIndex,
              startedAt,
              completedAt,
              durationMs,
              ok,
              code: safeCode,
              pids: Array.from(ctx.pids),
            });
          } catch {
            failureCount++;
          }
        };

        let result;
        try {
          result = als.run(ctx, () => Reflect.apply(origReconcile, this, args));
        } catch (syncErr) {
          recordEnd(false, syncErr);
          throw syncErr;
        }

        observeResult(result,recordEnd);
        return result;
      };
    }
  }
}

// -----------------------------------------------------------------------------
// 5. Periodic Sampler & Explicit Stop
// -----------------------------------------------------------------------------
let sampleTimer = null;
let lastCpuUsage = null;
let lastSampleTime = 0;
let histogram = null;
let observerStarted = false;

export function startApiLockSpansObserver(evidence) {
  if (observerStarted) {
    throw new Error('API lock spans observer already started');
  }
  observerStarted = true;
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

  return async function stopApiLockSpansObserver() {
    if (isStopped) return getHealth();
    stopClientConnectionPhases();
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
      fs.writeFileSync(`${evidenceDir}/api-lock-spans-health.json`, JSON.stringify(health, null, 2) + '\n', { flag: 'wx' });
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

// Fixed metadata only. Original errors/arguments/results remain untouched.
export function sanitizeConnectErrorCode(error){const code=typeof error?.code==='string'?error.code:'',message=typeof error?.message==='string'?error.message:'';if(message==='timeout exceeded when trying to connect')return 'POOL_ACQUIRE_TIMEOUT';if(message==='Connection terminated due to connection timeout'||code==='ETIMEDOUT')return 'CONNECTION_TIMEOUT';if(code==='ECONNREFUSED')return 'CONNECTION_REFUSED';if(['ECONNRESET','EPIPE'].includes(code))return 'CONNECTION_RESET';if(message==='Cannot use a pool after calling end on the pool')return 'POOL_ENDED';if(/^[0-9A-Z]{5}$/.test(code))return 'SQLSTATE';return 'UNKNOWN_FAILURE';}
let initialServicesInstalled=false;
export function instrumentInitialRoomServices({RoomsService,TeamsService,PlaySessionsService}){
 if(initialServicesInstalled)throw Error('Initial service observation already installed');
 const targets=[[RoomsService,'RoomsService',['getRoomDetail','listRoomMembers','listOwnRooms']],[TeamsService,'TeamsService',['transaction','snapshot']],[PlaySessionsService,'PlaySessionsService',['listRoom']]];
 for(const [Target,,names]of targets)for(const name of names)assert(typeof Target?.prototype?.[name]==='function','Initial service observation target missing');
 initialServicesInstalled=true;
 for(const [Target,service,names]of targets)for(const name of names){const original=Target.prototype[name],owner=service+'.'+name;Target.prototype[name]=function(...args){const ctx=createSpanContext(owner),startedAt=new Date().toISOString(),startMonotonic=performance.now();try{bufferRecord({type:'service-start',owner,spanIndex:ctx.spanIndex,parentSpanIndex:ctx.parentSpanIndex,startedAt});}catch{failureCount++;}const complete=(ok,error)=>{try{bufferRecord({type:'service-end',owner,spanIndex:ctx.spanIndex,parentSpanIndex:ctx.parentSpanIndex,startedAt,completedAt:new Date().toISOString(),durationMs:Math.round((performance.now()-startMonotonic)*100)/100,ok,errorCode:ok?null:sanitizeConnectErrorCode(error),pids:Array.from(ctx.pids)});}catch{failureCount++;}};let result;try{result=als.run(ctx,()=>Reflect.apply(original,this,args));}catch(error){complete(false,error);throw error;}observeResult(result,complete);return result;};}
}

// Only genuine socket/client connect events establish these timestamps.
const activeClientPhases=new Set();let clientPhaseSequence=0,clientPhaseEmitted=0,clientPhaseInterrupted=0;
export function clientPhaseHealth(){return {started:clientPhaseSequence,emitted:clientPhaseEmitted,activeOwnListenerSets:activeClientPhases.size,interrupted:clientPhaseInterrupted};}
function installClientConnectionPhases(pg){const originalConnect=pg.Client.prototype.connect;pg.Client.prototype.connect=function(...args){
 if(isStopped)return Reflect.apply(originalConnect,this,args);
 let emit=()=>{},cleanup=()=>{};
 try{
  if(activeClientPhases.size>=1024)throw Error('Connection observation bound');
  const ctx=als.getStore(),client=this,socket=this?.connection?.stream;
  if(typeof socket?.once!=='function'||typeof client?.once!=='function')throw Error('Connection observation events absent');
  const index=++clientPhaseSequence,startedAt=new Date().toISOString(),start=performance.now();let tcpAt=null,tcpMs=null,pgAt=null,pgMs=null,closedAt=null,closedMs=null,hadError=null,emitted=false;
  const own={finish:null};const n=v=>Number.isSafeInteger(v)&&v>=0?v:null;const elapsed=()=>Math.round((performance.now()-start)*100)/100;
  cleanup=()=>{activeClientPhases.delete(own);try{socket.removeListener('connect',tcp);socket.removeListener('close',closed);client.removeListener('connect',ready);}catch{failureCount++;}};
  emit=reason=>{if(emitted||isStopped)return;emitted=true;cleanup();try{const states=new Set(['opening','open','readOnly','writeOnly','closed']),raw=socket.readyState;if(reason==='stopped'){clientPhaseInterrupted++;failureCount++;}bufferRecord({type:'client-connection-phase',clientConnectionIndex:index,spanIndex:ctx?.spanIndex??null,parentSpanIndex:ctx?.parentSpanIndex??null,owner:SAFE_SERVICE_OWNERS.has(ctx?.owner)?ctx.owner:'unassociated',startedAt,completedAt:new Date().toISOString(),tcpConnectedAt:tcpAt,tcpDurationMs:tcpMs,pgReadyAt:pgAt,pgDurationMs:pgMs,socketClosedAt:closedAt,socketCloseDurationMs:closedMs,finalPhase:pgAt?'pg-ready':closedAt?'socket-closed':tcpAt?'tcp-connected':'starting',reason,backendPid:pgAt&&Number.isSafeInteger(client.processID)&&client.processID>0?client.processID:null,socketReadyState:states.has(raw)?raw:null,socketDestroyed:typeof socket.destroyed==='boolean'?socket.destroyed:null,bytesRead:n(socket.bytesRead),bytesWritten:n(socket.bytesWritten),socketHadError:hadError});clientPhaseEmitted++;}catch{failureCount++;}};
  function tcp(){try{tcpAt=new Date().toISOString();tcpMs=elapsed();}catch{failureCount++;}}
  function ready(){try{pgAt=new Date().toISOString();pgMs=elapsed();emit('pg-ready');}catch{failureCount++;}}
  function closed(errorFlag){try{closedAt=new Date().toISOString();closedMs=elapsed();hadError=typeof errorFlag==='boolean'?errorFlag:null;emit('socket-closed');}catch{failureCount++;}}
  own.finish=()=>emit('stopped');activeClientPhases.add(own);socket.once('connect',tcp);socket.once('close',closed);client.once('connect',ready);
 }catch{failureCount++;cleanup();}
 try{return Reflect.apply(originalConnect,this,args);}catch(error){emit('sync-error');throw error;}
};}
function stopClientConnectionPhases(){for(const own of [...activeClientPhases])own.finish();if(activeClientPhases.size)failureCount++;try{fs.writeFileSync(evidenceDir+'/client-connection-phase-status.json',JSON.stringify({...clientPhaseHealth(),stoppedAt:new Date().toISOString(),complete:activeClientPhases.size===0&&clientPhaseSequence===clientPhaseEmitted&&clientPhaseInterrupted===0},null,2)+'\n',{flag:'wx'});}catch{failureCount++;}}
