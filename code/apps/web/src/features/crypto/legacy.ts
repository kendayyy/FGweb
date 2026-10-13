import { DecryptionSettings, RoomId, TrustRequirement, type OlmMachine } from '@matrix-org/matrix-sdk-crypto-wasm';
import { EncryptedMessageSchema, LegacyImportedContentSchema, type EncryptedMessageDTO } from '@fg/contracts';
import type { z } from 'zod';
import { CryptoMessageError, matrixIdentifier, samePublicRoutingIds } from './client';
import { canonicalJson, publicSha256 } from './canonical-json';
import { hasExplicitRecoveredSession } from './recovery';

export type LegacyContent = z.infer<typeof LegacyImportedContentSchema>;

/** Importer authenticity is distinct from retained original plaintext authorship. */
export async function decryptLegacyMessage(machine: OlmMachine, input: EncryptedMessageDTO, conversationId: string, recovered = false): Promise<LegacyContent> {
  let room: RoomId | undefined, settings: DecryptionSettings | undefined;
  let decrypted: Awaited<ReturnType<OlmMachine['decryptRoomEvent']>> | undefined;
  try {
    const message = EncryptedMessageSchema.parse(input);
    if (message.origin !== 'LEGACY_IMPORT' || message.conversationId !== conversationId) throw new CryptoMessageError('INVALID_MESSAGE');
    const provenance = message.importProvenance;
    const sender = await matrixIdentifier('user', provenance.importerUserId);
    room = new RoomId(await matrixIdentifier('room', conversationId));
    const { sender_key: senderKey, session_id: sessionId } = message.envelope.event;
    if (typeof senderKey !== 'string' || typeof sessionId !== 'string') throw new CryptoMessageError('INVALID_MESSAGE');
    if (recovered && !await hasExplicitRecoveredSession(machine, room.toString(), senderKey, sessionId)) throw new CryptoMessageError('UNVERIFIED_DEVICE');
    settings = new DecryptionSettings(TrustRequirement.Untrusted);
    decrypted = await machine.decryptRoomEvent(JSON.stringify({ type: 'm.room.encrypted', sender, event_id: `$${message.id}`, origin_server_ts: Date.parse(message.createdAt), content: message.envelope.event }), room, settings);
    if (decrypted.sender.toString() !== sender || (!recovered || decrypted.senderDevice) && decrypted.senderDevice?.toString() !== provenance.importerDeviceId) throw new CryptoMessageError('INVALID_MESSAGE');
    if (sender === machine.userId.toString() && provenance.importerDeviceId === machine.deviceId.toString()) {
      if (decrypted.senderCurve25519Key !== machine.identityKeys.curve25519.toBase64() || decrypted.senderClaimedEd25519Key !== machine.identityKeys.ed25519.toBase64()) throw new CryptoMessageError('INVALID_MESSAGE');
    } else if (decrypted.senderDevice) {
      const device = await machine.getDevice(decrypted.sender, decrypted.senderDevice);
      try {
        if (!recovered && (!device || device.isDeleted() || !device.isVerified())) throw new CryptoMessageError('UNVERIFIED_DEVICE');
        if (device && (device.curve25519Key?.toBase64() !== decrypted.senderCurve25519Key || device.ed25519Key?.toBase64() !== decrypted.senderClaimedEd25519Key)) throw new CryptoMessageError('INVALID_MESSAGE');
      } finally { device?.free(); }
    } else if (!recovered) throw new CryptoMessageError('UNVERIFIED_DEVICE');
    const event: unknown = JSON.parse(decrypted.event);
    if (!event || typeof event !== 'object' || !('type' in event) || event.type !== 'm.room.message' || !('sender' in event) || event.sender !== sender || !('content' in event)) throw new CryptoMessageError('INVALID_MESSAGE');
    const content = LegacyImportedContentSchema.parse(event.content), binding = content.fg, source = content.source;
    if (binding.conversationId !== conversationId || binding.membershipRevision !== message.membershipRevision ||
      Object.entries(provenance).some(([key, value]) => Reflect.get(binding, key) !== value) ||
      source.messageId !== message.id || source.senderId !== message.senderId || source.clientMessageId !== message.clientMessageId || source.createdAt !== message.createdAt ||
      !samePublicRoutingIds(message.attachmentIds, source.attachments.map(image => image.id)) ||
      await publicSha256(new TextEncoder().encode(canonicalJson(source))) !== provenance.originalSha256.replace(/=+$/, '')) throw new CryptoMessageError('INVALID_MESSAGE');
    return content;
  } catch (error) {
    if (error instanceof CryptoMessageError) throw error;
    throw new CryptoMessageError('INVALID_MESSAGE');
  } finally { decrypted?.free(); settings?.free(); room?.free(); }
}
