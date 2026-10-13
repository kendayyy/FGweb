import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { CryptoDeviceSchema } from '@fg/contracts';
import { CryptoApi } from './api';
import { matrixIdentifier } from './client';
import { uploadNativeDevice } from './transport';

export class CryptoBootstrapError extends Error {
  constructor(public readonly code: 'REVOKED_DEVICE' | 'IDENTITY_MISMATCH' | 'UNREGISTERED_DEVICE') { super(code); this.name = 'CryptoBootstrapError'; }
}

/** Call inside NativeDeviceSession.run; ready requires actual server registration. */
export async function bootstrapNativeDevice(machine: sdk.OlmMachine, api: CryptoApi, userId: string, signal?: AbortSignal): Promise<{ deviceId: string }> {
  // Historical keys are shared only by the reviewed current/cohort flows.
  machine.roomKeyRequestsEnabled = false;
  machine.roomKeyForwardingEnabled = false;
  if (machine.userId.toString() !== await matrixIdentifier('user', userId)) throw new CryptoBootstrapError('IDENTITY_MISMATCH');
  const deviceId = machine.deviceId.toString();
  function validate(input: unknown) {
    const devices = CryptoDeviceSchema.array().max(100).parse(input);
    const device = devices.find(item => item.deviceId === deviceId);
    if (device?.revokedAt) throw new CryptoBootstrapError('REVOKED_DEVICE');
    if (device && (device.deviceKeys.user_id !== machine.userId.toString() ||
      device.deviceKeys.keys[`curve25519:${deviceId}`] !== machine.identityKeys.curve25519.toBase64() ||
      device.deviceKeys.keys[`ed25519:${deviceId}`] !== machine.identityKeys.ed25519.toBase64())) throw new CryptoBootstrapError('IDENTITY_MISMATCH');
    return device;
  }
  validate(await api.invoke('GET', '/api/v1/crypto/devices', {}, undefined, signal));
  for (const request of await machine.outgoingRequests()) {
    try { if (request.type === sdk.RequestType.KeysUpload) await uploadNativeDevice(machine, api, request, signal); }
    finally { request.free(); }
  }
  if (!validate(await api.invoke('GET', '/api/v1/crypto/devices', {}, undefined, signal))) throw new CryptoBootstrapError('UNREGISTERED_DEVICE');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return { deviceId };
}
