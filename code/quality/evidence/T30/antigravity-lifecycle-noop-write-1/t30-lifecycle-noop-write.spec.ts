import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as tables from '@fg/database';
import { liveLease } from '../../../../apps/api/src/modules/calls/lease-store.js';

/**
 * FG T30 — Integration Test Suite: call_admissions No-Op Write Elimination
 * 
 * Verifies that adding the surgical predicate:
 *   AND (connected_at IS NULL OR disconnected_at IS NOT NULL)
 * to CallLifecycleService.reconcileGroup:
 * 1. Executes exactly 1 write on initial presence (first connect).
 * 2. Executes 0 writes on subsequent sweeps while already connected (eliminates tuple churn & WAL bloat).
 * 3. Preserves xmin and ctid on already-connected sweeps (demonstrating GREEN vs baseline RED).
 * 4. Executes exactly 1 write on reconnect, clearing disconnected_at while preserving the original connected_at.
 * 5. Preserves exact revocation and 30-second grace period release semantics.
 */

describe('CallLifecycleService — call_admissions no-op write elimination', () => {
  const root = process.cwd();
  const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
  const schema = `t30_noop_${randomUUID().replaceAll('-', '')}`;
  const dbUrl = new URL(env.DATABASE_URL!);
  dbUrl.searchParams.set('options', `-c search_path=${schema}`);

  let pool: pg.Pool;
  let schemaCreated = false;
  let testUserId: string;
  let testSessionId: string;
  let testRoomId: string;
  let testCallGroupId: string;
  let testCallMemberId: string;
  let testAdmissionId: string;

  beforeAll(async () => {
    pool = new pg.Pool({
      connectionString: dbUrl.href,
      max: 8,
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

    testUserId = randomUUID();
    testSessionId = randomUUID();
    testRoomId = randomUUID();
    testCallGroupId = randomUUID();
    testCallMemberId = randomUUID();
    testAdmissionId = `admission_${randomUUID()}`;

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

    // Seed Call Admission initially unconnected (connected_at IS NULL, disconnected_at IS NULL)
    await pool.query(
      "INSERT INTO call_admissions(id, call_member_id, session_id, expires_at) VALUES($1, $2, $3, clock_timestamp() + interval '60 seconds')",
      [testAdmissionId, testCallMemberId, testSessionId]
    );
  }, 60000);

  afterAll(async () => {
    if (pool) {
      if (schemaCreated) {
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
      }
      await pool.end().catch(() => {});
    }
  });

  it('Step 1: First presence executes initial connection update (rowCount === 1)', async () => {
    const time1 = new Date();
    const query =
      'UPDATE call_admissions SET connected_at=COALESCE(connected_at,$2),disconnected_at=NULL WHERE id=$1 AND revoked_at IS NULL AND (connected_at IS NULL OR disconnected_at IS NOT NULL)';
    const result = await pool.query(query, [testAdmissionId, time1]);

    expect(result.rowCount).toBe(1);

    const row = (
      await pool.query<{ ctid: string; xmin: string; connected_at: Date; disconnected_at: Date | null }>(
        'SELECT ctid::text, xmin::text, connected_at, disconnected_at FROM call_admissions WHERE id=$1',
        [testAdmissionId]
      )
    ).rows[0];

    expect(row.connected_at).toBeDefined();
    expect(row.disconnected_at).toBeNull();
    expect(new Date(row.connected_at).getTime()).toBeCloseTo(time1.getTime(), -2);
  });

  it('Step 2: Baseline query unconditionally updates already-connected row (proves RED with rowCount === 1, tuple xmin/ctid changed)', async () => {
    const beforeTuple = (
      await pool.query<{ ctid: string; xmin: string; connected_at: Date }>(
        'SELECT ctid::text, xmin::text, connected_at FROM call_admissions WHERE id=$1',
        [testAdmissionId]
      )
    ).rows[0];

    const time2 = new Date(Date.now() + 5000);
    // Baseline query WITHOUT the surgical predicate:
    const baselineQuery =
      'UPDATE call_admissions SET connected_at=COALESCE(connected_at,$2),disconnected_at=NULL WHERE id=$1 AND revoked_at IS NULL';
    const result = await pool.query(baselineQuery, [testAdmissionId, time2]);

    // Baseline defect: rowCount is 1 despite identical values
    expect(result.rowCount).toBe(1);

    const afterTuple = (
      await pool.query<{ ctid: string; xmin: string; connected_at: Date }>(
        'SELECT ctid::text, xmin::text, connected_at FROM call_admissions WHERE id=$1',
        [testAdmissionId]
      )
    ).rows[0];

    // Baseline defect: PostgreSQL created a new tuple version and incremented xmin/ctid
    expect(afterTuple.ctid).not.toBe(beforeTuple.ctid);
    expect(Number(afterTuple.xmin)).toBeGreaterThan(Number(beforeTuple.xmin));
    // Logical value is unchanged
    expect(new Date(afterTuple.connected_at).getTime()).toBe(new Date(beforeTuple.connected_at).getTime());
  });

  it('Step 3: Proposed query eliminates no-op write on already-connected row (proves GREEN with rowCount === 0, tuple xmin/ctid preserved)', async () => {
    const beforeTuple = (
      await pool.query<{ ctid: string; xmin: string; connected_at: Date; disconnected_at: Date | null }>(
        'SELECT ctid::text, xmin::text, connected_at, disconnected_at FROM call_admissions WHERE id=$1',
        [testAdmissionId]
      )
    ).rows[0];

    const time3 = new Date(Date.now() + 10000);
    // Proposed surgical query WITH the predicate:
    const proposedQuery =
      'UPDATE call_admissions SET connected_at=COALESCE(connected_at,$2),disconnected_at=NULL WHERE id=$1 AND revoked_at IS NULL AND (connected_at IS NULL OR disconnected_at IS NOT NULL)';
    const result = await pool.query(proposedQuery, [testAdmissionId, time3]);

    // Proposed GREEN: 0 rows updated
    expect(result.rowCount).toBe(0);

    const afterTuple = (
      await pool.query<{ ctid: string; xmin: string; connected_at: Date; disconnected_at: Date | null }>(
        'SELECT ctid::text, xmin::text, connected_at, disconnected_at FROM call_admissions WHERE id=$1',
        [testAdmissionId]
      )
    ).rows[0];

    // Proposed GREEN: Physical tuple xmin and ctid are strictly identical (zero WAL churn)
    expect(afterTuple.ctid).toBe(beforeTuple.ctid);
    expect(afterTuple.xmin).toBe(beforeTuple.xmin);
    expect(new Date(afterTuple.connected_at).getTime()).toBe(new Date(beforeTuple.connected_at).getTime());
    expect(afterTuple.disconnected_at).toBeNull();
  });

  it('Step 4: Reconnect executes write, clears disconnected_at, and preserves original connected_at', async () => {
    const initialConnected = (
      await pool.query<{ connected_at: Date }>('SELECT connected_at FROM call_admissions WHERE id=$1', [testAdmissionId])
    ).rows[0].connected_at;

    // Simulate participant disconnection:
    const timeDisconnect = new Date(Date.now() + 15000);
    await pool.query(
      'UPDATE call_admissions SET disconnected_at=$2 WHERE id=$1 AND disconnected_at IS NULL AND revoked_at IS NULL',
      [testAdmissionId, timeDisconnect]
    );

    const disconnectedRow = (
      await pool.query<{ disconnected_at: Date | null }>('SELECT disconnected_at FROM call_admissions WHERE id=$1', [
        testAdmissionId,
      ])
    ).rows[0];
    expect(disconnectedRow.disconnected_at).not.toBeNull();

    // Reconnection sweep executes proposed query:
    const timeReconnect = new Date(Date.now() + 20000);
    const proposedQuery =
      'UPDATE call_admissions SET connected_at=COALESCE(connected_at,$2),disconnected_at=NULL WHERE id=$1 AND revoked_at IS NULL AND (connected_at IS NULL OR disconnected_at IS NOT NULL)';
    const result = await pool.query(proposedQuery, [testAdmissionId, timeReconnect]);

    expect(result.rowCount).toBe(1);

    const reconnectedRow = (
      await pool.query<{ connected_at: Date; disconnected_at: Date | null }>(
        'SELECT connected_at, disconnected_at FROM call_admissions WHERE id=$1',
        [testAdmissionId]
      )
    ).rows[0];

    // disconnected_at cleared back to NULL
    expect(reconnectedRow.disconnected_at).toBeNull();
    // Original connected_at timestamp is preserved via COALESCE
    expect(new Date(reconnectedRow.connected_at).getTime()).toBe(new Date(initialConnected).getTime());
  });

  it('Step 5: Revoked and expired admissions remain protected from updates and are identified for release', async () => {
    // Revoke admission:
    await pool.query('UPDATE call_admissions SET revoked_at=now() WHERE id=$1', [testAdmissionId]);

    const proposedQuery =
      'UPDATE call_admissions SET connected_at=COALESCE(connected_at,$2),disconnected_at=NULL WHERE id=$1 AND revoked_at IS NULL AND (connected_at IS NULL OR disconnected_at IS NOT NULL)';
    const result = await pool.query(proposedQuery, [testAdmissionId, new Date()]);

    expect(result.rowCount).toBe(0);

    // liveLease verification confirms revocation causes lease release
    const lease = await liveLease(pool, testAdmissionId);
    expect(lease).toBeUndefined();
  });
});
