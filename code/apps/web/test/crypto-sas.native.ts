import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { nativePair } from './crypto-native-fixture.ts';
import { decryptLiveMessage, matrixIdentifier } from '../src/features/crypto/client.ts';

test('native SAS requires both confirmations and authenticates remote Megolm sender keys', async () => {
  const pair = await nativePair();
  const { alice, bob } = pair;
  try {
    const knownBob = await alice.getDevice(bob.userId, bob.deviceId); assert.ok(knownBob);
    assert.equal(knownBob.isVerified(), false);
    const [request, initial] = knownBob.requestVerification([sdk.VerificationMethod.SasV1]); knownBob.free();
    await pair.send(alice, initial); initial.free();
    const received = bob.getVerificationRequest(alice.userId, request.flowId); assert.ok(received);
    const ready = received.acceptWithMethods([sdk.VerificationMethod.SasV1]); assert.ok(ready);
    await pair.send(bob, ready); ready.free();
    const started = await request.startSas(); assert.ok(started);
    const [aliceSas, start] = started; await pair.send(alice, start); start.free();
    const bobSas = bob.getVerification(alice.userId, request.flowId); assert.ok(bobSas instanceof sdk.Sas);
    const accept = bobSas.accept(); assert.ok(accept); await pair.send(bob, accept); accept.free();
    await pair.flush();
    assert.ok(aliceSas.canBePresented()); assert.ok(bobSas.canBePresented());
    assert.deepEqual(aliceSas.decimals(), bobSas.decimals());
    for (const outgoing of await aliceSas.confirm()) { await pair.send(alice, outgoing); outgoing.free(); }
    const unconfirmed = await bob.getDevice(alice.userId, alice.deviceId); assert.ok(unconfirmed);
    assert.equal(unconfirmed.isVerified(), false); unconfirmed.free();
    for (const outgoing of await bobSas.confirm()) { await pair.send(bob, outgoing); outgoing.free(); }
    await pair.flush();
    assert.ok(aliceSas.isDone()); assert.ok(bobSas.isDone());
    for (const [owner, peer] of [[alice, bob], [bob, alice]]) {
      const trusted = await owner.getDevice(peer.userId, peer.deviceId); assert.ok(trusted); assert.equal(trusted.isVerified(), true); trusted.free();
    }
    assert.ok(pair.transactions.length >= 8);
    assert.ok(pair.transactions.every(event => event.flowId === request.flowId));
    assert.ok(pair.transactions.every(event => event.transportId !== event.flowId));
    assert.equal(new Set(pair.transactions.map(event => event.transportId)).size, pair.transactions.length);
    const claim = await alice.getMissingSessions([bob.userId]); if (claim) { await pair.send(alice, claim); claim.free(); }
    const room = new sdk.RoomId(await matrixIdentifier('room', 'native-sas'));
    const settings = new sdk.EncryptionSettings(); settings.historyVisibility = sdk.HistoryVisibility.Joined;
    settings.sharingStrategy = sdk.CollectStrategy.onlyTrustedDevices();
    for (const outgoing of await alice.shareRoomKey(room, [bob.userId], settings)) { await pair.send(alice, outgoing); outgoing.free(); }
    const content = { msgtype: 'm.text', body: 'native verified remote sender', fg: { version: 1, conversationId: 'native-sas', clientMessageId: 'sas-message', senderId: 'native-alice', senderDeviceId: 'A', membershipRevision: 1 } };
    const event = JSON.parse(await alice.encryptRoomEvent(room, 'm.room.message', JSON.stringify(content)));
    const message = { id: 'sas-server', conversationId: 'native-sas', senderId: 'native-alice', clientMessageId: 'sas-message', deviceId: 'A', membershipRevision: 1,
      origin: 'LIVE' as const, createdAt: '2026-10-10T05:00:00.000Z', attachmentIds: [], envelope: { version: 1 as const, protocol: 'MATRIX_MEGOLM' as const, event } };
    assert.deepEqual(await decryptLiveMessage(bob, message, 'native-sas'), content);
    const trusted = await bob.getDevice(alice.userId, alice.deviceId); assert.ok(trusted);
    await trusted.setLocalTrust(sdk.LocalTrust.Unset); trusted.free();
    await assert.rejects(decryptLiveMessage(bob, message, 'native-sas'), error => error instanceof Error && 'code' in error && error.code === 'UNVERIFIED_DEVICE');
    aliceSas.free(); bobSas.free(); request.free(); received.free(); settings.free(); room.free();
  } finally { pair.close(); }
});
