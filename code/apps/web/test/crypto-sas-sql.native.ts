import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { nativePair } from './crypto-native-fixture.ts';

test('actual PostgreSQL protocol guard accepts unchanged native SAS transport and flow IDs', { timeout: 60_000 }, async () => {
  const owned = `crypto_fe_${randomUUID().replaceAll('-', '')}`; assert.match(owned, /^crypto_fe_[a-f0-9]{32}$/);
  const env = parseEnv(fs.readFileSync('.env.local', 'utf8')), url = new URL(env.DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${owned}`);
  const pool = new pg.Pool({ connectionString: url.href, connectionTimeoutMillis: 5000 });
  const pair = await nativePair();
  try {
    await pool.query(`CREATE SCHEMA "${owned}"`);
    const client = await pool.connect();
    try { await migrate(drizzle(client), { migrationsFolder: 'packages/database/migrations', migrationsSchema: owned }); } finally { client.release(); }
    const device = await pair.alice.getDevice(pair.bob.userId, pair.bob.deviceId); assert.ok(device);
    const [flow, request] = device.requestVerification([sdk.VerificationMethod.SasV1]); device.free();
    const content = JSON.parse(request.body).messages[pair.bob.userId.toString()].B;
    assert.notEqual(request.txn_id, content.transaction_id);
    const event = { eventType: request.event_type, content };
    const valid = async (value: unknown, sender = 'A', transaction = request.txn_id) => (await pool.query('SELECT chat_crypto_valid_protocol_event($1,$2,$3) AS valid', [value, sender, transaction])).rows[0].valid;
    const nativeAccepted = await valid(event);
    console.log(JSON.stringify({ realPostgreSQL: true, nativeSdk: '18.6.0', nativeTransportEqualsFlow: false, nativeAccepted, flowAliasControlAccepted: await valid(event, 'A', content.transaction_id) }));
    assert.equal(nativeAccepted, true, 'database must accept distinct native transport/flow IDs without rewriting either');
    assert.equal(await valid(event, 'FOREIGN'), false);
    assert.equal(await valid({ ...event, content: { ...content, private_key: 'forbidden-extension' } }), false);
    assert.equal(await valid({ ...event, content: { ...content, transaction_id: '' } }), false);
    assert.equal(await valid({ ...event, content: { ...content, transaction_id: 'x'.repeat(129) } }), false);
    request.free(); flow.free();
  } finally {
    pair.close();
    try { assert.match(owned, /^crypto_fe_[a-f0-9]{32}$/); await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`); }
    finally { await pool.end(); }
  }
});
