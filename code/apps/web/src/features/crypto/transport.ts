import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { CryptoClaimResponseSchema, CryptoKeysResponseSchema, CryptoSyncResponseSchema, SendCryptoToDeviceSchema, SendCryptoVerificationSchema } from '@fg/contracts';
import { CryptoApi } from './api';
import { matrixIdentifier } from './client';

export interface CryptoTransportContext {
  conversationId: string;
  membershipRevision: number;
  cohortId?: string;
  userIds: readonly string[];
}

export class CryptoTransportError extends Error {
  constructor() { super('CRYPTO_TRANSPORT_REJECTED'); this.name = 'CryptoTransportError'; }
}

/** Device registration/replenishment does not invent a conversation context. */
export async function uploadNativeDevice(machine: sdk.OlmMachine, api: CryptoApi, request: sdk.OutgoingRequest, signal?: AbortSignal): Promise<void> {
  if (request.type !== sdk.RequestType.KeysUpload || !request.id || signal?.aborted) throw new CryptoTransportError();
  const body = JSON.parse(request.body), deviceId = machine.deviceId.toString();
  if (body.device_keys) {
    await api.invoke('POST', '/api/v1/crypto/devices', {}, { deviceId, deviceKeys: body.device_keys, oneTimeKeys: body.one_time_keys ?? {} }, signal);
  } else if (body.one_time_keys && Object.keys(body.one_time_keys).length) {
    await api.invoke('POST', '/api/v1/crypto/devices/:deviceId/one-time-keys', { deviceId }, { oneTimeKeys: body.one_time_keys }, signal);
  }
  const synced = CryptoSyncResponseSchema.parse(await api.invoke('GET', '/api/v1/crypto/sync', {}, { deviceId, limit: 1 }, signal));
  // Count reads never acknowledge queue entries.
  if (signal?.aborted) throw new CryptoTransportError();
  await machine.markRequestAsSent(request.id, request.type, JSON.stringify({ one_time_key_counts: synced.oneTimeKeyCounts }));
}

/** Native transaction IDs remain unchanged, including across recipient chunks. */
export class NativeCryptoTransport {
  private readonly users = new Map<string, string>();
  private constructor(private readonly machine: sdk.OlmMachine, private readonly api: CryptoApi, private readonly context: CryptoTransportContext) {}

  static async create(machine: sdk.OlmMachine, api: CryptoApi, context: CryptoTransportContext): Promise<NativeCryptoTransport> {
    const adapter = new NativeCryptoTransport(machine, api, { ...context, userIds: [...context.userIds] });
    for (const id of context.userIds) adapter.users.set(await matrixIdentifier('user', id), id);
    if (!adapter.users.has(machine.userId.toString())) throw new CryptoTransportError();
    return adapter;
  }

  private userId(matrixId: string): string {
    const id = this.users.get(matrixId);
    if (!id) throw new CryptoTransportError();
    return id;
  }
  private scope() {
    const { conversationId, membershipRevision, cohortId } = this.context;
    return { conversationId, membershipRevision, ...(cohortId ? { cohortId } : {}) };
  }

  async send(request: sdk.OutgoingRequest, signal?: AbortSignal): Promise<void> {
    const body = JSON.parse(request.body);
    let response: unknown;
    switch (request.type) {
      case sdk.RequestType.KeysUpload: {
        return uploadNativeDevice(this.machine, this.api, request, signal);
      }
      case sdk.RequestType.KeysQuery: {
        const requested = Object.keys(body.device_keys).map(id => this.userId(id));
        const deviceKeys: Record<string, Record<string, unknown>> = {};
        const master: Record<string, unknown> = {}, selfSigning: Record<string, unknown> = {}, userSigning: Record<string, unknown> = {};
        for (let index = 0; index < requested.length; index += 100) {
          const selected = requested.slice(index, index + 100);
          const keys = CryptoKeysResponseSchema.parse(await this.api.invoke('POST', '/api/v1/crypto/keys/query', {}, { ...this.scope(), userIds: selected }, signal));
          if (keys.membershipRevision !== this.context.membershipRevision) throw new CryptoTransportError();
          for (const user of keys.users) {
            if (!selected.includes(user.userId) || this.users.get(user.matrixUserId) !== user.userId || deviceKeys[user.matrixUserId]) throw new CryptoTransportError();
            const devices: Record<string, unknown> = {}; deviceKeys[user.matrixUserId] = devices;
            for (const device of user.devices) {
              if (device.revokedAt) continue;
              if (device.deviceKeys.user_id !== user.matrixUserId || devices[device.deviceId]) throw new CryptoTransportError();
              devices[device.deviceId] = device.deviceKeys;
            }
            if (user.identityKeys) {
              const identity = user.identityKeys;
              if ([identity.masterKey, identity.selfSigningKey, identity.userSigningKey].some(key => key.user_id !== user.matrixUserId)) throw new CryptoTransportError();
              master[user.matrixUserId] = identity.masterKey; selfSigning[user.matrixUserId] = identity.selfSigningKey; userSigning[user.matrixUserId] = identity.userSigningKey;
            }
          }
        }
        response = { device_keys: deviceKeys, master_keys: master, self_signing_keys: selfSigning, user_signing_keys: userSigning, failures: {} };
        break;
      }
      case sdk.RequestType.KeysClaim: {
        const targets = Object.entries(body.one_time_keys as Record<string, Record<string, string>>).flatMap(([id, devices]) =>
          Object.entries(devices).map(([deviceId, algorithm]) => {
            if (algorithm !== 'signed_curve25519') throw new CryptoTransportError();
            return { userId: this.userId(id), deviceId };
          }));
        const keysByUser: Record<string, Record<string, unknown>> = {};
        for (let index = 0; index < targets.length; index += 100) {
          const selected = targets.slice(index, index + 100);
          const claim = CryptoClaimResponseSchema.parse(await this.api.invoke('POST', '/api/v1/crypto/keys/claim', {}, { ...this.scope(), deviceId: this.machine.deviceId.toString(), targets: selected }, signal));
          if (claim.membershipRevision !== this.context.membershipRevision) throw new CryptoTransportError();
          for (const key of claim.keys) {
            if (!selected.some(target => target.userId === key.userId && target.deviceId === key.deviceId)) throw new CryptoTransportError();
            const id = await matrixIdentifier('user', key.userId);
            keysByUser[id] ??= {};
            if (keysByUser[id][key.deviceId]) throw new CryptoTransportError();
            keysByUser[id][key.deviceId] = { [key.keyId]: key.signedKey };
          }
        }
        if (Object.values(keysByUser).reduce((sum, devices) => sum + Object.keys(devices).length, 0) !== targets.length) throw new CryptoTransportError();
        response = { one_time_keys: keysByUser, failures: {} };
        break;
      }
      case sdk.RequestType.ToDevice: {
        const outgoing = request as sdk.ToDeviceRequest;
        const recipients = Object.entries(body.messages as Record<string, Record<string, unknown>>).flatMap(([id, devices]) =>
          Object.entries(devices).map(([deviceId, content]) => ({ userId: this.userId(id), deviceId, content })));
        if (!recipients.length) throw new CryptoTransportError();
        if (outgoing.event_type === 'm.room.encrypted') {
          for (let index = 0; index < recipients.length; index += 1) {
            // A single recipient is bounded by the contract. Smaller batches
            // avoid byte-size assumptions for native Olm ciphertext.
            const payload = SendCryptoToDeviceSchema.parse({ ...this.scope(), deviceId: this.machine.deviceId.toString(), transactionId: outgoing.txn_id, eventType: outgoing.event_type, recipients: [recipients[index]] });
            await this.api.invoke('POST', '/api/v1/crypto/to-device', {}, payload, signal);
          }
        } else {
          for (const recipient of recipients) {
            const payload = SendCryptoVerificationSchema.parse({ ...this.scope(), deviceId: this.machine.deviceId.toString(), transactionId: outgoing.txn_id,
              eventType: outgoing.event_type, content: recipient.content, recipientUserId: recipient.userId, recipientDeviceId: recipient.deviceId });
            await this.api.invoke('POST', '/api/v1/crypto/verification', {}, payload, signal);
          }
        }
        response = {};
        break;
      }
      case sdk.RequestType.SignatureUpload:
        await this.api.invoke('POST', '/api/v1/crypto/signatures', {}, { signedKeys: body }, signal);
        response = { failures: {} }; break;
      default: throw new CryptoTransportError();
    }
    if (signal?.aborted || !request.id) throw new CryptoTransportError();
    await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(response));
  }
}
