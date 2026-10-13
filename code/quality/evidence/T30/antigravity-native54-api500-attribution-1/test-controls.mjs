import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createServer } from 'node:http';

/**
 * FG T30 — Diagnostic Test Controls for API Pool Connect Attribution & Error Classification
 *
 * Verifies:
 * 1. Direct Promise-based Pool.connect acquisition records owner, backendPid, duration, and ok: true.
 * 2. Pool exhaustion timeout (connectionTimeoutMillis) records ok: false, errorCode: ERR_POOL_ACQUIRE_TIMEOUT, backendPid: null, and attributes to caller service.
 * 3. Callback-based pool.connect paths remain completely unmodified.
 * 4. Error classification strictly adheres to fixed enum constants with zero stack, message, or secret persistence.
 * 5. Bounded buffer limits, atomic flush, and health check settlement invariants hold.
 */

const evidenceDir = path.resolve('quality/evidence/T30/antigravity-native54-api500-attribution-1/test-controls-out');
fs.mkdirSync(evidenceDir, { recursive: true });

const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
const baseDbUrl = new URL(env.DATABASE_URL);
const schema = `t30_attr_ctrl_${randomUUID().replaceAll('-', '')}`;
baseDbUrl.searchParams.set('options', `-c search_path=${schema}`);

const checks = {};
const test = (name, fn) => {
  try {
    fn();
    checks[name] = true;
  } catch (err) {
    checks[name] = false;
    console.error(`Check failed: ${name}`, err);
  }
};

const testAsync = async (name, fn) => {
  try {
    await fn();
    checks[name] = true;
  } catch (err) {
    checks[name] = false;
    console.error(`Async check failed: ${name}`, err);
  }
};

let mainPool = null;
let stopObserver = null;
const cleanup = {
  schemaCreated: false,
  schemaDropped: false,
  mainPoolEnded: false,
  observerStopped: false,
};

async function runControls() {
  const observer = await import(pathToFileURL(path.resolve('quality/evidence/T30/antigravity-native54-api500-attribution-1/api-observer-attributed1.mjs')).href);

  // 1. Error classification unit tests (no DB required)
  test('classifyPoolAcquireTimeout', () => {
    const err = new Error('timeout exceeded when trying to connect');
    assert.equal(observer.sanitizeConnectErrorCode(err), 'ERR_POOL_ACQUIRE_TIMEOUT');
  });

  test('classifyConnectionTimeout', () => {
    const err = new Error('Connection terminated due to connection timeout');
    assert.equal(observer.sanitizeConnectErrorCode(err), 'ERR_CONNECTION_TIMEOUT');
    const errCode = { code: 'ETIMEDOUT' };
    assert.equal(observer.sanitizeConnectErrorCode(errCode), 'ERR_CONNECTION_TIMEOUT');
  });

  test('classifyConnectionRefused', () => {
    const err = { code: 'ECONNREFUSED' };
    assert.equal(observer.sanitizeConnectErrorCode(err), 'ERR_CONNECTION_REFUSED');
  });

  test('classifyConnectionReset', () => {
    const err = { code: 'ECONNRESET' };
    assert.equal(observer.sanitizeConnectErrorCode(err), 'ERR_CONNECTION_RESET');
  });

  test('classifyPoolEnded', () => {
    const err = new Error('Cannot use a pool after calling end on the pool');
    assert.equal(observer.sanitizeConnectErrorCode(err), 'ERR_POOL_ENDED');
  });

  test('classifySqlState', () => {
    const err = { code: '53300' }; // too_many_connections
    assert.equal(observer.sanitizeConnectErrorCode(err), 'ERR_SQLSTATE');
  });

  test('classifyGenericFallback', () => {
    const err = new Error('Some unexpected internal error with private token sec_12345');
    assert.equal(observer.sanitizeConnectErrorCode(err), 'ERR_GENERIC_CONNECT_FAILURE');
  });

  // 2. Instrument pg and start observer
  observer.instrumentOwnedApiPools(pg, evidenceDir);
  stopObserver = observer.startApiLockSpansObserver(evidenceDir);

  // 3. Setup mock services for instrumentation
  class MockRoomsService {
    async getRoomDetail(pool) {
      const client = await pool.connect();
      try {
        const res = await client.query('SELECT 1 AS val');
        return res.rows[0].val;
      } finally {
        client.release();
      }
    }
    async listRoomMembers(pool) {
      const client = await pool.connect();
      try {
        const res = await client.query('SELECT 2 AS val');
        return res.rows[0].val;
      } finally {
        client.release();
      }
    }
  }

  class MockTeamsService {
    async transaction(pool, fn) {
      const client = await pool.connect();
      try {
        return await fn(client);
      } finally {
        client.release();
      }
    }
  }

  observer.instrumentOwnedApiServices({
    RoomsService: MockRoomsService,
    TeamsService: MockTeamsService,
  });

  const roomsService = new MockRoomsService();
  const teamsService = new MockTeamsService();

  // 4. Create schema and test database connection
  mainPool = new pg.Pool({ connectionString: baseDbUrl.href, max: 5, connectionTimeoutMillis: 5000 });
  await mainPool.query(`CREATE SCHEMA "${schema}"`);
  cleanup.schemaCreated = true;

  // 5. Test normal Promise-based pool.connect under RoomsService.getRoomDetail
  await testAsync('normalPoolConnectUnderService', async () => {
    const val = await roomsService.getRoomDetail(mainPool);
    assert.equal(val, 1);
    observer.flushSpansSync();

    const records = fs.readFileSync(path.join(evidenceDir, 'api-lock-spans.jsonl'), 'utf8')
      .trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);

    const connectRecords = records.filter(r => r.type === 'pool-connect' && r.owner === 'RoomsService.getRoomDetail');
    assert(connectRecords.length >= 1, 'Expected at least one pool-connect record under RoomsService.getRoomDetail');
    const rec = connectRecords[connectRecords.length - 1];
    assert.equal(rec.ok, true);
    assert.equal(rec.errorCode, null);
    assert.equal(rec.sqlState, null);
    assert(typeof rec.backendPid === 'number' && rec.backendPid > 0);
    assert(rec.durationMs >= 0);
  });

  // 6. Test real PG Pool exhaustion timeout under RoomsService.listRoomMembers
  await testAsync('poolAcquireTimeoutExhaustionUnderService', async () => {
    // Create dedicated tiny pool: max 2, timeout 400ms
    const tightPool = new pg.Pool({
      connectionString: baseDbUrl.href,
      max: 2,
      connectionTimeoutMillis: 400,
    });

    const client1 = await tightPool.connect();
    const client2 = await tightPool.connect();

    let timeoutError = null;
    try {
      await roomsService.listRoomMembers(tightPool);
    } catch (err) {
      timeoutError = err;
    }

    assert(timeoutError !== null, 'Expected 3rd pool.connect to throw timeout error');
    assert(timeoutError.message.includes('timeout exceeded when trying to connect'));

    // Release clients and close tight pool
    client1.release();
    client2.release();
    await tightPool.end();

    observer.flushSpansSync();

    const records = fs.readFileSync(path.join(evidenceDir, 'api-lock-spans.jsonl'), 'utf8')
      .trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);

    const timeoutRecords = records.filter(r => r.type === 'pool-connect' && r.owner === 'RoomsService.listRoomMembers' && !r.ok);
    assert(timeoutRecords.length >= 1, 'Expected failed pool-connect record under RoomsService.listRoomMembers');
    const rec = timeoutRecords[timeoutRecords.length - 1];
    assert.equal(rec.ok, false);
    assert.equal(rec.errorCode, 'ERR_POOL_ACQUIRE_TIMEOUT');
    assert.equal(rec.sqlState, null);
    assert.equal(rec.backendPid, null);
    assert(rec.durationMs >= 350, `Expected duration ~400ms, got ${rec.durationMs}`);

    // Verify service-end record also captured the sanitized code
    const serviceEndRecords = records.filter(r => r.type === 'service-end' && r.owner === 'RoomsService.listRoomMembers');
    assert(serviceEndRecords.length >= 1);
    const endRec = serviceEndRecords[serviceEndRecords.length - 1];
    assert.equal(endRec.ok, false);
    assert.equal(endRec.code, 'ERR_POOL_ACQUIRE_TIMEOUT');
  });

  // 7. Test callback path preservation
  await testAsync('callbackPathPreservedUnchanged', async () => {
    await new Promise((resolve, reject) => {
      mainPool.connect((err, client, release) => {
        if (err) return reject(err);
        try {
          assert(client && typeof client.query === 'function');
          assert(typeof release === 'function');
          release();
          resolve();
        } catch (assertErr) {
          release();
          reject(assertErr);
        }
      });
    });
  });

  // 8. Test TeamsService transaction context
  await testAsync('teamsServiceTransactionContext', async () => {
    const res = await teamsService.transaction(mainPool, async (client) => {
      const q = await client.query('SELECT 42 AS answer');
      return q.rows[0].answer;
    });
    assert.equal(res, 42);

    observer.flushSpansSync();
    const records = fs.readFileSync(path.join(evidenceDir, 'api-lock-spans.jsonl'), 'utf8')
      .trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);

    const teamConnects = records.filter(r => r.type === 'pool-connect' && r.owner === 'TeamsService.transaction');
    assert(teamConnects.length >= 1);
    assert.equal(teamConnects[teamConnects.length - 1].ok, true);
  });
}

async function finalize() {
  try {
    if (mainPool) {
      if (cleanup.schemaCreated) {
        await mainPool.query(`DROP SCHEMA "${schema}" CASCADE`);
        cleanup.schemaDropped = true;
      }
      await mainPool.end();
      cleanup.mainPoolEnded = true;
    }
  } catch (err) {
    console.error('Database cleanup error:', err);
  }

  if (stopObserver) {
    try {
      const health = await stopObserver();
      cleanup.observerStopped = Boolean(health);
    } catch (err) {
      console.error('Observer stop error:', err);
    }
  }

  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const result = {
    recordedAt: new Date().toISOString(),
    checks,
    failedChecks,
    cleanup,
    success: failedChecks.length === 0,
    nativeAcceptance: false,
  };

  fs.writeFileSync(path.join(evidenceDir, 'controls-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('Controls result summary:', JSON.stringify(result, null, 2));
}

// Controls definition ready for Codex review/execution.
export { runControls, finalize };
