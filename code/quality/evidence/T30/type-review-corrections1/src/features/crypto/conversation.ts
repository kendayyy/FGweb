import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { CryptoConversationStateSchema, CryptoDecryptedMessageSchema, EncryptedMessageSchema, SendEncryptedMessageSchema, type CryptoConversationStateDTO, type EncryptedMessageDTO } from '@fg/contracts';
import type { z } from 'zod';
import { z as schema } from 'zod';
import { CryptoApi, CryptoApiError } from './api';
import { CryptoMessageError, decryptLiveMessage, decryptRecoveredHistory, matrixIdentifier, samePublicRoutingIds } from './client';
import { NativeDeviceSession } from './device-session';
import { NativeCryptoTransport, type CryptoTransportContext } from './transport';
import type { SealedPrivateImage } from './images';
import { decryptLegacyMessage, type LegacyContent } from './legacy';

type Content = z.infer<typeof CryptoDecryptedMessageSchema>;
type Payload = z.infer<typeof SendEncryptedMessageSchema>;
type ComposeInput = { clientMessageId: string; body: string; mentionedUserIds?: string[]; reply?: { messageId: string; previewText: string } };
export class CryptoConversationError extends Error {
  constructor(public readonly code: 'MIGRATION_REQUIRED' | 'DEVICE_REVOKED' | 'INVALID_CONTEXT' | 'UNVERIFIED_DEVICE' | 'NO_RECIPIENT_DEVICE' | 'RETRY_CHANGED' | 'REVISION_CHANGED' | 'PARTICIPANTS_CHANGED') { super(code); this.name = 'CryptoConversationError'; }
}
export interface RecipientDevice { userId: string; deviceId: string; fingerprint: string; verified: boolean }
export interface CryptoHistoryPage { items: EncryptedMessageDTO[]; hasMore: boolean; nextCursor: string | null }
export interface DecodedCryptoRow { message: EncryptedMessageDTO; content?: Content; legacy?: LegacyContent; error?: string; recovered?: true }

/** All access runs through the device queue; pending retries reuse exact ciphertext. */
export class CryptoConversation {
  private revision?: number;
  private rosterRevision?: number;
  private readonly pending = new Map<string, { input: string; payload: Payload }>();
  private readonly uploaded = new Map<string, { revision: number; id: string; hash: string }>();
  private readonly users: readonly string[];
  constructor(private readonly session: NativeDeviceSession, private readonly api: CryptoApi, readonly conversationId: string, private readonly actorId: string, userIds: readonly string[], private readonly resolveParticipants?: (signal: AbortSignal) => Promise<string[]>) {
    this.users = [...new Set(userIds)];
    if (!this.users.includes(actorId) || this.users.length < 1 || this.users.length > 1000) throw new CryptoConversationError('INVALID_CONTEXT');
    session.signal.addEventListener('abort', () => { this.pending.clear(); this.uploaded.clear(); this.revision = undefined; this.rosterRevision = undefined; }, { once: true });
  }
  private identities(): Promise<sdk.UserId[]> {
    // Native array-taking APIs consume UserId wrappers; allocate for each call.
    return Promise.all(this.users.map(async id => new sdk.UserId(await matrixIdentifier('user', id))));
  }
  private async context(machine: sdk.OlmMachine, signal: AbortSignal): Promise<{ state: CryptoConversationStateDTO; adapter: NativeCryptoTransport; context: CryptoTransportContext }> {
    const state = CryptoConversationStateSchema.parse(await this.api.invoke('GET', '/api/v1/crypto/conversations/:id/state', { id: this.conversationId }, undefined, signal));
    if (state.conversationId !== this.conversationId || state.matrixRoomId !== await matrixIdentifier('room', this.conversationId) ||
      state.matrixUserId !== machine.userId.toString() || state.matrixUserId !== await matrixIdentifier('user', this.actorId)) throw new CryptoConversationError('INVALID_CONTEXT');
    if (state.mode !== 'E2EE' || state.migrationState !== 'RECONCILED') throw new CryptoConversationError('MIGRATION_REQUIRED');
    if (!state.eligibleDeviceIds.includes(machine.deviceId.toString())) { this.pending.clear(); throw new CryptoConversationError('DEVICE_REVOKED'); }
    if (this.resolveParticipants && this.rosterRevision !== state.membershipRevision) {
      let members: string[];
      try { members = await this.resolveParticipants(signal); }
      catch {
        // A roster network/stale-peer failure is not proof of own revocation.
        await this.api.invoke('GET', '/api/v1/crypto/conversations/:id/state', { id: this.conversationId }, undefined, signal);
        throw new CryptoConversationError('PARTICIPANTS_CHANGED');
      }
      const latest = CryptoConversationStateSchema.parse(await this.api.invoke('GET', '/api/v1/crypto/conversations/:id/state', { id: this.conversationId }, undefined, signal));
      if (latest.conversationId !== state.conversationId || latest.matrixRoomId !== state.matrixRoomId || latest.matrixUserId !== state.matrixUserId || latest.mode !== 'E2EE' || latest.migrationState !== 'RECONCILED') throw new CryptoConversationError('INVALID_CONTEXT');
      if (!latest.eligibleDeviceIds.includes(machine.deviceId.toString())) throw new CryptoConversationError('DEVICE_REVOKED');
      if (latest.membershipRevision !== state.membershipRevision || members.length !== new Set(members).size || !samePublicRoutingIds(members, this.users)) throw new CryptoConversationError('PARTICIPANTS_CHANGED');
      this.rosterRevision = state.membershipRevision;
    }
    const context = { conversationId: this.conversationId, membershipRevision: state.membershipRevision, userIds: this.users };
    const adapter = await NativeCryptoTransport.create(machine, this.api, context);
    const request = machine.queryKeysForUsers(await this.identities());
    try { await adapter.send(request, signal); }
    catch (error) {
      if (error instanceof CryptoApiError && error.status === 403) {
        const latest = CryptoConversationStateSchema.parse(await this.api.invoke('GET', '/api/v1/crypto/conversations/:id/state', { id: this.conversationId }, undefined, signal));
        if (!latest.eligibleDeviceIds.includes(machine.deviceId.toString())) throw error;
        throw new CryptoConversationError('PARTICIPANTS_CHANGED');
      }
      throw error;
    }
    finally { request.free(); }
    return { state, adapter, context };
  }
  private async recipientDevices(machine: sdk.OlmMachine): Promise<RecipientDevice[]> {
    const result: RecipientDevice[] = [];
    for (const userId of this.users) {
      const identity = new sdk.UserId(await matrixIdentifier('user', userId));
      let devices: sdk.UserDevices | undefined;
      try {
        devices = await machine.getUserDevices(identity);
        for (const device of devices.devices()) {
          try {
            if (device.isDeleted() || userId === this.actorId && device.deviceId.toString() === machine.deviceId.toString()) continue;
            result.push({ userId, deviceId: device.deviceId.toString(), fingerprint: device.ed25519Key?.toBase64() ?? '', verified: device.isVerified() });
          } finally { device.free(); }
        }
      } finally { devices?.free(); identity.free(); }
    }
    return result;
  }
  devices(): Promise<RecipientDevice[]> {
    return this.session.run(async (machine, signal) => { await this.context(machine, signal); return this.recipientDevices(machine); });
  }
  sendText(input: ComposeInput): Promise<EncryptedMessageDTO> { return this.sendContent(input, []); }
  sendImages(input: ComposeInput, images: SealedPrivateImage[]): Promise<EncryptedMessageDTO> {
    if (!images.length || images.length > 4 || new Set(images.map(image => image.clientUploadId)).size !== images.length) return Promise.reject(new CryptoConversationError('INVALID_CONTEXT'));
    return this.sendContent(input, images);
  }
  private sendContent(input: ComposeInput, images: SealedPrivateImage[]): Promise<EncryptedMessageDTO> {
    return this.session.run(async (machine, signal) => {
      const { state, adapter } = await this.context(machine, signal);
      const binding = { version: 1 as const, conversationId: this.conversationId, clientMessageId: input.clientMessageId,
        senderId: this.actorId, senderDeviceId: machine.deviceId.toString(), membershipRevision: state.membershipRevision,
        ...(input.mentionedUserIds ? { mentionedUserIds: input.mentionedUserIds } : {}), ...(input.reply ? { reply: input.reply } : {}) };
      const prior = this.pending.get(input.clientMessageId), fingerprint = JSON.stringify({ ...input, images: images.map(image => ({ id: image.clientUploadId, hash: image.secret.hashes.sha256, width: image.width, height: image.height })) });
      if (prior && prior.input !== fingerprint) throw new CryptoConversationError('RETRY_CHANGED');
      if (prior && prior.payload.membershipRevision !== state.membershipRevision) throw new CryptoConversationError('REVISION_CHANGED');
      const recipients = await this.recipientDevices(machine);
      for (const userId of this.users.filter(id => id !== this.actorId)) if (!recipients.some(device => device.userId === userId)) throw new CryptoConversationError('NO_RECIPIENT_DEVICE');
      if (recipients.some(device => !device.verified)) throw new CryptoConversationError('UNVERIFIED_DEVICE');
      let payload = prior?.payload;
      if (!payload) {
        const descriptors = [];
        for (const image of images) {
          let uploaded = this.uploaded.get(image.clientUploadId);
          if (uploaded && (uploaded.revision !== state.membershipRevision || uploaded.hash !== image.secret.hashes.sha256)) throw new CryptoConversationError('REVISION_CHANGED');
          if (!uploaded) {
            const receipt = await this.api.uploadAttachment(this.conversationId, { clientUploadId: image.clientUploadId, deviceId: machine.deviceId.toString(), membershipRevision: state.membershipRevision,
              ciphertextSize: image.ciphertext.byteLength, ciphertextSha256: image.secret.hashes.sha256 }, image.ciphertext, signal);
            uploaded = { revision: state.membershipRevision, id: receipt.id, hash: receipt.ciphertextSha256 }; this.uploaded.set(image.clientUploadId, uploaded);
          }
          descriptors.push({ attachmentId: uploaded.id, secret: image.secret, fileName: 'image.webp', mimeType: 'image/webp' as const, plaintextSize: image.ciphertext.byteLength, width: image.width, height: image.height });
        }
        const content = CryptoDecryptedMessageSchema.parse(images.length ? { msgtype: 'm.image', body: input.body, fg: binding, images: descriptors } : { msgtype: 'm.text', body: input.body, fg: binding });
        const room = new sdk.RoomId(state.matrixRoomId), settings = new sdk.EncryptionSettings();
        try {
          if (this.revision !== state.membershipRevision) await machine.invalidateGroupSession(room);
          const claim = await machine.getMissingSessions(await this.identities());
          if (claim) { try { await adapter.send(claim, signal); } finally { claim.free(); } }
          settings.historyVisibility = sdk.HistoryVisibility.Joined; settings.sharingStrategy = sdk.CollectStrategy.onlyTrustedDevices();
          for (const request of await machine.shareRoomKey(room, await this.identities(), settings)) {
            try { await adapter.send(request, signal); } finally { request.free(); }
          }
          const event = JSON.parse(await machine.encryptRoomEvent(room, 'm.room.message', JSON.stringify(content)));
          payload = SendEncryptedMessageSchema.parse({ clientMessageId: input.clientMessageId, deviceId: machine.deviceId.toString(), membershipRevision: state.membershipRevision,
            envelope: { version: 1, protocol: 'MATRIX_MEGOLM', event }, ...(descriptors.length ? { attachmentIds: descriptors.map(image => image.attachmentId) } : {}), ...(input.mentionedUserIds ? { mentionedUserIds: input.mentionedUserIds } : {}) });
          this.pending.set(input.clientMessageId, { input: fingerprint, payload }); this.revision = state.membershipRevision;
        } finally { room.free(); settings.free(); }
      }
      const result = EncryptedMessageSchema.parse(await this.api.invoke('POST', '/api/v1/crypto/conversations/:id/messages', { id: this.conversationId }, payload, signal));
      if (result.origin !== 'LIVE' || result.clientMessageId !== input.clientMessageId || result.conversationId !== this.conversationId || result.senderId !== this.actorId || result.deviceId !== machine.deviceId.toString() || result.membershipRevision !== payload.membershipRevision || JSON.stringify(result.envelope) !== JSON.stringify(payload.envelope) || !samePublicRoutingIds(result.attachmentIds, payload.attachmentIds ?? []) || !samePublicRoutingIds(result.mentionedUserIds ?? [], payload.mentionedUserIds ?? [])) throw new CryptoConversationError('INVALID_CONTEXT');
      // Retain bounded ciphertext for committed-but-lost response retries in this session.
      if (this.pending.size > 100) this.pending.delete(this.pending.keys().next().value!);
      while (this.uploaded.size > 400) this.uploaded.delete(this.uploaded.keys().next().value!);
      return result;
    });
  }
  decrypt(message: EncryptedMessageDTO): Promise<Content> {
    return this.session.run(async (machine, signal) => { await this.context(machine, signal); return decryptLiveMessage(machine, message, this.conversationId); });
  }
  history(after?: string): Promise<CryptoHistoryPage> {
    return this.session.run(async (machine, signal) => {
      await this.context(machine, signal);
      return schema.object({ items: EncryptedMessageSchema.array().max(100), hasMore: schema.boolean(), nextCursor: schema.string().max(512).nullable() }).strict().parse(
        await this.api.invoke('GET', '/api/v1/crypto/conversations/:id/messages', { id: this.conversationId }, { ...(after ? { after } : {}), limit: 100 }, signal));
    });
  }
  decodePage(messages: EncryptedMessageDTO[]): Promise<DecodedCryptoRow[]> {
    return this.session.run(async (machine, signal) => {
      await this.context(machine, signal);
      const checked = EncryptedMessageSchema.array().max(100).parse(messages), result: DecodedCryptoRow[] = [];
      for (const message of checked) {
        if (message.conversationId !== this.conversationId) throw new CryptoConversationError('INVALID_CONTEXT');
        if (message.origin === 'LEGACY_IMPORT') {
          try { result.push({ message, legacy: await decryptLegacyMessage(machine, message, this.conversationId) }); }
          catch {
            try { result.push({ message, legacy: await decryptLegacyMessage(machine, message, this.conversationId, true), recovered: true }); }
            catch { result.push({ message, error: 'Chưa kiểm tra được bản nhập lịch sử cũ. Khóa, nguồn hoặc dữ liệu không hợp lệ.' }); }
          }
          continue;
        }
        try { result.push({ message, content: await decryptLiveMessage(machine, message, this.conversationId) }); }
        catch (error) {
          try { result.push({ message, content: await decryptRecoveredHistory(machine, message, this.conversationId), recovered: true }); }
          catch { result.push({ message, error: error instanceof CryptoMessageError && error.code === 'UNVERIFIED_DEVICE' ? 'Chưa xác minh thiết bị gửi tin này.' : 'Chưa đọc được tin. Có thể đang thiếu khóa hoặc dữ liệu không hợp lệ.' }); }
        }
      }
      return result;
    });
  }
}
