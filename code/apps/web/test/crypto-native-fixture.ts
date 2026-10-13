import assert from 'node:assert/strict';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { SendCryptoVerificationSchema } from '@fg/contracts';
import { matrixIdentifier } from '../src/features/crypto/client.ts';

/** Native protocol unit fixture. In-memory delivery is not API/DB/E2E evidence. */
export async function nativePair() {
  await sdk.initAsync();
  const alice = await sdk.OlmMachine.initialize(new sdk.UserId(await matrixIdentifier('user', 'native-alice')), new sdk.DeviceId('A'));
  const bob = await sdk.OlmMachine.initialize(new sdk.UserId(await matrixIdentifier('user', 'native-bob')), new sdk.DeviceId('B'));
  const machines = [alice, bob];
  const fg = (id: string) => id === alice.userId.toString() ? 'native-alice' : id === bob.userId.toString() ? 'native-bob' : (() => { throw new Error('Unknown native fixture recipient'); })();
  const deviceKeys: Record<string, Record<string, unknown>> = {};
  const prekeys = new Map<string, Record<string, unknown>>();
  const transactions: { type: string; transportId: string; flowId?: string }[] = [];
  async function send(sender: sdk.OlmMachine, request: sdk.OutgoingRequest) {
    const body = JSON.parse(request.body);
    let response: unknown = {};
    if (request.type === sdk.RequestType.KeysUpload) {
      deviceKeys[sender.userId.toString()] = { [sender.deviceId.toString()]: body.device_keys };
      prekeys.set(sender.userId.toString(), body.one_time_keys);
      response = { one_time_key_counts: { signed_curve25519: Object.keys(body.one_time_keys).length } };
    } else if (request.type === sdk.RequestType.KeysQuery) {
      response = { device_keys: deviceKeys, failures: {} };
    } else if (request.type === sdk.RequestType.KeysClaim) {
      const claimed: Record<string, Record<string, unknown>> = {};
      for (const [id, devices] of Object.entries(body.one_time_keys as Record<string, Record<string, string>>)) {
        const available = prekeys.get(id)!;
        for (const [device, algorithm] of Object.entries(devices)) {
          assert.equal(algorithm, 'signed_curve25519');
          const key = Object.keys(available)[0]; assert.ok(key);
          claimed[id] ??= {}; claimed[id][device] = { [key]: available[key] }; delete available[key];
        }
      }
      response = { one_time_keys: claimed, failures: {} };
    } else if (request.type === sdk.RequestType.ToDevice) {
      const outgoing = request as sdk.ToDeviceRequest;
      for (const [id, devices] of Object.entries(body.messages as Record<string, Record<string, Record<string, unknown>>>)) {
        const recipient = machines.find(machine => machine.userId.toString() === id)!; assert.ok(recipient);
        for (const [deviceId, content] of Object.entries(devices)) {
          assert.equal(deviceId, recipient.deviceId.toString());
          if (outgoing.event_type.startsWith('m.key.verification.')) {
            SendCryptoVerificationSchema.parse({ conversationId: 'native-sas', membershipRevision: 1, deviceId: sender.deviceId.toString(),
              transactionId: outgoing.txn_id, recipientUserId: fg(id), recipientDeviceId: deviceId, eventType: outgoing.event_type, content });
            transactions.push({ type: outgoing.event_type, transportId: outgoing.txn_id, flowId: String(content.transaction_id) });
          }
          const lists = new sdk.DeviceLists();
          try { await recipient.receiveSyncChanges(JSON.stringify([{ sender: sender.userId.toString(), type: outgoing.event_type, content }]), lists, new Map()); }
          finally { lists.free(); }
        }
      }
    } else { throw new Error(`Unsupported native fixture request: ${request.type}`); }
    assert.ok(request.id); await sender.markRequestAsSent(request.id, request.type, JSON.stringify(response));
  }
  async function flush() {
    for (let round = 0; round < 16; round++) {
      let sent = 0;
      for (const machine of machines) {
        for (const request of await machine.outgoingRequests()) {
          await send(machine, request); request.free(); sent++;
        }
      }
      if (!sent) return;
    }
    throw new Error('Native protocol fixture did not settle within bounded rounds');
  }
  await flush();
  for (const machine of machines) await machine.updateTrackedUsers(machines.map(peer => peer.userId));
  await flush();
  return { alice, bob, send, flush, transactions, deviceKeys, close: () => machines.forEach(machine => machine.close()) };
}
