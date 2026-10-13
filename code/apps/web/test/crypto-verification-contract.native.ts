import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { SendCryptoVerificationSchema } from '@fg/contracts';
import { matrixIdentifier } from '../src/features/crypto/client.ts';

test('locked relay contract accepts native SAS transport IDs without changing flow IDs', async () => {
  await sdk.initAsync();
  const alice = await sdk.OlmMachine.initialize(new sdk.UserId(await matrixIdentifier('user', 'sas-alice')), new sdk.DeviceId('A'));
  const bob = await sdk.OlmMachine.initialize(new sdk.UserId(await matrixIdentifier('user', 'sas-bob')), new sdk.DeviceId('B'));
  try {
    const keys: Record<string, Record<string, unknown>> = {};
    for (const machine of [alice, bob]) {
      const upload = (await machine.outgoingRequests()).find(request => request.type === sdk.RequestType.KeysUpload)!;
      const body = JSON.parse(upload.body);
      keys[machine.userId.toString()] = { [machine.deviceId.toString()]: body.device_keys };
      await machine.markRequestAsSent(upload.id!, upload.type, JSON.stringify({ one_time_key_counts: {} }));
    }
    for (const machine of [alice, bob]) {
      await machine.updateTrackedUsers([alice.userId, bob.userId]);
      for (const request of await machine.outgoingRequests()) {
        if (request.type === sdk.RequestType.KeysQuery) await machine.markRequestAsSent(request.id!, request.type, JSON.stringify({ device_keys: keys, failures: {} }));
      }
    }
    const device = await alice.getDevice(bob.userId, bob.deviceId);
    assert.ok(device); assert.equal(device.isVerified(), false);
    const [flow, initial] = device.requestVerification([sdk.VerificationMethod.SasV1]);
    device.free();
    const content = JSON.parse(initial.body).messages[bob.userId.toString()].B;
    const payload = { conversationId: 'sas-dm', membershipRevision: 1, deviceId: 'A', transactionId: initial.txn_id,
      recipientUserId: 'sas-bob', recipientDeviceId: 'B', eventType: initial.event_type, content };
    const first = SendCryptoVerificationSchema.safeParse(payload);
    console.log(JSON.stringify({ stage: 'request', nativeTransportEqualsFlow: initial.txn_id === content.transaction_id, contractAccepted: first.success }));
    const lists = new sdk.DeviceLists();
    await bob.receiveSyncChanges(JSON.stringify([{ sender: alice.userId.toString(), type: initial.event_type, content }]), lists, new Map());
    lists.free();
    const received = bob.getVerificationRequest(alice.userId, flow.flowId);
    assert.ok(received);
    const ready = received.acceptWithMethods([sdk.VerificationMethod.SasV1]);
    assert.ok(ready instanceof sdk.ToDeviceRequest);
    const readyContent = JSON.parse(ready.body).messages[alice.userId.toString()].A;
    const accepted = SendCryptoVerificationSchema.safeParse({ ...payload, deviceId: 'B', recipientUserId: 'sas-alice', recipientDeviceId: 'A',
      transactionId: ready.txn_id, eventType: ready.event_type, content: readyContent });
    console.log(JSON.stringify({ stage: 'ready', nativeTransportEqualsFlow: ready.txn_id === readyContent.transaction_id, sameFlowAsRequest: readyContent.transaction_id === content.transaction_id, contractAccepted: accepted.success }));
    ready.free(); received.free(); initial.free(); flow.free();
    assert.equal(first.success, true, 'native SAS request must pass unchanged contract');
    assert.equal(accepted.success, true, 'native SAS ready must pass without rewriting transport or verification flow');
  } finally { alice.close(); bob.close(); }
});
