import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { makeSignature } from 'better-auth/crypto';
import { NestFactory } from '@nestjs/core';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { CryptoConversationStateSchema } from '@fg/contracts';
import { CryptoApi } from '../src/features/crypto/api.ts';
import { matrixIdentifier } from '../src/features/crypto/client.ts';
import { bootstrapNativeDevice, CryptoBootstrapError } from '../src/features/crypto/bootstrap.ts';
import { NativeDeviceSession } from '../src/features/crypto/device-session.ts';
import { CryptoVerificationInbox, CryptoVerificationError } from '../src/features/crypto/verification.ts';

test('historical migration context exposes only authorized cohorts and eligible native devices', { timeout: 90_000 }, async () => {
  const owned = `crypto_fe_${randomUUID().replaceAll('-', '')}`;
  assert.match(owned, /^crypto_fe_[a-f0-9]{32}$/);
  const parent = path.resolve('.runtime/chatcrypto-fe'), storage = path.join(parent, owned);
  const saved = { ...process.env };
  const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
  const url = new URL(env.DATABASE_URL); url.searchParams.set('options', `-c search_path=${owned}`);
  const pool = new pg.Pool({ connectionString: url.href, connectionTimeoutMillis: 5000 });
  const secret = 'fe-owned-synthetic-auth-secret-not-a-real-account-32';
  const origin = 'http://localhost:5173';
  const users = ['native-alice', 'native-bob'];
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
  const machines: sdk.OlmMachine[] = [];
  const sessions: NativeDeviceSession[] = [], closed = new Set<sdk.OlmMachine>();
  try {
    assert.equal((await pool.query("SELECT to_regclass('public.chat_crypto_state') AS value")).rows[0].value, null);
    await pool.query(`CREATE SCHEMA "${owned}"`);
    const client = await pool.connect();
    try { await migrate(drizzle(client), { migrationsFolder: 'packages/database/migrations', migrationsSchema: owned }); }
    finally { client.release(); }
    for (const user of users) {
      await pool.query('INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES($1,$1,$2,true,now(),now())', [user, `${owned}-${user}@example.invalid`]);
      await pool.query('INSERT INTO "session"(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$1,now()+interval \'1 day\',now(),now())', [`${owned}-${user}`, user]);
    }
    await pool.query("INSERT INTO conversations(id,kind,user1_id,user2_id) VALUES('native-dm','DM','native-alice','native-bob')");
    await pool.query("INSERT INTO chat_crypto_state(conversation_id,mode,migration_state,history_status) VALUES('native-dm','E2EE','RECONCILED','KNOWN')");
    for (const user of users) await pool.query("INSERT INTO chat_crypto_membership_intervals(id,conversation_id,user_id,start_revision,joined_at) VALUES($1,'native-dm',$2,1,now())", [`interval-${user}`, user]);
    Object.assign(process.env, { ...env, DATABASE_URL: url.href, PUBLIC_ORIGIN: origin, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: secret,
      FG_UPLOADS_DIR: path.join(storage, 'legacy'), FG_CRYPTO_OBJECTS_DIR: path.join(storage, 'opaque'),
      FG_CRYPTO_TRANSPORT_MAX_ROWS_PER_USER: '10000', FG_CRYPTO_TRANSPORT_MAX_PAYLOAD_BYTES_PER_USER: '100000000' });
    const { AppModule } = await import('../../api/dist/app.module.js');
    const { configureFgHttpBodyParsers } = await import('../../api/dist/modules/chat-crypto/http-body-parsers.js');
    app = await NestFactory.create(AppModule, { logger: false, bodyParser: false }); configureFgHttpBodyParsers(app);
    await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
    const apis: CryptoApi[] = [];
    await sdk.initAsync();
    for (const [index, user] of users.entries()) {
      const token = `${owned}-${user}`, signature = await makeSignature(token, secret);
      const cookie = `better-auth.session_token=${token}.${signature}`;
      apis.push(new CryptoApi((input, init) => fetch(new URL(String(input), base), { ...init, headers: { ...init?.headers, Cookie: cookie, Origin: origin } })));
      machines.push(await sdk.OlmMachine.initialize(new sdk.UserId(await matrixIdentifier('user', user)), new sdk.DeviceId(index ? 'B' : 'A')));
      assert.deepEqual(await bootstrapNativeDevice(machines[index], apis[index], user), { deviceId: index ? 'B' : 'A' });
    }
    const [alice] = machines;
    await assert.rejects(bootstrapNativeDevice(alice, apis[0], users[1]), error => error instanceof CryptoBootstrapError && error.code === 'IDENTITY_MISMATCH');
    const replacement = await sdk.OlmMachine.initialize(new sdk.UserId(await matrixIdentifier('user', users[0])), new sdk.DeviceId('A'));
    try { await assert.rejects(bootstrapNativeDevice(replacement, apis[0], users[0]), error => error instanceof CryptoBootstrapError && error.code === 'IDENTITY_MISMATCH'); }
    finally { replacement.close(); }
    const state = CryptoConversationStateSchema.parse(await apis[0].invoke('GET', '/api/v1/crypto/conversations/:id/state', { id: 'native-dm' }));
    assert.equal(state.mode, 'E2EE'); assert.equal(state.membershipRevision, 3);
    console.log(JSON.stringify({ phase: 'compiled-api-bootstrap', realAppModuleStarted: true, twoRealSignedSessions: true, twoNativeDevicesRegistered: true, realStateRevision: state.membershipRevision, isolatedPostgreSQL: true, mainMutation: false }));
    await pool.query("UPDATE chat_crypto_state SET migration_state='LEGACY_PENDING' WHERE conversation_id='native-dm'");
    await pool.query("INSERT INTO chat_crypto_history_cohorts(id,conversation_id,verified_at,verification_basis) VALUES('visible-cohort','native-dm',clock_timestamp(),'EXPLICIT_RECONCILIATION'),('foreign-cohort','native-dm',clock_timestamp(),'EXPLICIT_RECONCILIATION')");
    await pool.query("INSERT INTO chat_crypto_cohort_members(cohort_id,conversation_id,user_id) VALUES('visible-cohort','native-dm','native-alice'),('visible-cohort','native-dm','native-bob'),('foreign-cohort','native-dm','native-bob')");
    await pool.query("INSERT INTO messages(id,conversation_id,sender_id,type,content,client_message_id,encryption_mode) VALUES('context-old','native-dm','native-alice','TEXT','owned synthetic old source','old-client','LEGACY_PENDING')");
    await pool.query("INSERT INTO chat_crypto_legacy_migrations(message_id,conversation_id,cohort_id,original_sha256,state) VALUES('context-old','native-dm','visible-cohort',$1,'PREPARED')", ['A'.repeat(43)]);
    await pool.query("INSERT INTO messages(id,conversation_id,sender_id,type,content,client_message_id,encryption_mode) VALUES('context-foreign','native-dm','native-bob','TEXT','owned synthetic foreign source','foreign-client','LEGACY_PENDING')");
    await pool.query("INSERT INTO chat_crypto_legacy_migrations(message_id,conversation_id,cohort_id,original_sha256,state) VALUES('context-foreign','native-dm','foreign-cohort',$1,'PREPARED')", ['B'.repeat(43)]);
    const read = async () => Reflect.get(await apis[0].invoke('GET', '/api/v1/crypto/conversations/:id/state', { id: 'native-dm' }) as object, 'legacyCohorts');
    const cohorts = await read();
    assert.deepEqual(cohorts, [{ cohortId: 'visible-cohort', sourceCount: 1, members: [{ userId: users[0], deviceIds: ['A'] }, { userId: users[1], deviceIds: ['B'] }] }]);
    const bobState = CryptoConversationStateSchema.parse(await apis[1].invoke('GET', '/api/v1/crypto/conversations/:id/state', { id: 'native-dm' }));
    assert.deepEqual(bobState.legacyCohorts?.map(cohort => cohort.cohortId), ['foreign-cohort', 'visible-cohort']);
    for (const machine of machines) sessions.push(new NativeDeviceSession(machine, () => { closed.add(machine); }));
    const verifiers = sessions.map((session, index) => new CryptoVerificationInbox(session, apis[index], users[index]));
    await assert.rejects(verifiers[0].begin('native-dm', users[1], 'B'), error => error instanceof CryptoVerificationError && error.code === 'FLOW_CONTEXT_CHANGED');
    await assert.rejects(verifiers[0].begin('native-dm', users[1], 'B', 'foreign-cohort'), error => error instanceof CryptoVerificationError && error.code === 'FLOW_CONTEXT_CHANGED');
    const keyA = await verifiers[0].begin('native-dm', users[1], 'B', 'visible-cohort');
    const received = await verifiers[1].poll(); assert.equal(received.length, 1); assert.equal(received[0].status, 'REQUESTED');
    assert.equal(received[0].cohortId, 'visible-cohort'); const keyB = received[0].key;
    await verifiers[1].act(keyB, 'ACCEPT'); await verifiers[0].poll();
    await verifiers[0].act(keyA, 'START'); await verifiers[1].poll();
    await verifiers[1].act(keyB, 'ACCEPT_SAS');
    let viewsA = await verifiers[0].poll(), viewsB = await verifiers[1].poll();
    for (let round = 0; round < 8 && (viewsA[0].status !== 'SAS' || viewsB[0].status !== 'SAS'); round++) { viewsA = await verifiers[0].poll(); viewsB = await verifiers[1].poll(); }
    assert.equal(viewsA[0].status, 'SAS'); assert.equal(viewsB[0].status, 'SAS'); assert.deepEqual(viewsA[0].decimals, viewsB[0].decimals);
    await verifiers[0].act(keyA, 'CONFIRM'); await verifiers[1].poll();
    const untrusted = await machines[1].getDevice(machines[0].userId, machines[0].deviceId); assert.ok(untrusted); assert.equal(untrusted.isVerified(), false); untrusted.free();
    await verifiers[1].act(keyB, 'CONFIRM');
    for (let round = 0; round < 8; round++) { viewsA = await verifiers[0].poll(); viewsB = await verifiers[1].poll(); if (viewsA[0].status === 'VERIFIED' && viewsB[0].status === 'VERIFIED') break; }
    assert.equal(viewsA[0].status, 'VERIFIED'); assert.equal(viewsB[0].status, 'VERIFIED');
    console.log(JSON.stringify({ actualCohortScopedNativeSas: true, bilateralConfirmationRequired: true, foreignAndMissingCohortRejected: true }));
    const late = await sdk.OlmMachine.initialize(new sdk.UserId(await matrixIdentifier('user', users[1])), new sdk.DeviceId('LATE'));
    machines.push(late); await bootstrapNativeDevice(late, apis[1], users[1]);
    assert.deepEqual(await read(), cohorts, 'New devices cannot inherit historical cohort entitlement');
    await apis[1].invoke('DELETE', '/api/v1/crypto/devices/:deviceId', { deviceId: 'B' });
    const unavailable = await read();
    assert.deepEqual(unavailable, [{ cohortId: 'visible-cohort', sourceCount: 1, members: [{ userId: users[0], deviceIds: ['A'] }, { userId: users[1], deviceIds: [] }] }]);
    await pool.query("UPDATE chat_crypto_state SET history_status='UNKNOWN' WHERE conversation_id='native-dm'");
    assert.deepEqual(await read(), [], 'Unknown history must not imply verified migration context');
    console.log(JSON.stringify({ authorizedCohortOnly: true, actualNativeDeviceCutoff: true, actualRevocationObserved: true, unknownHistoryFailClosed: true, mainMutation: false }));
  } finally {
    for (const session of sessions) await session.close();
    for (const machine of machines) if (!closed.has(machine)) machine.close();
    try { await app?.close(); }
    finally {
      try {
        assert.match(owned, /^crypto_fe_[a-f0-9]{32}$/);
        await pool.query(`DROP SCHEMA IF EXISTS "${owned}" CASCADE`);
        assert.equal((await pool.query("SELECT to_regclass('public.chat_crypto_state') AS value")).rows[0].value, null);
        if (fs.existsSync(storage)) {
          assert.equal(fs.realpathSync(storage), path.join(fs.realpathSync(parent), owned));
          fs.rmSync(storage, { recursive: true });
        }
      } finally { await pool.end(); process.env = saved; }
    }
  }
});
