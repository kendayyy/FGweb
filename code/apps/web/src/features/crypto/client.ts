import { DecryptionSettings, RoomId, TrustRequirement, type OlmMachine } from '@matrix-org/matrix-sdk-crypto-wasm';
import { CryptoDecryptedMessageSchema, EncryptedMessageSchema, type EncryptedMessageDTO } from '@fg/contracts';
import type { z } from 'zod';
import { hasExplicitRecoveredSession } from './recovery';

export class CryptoMessageError extends Error {
  constructor(public readonly code: 'LOCKED' | 'INVALID_MESSAGE' | 'UNVERIFIED_DEVICE', options?: ErrorOptions) {
    super(code, options);
    this.name = 'CryptoMessageError';
  }
}

/** Public mapping only; never derives an encryption key. */
export async function matrixIdentifier(kind: 'user' | 'room', id: string): Promise<string> {
  const bytes = new TextEncoder().encode(id);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return `${kind === 'user' ? '@' : '!'}fg_${hex}:fg.invalid`;
}
export function samePublicRoutingIds(actual: readonly string[], expected: readonly string[]): boolean {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

export async function decryptLiveMessage(machine: OlmMachine, input: EncryptedMessageDTO, conversationId: string): Promise<z.infer<typeof CryptoDecryptedMessageSchema>> {
  return decryptBoundMessage(machine, input, conversationId, false);
}
/** Historical content only: caller must label its sender/device as unverified. */
export async function decryptRecoveredHistory(machine: OlmMachine, input: EncryptedMessageDTO, conversationId: string): Promise<z.infer<typeof CryptoDecryptedMessageSchema>> {
  return decryptBoundMessage(machine, input, conversationId, true);
}
async function decryptBoundMessage(machine: OlmMachine, input: EncryptedMessageDTO, conversationId: string, recovered: boolean): Promise<z.infer<typeof CryptoDecryptedMessageSchema>> {
  let decrypted: Awaited<ReturnType<OlmMachine['decryptRoomEvent']>> | undefined;
  let room: RoomId | undefined;
  let settings: DecryptionSettings | undefined;
  try {
    const message = EncryptedMessageSchema.parse(input);
    if (message.origin !== 'LIVE' || message.conversationId !== conversationId) throw new CryptoMessageError('INVALID_MESSAGE');
    const sender = await matrixIdentifier('user', message.senderId);
    room = new RoomId(await matrixIdentifier('room', conversationId));
    if (recovered) {
      const { sender_key: senderKey, session_id: sessionId } = message.envelope.event;
      if (!senderKey || !sessionId || !await hasExplicitRecoveredSession(machine, room.toString(), senderKey, sessionId)) throw new CryptoMessageError('INVALID_MESSAGE');
    }
    // Local SAS verification is supported as well as cross-signing. The SDK's
    // sender fields alone are untrusted: verify both keys against its device store.
    settings = new DecryptionSettings(TrustRequirement.Untrusted);
    decrypted = await machine.decryptRoomEvent(JSON.stringify({
      type: 'm.room.encrypted', sender, event_id: `$${message.id}`,
      origin_server_ts: Date.parse(message.createdAt), content: message.envelope.event,
    }), room, settings);
    if (decrypted.sender.toString() !== sender || (!recovered || decrypted.senderDevice) && decrypted.senderDevice?.toString() !== message.deviceId) throw new CryptoMessageError('INVALID_MESSAGE');
    const ownDevice = sender === machine.userId.toString() && message.deviceId === machine.deviceId.toString();
    if (ownDevice) {
      if (decrypted.senderCurve25519Key !== machine.identityKeys.curve25519.toBase64() ||
          decrypted.senderClaimedEd25519Key !== machine.identityKeys.ed25519.toBase64()) throw new CryptoMessageError('INVALID_MESSAGE');
    } else if (recovered) {
      if (decrypted.senderDevice) {
        const device = await machine.getDevice(decrypted.sender, decrypted.senderDevice);
        try {
          if (device && (device.curve25519Key?.toBase64() !== decrypted.senderCurve25519Key || device.ed25519Key?.toBase64() !== decrypted.senderClaimedEd25519Key)) throw new CryptoMessageError('INVALID_MESSAGE');
        } finally { device?.free(); }
      }
    } else {
      const device = await machine.getDevice(decrypted.sender, decrypted.senderDevice!);
      try {
        if (!device || device.isDeleted() || !device.isVerified()) throw new CryptoMessageError('UNVERIFIED_DEVICE');
        if (device.curve25519Key?.toBase64() !== decrypted.senderCurve25519Key ||
            device.ed25519Key?.toBase64() !== decrypted.senderClaimedEd25519Key) throw new CryptoMessageError('INVALID_MESSAGE');
      } finally { device?.free(); }
    }
    const event: unknown = JSON.parse(decrypted.event);
    if (!event || typeof event !== 'object' || !('type' in event) || event.type !== 'm.room.message' ||
        !('sender' in event) || event.sender !== sender || !('content' in event)) throw new CryptoMessageError('INVALID_MESSAGE');
    const content = CryptoDecryptedMessageSchema.parse(event.content);
    const binding = content.fg;
    if (binding.conversationId !== conversationId || binding.senderId !== message.senderId ||
        binding.senderDeviceId !== message.deviceId || binding.clientMessageId !== message.clientMessageId ||
        binding.membershipRevision !== message.membershipRevision) throw new CryptoMessageError('INVALID_MESSAGE');
    const images = content.msgtype === 'm.image' ? content.images.map(image => image.attachmentId) : [];
    if (!samePublicRoutingIds(images, message.attachmentIds) || new Set(images).size !== images.length ||
        !samePublicRoutingIds(binding.mentionedUserIds ?? [], message.mentionedUserIds ?? [])) throw new CryptoMessageError('INVALID_MESSAGE');
    return content;
  } catch (error) {
    if (error instanceof CryptoMessageError) throw error;
    // Never surface WASM diagnostics containing decrypted content in UI/logs.
    throw new CryptoMessageError('INVALID_MESSAGE', { cause: new Error('Native decryption or contract validation rejected') });
  } finally {
    decrypted?.free(); settings?.free(); room?.free();
  }
}
