import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { nativePair } from './crypto-native-fixture.ts';

test('additive native SAS validator migration preserves existing protocol rows and journal history', { timeout: 60_000 }, async () => {
  const uuid = randomUUID().replaceAll('-', ''), owned = `crypto_fe_${uuid}`;
  assert.match(owned, /^crypto_fe_[a-f0-9]{32}$/);
  const parent = path.resolve('.cache/chatcrypto-fe'), oldFolder = path.join(parent, `sas-before-${uuid}`);
  fs.mkdirSync(path.join(oldFolder, 'meta'), { recursive: true });
  const oldJournal = JSON.parse(fs.readFileSync('quality/evidence/CHATCRYPTO-FE/sas-sql-original-1.txt', 'utf8'));
  assert.equal(oldJournal.entries.at(-1).idx, 21);
  fs.writeFileSync(path.join(oldFolder, 'meta/_journal.json'), JSON.stringify(oldJournal));
  for (const entry of oldJournal.entries) fs.copyFileSync(`packages/database/migrations/${entry.tag}.sql`, path.join(oldFolder, `${entry.tag}.sql`));
  const env = parseEnv(fs.readFileSync('.env.local', 'utf8')), url = new URL(env.DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${owned}`);
  const pool = new pg.Pool({ connectionString: url.href, connectionTimeoutMillis: 5000 });
  const pair = await nativePair();
  try {
    await pool.query(`CREATE SCHEMA "${owned}"`);
    const client = await pool.connect();
    try { await migrate(drizzle(client), { migrationsFolder: oldFolder, migrationsSchema: owned }); } finally { client.release(); }
    for (const [user, machine] of [['native-alice', pair.alice], ['native-bob', pair.bob]] as const) {
      await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())', [user, `${owned}-${user}@example.invalid`]);
      const keys = pair.deviceKeys[machine.userId.toString()][machine.deviceId.toString()] as { keys: Record<string, string> };
      await pool.query('INSERT INTO chat_crypto_devices(user_id,device_id,ed25519_key,curve25519_key,device_keys) VALUES($1,$2,$3,$4,$5)',
        [user, machine.deviceId.toString(), keys.keys[`ed25519:${machine.deviceId}`], keys.keys[`curve25519:${machine.deviceId}`], keys]);
    }
    await pool.query("INSERT INTO conversations(id,kind,user1_id,user2_id) VALUES('retained-dm','DM','native-alice','native-bob')");
    await pool.query("INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES('retained-dm','E2EE','RECONCILED','KNOWN')");
    const device = await pair.alice.getDevice(pair.bob.userId, pair.bob.deviceId); assert.ok(device);
    const [flow, request] = device.requestVerification([sdk.VerificationMethod.SasV1]); device.free();
    const content = JSON.parse(request.body).messages[pair.bob.userId.toString()].B;
    const event = { eventType: request.event_type, content };
    assert.notEqual(request.txn_id, content.transaction_id);
    const accepted = async () => (await pool.query('SELECT chat_crypto_valid_protocol_event($1,$2,$3) AS valid', [event, 'A', request.txn_id])).rows[0].valid;
    assert.equal(await accepted(), false);
    // Existing historical row follows the old conflated transport format. It
    // is retained byte-for-byte; this does not claim a native flow completed.
    await pool.query("INSERT INTO chat_crypto_protocol_events(id,conversation_id,membership_revision,sender_user_id,sender_device_id,recipient_user_id,recipient_device_id,transaction_id,event,expires_at) VALUES('retained-protocol','retained-dm',1,'native-alice','A','native-bob','B',$1,$2,now()+interval '10 minutes')", [content.transaction_id, event]);
    const snapshot = async () => {
      const rows = (await pool.query("SELECT (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM \"user\" u) AS users,(SELECT jsonb_agg(to_jsonb(d) ORDER BY user_id,device_id) FROM chat_crypto_devices d) AS devices,(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM chat_crypto_protocol_events e) AS events")).rows[0];
      return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    };
    const before = await snapshot(), oldHistory = (await pool.query(`SELECT hash,created_at FROM "${owned}".__drizzle_migrations ORDER BY id`)).rows;
    const upgrade = await pool.connect();
    try { await migrate(drizzle(upgrade), { migrationsFolder: 'packages/database/migrations', migrationsSchema: owned }); } finally { upgrade.release(); }
    assert.equal(await accepted(), true); assert.equal(await snapshot(), before);
    const afterHistory = (await pool.query(`SELECT hash,created_at FROM "${owned}".__drizzle_migrations ORDER BY id`)).rows;
    assert.equal(afterHistory.length, oldHistory.length + 1); assert.deepEqual(afterHistory.slice(0, oldHistory.length), oldHistory);
    await pool.query(fs.readFileSync('packages/database/migrations/0022_chat_crypto_verification_flow.sql', 'utf8'));
    assert.equal(await snapshot(), before); assert.equal(await accepted(), true);
    flow.free(); request.free();
    console.log(JSON.stringify({ realPostgreSQL: true, oldProtocolRowRetained: true, userAndDeviceRowsRetained: true, oldMigrationHistoryRetained: true, functionReapplyIdempotent: true, nativeDistinctIdsAccepted: true, mainApplied: false }));
  } finally {
    pair.close();
    try { assert.match(owned, /^crypto_fe_[a-f0-9]{32}$/); await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`); }
    finally {
      await pool.end();
      assert.equal(fs.realpathSync(oldFolder), path.join(fs.realpathSync(parent), `sas-before-${uuid}`));
      fs.rmSync(oldFolder, { recursive: true });
    }
  }
});
