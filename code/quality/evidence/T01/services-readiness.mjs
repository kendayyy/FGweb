import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import assert from 'node:assert/strict';
import pg from 'pg';
import Redis from 'ioredis';
import { RoomServiceClient } from 'livekit-server-sdk';

try {
  const location = path.resolve(process.env.FG_LOCAL_ENV_PATH || 'infra/.env.local');
  const root = process.cwd()+path.sep;
  assert.ok(location.startsWith(root), 'local configuration must be in code');
  const env = parseEnv(fs.readFileSync(location, 'utf8'));
  for (const name of ['POSTGRES_USER','POSTGRES_DB','POSTGRES_PASSWORD','REDISCLI_AUTH','LIVEKIT_API_KEY','LIVEKIT_API_SECRET']) assert.ok(env[name], 'missing local service credential');
  const db = new pg.Client({ host: '127.0.0.1', port: 55432, user: env.POSTGRES_USER, database: env.POSTGRES_DB, password: env.POSTGRES_PASSWORD, connectionTimeoutMillis: 5000, statement_timeout: 3000 });
  try {
    await db.connect();
    const result = await db.query('SELECT 1 AS ready, current_setting(\'server_version_num\')::int AS version');
    assert.equal(result.rows[0].ready, 1);
    assert.ok(result.rows[0].version >= 170000 && result.rows[0].version < 180000);
    console.log('PASS: PostgreSQL 17 authenticated SQL');
  } finally { await db.end(); }
  const redis = new Redis({ host: '127.0.0.1', port: 56379, password: env.REDISCLI_AUTH, lazyConnect: true, connectTimeout: 5000, retryStrategy: () => null, maxRetriesPerRequest: 1 });
  redis.on('error', () => {});
  try { await redis.connect(); assert.equal(await redis.ping(), 'PONG'); console.log('PASS: Redis authenticated PING'); }
  finally { redis.disconnect(); }
  const response = await fetch('http://127.0.0.1:57880/', { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  const client = new RoomServiceClient('http://127.0.0.1:57880', env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  assert.ok(Array.isArray(await client.listRooms()));
  console.log('PASS: LiveKit HTTP and authenticated SDK readiness (no media capacity claim)');
} catch {
  console.error('FAIL: local service configuration or authenticated readiness unavailable');
  process.exitCode = 1;
}
