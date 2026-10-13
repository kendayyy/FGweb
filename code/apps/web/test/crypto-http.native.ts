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
import { CryptoConversationStateSchema, CryptoSyncResponseSchema, EncryptedMessageSchema } from '@fg/contracts';
import { CryptoApi } from '../src/features/crypto/api.ts';
import { NativeCryptoTransport } from '../src/features/crypto/transport.ts';
import { decryptLiveMessage, matrixIdentifier } from '../src/features/crypto/client.ts';
import { bootstrapNativeDevice, CryptoBootstrapError } from '../src/features/crypto/bootstrap.ts';
import { NativeDeviceSession } from '../src/features/crypto/device-session.ts';
import { CryptoConversation, CryptoConversationError } from '../src/features/crypto/conversation.ts';
import { CryptoVerificationInbox } from '../src/features/crypto/verification.ts';
import { encryptAttachmentBytes, decryptAttachmentBytes } from '../src/features/crypto/attachments.ts';
import { CryptoRecoveryClient } from '../src/features/crypto/recovery-client.ts';
import { createRecoveryCode } from '../src/features/crypto/recovery.ts';

test('frontend adapter carries native SAS and Megolm through actual AppModule/auth/isolated PostgreSQL', { timeout: 90_000 }, async () => {
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
    const [alice, bob] = machines;
    await assert.rejects(bootstrapNativeDevice(alice, apis[0], users[1]), error => error instanceof CryptoBootstrapError && error.code === 'IDENTITY_MISMATCH');
    const replacement = await sdk.OlmMachine.initialize(new sdk.UserId(await matrixIdentifier('user', users[0])), new sdk.DeviceId('A'));
    try { await assert.rejects(bootstrapNativeDevice(replacement, apis[0], users[0]), error => error instanceof CryptoBootstrapError && error.code === 'IDENTITY_MISMATCH'); }
    finally { replacement.close(); }
    const state = CryptoConversationStateSchema.parse(await apis[0].invoke('GET', '/api/v1/crypto/conversations/:id/state', { id: 'native-dm' }));
    assert.equal(state.mode, 'E2EE'); assert.equal(state.membershipRevision, 3);
    console.log(JSON.stringify({ phase: 'compiled-api-bootstrap', realAppModuleStarted: true, twoRealSignedSessions: true, twoNativeDevicesRegistered: true, realStateRevision: state.membershipRevision, isolatedPostgreSQL: true, mainMutation: false }));
    const initialSync = await apis[0].invoke('GET', '/api/v1/crypto/sync', {}, { deviceId: 'A', limit: 1 });
    assert.ok(initialSync && typeof initialSync === 'object');
    const actualAvailable = Number((await pool.query("SELECT count(*) FROM chat_crypto_one_time_keys WHERE user_id='native-alice' AND device_id='A' AND claimed_at IS NULL")).rows[0].count);
    assert.ok(actualAvailable > 0);
    assert.deepEqual(Reflect.get(initialSync, 'oneTimeKeyCounts'), { signed_curve25519: actualAvailable }, 'native client must receive actual self-device prekey count, never guess it');
    const adapters = await Promise.all(machines.map((machine, index) => NativeCryptoTransport.create(machine, apis[index], { conversationId: 'native-dm', membershipRevision: state.membershipRevision, userIds: users })));
    for (const machine of machines) sessions.push(new NativeDeviceSession(machine, () => { closed.add(machine); }));
    const clients = sessions.map((session, index) => new CryptoConversation(session, apis[index], 'native-dm', users[index], users));
    await assert.rejects(clients[0].sendText({ clientMessageId: 'blocked-unverified', body: 'Must not reach server before device verification' }), error => error instanceof CryptoConversationError && error.code === 'UNVERIFIED_DEVICE');
    assert.equal(Number((await pool.query('SELECT count(*) FROM messages')).rows[0].count), 0);
    const staleParticipants = new CryptoConversation(sessions[0], apis[0], 'native-dm', users[0], [...users, 'former-native-member']);
    await assert.rejects(staleParticipants.devices(), error => error instanceof CryptoConversationError && error.code === 'PARTICIPANTS_CHANGED');
    assert.ok(CryptoConversationStateSchema.parse(await apis[0].invoke('GET', '/api/v1/crypto/conversations/:id/state', { id: 'native-dm' })).eligibleDeviceIds.includes('A'), 'Obsolete peer denial is not self device/room revocation');
    for (const [index, machine] of machines.entries()) {
      const query = machine.queryKeysForUsers(machines.map(peer => peer.userId));
      await adapters[index].send(query); query.free();
    }
    async function sync(index: number) {
      const machine = machines[index], api = apis[index];
      const synced = CryptoSyncResponseSchema.parse(await api.invoke('GET', '/api/v1/crypto/sync', {}, { deviceId: machine.deviceId.toString(), limit: 100 }));
      for (const item of synced.verification) {
        const stored = (await pool.query('SELECT conversation_id,membership_revision FROM chat_crypto_protocol_events WHERE id=$1', [item.id])).rows[0];
        assert.equal(Reflect.get(item, 'conversationId'), stored.conversation_id);
        assert.equal(Reflect.get(item, 'membershipRevision'), Number(stored.membership_revision));
      }
      const events = [];
      for (const item of synced.encrypted.items) events.push({ sender: await matrixIdentifier('user', item.senderUserId), type: 'm.room.encrypted', content: item.content });
      for (const item of synced.verification) events.push({ sender: await matrixIdentifier('user', item.senderUserId), type: item.event.eventType, content: item.event.content });
      const lists = new sdk.DeviceLists();
      try { await machine.receiveSyncChanges(JSON.stringify(events), lists, new Map(Object.entries(synced.oneTimeKeyCounts))); } finally { lists.free(); }
      const ids = [...synced.encrypted.items, ...synced.verification].map(item => item.id);
      if (ids.length) await api.invoke('POST', '/api/v1/crypto/sync/ack', {}, { deviceId: machine.deviceId.toString(), eventIds: ids });
    }
    async function flush() {
      for (let round = 0; round < 16; round++) {
        let sent = 0;
        for (const [index, machine] of machines.slice(0, adapters.length).entries()) {
          for (const request of await machine.outgoingRequests()) {
            if (request.type !== sdk.RequestType.ToDevice && request.type !== sdk.RequestType.KeysUpload) continue;
            await adapters[index].send(request); request.free(); sent++;
          }
        }
        await sync(0); await sync(1);
        if (!sent && round > 0) return;
      }
      throw new Error('Owned actual HTTP SAS protocol did not settle');
    }
    const verifiers = sessions.map((session, index) => new CryptoVerificationInbox(session, apis[index], users[index]));
    const keyA = await verifiers[0].begin('native-dm', users[1], 'B');
    const received = await verifiers[1].poll(); assert.equal(received.length, 1); assert.equal(received[0].status, 'REQUESTED');
    const keyB = received[0].key; assert.equal(received[0].flowId, JSON.parse(keyA)[1]);
    await verifiers[1].act(keyB, 'ACCEPT');
    assert.equal((await verifiers[0].poll()).find(view => view.key === keyA)?.status, 'READY');
    await verifiers[0].act(keyA, 'START');
    assert.equal((await verifiers[1].poll()).find(view => view.key === keyB)?.needsSasAccept, true);
    await verifiers[1].act(keyB, 'ACCEPT_SAS');
    let viewsA = await verifiers[0].poll(), viewsB = await verifiers[1].poll();
    for (let round = 0; round < 8 && (viewsA[0].status !== 'SAS' || viewsB[0].status !== 'SAS'); round++) { viewsA = await verifiers[0].poll(); viewsB = await verifiers[1].poll(); }
    assert.equal(viewsA[0].status, 'SAS'); assert.equal(viewsB[0].status, 'SAS');
    assert.deepEqual(viewsA[0].decimals, viewsB[0].decimals); assert.equal(viewsA[0].decimals?.length, 3);
    await verifiers[0].act(keyA, 'CONFIRM'); await verifiers[1].poll();
    const beforeConfirmation = await bob.getDevice(alice.userId, alice.deviceId); assert.ok(beforeConfirmation); assert.equal(beforeConfirmation.isVerified(), false); beforeConfirmation.free();
    await verifiers[1].act(keyB, 'CONFIRM');
    for (let round = 0; round < 8; round++) {
      viewsA = await verifiers[0].poll(); viewsB = await verifiers[1].poll();
      if (viewsA[0].status === 'VERIFIED' && viewsB[0].status === 'VERIFIED') break;
    }
    assert.equal(viewsA[0].status, 'VERIFIED'); assert.equal(viewsB[0].status, 'VERIFIED');
    const trusted = await alice.getDevice(bob.userId, bob.deviceId); assert.ok(trusted?.isVerified()); trusted.free();
    console.log(JSON.stringify({ actualNativeVerificationInbox: true, incomingContextAndFreshNativeKeys: true, realSasDecimalsMatch: true, bilateralConfirmationRequired: true }));
    const claim = await alice.getMissingSessions([bob.userId]); assert.ok(claim); await adapters[0].send(claim); claim.free();
    const room = new sdk.RoomId(state.matrixRoomId), settings = new sdk.EncryptionSettings();
    settings.historyVisibility = sdk.HistoryVisibility.Joined; settings.sharingStrategy = sdk.CollectStrategy.onlyTrustedDevices();
    for (const request of await alice.shareRoomKey(room, [bob.userId], settings)) { await adapters[0].send(request); request.free(); }
    await sync(1);
    const content = { msgtype: 'm.text', body: 'actual frontend HTTP private ciphertext fixture', fg: { version: 1, conversationId: 'native-dm', clientMessageId: 'actual-fe-first', senderId: users[0], senderDeviceId: 'A', membershipRevision: state.membershipRevision } };
    const event = JSON.parse(await alice.encryptRoomEvent(room, 'm.room.message', JSON.stringify(content)));
    const payload = { clientMessageId: content.fg.clientMessageId, deviceId: 'A', membershipRevision: state.membershipRevision, envelope: { version: 1, protocol: 'MATRIX_MEGOLM', event } };
    const sent = EncryptedMessageSchema.parse(await apis[0].invoke('POST', '/api/v1/crypto/conversations/:id/messages', { id: 'native-dm' }, payload));
    assert.deepEqual(await decryptLiveMessage(bob, sent, 'native-dm'), content);
    const retry = EncryptedMessageSchema.parse(await apis[0].invoke('POST', '/api/v1/crypto/conversations/:id/messages', { id: 'native-dm' }, payload)); assert.equal(retry.id, sent.id);
    const row = (await pool.query('SELECT content,crypto_envelope FROM messages WHERE id=$1', [sent.id])).rows[0];
    assert.equal(row.content, ''); assert.ok(!JSON.stringify(row).includes(content.body));
    const clientInput = { clientMessageId: 'conversation-client-text', body: 'Native conversation client private fixture', mentionedUserIds: [users[1]], reply: { messageId: sent.id, previewText: content.body } };
    const fromClient = await clients[0].sendText(clientInput); await sync(1);
    const decodedClient = await clients[1].decrypt(fromClient);
    assert.equal(decodedClient.body, clientInput.body); assert.deepEqual(decodedClient.fg.reply, clientInput.reply); assert.deepEqual(decodedClient.fg.mentionedUserIds, clientInput.mentionedUserIds);
    assert.equal((await clients[0].sendText(clientInput)).id, fromClient.id);
    await assert.rejects(clients[0].sendText({ ...clientInput, body: 'Different body with same retry ID' }), error => error instanceof CryptoConversationError && error.code === 'RETRY_CHANGED');
    const privateRow = (await pool.query('SELECT content,crypto_envelope FROM messages WHERE id=$1', [fromClient.id])).rows[0];
    for (const privateText of [clientInput.body, clientInput.reply.previewText]) assert.equal(JSON.stringify(privateRow).includes(privateText), false);
    console.log(JSON.stringify({ actualConversationClient: true, unverifiedSendBlockedBeforeServerWrite: true, nativeTextReplyMentionEncrypted: true, exactCipherRetryDedup: true, changedRetryRejected: true }));
    const sharp = (await import('sharp')).default;
    const pixels = new Uint8Array(await sharp({ create: { width: 16, height: 12, channels: 3, background: { r: 21, g: 140, b: 74 } } }).webp().toBuffer());
    const sealed = { clientUploadId: randomUUID(), ...encryptAttachmentBytes(pixels), width: 16, height: 12 };
    const sealedSecond = { clientUploadId: randomUUID(), ...encryptAttachmentBytes(pixels), width: 16, height: 12 };
    const preparedImages = [];
    for (const image of [sealed, sealedSecond]) {
      const receipt = await apis[0].uploadAttachment('native-dm', { clientUploadId: image.clientUploadId, deviceId: 'A', membershipRevision: state.membershipRevision,
        ciphertextSize: image.ciphertext.byteLength, ciphertextSha256: image.secret.hashes.sha256 }, image.ciphertext);
      preparedImages.push({ image, id: receipt.id });
    }
    preparedImages.sort((a, b) => b.id.localeCompare(a.id));
    const sealedImages = preparedImages.map(item => item.image);
    const imageInput = { clientMessageId: 'native-image-client', body: 'Owned native private image fixture' };
    const imageMessage = await clients[0].sendImages(imageInput, sealedImages); await sync(1);
    const imageContent = await clients[1].decrypt(imageMessage); assert.equal(imageContent.msgtype, 'm.image');
    if (imageContent.msgtype !== 'm.image') throw new Error('Expected native image content');
    const downloaded = await apis[1].downloadAttachment('native-dm', imageContent.images[0].attachmentId);
    assert.deepEqual(downloaded, sealedImages[0].ciphertext); assert.notDeepEqual(downloaded, pixels);
    assert.deepEqual(decryptAttachmentBytes(downloaded, imageContent.images[0].secret), pixels);
    assert.deepEqual(imageContent.images.map(image => image.attachmentId), preparedImages.map(item => item.id), 'User-selected order stays inside native ciphertext');
    assert.equal((await clients[0].sendImages(imageInput, sealedImages)).id, imageMessage.id);
    const imageRow = (await pool.query('SELECT content,crypto_envelope FROM messages WHERE id=$1', [imageMessage.id])).rows[0];
    assert.equal(imageRow.content, ''); assert.equal(JSON.stringify(imageRow).includes(sealed.secret.key.k), false);
    assert.equal(JSON.stringify(imageRow).includes(imageInput.body), false);
    const tampered = new Uint8Array(downloaded); tampered[0] ^= 1;
    assert.throws(() => decryptAttachmentBytes(tampered, imageContent.images[0].secret));
    console.log(JSON.stringify({ nativeImageThroughActualMultipartApi: true, actualOpaqueDownload: true, nativeImageDecryptAndTamperRejection: true, exactImageRetryDedup: true, noImageKeyOrBodyInDatabase: true }));
    const recovery = new CryptoRecoveryClient(sessions[0], apis[0]), recoveryCode = createRecoveryCode();
    assert.equal(await recovery.current(), null);
    const storedBackup = await recovery.backup(recoveryCode, 0); assert.equal(storedBackup.backupVersion, 1);
    assert.equal(storedBackup.ciphertext.includes(recoveryCode), false); assert.equal(storedBackup.ciphertext.includes(clientInput.body), false);
    await assert.rejects(recovery.backup(createRecoveryCode(), 0), error => error instanceof Error && Reflect.get(error, 'status') === 409);
    assert.equal((await recovery.current())?.ciphertext, storedBackup.ciphertext);
    assert.equal(await new CryptoRecoveryClient(sessions[1], apis[1]).current(), null);
    const restoredMachine = await sdk.OlmMachine.initialize(new sdk.UserId(await matrixIdentifier('user', users[0])), new sdk.DeviceId('RECOVERED'));
    machines.push(restoredMachine); const restoredSession = new NativeDeviceSession(restoredMachine, () => closed.add(restoredMachine)); sessions.push(restoredSession);
    const newIdentity = restoredMachine.identityKeys.ed25519.toBase64(), restoredClient = new CryptoRecoveryClient(restoredSession, apis[0]);
    await assert.rejects(restoredClient.restore(createRecoveryCode())); await assert.rejects(restoredClient.restore('ResetPassword!123'));
    const restoredCounts = await restoredClient.restore(recoveryCode); assert.ok(restoredCounts.total > 0); assert.ok(restoredCounts.imported > 0);
    assert.equal(restoredMachine.identityKeys.ed25519.toBase64(), newIdentity); assert.equal(restoredMachine.deviceId.toString(), 'RECOVERED');
    const recoveredSender = await restoredMachine.getDevice(bob.userId, bob.deviceId);
    try { assert.equal(recoveredSender?.isVerified() ?? false, false); } finally { recoveredSender?.free(); }
    const recoveryRows = (await pool.query('SELECT ciphertext FROM chat_crypto_recovery_backups')).rows;
    assert.equal(recoveryRows.length, 1); assert.equal(recoveryRows[0].ciphertext, storedBackup.ciphertext);
    console.log(JSON.stringify({ actualRecoveryCiphertextCasAndOwnerIsolation: true, wrongCodeAndPasswordResetNoBypass: true, correctNativeRoomKeyImport: true, freshIdentityAndNoDeviceTrust: true }));
    assert.ok(Number((await pool.query('SELECT count(*) FROM chat_crypto_protocol_events')).rows[0].count) >= 8);
    const claimedIds = new Set<string>();
    const availableBeforeDrain = Number((await pool.query("SELECT count(*) FROM chat_crypto_one_time_keys WHERE user_id='native-bob' AND device_id='B' AND claimed_at IS NULL")).rows[0].count);
    assert.ok(availableBeforeDrain > 0 && availableBeforeDrain <= 100);
    for (let remaining = 0; remaining < availableBeforeDrain; remaining++) {
      const result = await apis[0].invoke('POST', '/api/v1/crypto/keys/claim', {}, {
        conversationId: 'native-dm', membershipRevision: state.membershipRevision, deviceId: 'A', targets: [{ userId: users[1], deviceId: 'B' }],
      }) as { keys: { keyId: string }[] };
      assert.equal(result.keys.length, 1); assert.ok(!claimedIds.has(result.keys[0].keyId)); claimedIds.add(result.keys[0].keyId);
    }
    assert.ok(claimedIds.size > 0);
    assert.equal(Number((await pool.query("SELECT count(*) FROM chat_crypto_one_time_keys WHERE user_id='native-bob' AND device_id='B' AND claimed_at IS NULL")).rows[0].count), 0);
    const depleted = CryptoSyncResponseSchema.parse(await apis[1].invoke('GET', '/api/v1/crypto/sync', {}, { deviceId: 'B', limit: 1 }));
    assert.equal(depleted.oneTimeKeyCounts.signed_curve25519, 0);
    await assert.rejects(apis[0].invoke('POST', '/api/v1/crypto/keys/claim', {}, {
      conversationId: 'native-dm', membershipRevision: state.membershipRevision, deviceId: 'A', targets: [{ userId: users[1], deviceId: 'B' }],
    }), error => error instanceof Error && Reflect.get(error, 'status') === 409);
    await sync(1); await flush();
    const restocked = CryptoSyncResponseSchema.parse(await apis[1].invoke('GET', '/api/v1/crypto/sync', {}, { deviceId: 'B', limit: 1 }));
    const actualRestocked = Number((await pool.query("SELECT count(*) FROM chat_crypto_one_time_keys WHERE user_id='native-bob' AND device_id='B' AND claimed_at IS NULL")).rows[0].count);
    assert.ok(actualRestocked > 0 && actualRestocked <= 100); assert.equal(restocked.oneTimeKeyCounts.signed_curve25519, actualRestocked);
    const replenished = await apis[0].invoke('POST', '/api/v1/crypto/keys/claim', {}, {
      conversationId: 'native-dm', membershipRevision: state.membershipRevision, deviceId: 'A', targets: [{ userId: users[1], deviceId: 'B' }],
    }) as { keys: { keyId: string }[] };
    assert.equal(replenished.keys.length, 1); assert.ok(!claimedIds.has(replenished.keys[0].keyId));
    await assert.rejects(apis[0].invoke('GET', '/api/v1/crypto/sync', {}, { deviceId: 'B', limit: 1 }), error => error instanceof Error && Reflect.get(error, 'status') === 403);
    await apis[1].invoke('DELETE', '/api/v1/crypto/devices/:deviceId', { deviceId: 'B' });
    await assert.rejects(bootstrapNativeDevice(bob, apis[1], users[1]), error => error instanceof CryptoBootstrapError && error.code === 'REVOKED_DEVICE');
    await assert.rejects(apis[1].invoke('GET', '/api/v1/crypto/sync', {}, { deviceId: 'B', limit: 1 }), error => error instanceof Error && Reflect.get(error, 'status') === 403);
    console.log(JSON.stringify({ actualPrekeyDepletion: true, nativeSignedReplenishment: true, realCountMatchesDatabase: true, foreignAndRevokedCountReadsDenied: true }));
    room.free(); settings.free();
    console.log(JSON.stringify({ realAppModule: true, realSignedAuth: true, isolatedPostgreSQL: true, nativeSdk: '18.6.0', nativeSasCompleted: true, plaintextAbsentInMessageRow: true, dedup: true, mainMutation: false, headedUi: false }));
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
