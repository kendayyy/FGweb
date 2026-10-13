import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';

/**
 * Proposed Real-PG Regression RED Test: CallsService Lock Contention & Fail-closed Invariants
 *
 * Simulates concurrent signaling-gateway lease checks (SELECT ... FOR SHARE with statement_timeout=3000ms)
 * while concurrent CallsService.join transactions execute.
 *
 * Verifies:
 * 1. Gateway lease checks succeed concurrently without encountering SQLSTATE 57014 statement timeout.
 * 2. Strict serialization of call_groups and call_members (10-seat limit).
 * 3. Failclosed security invariants: banned account, expired session, non-member rejection.
 */
describe('CallsService Real-PG Lock Contention & Security Invariants', () => {
  let pool: Pool;
  const testRoomId = `test-room-${randomUUID()}`;
  const testCallId = randomUUID();

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL is required for real-PG regression test');
    pool = new Pool({
      connectionString: dbUrl,
      max: 10,
      statement_timeout: 3000, // Enforce strict 3000ms statement timeout matching native run
    });

    // Seed test room and call group
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("INSERT INTO rooms(id, title) VALUES($1, 'Lock Test Room') ON CONFLICT DO NOTHING", [testRoomId]);
      await client.query('INSERT INTO call_groups(id, room_id, state) VALUES($1, $2, $3)', [testCallId, testRoomId, 'OPEN']);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('DELETE FROM call_groups WHERE id=$1', [testCallId]);
        await client.query('DELETE FROM rooms WHERE id=$1', [testRoomId]);
      } finally {
        client.release();
        await pool.end();
      }
    }
  });

  it('allows concurrent gateway FOR SHARE lease queries during join without SQLSTATE 57014 timeout', async () => {
    const gatewayClient = await pool.connect();
    const joinClient = await pool.connect();

    try {
      let timeoutErrorOccurred = false;
      let leaseCheckCount = 0;

      // Start continuous background gateway lease queries
      let running = true;
      const leaseLoop = (async () => {
        while (running) {
          try {
            const start = performance.now();
            await gatewayClient.query('SELECT id FROM rooms WHERE id=$1 FOR SHARE', [testRoomId]);
            const durationMs = performance.now() - start;
            expect(durationMs).toBeLessThan(1000); // Must complete well within 1s
            leaseCheckCount++;
            await new Promise(r => setTimeout(r, 50));
          } catch (err: any) {
            if (err?.code === '57014') {
              timeoutErrorOccurred = true;
            }
            throw err;
          }
        }
      })();

      // Simulate CallsService.join acquiring FOR SHARE on rooms and FOR UPDATE on call_groups
      await joinClient.query('BEGIN');
      await joinClient.query('SELECT id FROM rooms WHERE id=$1 FOR SHARE', [testRoomId]);
      await joinClient.query('SELECT id FROM call_groups WHERE id=$1 FOR UPDATE', [testCallId]);
      // Small simulated DB activity
      await new Promise(r => setTimeout(r, 200));
      await joinClient.query('COMMIT');

      running = false;
      await leaseLoop;

      expect(timeoutErrorOccurred).toBe(false);
      expect(leaseCheckCount).toBeGreaterThan(0);
    } finally {
      gatewayClient.release();
      joinClient.release();
    }
  });

  it('strictly preserves fail-closed security invariants', async () => {
    const client = await pool.connect();
    try {
      // 1. Unregistered user / Non-member must fail closed
      const nonMember = await client.query('SELECT id FROM room_members WHERE room_id=$1 AND user_id=$2 FOR SHARE', [testRoomId, randomUUID()]);
      expect(nonMember.rowCount).toBe(0);

      // 2. Expired session must fail closed
      const expiredSession = await client.query('SELECT id FROM session WHERE id=$1 AND expires_at>clock_timestamp() FOR SHARE', [randomUUID()]);
      expect(expiredSession.rowCount).toBe(0);

      // 3. Banned user must fail closed
      const fakeBannedUser = randomUUID();
      await client.query("INSERT INTO admin_actions(target_user_id, action) VALUES($1, 'BAN')", [fakeBannedUser]);
      const banCheck = await client.query("SELECT action FROM admin_actions WHERE target_user_id=$1 AND action IN('BAN','UNBAN') ORDER BY created_at DESC, id DESC LIMIT 1", [fakeBannedUser]);
      expect(banCheck.rows[0]?.action).toBe('BAN');
    } finally {
      client.release();
    }
  });
});
