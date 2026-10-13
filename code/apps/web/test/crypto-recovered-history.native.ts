import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import * as client from '../src/features/crypto/client.ts';
import { attachRecoveryProvenanceStore, createRecoveryCode, prepareRecoveryBackup, restoreRecoveryBackup } from '../src/features/crypto/recovery.ts';
import { EncryptedMessageSchema } from '@fg/contracts';

test('explicit native recovery reads possessed history with unverified provenance and never grants device trust', async () => {
  await sdk.initAsync();
  const user = await client.matrixIdentifier('user', 'recovered-history-user'), roomId = await client.matrixIdentifier('room', 'recovered-history-room');
  const original = await sdk.OlmMachine.initialize(new sdk.UserId(user), new sdk.DeviceId('OLD'));
  const fresh = await sdk.OlmMachine.initialize(new sdk.UserId(user), new sdk.DeviceId('NEW'));
  const withoutCode = await sdk.OlmMachine.initialize(new sdk.UserId(user), new sdk.DeviceId('NO_CODE'));
  const room = new sdk.RoomId(roomId), settings = new sdk.EncryptionSettings();
  try {
    settings.historyVisibility = sdk.HistoryVisibility.Joined; settings.sharingStrategy = sdk.CollectStrategy.onlyTrustedDevices();
    await original.shareRoomKey(room, [], settings);
    const content = { msgtype: 'm.text', body: 'Previously possessed native history', fg: { version: 1, conversationId: 'recovered-history-room', clientMessageId: 'recovered-message', senderId: 'recovered-history-user', senderDeviceId: 'OLD', membershipRevision: 1 } };
    const event = JSON.parse(await original.encryptRoomEvent(room, 'm.room.message', JSON.stringify(content)));
    const message = EncryptedMessageSchema.parse({ origin: 'LIVE', id: 'old-message', conversationId: content.fg.conversationId, senderId: content.fg.senderId, clientMessageId: content.fg.clientMessageId, deviceId: 'OLD', membershipRevision: 1,
      envelope: { version: 1, protocol: 'MATRIX_MEGOLM', event }, createdAt: '2026-10-10T08:00:00.000Z', attachmentIds: [] });
    const code = createRecoveryCode(), prepared = await prepareRecoveryBackup(original, code, 0);
    const backup = { ...prepared, expectedVersion: undefined, backupVersion: 1, updatedAt: '2026-10-10T08:00:00.000Z' }; delete backup.expectedVersion;
    await assert.rejects(client.decryptLiveMessage(fresh, message, message.conversationId));
    await assert.rejects(restoreRecoveryBackup(withoutCode, backup, createRecoveryCode()));
    await assert.rejects(restoreRecoveryBackup(withoutCode, backup, 'ResetPassword!123'));
    const oldIdentity = fresh.identityKeys.ed25519.toBase64();
    // This is a public-metadata storage double; all room keys/decryption remain native.
    const metadata = new Map<string, string>();
    const storage = { getItem: (key: string) => metadata.get(key) ?? null, setItem: (key: string, value: string) => { metadata.set(key, value); } };
    attachRecoveryProvenanceStore(fresh, storage, 'new-device-public-manifest');
    await restoreRecoveryBackup(fresh, backup, code);
    await assert.rejects(client.decryptLiveMessage(fresh, message, message.conversationId));
    const recovered = Reflect.get(client, 'decryptRecoveredHistory');
    assert.equal(typeof recovered, 'function', 'Missing explicit recovered history path; strict live trust must remain unchanged');
    assert.deepEqual(await recovered(fresh, message, message.conversationId), content);
    const manifest = metadata.get('new-device-public-manifest'); assert.ok(manifest);
    assert.equal(manifest.includes(code), false); assert.equal(manifest.includes('session_key'), false);
    attachRecoveryProvenanceStore(fresh, storage, 'new-device-public-manifest');
    assert.deepEqual(await recovered(fresh, message, message.conversationId), content);
    metadata.set('no-code-device-public-manifest', manifest);
    attachRecoveryProvenanceStore(withoutCode, storage, 'no-code-device-public-manifest');
    await assert.rejects(recovered(withoutCode, message, message.conversationId), 'A copied public manifest cannot supply native keys');
    metadata.set('new-device-public-manifest', '{broken');
    attachRecoveryProvenanceStore(fresh, storage, 'new-device-public-manifest');
    await assert.rejects(recovered(fresh, message, message.conversationId));
    attachRecoveryProvenanceStore(fresh, storage, 'other-device-public-manifest');
    await assert.rejects(recovered(fresh, message, message.conversationId));
    metadata.set('new-device-public-manifest', manifest); attachRecoveryProvenanceStore(fresh, storage, 'new-device-public-manifest');
    assert.deepEqual(await recovered(fresh, message, message.conversationId), content);
    attachRecoveryProvenanceStore(withoutCode, { getItem: () => null, setItem: () => { throw new Error('Owned metadata quota failure'); } }, 'quota-failed-device');
    await assert.rejects(restoreRecoveryBackup(withoutCode, backup, code));
    await assert.rejects(recovered(withoutCode, message, message.conversationId), 'Failed public-manifest persistence must not grant recovered provenance');
    await assert.rejects(recovered(withoutCode, message, message.conversationId));
    await assert.rejects(recovered(fresh, { ...message, clientMessageId: 'changed-binding' }, message.conversationId));
    await assert.rejects(recovered(fresh, { ...message, deviceId: 'WRONG_DEVICE' }, message.conversationId));
    const corrupted = { ...message.envelope.event, ciphertext: (message.envelope.event.ciphertext.startsWith('A') ? 'B' : 'A') + message.envelope.event.ciphertext.slice(1) };
    await assert.rejects(recovered(fresh, { ...message, envelope: { ...message.envelope, event: corrupted } }, message.conversationId));
    await assert.rejects(recovered(fresh, message, 'other-room'));
    assert.equal(fresh.deviceId.toString(), 'NEW'); assert.equal(fresh.identityKeys.ed25519.toBase64(), oldIdentity);
    const device = await fresh.getDevice(original.userId, original.deviceId);
    try { assert.equal(device?.isVerified() ?? false, false); } finally { device?.free(); }
    const later = JSON.parse(await original.encryptRoomEvent(room, 'm.room.message', JSON.stringify({ ...content, body: 'Later same session message' })));
    // A new epoch, never possessed in the backup, cannot become recoverable.
    await original.invalidateGroupSession(room); await original.shareRoomKey(room, [], settings);
    const newEpoch = JSON.parse(await original.encryptRoomEvent(room, 'm.room.message', JSON.stringify(content)));
    assert.notEqual(newEpoch.session_id, later.session_id);
    await assert.rejects(recovered(fresh, { ...message, envelope: { ...message.envelope, event: newEpoch } }, message.conversationId));
  } finally { original.close(); fresh.close(); withoutCode.close(); room.free(); settings.free(); }
});
