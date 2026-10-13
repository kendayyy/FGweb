import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as tables from '@fg/database';
import { liveLease } from '../../../../apps/api/src/modules/calls/lease-store.js';

/**
 * FG T30 — Runner for call_admissions No-Op Write Elimination Control
 * 
 * Verifies real PostgreSQL behavior on an isolated schema:
 * 1. Proves Baseline RED: Unconditional UPDATE mutates physical tuple (ctid changes, xmin increments,
 *    rowCount === 1) on already-connected row, generating unnecessary row versions and WAL records.
 * 2. Proves Proposed GREEN: Surgical predicate AND (connected_at IS NULL OR disconnected_at IS NOT NULL)
 *    leaves physical tuple untouched (ctid and xmin identical, rowCount === 0).
 * 3. Reconnect parity: Disconnected row is updated (rowCount === 1), clearing disconnected_at while
 *    retaining the original connected_at timestamp.
 * 4. Revocation and grace period parity: Revoked rows match 0 rows and are marked for release.
 * 
 * Enforces strict cleanup: drops schema and ends pool BEFORE emitting review record.
 * Sanitizes credentials, tokens, and raw SQL.
 */

const root = process.cwd();
const d = 'quality/evidence/T30/antigravity-lifecycle-noop-write-1';
const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));

const privateValues = Object.entries(env)
  .filter(([k, v]) => /SECRET|TOKEN|PASSWORD|KEY|DATABASE_URL/.test(k) && typeof v === 'string' && v.length > 7)
  .map(([, v]) => v);

try {
  const parsedDb = new URL(env.DATABASE_URL);
  if (parsedDb.password) privateValues.push(decodeURIComponent(parsedDb.password));
} catch {}

const sanitize = (s) => {
  if (typeof s !== 'string') return String(s ?? '');
  let sanitized = s;
  for (const val of privateValues) {
    if (val) sanitized = sanitized.split(val).join('[REDACTED]');
  }
  return sanitized
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/(?:postgres(?:ql)?|redis):\/\/[^@\s]+@/g, '[REDACTED_CONNECTION]@')
    .replace(/(?:wss?|https?):\/\/[^\s]+/g, '[URL REDACTED]');
};

const schema = `t30_noop_${randomUUID().replaceAll('-', '')}`;
const dbUrl = new URL(env.DATABASE_URL);
dbUrl.searchParams.set('options', `-c search_path=${schema}`);

let pool = null;
let schemaCreated = false;
let failed = false;
const checks = {};

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
    pool = new pg.Pool({
      connectionString: dbUrl.href,
      max: 6,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });

    await pool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;

    await migrate(drizzle(pool), {
      migrationsFolder: path.join(root, 'packages/database/migrations'),
      migrationsSchema: schema,
    });

    await tables.seedGames(drizzle(pool, { schema: tables }));
    const game = (await pool.query<{ id: string }>('SELECT id FROM games LIMIT 1')).rows[0];
    assert(game, 'Seeded game required');

    const testUserId = randomUUID();
    const testSessionId = randomUUID();
    const testRoomId = randomUUID();
    const testCallGroupId = randomUUID();
    const testCallMemberId = randomUUID();
    const testAdmissionId = `admission_${randomUUID()}`;

    // Seed User, Profile, Game Interests, Session with valid constraints
    await pool.query(
      'INSERT INTO "user"(id, name, email, email_verified, created_at, updated_at) VALUES($1, $2, $3, true, now(), now())',
      [testUserId, 'Test User', `${testUserId}@fixture.invalid`]
    );
    await pool.query('INSERT INTO profiles(user_id, display_name) VALUES($1, $2)', [testUserId, 'Test User']);
    await pool.query('INSERT INTO game_interests(id, user_id, game_id) VALUES($1, $2, $3)', [randomUUID(), testUserId, game.id]);
    await pool.query(
      "INSERT INTO session(id, user_id, token, expires_at, created_at, updated_at) VALUES($1, $2, $3, now() + interval '1 day', now(), now())",
      [testSessionId, testUserId, `tok-${testSessionId}`]
    );

    // Seed Room, Room Member, Call Group, Call Member
    await pool.query(
      "INSERT INTO rooms(id, owner_id, name, game_id, visibility, player_capacity) VALUES($1, $2, 'Test Room', $3, 'PUBLIC', 10)",
      [testRoomId, testUserId, game.id]
    );
    await pool.query("INSERT INTO room_members(id, room_id, user_id, role) VALUES($1, $2, $3, 'OWNER')", [
      randomUUID(),
      testRoomId,
      testUserId,
    ]);
    await pool.query("INSERT INTO call_groups(id, room_id, state) VALUES($1, $2, 'OPEN')", [testCallGroupId, testRoomId]);
    await pool.query("INSERT INTO call_members(id, call_group_id, room_id, user_id, seat_index) VALUES($1, $2, $3, $4, 1)", [
      testCallMemberId,
      testCallGroupId,
      testRoomId,
      testUserId,
    ]);

    // Seed Call Admission initially unconnected
    await pool.query(
      "INSERT INTO call_admissions(id, call_member_id, session_id, expires_at) VALUES($1, $2, $3, clock_timestamp() + interval '60 seconds')",
      [testAdmissionId, testCallMemberId, testSessionId]
    );

    // 1. Initial connect: updates connected_at
    const time1 = new Date();
    const initQuery =
      'UPDATE call_admissions SET connected_at=COALESCE(connected_at,$2),disconnected_at=NULL WHERE id=$1 AND revoked_at IS NULL AND (connected_at IS NULL OR disconnected_at IS NOT NULL)';
    const initRes = await pool.query(initQuery, [testAdmissionId, time1]);
    test('initial_presence_written', () => assert.equal(initRes.rowCount, 1));

    const tuple1 = (
      await pool.query<{ ctid: string; xmin: string; connected_at: Date; disconnected_at: Date | null }>(
        'SELECT ctid::text, xmin::text, connected_at, disconnected_at FROM call_admissions WHERE id=$1',
        [testAdmissionId]
      )
    ).rows[0];
    test('initial_connected_at_set', () => assert(tuple1.connected_at !== null && tuple1.disconnected_at === null));

    // 2. Baseline unconditional update on already-connected row: proves RED
    const time2 = new Date(Date.now() + 5000);
    const baselineQuery =
      'UPDATE call_admissions SET connected_at=COALESCE(connected_at,$2),disconnected_at=NULL WHERE id=$1 AND revoked_at IS NULL';
    const baselineRes = await pool.query(baselineQuery, [testAdmissionId, time2]);
    test('baseline_defect_rowcount_1', () => assert.equal(baselineRes.rowCount, 1));

    const tuple2 = (
      await pool.query<{ ctid: string; xmin: string; connected_at: Date }>(
        'SELECT ctid::text, xmin::text, connected_at FROM call_admissions WHERE id=$1',
        [testAdmissionId]
      )
    ).rows[0];
    test('baseline_defect_tuple_mutated_red', () => {
      assert.notEqual(tuple2.ctid, tuple1.ctid);
      assert(Number(tuple2.xmin) > Number(tuple1.xmin));
    });

    // 3. Proposed surgical query on already-connected row: proves GREEN
    const time3 = new Date(Date.now() + 10000);
    const proposedQuery =
      'UPDATE call_admissions SET connected_at=COALESCE(connected_at,$2),disconnected_at=NULL WHERE id=$1 AND revoked_at IS NULL AND (connected_at IS NULL OR disconnected_at IS NOT NULL)';
    const proposedRes = await pool.query(proposedQuery, [testAdmissionId, time3]);
    test('proposed_noop_rowcount_0', () => assert.equal(proposedRes.rowCount, 0));

    const tuple3 = (
      await pool.query<{ ctid: string; xmin: string; connected_at: Date; disconnected_at: Date | null }>(
        'SELECT ctid::text, xmin::text, connected_at, disconnected_at FROM call_admissions WHERE id=$1',
        [testAdmissionId]
      )
    ).rows[0];
    test('proposed_tuple_preserved_green', () => {
      assert.equal(tuple3.ctid, tuple2.ctid);
      assert.equal(tuple3.xmin, tuple2.xmin);
      assert.equal(new Date(tuple3.connected_at).getTime(), new Date(tuple2.connected_at).getTime());
      assert.equal(tuple3.disconnected_at, null);
    });

    // 4. Disconnect followed by reconnect
    const timeDisconnect = new Date(Date.now() + 15000);
    await pool.query(
      'UPDATE call_admissions SET disconnected_at=$2 WHERE id=$1 AND disconnected_at IS NULL AND revoked_at IS NULL',
      [testAdmissionId, timeDisconnect]
    );

    const timeReconnect = new Date(Date.now() + 20000);
    const reconnectRes = await pool.query(proposedQuery, [testAdmissionId, timeReconnect]);
    test('proposed_reconnect_written', () => assert.equal(reconnectRes.rowCount, 1));

    const tuple4 = (
      await pool.query<{ ctid: string; xmin: string; connected_at: Date; disconnected_at: Date | null }>(
        'SELECT ctid::text, xmin::text, connected_at, disconnected_at FROM call_admissions WHERE id=$1',
        [testAdmissionId]
      )
    ).rows[0];
    test('proposed_reconnect_disconnected_cleared', () => assert.equal(tuple4.disconnected_at, null));
    test('proposed_reconnect_original_connected_at_preserved', () => {
      assert.equal(new Date(tuple4.connected_at).getTime(), new Date(tuple1.connected_at).getTime());
    });

    // 5. Revocation & grace period parity
    await pool.query('UPDATE call_admissions SET revoked_at=now() WHERE id=$1', [testAdmissionId]);
    const revokeRes = await pool.query(proposedQuery, [testAdmissionId, new Date()]);
    test('proposed_revoked_no_match', () => assert.equal(revokeRes.rowCount, 0));

    const activeLease = await liveLease(pool, testAdmissionId);
    test('revoked_lease_invalidated', () => assert.equal(activeLease, undefined));
  } catch (err) {
    failed = true;
  } finally {
    const cleanup = { schemaRemoved: false, poolEnded: false };
    try {
      if (schemaCreated && pool) {
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        cleanup.schemaRemoved = true;
      }
      if (pool) {
        await pool.end();
        cleanup.poolEnded = pool.ended === true;
      }
    } catch {
      failed = true;
    }

    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);

    const review = {
      recordedAt: new Date().toISOString(),
      patchPath: `${d}/call-lifecycle-noop-write.patch`,
      patchSha256: createHash('sha256').update(fs.readFileSync(`${d}/call-lifecycle-noop-write.patch`)).digest('hex'),
      checks,
      failedChecks,
      cleanup,
      fatalError: failed,
      baselineDefectConfirmed: checks.baseline_defect_tuple_mutated_red === true,
      proposedFixConfirmed: checks.proposed_tuple_preserved_green === true,
      reconnectPreserved: checks.proposed_reconnect_original_connected_at_preserved === true,
      nativeAcceptance: false,
    };

    fs.writeFileSync(`${d}/noop-write-control-review.json`, JSON.stringify(review, null, 2) + '\n', { flag: 'wx' });
    console.log('[FG_CONTROL_RESULT] ' + sanitize(JSON.stringify(review, null, 2)));
    process.exitCode = failed || failedChecks.length || !Object.values(cleanup).every(Boolean) ? 1 : 0;
  }
})();
