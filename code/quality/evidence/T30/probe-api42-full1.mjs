import fs from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
import { parseEnv } from 'node:util';
import { createServer } from 'node:http';
import { RoomServiceClient } from 'livekit-server-sdk';
import {
  instrumentOwnedApiPools,
  instrumentRoomServiceClient,
  instrumentOwnedApiServices,
  startApiLockSpansObserver,
  als,
  createSpanContext,
} from './api42-observer-reviewed1.mjs';

/**
 * FG T30 — Control Probe Child for API Lock Spans and HTTP Timing
 * 
 * Verifies exact argument, this, promise, sync-throw, and error identity across
 * real PostgreSQL queries, real LiveKit SDK HTTP RPC calls, and service wrappers.
 * Validates ALS context propagation and 5 diagnostic execution modes:
 * - normal
 * - write-io
 * - short-write
 * - buffer-drop
 * - final-health-io
 */

const mode = process.argv[2] || 'normal';
const validModes = new Set(['normal', 'write-io', 'short-write', 'buffer-drop', 'final-health-io']);
assert(validModes.has(mode), `Invalid mode: ${mode}`);

const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
const secret = 'T30_API_SPANS_PRIVATE_SENTINEL';
const evidenceDir = `quality/evidence/T30/api42-full-controls1/control-${mode}`;
fs.mkdirSync(evidenceDir, { recursive: true });

// Pre-create health file for final-health-io mode to trigger flag 'wx' failure
if (mode === 'final-health-io') {
  fs.writeFileSync(`${evidenceDir}/api-lock-spans-health.json`, '{"preExisting":true}\n');
}

let originalResult, lastArgs, lastError, lastThis;
const origClientQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function (...args) {
  lastArgs = args;
  lastThis = this;
  const result = origClientQuery.apply(this, args);
  originalResult = result;
  if (result?.then) {
    result.then(
      () => {},
      (e) => {
        lastError = e;
      }
    );
  }
  return result;
};

const capturedSdk = new Map();
for (const name of [
  'listRooms',
  'listParticipants',
  'getParticipant',
  'updateParticipant',
  'removeParticipant',
  'deleteRoom',
]) {
  const orig = RoomServiceClient.prototype[name];
  RoomServiceClient.prototype[name] = function (...args) {
    const result = orig.apply(this, args);
    capturedSdk.set(name, { result, args, self: this });
    if (result?.then) {
      result.then(
        () => {},
        (e) => {
          capturedSdk.get(name).error = e;
        }
      );
    }
    return result;
  };
}

let faulted = false;
const origWriteSync = fs.writeSync;
if (mode === 'write-io') {
  fs.writeSync = function (fd, buffer, offset, length, position) {
    if (!faulted) {
      faulted = true;
      throw Object.assign(new Error('Injected writeSync EIO'), { code: 'EIO' });
    }
    return origWriteSync.call(this, fd, buffer, offset, length, position);
  };
} else if (mode === 'short-write') {
  fs.writeSync = function (fd, buffer, offset, length, position) {
    if (!faulted) {
      faulted = true;
      // Return 0 bytes written to trigger failureCount accounting
      return 0;
    }
    return origWriteSync.call(this, fd, buffer, offset, length, position);
  };
}

// Initialize instrumentation under test
instrumentOwnedApiPools(pg, evidenceDir);
instrumentRoomServiceClient(RoomServiceClient, evidenceDir);

// Mock CallLifecycleService and CallsService classes with real sync throw and async rejection
class MockCallsService {
  async list(user, session, roomId) {
    if(typeof user==='function')return user();
    return { ok: true, roomId };
  }
  async participants(user, session, id) {
    if (id === 'error-id') {
      throw Object.assign(new Error('participants-failed'), { code: 'CALL_NOT_FOUND' });
    }
    return { ok: true, id };
  }
  syncThrowMethod() {
    throw new TypeError('sync-failure');
  }
  async withControlGroup(user, session, id, run) {
    return run();
  }
}

class MockCallLifecycleService {
  async reconcileGroup(id) {
    return { reconciled: true, id };
  }
}

const serviceCaptured=[];
for(const [Type,methods] of [[MockCallsService,['list','participants','withControlGroup']],[MockCallLifecycleService,['reconcileGroup']]])for(const method of methods){
  const original=Type.prototype[method];Type.prototype[method]=function(...args){const result=Reflect.apply(original,this,args);serviceCaptured.push({method,self:this,args,result,context:als.getStore()});return result;};
}
instrumentOwnedApiServices({
  CallsService: MockCallsService,
  CallLifecycleService: MockCallLifecycleService,
});

const stopObserver = startApiLockSpansObserver(evidenceDir);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];

let pool = null;
let client = null;
let http = null;

(async () => {
  try {
    // 1. Real PostgreSQL identity and callback controls
    pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
    client = await pool.connect();

    const config = { text: 'SELECT $1::text AS value, pg_sleep(0.01)', values: [secret] };
    const promise = client.query(config);
    assert.equal(promise, originalResult);
    assert.equal(lastArgs[0], config);
    assert.equal(lastThis, client);
    assert.equal((await promise).rows[0].value, secret);
    checks.push('real PG exact original promise/config/this/value identity');

    const failed = client.query('SELECT 1/0');
    assert.equal(failed, originalResult);
    let error;
    try {
      await failed;
    } catch (e) {
      error = e;
    }
    assert.equal(error, lastError);
    assert.equal(error.code, '22012');
    checks.push('real PG error and original rejected promise identity');

    await new Promise((resolve, reject) => {
      const values = [7];
      const callback = (err, value) => {
        if (err) return reject(err);
        try {
          assert.equal(value.rows[0].v, 7);
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      assert.equal(client.query('SELECT $1::int AS v', values, callback), undefined);
      assert.equal(lastArgs[1], values);
      assert.equal(lastArgs[2], callback);
    });
    checks.push('real callback query exact args and undefined return');

    // 2. Real SDK HTTP outcomes and identity preservation across all 6 RPC methods
    http = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url.endsWith('/GetParticipant')) {
        res.statusCode = 404;
        res.end(JSON.stringify({ code: 'not_found', msg: secret }));
      } else if (req.url.endsWith('/ListRooms')) {
        res.end(JSON.stringify({ rooms: [{ name: 'fg-call_test' }] }));
      } else if (req.url.endsWith('/ListParticipants')) {
        res.end(JSON.stringify({ participants: [{ identity: secret }] }));
      } else {
        res.end('{}');
      }
    });
    await new Promise((r) => http.listen(0, '127.0.0.1', r));
    const sdk = new RoomServiceClient(`http://127.0.0.1:${http.address().port}`, 'test-key', 'test-secret');

    const testRpcCalls = [
      ['listRooms', [['fg-call_test']]],
      ['listParticipants', ['fg-call_test']],
      ['getParticipant', ['fg-call_test', secret]],
      ['updateParticipant', ['fg-call_test', secret, { permission: { canSubscribe: true } }]],
      ['removeParticipant', ['fg-call_test', secret]],
      ['deleteRoom', ['fg-call_test']],
    ];

    for (const [method, args] of testRpcCalls) {
      const p = sdk[method](...args);
      const captured = capturedSdk.get(method);
      assert.equal(p, captured.result);
      assert.equal(captured.self, sdk);
      assert.deepEqual(captured.args, args);
      try {
        await p;
        assert.notEqual(method, 'getParticipant');
      } catch (e) {
        assert.equal(method, 'getParticipant');
        assert.equal(e, captured.error);
        assert.equal(e.code, 'not_found');
      }
    }
    checks.push('real SDK HTTP outcomes original promise/args/this/error across all 6 RPC methods');

    // 3. ALS Context Propagation & Service Wrapper Invariants
    const callsInst = new MockCallsService();
    const lifecycleInst = new MockCallLifecycleService();

    let outerContextSeen = null;
    let innerContextSeen = null;

    const reconciled = await lifecycleInst.reconcileGroup('call-123');
    assert.deepEqual(reconciled, { reconciled: true, id: 'call-123' });
    checks.push('wrapped CallLifecycleService.reconcileGroup returns original outcome');

    const listed = await callsInst.list('user-1', 'sess-1', 'room-1');
    assert.deepEqual(listed, { ok: true, roomId: 'room-1' });
    checks.push('wrapped CallsService.list returns original outcome');

    // Test service async error preservation
    let serviceAsyncError = null;
    try {
      await callsInst.participants('user-1', 'sess-1', 'error-id');
    } catch (e) {
      serviceAsyncError = e;
    }
    assert(serviceAsyncError);
    assert.equal(serviceAsyncError.message, 'participants-failed');
    assert.equal(serviceAsyncError.code, 'CALL_NOT_FOUND');
    checks.push('wrapped CallsService.participants async rejection preserved');

    // Test nested context execution and PID propagation
    await als.run(createSpanContext('http-rooms-detail'), async () => {
      outerContextSeen = als.getStore();
      await client.query('SELECT 1');
      await callsInst.participants('user-2', 'sess-2', 'call-123');
      innerContextSeen = als.getStore();
    });

    assert(outerContextSeen);
    assert.equal(outerContextSeen.owner, 'http-rooms-detail');
    assert.equal(outerContextSeen.parentSpanIndex, null);
    assert(outerContextSeen.pids.size > 0);
    assert(outerContextSeen.pids.has(Number(client.processID)));
    checks.push('nested ALS context propagates backendPid set and span indices without metadata leakage');

    // Controlled simultaneous service contexts use distinct real PostgreSQL clients.
    const second=await pool.connect();
    try{
      const contexts=[];
      const operations=[client,second].map((db,index)=>{
        const callback=async()=>{const current=als.getStore();contexts.push({index,current});await db.query('SELECT pg_sleep(0.01)');assert(current.pids.has(db.processID));};
        const originalCount=serviceCaptured.length;
        const promise=callsInst.withControlGroup('synthetic','synthetic','synthetic',callback);
        const captured=serviceCaptured[originalCount];assert.equal(promise,captured.result);assert.equal(captured.self,callsInst);assert.equal(captured.args[3],callback);return promise;
      });
      await Promise.all(operations);assert.equal(contexts.length,2);assert.notEqual(contexts[0].current.spanIndex,contexts[1].current.spanIndex);
      assert.notEqual(client.processID,second.processID);for(const {index,current} of contexts)assert.equal(current.pids.size,1);
      let outer,inner;await callsInst.withControlGroup('synthetic','synthetic','nested',async()=>{outer=als.getStore();await callsInst.list(async()=>{inner=als.getStore();await client.query('SELECT 1');});assert.equal(als.getStore(),outer);});
      assert.notEqual(inner.spanIndex,outer.spanIndex);assert.equal(inner.parentSpanIndex,outer.spanIndex);assert(inner.pids.has(client.processID));
      checks.push('concurrent distinct real PG service contexts and nested inner parent/promise/args/this identities');
    }finally{second.release();}

    // Fill the bounded event buffer using real wrapper calls in one microtask turn; no 5100 DB roundtrips.
    if (mode === 'buffer-drop') {
      for (let i = 0; i < 3000; i++) await callsInst.list('synthetic','synthetic','synthetic');
    }

    // 4. Sampler observation & Stop Verification
    await delay(1200);
    const health = await stopObserver();

    checks.push('observer stopped and returned health record');
    if (mode === 'normal') {
      assert(health.observationComplete, 'Expected observationComplete === true in normal mode');
      assert.equal(health.failureCount, 0);
      assert.equal(health.droppedCount, 0);
      assert(health.sampleCount > 0);
    } else if (mode === 'write-io' || mode === 'short-write') {
      assert.equal(health.observationComplete, false);
      assert(health.failureCount > 0);
      assert(faulted);
    } else if (mode === 'buffer-drop') {
      assert.equal(health.observationComplete, false);
      assert(health.droppedCount > 0);
    } else if (mode === 'final-health-io') {
      assert.equal(health.observationComplete, false);
      assert(health.failureCount > 0);
    }

    // Teardown connections BEFORE reporting result
    if (client) {
      client.release();
      client = null;
    }
    if (pool && !pool.ended) {
      await pool.end();
    }
    if (http) {
      await new Promise((r) => http.close(r));
      http = null;
    }

    assert.equal(pool.ended, true, 'Pool must be ended before control completion');

    console.log(
      '[FG_CONTROL_RESULT] ' +
        JSON.stringify({
          mode,
          checks,
          poolEnded: pool.ended,
          writeFaultInjected: faulted,
          ok: true,
        })
    );
    console.log('[FG_API_SPANS_HEALTH] ' + JSON.stringify(health));
  } catch (err) {
    console.log(
      '[FG_CONTROL_RESULT] ' +
        JSON.stringify({
          mode,
          ok: false,
          name: err?.name ?? 'Error',
          message: 'Controlled probe assertion failed',
          code: err?.code ?? null,
        })
    );
    process.exitCode = 1;
  } finally {
    if (client) {
      try { client.release(); } catch {}
    }
    if (pool && !pool.ended) {
      try { await pool.end(); } catch {}
    }
    if (http) {
      try { await new Promise((r) => http.close(r)); } catch {}
    }
    if (mode === 'write-io' || mode === 'short-write') {
      fs.writeSync = origWriteSync;
    }
  }
})();
