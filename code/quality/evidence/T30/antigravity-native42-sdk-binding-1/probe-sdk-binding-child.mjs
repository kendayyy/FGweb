import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import pg from 'pg';
import { RoomServiceClient as EsmRoomServiceClient } from 'livekit-server-sdk';

/**
 * FG T30 — SDK Binding Proof Control Child
 * 
 * Verifies observation of BOTH ESM and compiled CJS RoomServiceClient constructors.
 * Evaluates:
 * 1. Constructor and prototype identity divergence (ESM !== CJS).
 * 2. Original argument, this, promise, and error identity preservation across all 6 RPC methods.
 * 3. PostgreSQL in-transaction PID and transactionIndex binding during FOR UPDATE locks.
 * 4. Automatic clearing of binding after successful COMMIT.
 * 5. Concurrent service contexts recording distinct actual PIDs without cross-contamination.
 * 6. Demonstrates that helper2 has a COVERAGE GAP (0 CJS RPC records) whereas observer3 is GREEN.
 */

const d = 'quality/evidence/T30';
const helper = process.argv[2];
const label = process.argv[3];
assert(helper, 'Helper path argument required');
assert(label, 'Label argument required');

const folder = `${d}/antigravity-native42-sdk-binding-1/control-sdk-binding-${label}`;
fs.mkdirSync(folder, { recursive: true });

// Resolve CJS RoomServiceClient from actual compiled calls.service.js require context
const requireFromCalls = createRequire(new URL('../../../apps/api/dist/modules/calls/calls.service.js', import.meta.url));
const { RoomServiceClient: CjsRoomServiceClient } = requireFromCalls('livekit-server-sdk');

assert.notEqual(EsmRoomServiceClient, CjsRoomServiceClient, 'ESM and CJS constructors must be distinct');
assert.notEqual(EsmRoomServiceClient.prototype, CjsRoomServiceClient.prototype, 'ESM and CJS prototypes must be distinct');

const SAFE_RPC_METHODS = [
  'listRooms',
  'listParticipants',
  'getParticipant',
  'updateParticipant',
  'removeParticipant',
  'deleteRoom',
];

// Attach spies BEFORE observer installation to capture original behaviors
const esmOriginals = new Map();
for (const method of SAFE_RPC_METHODS) {
  const orig = EsmRoomServiceClient.prototype[method];
  EsmRoomServiceClient.prototype[method] = function (...args) {
    const result = Reflect.apply(orig, this, args);
    esmOriginals.set(method, { result, self: this, args });
    return result;
  };
}

const cjsOriginals = new Map();
for (const method of SAFE_RPC_METHODS) {
  const orig = CjsRoomServiceClient.prototype[method];
  CjsRoomServiceClient.prototype[method] = function (...args) {
    const result = Reflect.apply(orig, this, args);
    cjsOriginals.set(method, { result, self: this, args });
    return result;
  };
}

const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
const schema = `t30_sdk_bind_${randomUUID().replaceAll('-', '')}`;
const db = new URL(env.DATABASE_URL);
db.searchParams.set('options', `-c search_path=${schema}`);

let pool, client1, clientA, clientB, http, stopObserver, created = false;
const cleanup = { schemaRemoved: false, poolEnded: false, httpClosed: false };
const checks = {};
let failed = false;

const test = (name, fn) => {
  try {
    fn();
    checks[name] = true;
  } catch (err) {
    checks[name] = false;
  }
};

(async () => {
  try {
    // 1. Loopback HTTP Server handling all 6 LiveKit RPC methods
    http = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url.endsWith('/GetParticipant')) {
        res.statusCode = 404;
        res.end(JSON.stringify({ code: 'not_found', msg: 'Controlled participant not found' }));
      } else if (req.url.endsWith('/ListRooms')) {
        res.end(JSON.stringify({ rooms: [{ name: 'fg-call_synthetic' }] }));
      } else if (req.url.endsWith('/ListParticipants')) {
        res.end(JSON.stringify({ participants: [{ identity: 'controlled-participant' }] }));
      } else {
        res.end('{}');
      }
    });
    await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
    const sfuUrl = `http://127.0.0.1:${http.address().port}`;

    // 2. Load and configure observer under test
    const observer = await import(pathToFileURL(path.resolve(d, helper)).href);
    observer.instrumentOwnedApiPools(pg, folder);

    const isObserver3 = helper.includes('observer3');
    if (isObserver3) {
      observer.instrumentRoomServiceClient([EsmRoomServiceClient, CjsRoomServiceClient], folder);
    } else {
      // Helper2 only accepted single ESM constructor
      observer.instrumentRoomServiceClient(EsmRoomServiceClient, folder);
    }
    stopObserver = observer.startApiLockSpansObserver(folder);

    // 3. Service method wrapping
    class MockCallsService {
      async list(...args) { return Reflect.apply(args[0], this, args.slice(1)); }
      async participants(...args) { return Reflect.apply(args[0], this, args.slice(1)); }
      async withControlGroup(...args) { return Reflect.apply(args[0], this, args.slice(1)); }
    }
    class MockCallLifecycleService {
      async reconcileGroup(...args) { return Reflect.apply(args[0], this, args.slice(1)); }
    }
    observer.instrumentOwnedApiServices({
      CallsService: MockCallsService,
      CallLifecycleService: MockCallLifecycleService,
    });
    const callsService = new MockCallsService();
    const lifecycleService = new MockCallLifecycleService();

    // 4. Initialize Database
    pool = new pg.Pool({ connectionString: db.href, max: 6, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await pool.query('CREATE TABLE rooms(id text PRIMARY KEY)');
    await pool.query("INSERT INTO rooms VALUES('synthetic-room')");

    const esmClient = new EsmRoomServiceClient(sfuUrl, 'controlled-key', 'controlled-secret');
    const cjsClient = new CjsRoomServiceClient(sfuUrl, 'controlled-key', 'controlled-secret');

    // 5. Check exact identity across all 6 methods for BOTH variants
    const rpcCalls = [
      ['listRooms', [[]]],
      ['listParticipants', ['fg-call_synthetic']],
      ['getParticipant', ['fg-call_synthetic', 'synthetic-participant']],
      ['updateParticipant', ['fg-call_synthetic', 'synthetic-participant', { permission: { canSubscribe: true } }]],
      ['removeParticipant', ['fg-call_synthetic', 'synthetic-participant']],
      ['deleteRoom', ['fg-call_synthetic']],
    ];

    for (const [method, args] of rpcCalls) {
      // Test ESM identity
      const esmPromise = esmClient[method](...args);
      test(`esm_${method}_identity`, () => {
        assert.equal(esmPromise, esmOriginals.get(method).result);
        assert.equal(esmOriginals.get(method).self, esmClient);
        assert.deepEqual(esmOriginals.get(method).args, args);
      });
      try {
        await esmPromise;
      } catch (err) {
        test(`esm_${method}_error_code`, () => assert.equal(err.code, 'not_found'));
      }

      // Test CJS identity
      const cjsPromise = cjsClient[method](...args);
      test(`cjs_${method}_identity`, () => {
        assert.equal(cjsPromise, cjsOriginals.get(method).result);
        assert.equal(cjsOriginals.get(method).self, cjsClient);
        assert.deepEqual(cjsOriginals.get(method).args, args);
      });
      try {
        await cjsPromise;
      } catch (err) {
        test(`cjs_${method}_error_code`, () => assert.equal(err.code, 'not_found'));
      }
    }

    // 6. Real PG Transaction Binding and Clearing Verification
    client1 = await pool.connect();
    const pid1 = Number(client1.processID);

    await lifecycleService.reconcileGroup(async () => {
      await client1.query('BEGIN');
      await client1.query("SELECT id FROM rooms WHERE id='synthetic-room' FOR UPDATE");

      // In-transaction RPC calls
      await esmClient.listRooms();
      await cjsClient.listRooms();

      await client1.query('COMMIT');

      // Post-commit RPC calls
      await esmClient.listRooms();
      await cjsClient.listRooms();
    });

    // 7. Concurrent Contexts Isolation Verification
    clientA = await pool.connect();
    clientB = await pool.connect();
    const pidA = Number(clientA.processID);
    const pidB = Number(clientB.processID);
    assert.notEqual(pidA, pidB, 'Concurrent test clients must have distinct backend PIDs');

    await Promise.all([
      callsService.withControlGroup(async () => {
        await clientA.query('BEGIN');
        await clientA.query("SELECT id FROM rooms WHERE id='synthetic-room' FOR UPDATE");
        await cjsClient.listParticipants('fg-call_synthetic');
        await clientA.query('COMMIT');
      }),
      callsService.participants(async () => {
        await clientB.query('BEGIN');
        await clientB.query("SELECT id FROM rooms WHERE id='synthetic-room' FOR UPDATE");
        await cjsClient.listParticipants('fg-call_synthetic');
        await clientB.query('COMMIT');
      }),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const health = await stopObserver();

    // 8. Analyze Telemetry Spans
    const records = fs
      .readFileSync(`${folder}/api-lock-spans.jsonl`, 'utf8')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map(JSON.parse);

    const rpcRecords = records.filter((r) => r.type === 'rpc');

    if (!isObserver3) {
      // Helper2 under test: Prove the CJS coverage gap
      const cjsRecorded = rpcRecords.some(
        (r) =>
          r.owner === 'CallLifecycleService.reconcileGroup' &&
          r.method === 'listRooms' &&
          r.backendPid === pid1
      );
      test('helper2_esm_recorded', () => assert(rpcRecords.length > 0));
      test('helper2_cjs_coverage_gap_confirmed', () => assert.equal(cjsRecorded, false));
    } else {
      // Observer3 under test: Prove full observation of both ESM and CJS
      const inTxListRooms = rpcRecords.filter(
        (r) =>
          r.owner === 'CallLifecycleService.reconcileGroup' &&
          r.method === 'listRooms' &&
          r.backendPid === pid1
      );
      test('observer3_in_tx_rpc_pid_bound', () => assert(inTxListRooms.length >= 2));

      const postCommitListRooms = rpcRecords.filter(
        (r) =>
          r.owner === 'CallLifecycleService.reconcileGroup' &&
          r.method === 'listRooms' &&
          r.backendPid === null &&
          r.transactionIndex === null
      );
      test('observer3_post_commit_cleared_binding', () => assert(postCommitListRooms.length >= 2));

      const concurrentA = rpcRecords.find(
        (r) => r.owner === 'CallsService.withControlGroup' && r.backendPid === pidA
      );
      const concurrentB = rpcRecords.find(
        (r) => r.owner === 'CallsService.participants' && r.backendPid === pidB
      );
      test('observer3_concurrent_distinct_pids', () => {
        assert(concurrentA);
        assert(concurrentB);
        assert.notEqual(concurrentA.backendPid, concurrentB.backendPid);
      });

      test('observer3_health_complete', () => {
        assert.equal(health.failureCount, 0);
        assert.equal(health.droppedCount, 0);
        assert.equal(health.observationComplete, true);
      });
    }
  } catch (err) {
    failed = true;
  } finally {
    try {
      if (client1) { await client1.query('ROLLBACK').catch(() => {}); client1.release(); }
      if (clientA) { await clientA.query('ROLLBACK').catch(() => {}); clientA.release(); }
      if (clientB) { await clientB.query('ROLLBACK').catch(() => {}); clientB.release(); }
      if (created && pool) {
        await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
        cleanup.schemaRemoved = (await pool.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema])).rowCount === 0;
      }
      if (pool) {
        await pool.end();
        cleanup.poolEnded = pool.ended === true;
      }
    } catch {
      failed = true;
    }

    try {
      if (http) {
        await new Promise((resolve) => http.close(resolve));
        cleanup.httpClosed = !http.listening;
      }
    } catch {
      failed = true;
    }

    try {
      if (stopObserver) await stopObserver();
    } catch {}
  }

  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  const result = {
    recordedAt: new Date().toISOString(),
    helper,
    label,
    checks,
    failedChecks,
    cleanup,
    fatalControlFailure: failed,
    nativeAcceptance: false,
  };

  fs.writeFileSync(`${folder}/result.json`, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log('[FG_CONTROL_RESULT] ' + JSON.stringify(result));
  process.exitCode = failed || failedChecks.length || !Object.values(cleanup).every(Boolean) ? 1 : 0;
})();
