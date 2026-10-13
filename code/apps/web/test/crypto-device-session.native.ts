import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { NativeDeviceSession, CryptoDeviceError } from '../src/features/crypto/device-session.ts';
import { runAuthCleanups } from '../src/features/auth/lifecycle.ts';
import { matrixIdentifier } from '../src/features/crypto/client.ts';
async function machine() {
  await sdk.initAsync();
  return sdk.OlmMachine.initialize(new sdk.UserId(await matrixIdentifier('user', 'session-user')), new sdk.DeviceId('SESSION'));
}
test('logout aborts transport and suppresses a pending native key result before releasing ownership', async () => {
  let releaseWork!: () => void, started!: () => void, released = 0;
  const barrier = new Promise<void>(resolve => { releaseWork = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const session = new NativeDeviceSession(await machine(), () => { released++; });
  const pending = session.run(async native => { started(); await barrier; return native.identityKeys.ed25519.toBase64(); });
  await entered;
  const rejected = assert.rejects(pending, error => error instanceof CryptoDeviceError && error.code === 'CLOSED');
  const closing = runAuthCleanups();
  assert.equal(session.signal.aborted, true); assert.equal(released, 0);
  releaseWork(); await rejected; await closing;
  assert.equal(released, 1);
  await session.close(); assert.equal(released, 1);
  await assert.rejects(session.run(async native => native.userId.toString()), CryptoDeviceError);
});
test('native operations run serially; a rejected action does not poison later retries', async () => {
  const session = new NativeDeviceSession(await machine(), () => undefined);
  const order: number[] = [];
  let releaseWork!: () => void;
  const barrier = new Promise<void>(resolve => { releaseWork = resolve; });
  const first = session.run(async () => { order.push(1); await barrier; order.push(2); });
  const second = session.run(async native => { order.push(3); assert.equal(native.deviceId.toString(), 'SESSION'); });
  await Promise.resolve(); await Promise.resolve(); assert.deepEqual(order, [1]);
  releaseWork(); await first; await second; assert.deepEqual(order, [1, 2, 3]);
  await assert.rejects(session.run(async () => { throw new Error('owned action failure'); }));
  assert.equal(await session.run(async native => native.deviceId.toString()), 'SESSION');
  await session.close();
});
