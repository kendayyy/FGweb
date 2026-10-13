import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import type { EncryptedMessageDTO } from '@fg/contracts';
import { CryptoMessageError, decryptLiveMessage, matrixIdentifier } from '../src/features/crypto/client.ts';

let machine: sdk.OlmMachine;
let room: sdk.RoomId;
const conversationId = 'native-client-conversation';
const binding = { version: 1, conversationId, clientMessageId: 'client-first', senderId: 'native-user', senderDeviceId: 'NATIVE', membershipRevision: 7 };
const content = { msgtype: 'm.text', body: '<script>private native text</script>', fg: binding };
before(async () => {
  await sdk.initAsync();
  machine = await sdk.OlmMachine.initialize(new sdk.UserId(await matrixIdentifier('user', binding.senderId)), new sdk.DeviceId(binding.senderDeviceId));
  room = new sdk.RoomId(await matrixIdentifier('room', conversationId));
  const settings = new sdk.EncryptionSettings();
  settings.historyVisibility = sdk.HistoryVisibility.Joined;
  settings.sharingStrategy = sdk.CollectStrategy.onlyTrustedDevices();
  await machine.shareRoomKey(room, [], settings);
});
after(() => { room?.free(); machine?.close(); });
async function encrypt(decoded: unknown = content): Promise<EncryptedMessageDTO> {
  return { id: 'server-first', conversationId, clientMessageId: binding.clientMessageId, senderId: binding.senderId,
    deviceId: binding.senderDeviceId, membershipRevision: binding.membershipRevision, origin: 'LIVE',
    createdAt: '2026-10-10T05:00:00.000Z', attachmentIds: [],
    envelope: { version: 1, protocol: 'MATRIX_MEGOLM', event: JSON.parse(await machine.encryptRoomEvent(room, 'm.room.message', JSON.stringify(decoded))) } };
}
const invalid = (error: unknown) => error instanceof CryptoMessageError && error.code === 'INVALID_MESSAGE';
test('native Megolm returns bound text as data, preserving markup without rendering it', async () => {
  assert.deepEqual(await decryptLiveMessage(machine, await encrypt(), conversationId), content);
});
for (const [field, changed] of Object.entries({ conversationId: 'other', clientMessageId: 'other', senderId: 'other', senderDeviceId: 'OTHER', membershipRevision: 8 })) {
  test(`native authenticated ciphertext rejects decoded ${field} disagreement`, async () => {
    await assert.rejects(decryptLiveMessage(machine, await encrypt({ ...content, fg: { ...binding, [field]: changed } }), conversationId), invalid);
  });
}
test('rejects outer conversation substitution before displaying plaintext', async () => {
  await assert.rejects(decryptLiveMessage(machine, await encrypt(), 'other'), invalid);
});
test('native Megolm rejects modified ciphertext', async () => {
  const message = await encrypt();
  const bytes = Buffer.from(message.envelope.event.ciphertext, 'base64');
  bytes[Math.floor(bytes.length / 2)] ^= 1;
  message.envelope.event.ciphertext = bytes.toString('base64');
  await assert.rejects(decryptLiveMessage(machine, message, conversationId), invalid);
});
test('rejects relay device substitution despite authentic room ciphertext', async () => {
  const message = await encrypt(); message.deviceId = 'OTHER';
  await assert.rejects(decryptLiveMessage(machine, message, conversationId), invalid);
});
test('rejects relay attachment and mention additions absent from encrypted content', async () => {
  const message = await encrypt(); message.attachmentIds = ['foreign-image']; message.mentionedUserIds = ['other'];
  await assert.rejects(decryptLiveMessage(machine, message, conversationId), invalid);
});
test('rejects wrong SDK device store without plaintext fallback', async () => {
  const outsider = await sdk.OlmMachine.initialize(new sdk.UserId(await matrixIdentifier('user', 'outsider')), new sdk.DeviceId('OUTSIDE'));
  try { await assert.rejects(decryptLiveMessage(outsider, await encrypt(), conversationId), invalid); }
  finally { outsider.close(); }
});
