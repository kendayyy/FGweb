import pg from 'pg';
import fs from 'node:fs';
import { parseEnv } from 'node:util';

const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

async function run() {
  const barrierClient = await pool.connect();
  await barrierClient.query('BEGIN');
  await barrierClient.query(`SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_social_pair', LEAST($1::text, $2::text), GREATEST($1::text, $2::text))::text, 0::bigint))`, ['user-ÿ', 'user-A']);

  const client1 = await pool.connect();
  const p1 = client1.query('BEGIN').then(() => client1.query(`SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_social_pair', LEAST($1::text, $2::text), GREATEST($1::text, $2::text))::text, 0::bigint))`, ['user-ÿ', 'user-A']));

  const client2 = await pool.connect();
  const p2 = client2.query('BEGIN').then(() => client2.query(`SELECT pg_advisory_xact_lock(hashtextextended(json_build_array('fg_social_pair', LEAST($1::text, $2::text), GREATEST($1::text, $2::text))::text, 0::bigint))`, ['user-ÿ', 'user-A']));

  let lockCount = 0;
  for (let i = 0; i < 30; i++) {
    const locks = await pool.query(
      `SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`
    );
    lockCount = locks.rows[0].count;
    if (lockCount >= 2) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.log('Polled Lock Count:', lockCount);

  await barrierClient.query('COMMIT');
  await Promise.all([p1, p2]);

  barrierClient.release();
  client1.release();
  client2.release();
  await pool.end();
}
run();
