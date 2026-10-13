import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { canonicalSignedPayload } from '../../api/src/modules/chat-crypto/matrix-signatures.ts';
import { matrixIdentifier } from '../src/features/crypto/client.ts';
import { decryptLegacyMessage } from '../src/features/crypto/legacy.ts';
import { canonicalJson } from '../src/features/crypto/canonical-json.ts';
import { createRecoveryCode, prepareRecoveryBackup, restoreRecoveryBackup } from '../src/features/crypto/recovery.ts';

test('browser public canonical JSON matches server Unicode code-point order and rejects invalid signing values', () => {
  const value = { '\u{10000}': ['Tiếng Việt', 1, false, null], '\ue000': { '\u{1f600}': 'ảnh', a: 2 } };
  assert.equal(canonicalJson(value), canonicalSignedPayload(value));
  for (const invalid of [1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '\ud800', { '\udfff': 'invalid-key' }, undefined]) assert.throws(() => canonicalJson(invalid));
});

test('native legacy archive authenticates importer separately and binds original source digest and metadata', async () => {
  await sdk.initAsync();
  const conversationId = 'native-legacy-reader', importerUserId = 'native-importer';
  const machine = await sdk.OlmMachine.initialize(new sdk.UserId(await matrixIdentifier('user', importerUserId)), new sdk.DeviceId('IMPORTER'));
  const room = new sdk.RoomId(await matrixIdentifier('room', conversationId));
  const settings = new sdk.EncryptionSettings();
  settings.historyVisibility = sdk.HistoryVisibility.Joined;
  settings.sharingStrategy = sdk.CollectStrategy.onlyTrustedDevices();
  try {
    await machine.shareRoomKey(room, [], settings);
    const source = { version: 1 as const, conversationId, messageId: 'old-message', senderId: 'original-author', clientMessageId: 'original-client', type: 'TEXT' as const,
      content: '<script>old plaintext authorship claim</script>', replyToId: 'older-reply', mentionedUserIds: ['old-mention'],
      createdAt: '2026-09-01T03:00:00.000Z', updatedAt: '2026-09-01T03:00:00.000Z', attachments: [] };
    const provenance = { candidateId: 'native-candidate', cohortId: 'verified-old-cohort', importerUserId, importerDeviceId: 'IMPORTER',
      originalSha256: createHash('sha256').update(canonicalSignedPayload(source)).digest('base64').replace(/=+$/, '') };
    const content = { msgtype: 'org.fg.legacy_import.v1' as const, fg: { version: 1 as const, conversationId, membershipRevision: 3, ...provenance }, source, images: [] };
    const message = { id: source.messageId, conversationId, senderId: source.senderId, clientMessageId: source.clientMessageId, deviceId: 'IMPORTER',
      membershipRevision: 3, origin: 'LEGACY_IMPORT' as const, createdAt: source.createdAt, attachmentIds: [], importProvenance: provenance,
      envelope: { version: 1 as const, protocol: 'MATRIX_MEGOLM' as const, event: JSON.parse(await machine.encryptRoomEvent(room, 'm.room.message', JSON.stringify(content))) } };
    assert.deepEqual(await decryptLegacyMessage(machine, message, conversationId), content);
    for (const changed of [
      { ...message, senderId: importerUserId },
      { ...message, clientMessageId: 'different-client' },
      { ...message, createdAt: '2026-09-02T03:00:00.000Z' },
      { ...message, membershipRevision: 4 },
      { ...message, attachmentIds: ['foreign-image'] },
      { ...message, importProvenance: { ...provenance, cohortId: 'another-cohort' } },
      { ...message, importProvenance: { ...provenance, importerUserId: source.senderId } },
      { ...message, importProvenance: { ...provenance, originalSha256: 'A'.repeat(43) } },
    ]) await assert.rejects(decryptLegacyMessage(machine, changed, conversationId));
    await assert.rejects(decryptLegacyMessage(machine, message, 'another-conversation'));
    const changedContent = { ...content, source: { ...source, content: 'changed inside archive' } };
    const changedEnvelope = { ...message, envelope: { ...message.envelope, event: JSON.parse(await machine.encryptRoomEvent(room, 'm.room.message', JSON.stringify(changedContent))) } };
    await assert.rejects(decryptLegacyMessage(machine, changedEnvelope, conversationId));
    await assert.rejects(decryptLegacyMessage(machine, { ...message, origin: 'LIVE' }, conversationId));
    const fresh = await sdk.OlmMachine.initialize(new sdk.UserId(await matrixIdentifier('user', importerUserId)), new sdk.DeviceId('RECOVERED'));
    try {
      await assert.rejects(decryptLegacyMessage(fresh, message, conversationId, true));
      const code = createRecoveryCode(), prepared = await prepareRecoveryBackup(machine, code, 0);
      const backup = { version: prepared.version, format: prepared.format, ciphertext: prepared.ciphertext, backupVersion: 1, updatedAt: '2026-10-10T05:00:00.000Z' };
      await assert.rejects(restoreRecoveryBackup(fresh, backup, createRecoveryCode()));
      await assert.rejects(decryptLegacyMessage(fresh, message, conversationId, true));
      await restoreRecoveryBackup(fresh, backup, code);
      assert.deepEqual(await decryptLegacyMessage(fresh, message, conversationId, true), content);
      await assert.rejects(decryptLegacyMessage(fresh, message, conversationId));
      assert.equal(fresh.deviceId.toString(), 'RECOVERED');
      const device = await fresh.getDevice(machine.userId, machine.deviceId);
      try { assert.notEqual(device?.isVerified(), true); } finally { device?.free(); }
    } finally { fresh.close(); }
  } finally { settings.free(); room.free(); machine.close(); }
});
