import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { matrixIdentifier } from '../src/features/crypto/client.ts';
import { createRecoveryCode, prepareRecoveryBackup, RecoveryError, restoreRecoveryBackup } from '../src/features/crypto/recovery.ts';

let original: sdk.OlmMachine;
let fresh: sdk.OlmMachine;
let room: sdk.RoomId;
let event: string;
let backup: unknown;
const code = createRecoveryCode();
before(async () => {
  await sdk.initAsync();
  const userId = await matrixIdentifier('user', 'recovery-user');
  original = await sdk.OlmMachine.initialize(new sdk.UserId(userId), new sdk.DeviceId('ORIGINAL'));
  fresh = await sdk.OlmMachine.initialize(new sdk.UserId(userId), new sdk.DeviceId('FRESH'));
  room = new sdk.RoomId(await matrixIdentifier('room', 'recovery-room'));
  const settings = new sdk.EncryptionSettings(); settings.historyVisibility = sdk.HistoryVisibility.Joined;
  settings.sharingStrategy = sdk.CollectStrategy.onlyTrustedDevices();
  await original.shareRoomKey(room, [], settings); settings.free();
  const ciphertext = JSON.parse(await original.encryptRoomEvent(room, 'm.room.message', JSON.stringify({ msgtype: 'm.text', body: 'native recovery private history' })));
  event = JSON.stringify({ type: 'm.room.encrypted', sender: userId, event_id: '$recovery-fixture', origin_server_ts: 1, content: ciphertext });
  const prepared = await prepareRecoveryBackup(original, code, 0);
  backup = { version: prepared.version, format: prepared.format, ciphertext: prepared.ciphertext, backupVersion: 1, updatedAt: '2026-10-10T05:00:00.000Z' };
});
after(() => { original?.close(); fresh?.close(); room?.free(); });
const decrypt = async () => {
  const settings = new sdk.DecryptionSettings(sdk.TrustRequirement.Untrusted);
  try { return await fresh.decryptRoomEvent(event, room, settings); } finally { settings.free(); }
};
test('new device without recovery keys cannot decrypt history', async () => { await assert.rejects(decrypt()); });
test('backup contains native encrypted export, no private text, keys or recovery code', () => {
  const serialized = JSON.stringify(backup);
  assert.ok(serialized.includes('BEGIN MEGOLM SESSION DATA'));
  for (const secret of ['native recovery private history', code, original.identityKeys.curve25519.toBase64()]) assert.ok(!serialized.includes(secret));
});
test('wrong independent code and account-password-shaped input fail without granting history', async () => {
  await assert.rejects(restoreRecoveryBackup(fresh, backup, createRecoveryCode()), error => error instanceof RecoveryError && error.code === 'RECOVERY_FAILED');
  await assert.rejects(restoreRecoveryBackup(fresh, backup, 'AccountPassword!123'), error => error instanceof RecoveryError && error.code === 'INVALID_RECOVERY_CODE');
  await assert.rejects(decrypt());
});
test('correct native recovery restores historical room key but not device identity or trust', async () => {
  const ownKey = fresh.identityKeys.ed25519.toBase64();
  await restoreRecoveryBackup(fresh, backup, code);
  const decoded = await decrypt();
  try { assert.equal(JSON.parse(decoded.event).content.body, 'native recovery private history'); } finally { decoded.free(); }
  assert.equal(fresh.deviceId.toString(), 'FRESH');
  assert.equal(fresh.identityKeys.ed25519.toBase64(), ownKey);
  assert.notEqual(ownKey, original.identityKeys.ed25519.toBase64());
  const oldDevice = await fresh.getDevice(original.userId, original.deviceId);
  try { assert.ok(!oldDevice?.isVerified()); } finally { oldDevice?.free(); }
});
