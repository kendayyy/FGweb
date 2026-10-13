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
} from './api-lock-spans-observer.mjs';

const mode = process.argv[2] || 'healthy';
const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
const secret = 'T30_API_SPANS_PRIVATE_SENTINEL';
const evidenceDir = `quality/evidence/T30/antigravity-native41-api-lock-spans-1/control-${mode}`;
fs.mkdirSync(evidenceDir, { recursive: true });

let originalResult, lastArgs, lastError, lastThis;
const origClientQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function (...args) {
  lastArgs = args;
  lastThis = this;
  const result = origClientQuery.apply(this, args);
  originalResult = result;
  if (result?.then) result.then(() => {}, (e) => { lastError = e; });
  return result;
};

const capturedSdk = new Map();
for (const name of ['listRooms', 'listParticipants', 'getParticipant', 'updateParticipant', 'removeParticipant', 'deleteRoom']) {
  const orig = RoomServiceClient.prototype[name];
  RoomServiceClient.prototype[name] = function (...args) {
    const result = orig.apply(this, args);
    capturedSdk.set(name, { result, args, self: this });
    if (result?.then) result.then(() => {}, (e) => { capturedSdk.get(name).error = e; });
    return result;
  };
}

let faulted = false;
const origAppend = fs.appendFileSync;
if (mode === 'write-io') {
  fs.appendFileSync = function (filePath, data, ...rest) {
    if (String(filePath).includes('api-lock-spans') && !faulted) {
      faulted = true;
      throw Object.assign(new Error(secret), { code: 'EIO' });
    }
    return origAppend.call(this, filePath, data, ...rest);
  };
}

// Initialize instrumentation under test
instrumentOwnedApiPools(pg, evidenceDir);
instrumentRoomServiceClient(RoomServiceClient, evidenceDir);

// Mock CallLifecycleService and CallsService classes
class MockCallsService {
  async list(user, session, roomId) {
    return { ok: true, roomId };
  }
  async participants(user, session, id) {
    return { ok: true, id };
  }
  async withControlGroup(user, session, id, run) {
    return run({ query: () => Promise.resolve({ rows: [] }) }, { id });
  }
}

class MockCallLifecycleService {
  async reconcileGroup(id) {
    return { reconciled: true, id };
  }
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

    const config = { text: 'SELECT $1::text AS value, pg_sleep(0.05)', values: [secret] };
    const promise = client.query(config);
    assert.equal(promise, originalResult);
    assert.equal(lastArgs[0], config);
    assert.equal(lastThis, client);
    assert.equal((await promise).rows[0].value, secret);
    checks.push('real PG exact original promise/config/this/value identity');

    const failed = client.query('SELECT 1/0');
    assert.equal(failed, originalResult);
    let error;
    try { await failed; } catch (e) { error = e; }
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
        } catch (e) { reject(e); }
      };
      assert.equal(client.query('SELECT $1::int AS v', values, callback), undefined);
      assert.equal(lastArgs[1], values);
      assert.equal(lastArgs[2], callback);
    });
    checks.push('real callback query exact args and undefined return');

    // 2. Real SDK HTTP outcomes and identity preservation across 6 RPC methods
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

    // 3. ALS Context Propagation & Nested Context Invariants
    const callsInst = new MockCallsService();
    const lifecycleInst = new MockCallLifecycleService();

    let outerContextSeen = null;
    let innerContextSeen = null;

    await lifecycleInst.reconcileGroup('call-123');
    checks.push('wrapped CallLifecycleService.reconcileGroup returns original outcome');

    await callsInst.list('user-1', 'sess-1', 'room-1');
    checks.push('wrapped CallsService.list returns original outcome');

    // Test nested context execution
    await als.run(createSpanContext('OuterContext'), async () => {
      outerContextSeen = als.getStore();
      await client.query('SELECT 1');
      await callsInst.participants('user-2', 'sess-2', 'call-123');
      innerContextSeen = als.getStore();
    });

    assert(outerContextSeen);
    assert.equal(outerContextSeen.owner, 'OuterContext');
    assert.equal(outerContextSeen.parentSpanIndex, null);
    assert(outerContextSeen.backendPid > 0);
    checks.push('nested ALS context propagates backendPid and parentSpanIndex without metadata leakage');

    // 4. Sampler observation & Stop Verification
    await delay(1200);
    const health = await stopObserver();

    checks.push('observer stopped and returned health record');
    if (mode === 'healthy') {
      assert(health.observationComplete);
      assert.equal(health.failureCount, 0);
      assert.equal(health.droppedCount, 0);
      assert(health.sampleCount > 0);
    } else if (mode === 'write-io') {
      assert.equal(health.observationComplete, false);
      assert(health.failureCount > 0);
      assert(faulted);
    }

    console.log('[FG_CONTROL_RESULT] ' + JSON.stringify({ mode, checks, poolEnded: pool.ended, writeFaultInjected: faulted, ok: true }));
    console.log('[FG_API_SPANS_HEALTH] ' + JSON.stringify(health));
  } catch (err) {
    console.log('[FG_CONTROL_RESULT] ' + JSON.stringify({ mode, ok: false, name: err.name, message: err.message, code: err.code ?? null }));
    process.exitCode = 1;
  } finally {
    if (client) client.release();
    if (pool && !pool.ended) await pool.end();
    if (http) await new Promise((r) => http.close(r));
    if (mode === 'write-io') fs.appendFileSync = origAppend;
  }
})();
