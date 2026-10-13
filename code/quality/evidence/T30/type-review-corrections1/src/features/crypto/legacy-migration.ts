import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { z } from 'zod';
import { CryptoConversationStateSchema, LegacyMigrationItemSchema, LegacyCandidateSchema, LegacyImportedContentSchema, CommitLegacyCiphertextSchema, LegacyRoundtripAttestationSchema, type CryptoConversationStateDTO } from '@fg/contracts';
import { CryptoApi } from './api';
import { NativeDeviceSession } from './device-session';
import { NativeCryptoTransport } from './transport';
import { matrixIdentifier, samePublicRoutingIds } from './client';
import { canonicalJson, publicSha256 } from './canonical-json';
import { encryptAttachmentBytes, decryptAttachmentBytes } from './attachments';
import { decryptLegacyMessage } from './legacy';
import type { RecipientDevice } from './conversation';

type Source = z.infer<typeof LegacyMigrationItemSchema>;
type Candidate = z.infer<typeof LegacyCandidateSchema>;
type Commit = z.infer<typeof CommitLegacyCiphertextSchema>;
type Image = ReturnType<typeof encryptAttachmentBytes> & { clientUploadId: string; draftId?: string; sourceId: string; plaintextSha256: string };
const pageSchema = z.object({ items: z.array(LegacyMigrationItemSchema).max(100), hasMore: z.boolean(), nextCursor: z.string().nullable() }).strict();
export class LegacyMigrationError extends Error {
  constructor(public readonly code: 'INVALID_CONTEXT' | 'UNAVAILABLE_DEVICE' | 'UNVERIFIED_DEVICE' | 'SOURCE_CHANGED' | 'RETRY_CHANGED' | 'CLOSED') { super(code); this.name = 'LegacyMigrationError'; }
}

/** Preparation and independent roundtrip only; never performs server cutoff. */
export class CryptoLegacyMigration {
  private readonly abort = new AbortController();
  private readonly pending = new Map<string, { fingerprint: string; images: Image[]; payload?: Commit }>();
  private epoch?: string;
  constructor(private readonly session: NativeDeviceSession, private readonly api: CryptoApi, readonly conversationId: string, private readonly actorId: string) {
    session.signal.addEventListener('abort', () => this.close(), { once: true });
  }
  close(): void { this.abort.abort(); for (const item of this.pending.values()) item.images.forEach(image => image.ciphertext.fill(0)); this.pending.clear(); this.epoch = undefined; }
  get closed(): boolean { return this.abort.signal.aborted; }
  private run<T>(action: (machine: sdk.OlmMachine, signal: AbortSignal) => Promise<T>): Promise<T> {
    return this.session.run(async (machine, signal) => {
      const combined = AbortSignal.any([signal, this.abort.signal]);
      if (combined.aborted) throw new LegacyMigrationError('CLOSED');
      const value = await action(machine, combined);
      if (combined.aborted) throw new LegacyMigrationError('CLOSED');
      return value;
    });
  }
  private async context(machine: sdk.OlmMachine, signal: AbortSignal, cohortId: string) {
    const state = CryptoConversationStateSchema.parse(await this.api.invoke('GET', '/api/v1/crypto/conversations/:id/state', { id: this.conversationId }, undefined, signal));
    const cohort = state.legacyCohorts?.find(item => item.cohortId === cohortId);
    if (state.conversationId !== this.conversationId || state.mode !== 'E2EE' || state.historyStatus !== 'KNOWN' || !['LEGACY_PENDING', 'MIGRATING'].includes(state.migrationState) ||
      state.matrixUserId !== machine.userId.toString() || state.matrixRoomId !== await matrixIdentifier('room', this.conversationId) || !state.eligibleDeviceIds.includes(machine.deviceId.toString()) ||
      !cohort || !cohort.members.find(member => member.userId === this.actorId)?.deviceIds.includes(machine.deviceId.toString())) throw new LegacyMigrationError('INVALID_CONTEXT');
    if (cohort.members.some(member => !member.deviceIds.length)) throw new LegacyMigrationError('UNAVAILABLE_DEVICE');
    const adapter = await NativeCryptoTransport.create(machine, this.api, { conversationId: this.conversationId, membershipRevision: state.membershipRevision, cohortId, userIds: cohort.members.map(member => member.userId) });
    return { state, cohort, adapter };
  }
  state(): Promise<CryptoConversationStateDTO> {
    return this.run(async (machine, signal) => {
      const state = CryptoConversationStateSchema.parse(await this.api.invoke('GET', '/api/v1/crypto/conversations/:id/state', { id: this.conversationId }, undefined, signal));
      if (state.conversationId !== this.conversationId || state.matrixUserId !== machine.userId.toString() || !state.eligibleDeviceIds.includes(machine.deviceId.toString())) throw new LegacyMigrationError('INVALID_CONTEXT');
      return state;
    });
  }
  private async inspect(machine: sdk.OlmMachine, signal: AbortSignal, context: Awaited<ReturnType<CryptoLegacyMigration['context']>>): Promise<RecipientDevice[]> {
    const query = machine.queryKeysForUsers(await Promise.all(context.cohort.members.map(async member => new sdk.UserId(await matrixIdentifier('user', member.userId)))));
    try { await context.adapter.send(query, signal); } finally { query.free(); }
    const recipients: RecipientDevice[] = [];
    for (const member of context.cohort.members) {
      const user = new sdk.UserId(await matrixIdentifier('user', member.userId));
      try {
        for (const deviceId of member.deviceIds) {
          if (member.userId === this.actorId && deviceId === machine.deviceId.toString()) continue;
          const id = new sdk.DeviceId(deviceId), device = await machine.getDevice(user, id);
          try {
            if (!device || device.isDeleted() || !device.ed25519Key || !device.curve25519Key) throw new LegacyMigrationError('UNAVAILABLE_DEVICE');
            recipients.push({ userId: member.userId, deviceId, fingerprint: device.ed25519Key.toBase64(), verified: device.isVerified() });
          } finally { device?.free(); id.free(); }
        }
      } finally { user.free(); }
    }
    return recipients;
  }
  devices(cohortId: string): Promise<RecipientDevice[]> {
    return this.run(async (machine, signal) => this.inspect(machine, signal, await this.context(machine, signal, cohortId)));
  }
  private async batchNative(machine: sdk.OlmMachine, signal: AbortSignal, cohortId: string, after?: string) {
    await this.context(machine, signal, cohortId);
    return pageSchema.parse(await this.api.invoke('GET', '/api/v1/crypto/conversations/:id/legacy/batch', { id: this.conversationId }, { cohortId, deviceId: machine.deviceId.toString(), limit: 100, ...(after ? { after } : {}) }, signal));
  }
  batch(cohortId: string, after?: string) { return this.run((machine, signal) => this.batchNative(machine, signal, cohortId, after)); }
  prepare(cohortId: string, input: Source): Promise<Candidate> {
    return this.run(async (machine, signal) => {
      const source = LegacyMigrationItemSchema.parse(input), context = await this.context(machine, signal, cohortId);
      if (source.sourceManifest.conversationId !== this.conversationId || await publicSha256(new TextEncoder().encode(canonicalJson(source.sourceManifest))) !== source.originalSha256.replace(/=+$/, '')) throw new LegacyMigrationError('SOURCE_CHANGED');
      if ((await this.inspect(machine, signal, context)).some(device => !device.verified)) throw new LegacyMigrationError('UNVERIFIED_DEVICE');
      const key = JSON.stringify([cohortId, source.messageId]), fingerprint = canonicalJson({ source, revision: context.state.membershipRevision });
      let pending = this.pending.get(key);
      if (pending && pending.fingerprint !== fingerprint) throw new LegacyMigrationError('RETRY_CHANGED');
      if (!pending) { if (this.pending.size >= 1000) throw new LegacyMigrationError('INVALID_CONTEXT'); pending = { fingerprint, images: [] }; this.pending.set(key, pending); }
      if (!pending.payload) {
        for (const original of source.sourceManifest.attachments) {
          let image = pending.images.find(image => image.sourceId === original.id);
          if (!image) {
            const bytes = await this.api.downloadLegacyAttachment(this.conversationId, original.id, { cohortId, deviceId: machine.deviceId.toString(), messageId: source.messageId }, signal);
            try {
              if (bytes.length !== original.fileSize || await publicSha256(bytes) !== original.plaintextSha256.replace(/=+$/, '')) throw new LegacyMigrationError('SOURCE_CHANGED');
              image = { ...encryptAttachmentBytes(bytes), clientUploadId: crypto.randomUUID(), sourceId: original.id, plaintextSha256: original.plaintextSha256 }; pending.images.push(image);
            } finally { bytes.fill(0); }
          }
          if (!image.draftId) {
            const receipt = await this.api.uploadLegacyAttachment(this.conversationId, { cohortId, deviceId: machine.deviceId.toString(), membershipRevision: context.state.membershipRevision, clientUploadId: image.clientUploadId, ciphertextSize: image.ciphertext.length, ciphertextSha256: image.secret.hashes.sha256 }, image.ciphertext, signal);
            image.draftId = receipt.id;
          }
        }
        const room = new sdk.RoomId(context.state.matrixRoomId), settings = new sdk.EncryptionSettings();
        try {
          const epoch = JSON.stringify([cohortId, context.state.membershipRevision]);
          if (epoch !== this.epoch) { await machine.invalidateGroupSession(room); this.epoch = epoch; }
          const identities = async () => Promise.all(context.cohort.members.map(async member => new sdk.UserId(await matrixIdentifier('user', member.userId))));
          const claim = await machine.getMissingSessions(await identities());
          if (claim) { try { await context.adapter.send(claim, signal); } finally { claim.free(); } }
          settings.historyVisibility = sdk.HistoryVisibility.Joined; settings.sharingStrategy = sdk.CollectStrategy.onlyTrustedDevices();
          for (const request of await machine.shareRoomKey(room, await identities(), settings)) { try { await context.adapter.send(request, signal); } finally { request.free(); } }
          const candidateId = crypto.randomUUID();
          const content = LegacyImportedContentSchema.parse({ msgtype: 'org.fg.legacy_import.v1', fg: { version: 1, conversationId: this.conversationId, membershipRevision: context.state.membershipRevision, candidateId, cohortId, originalSha256: source.originalSha256, importerUserId: this.actorId, importerDeviceId: machine.deviceId.toString() }, source: source.sourceManifest, images: pending.images.map(image => ({ attachmentId: image.sourceId, secret: image.secret })) });
          pending.payload = CommitLegacyCiphertextSchema.parse({ candidateId, messageId: source.messageId, originalSha256: source.originalSha256, deviceId: machine.deviceId.toString(), membershipRevision: context.state.membershipRevision, cohortId, envelope: { version: 1, protocol: 'MATRIX_MEGOLM', event: JSON.parse(await machine.encryptRoomEvent(room, 'm.room.message', JSON.stringify(content))) }, attachmentMappings: pending.images.map(image => ({ attachmentId: image.sourceId, draftId: image.draftId, plaintextSha256: image.plaintextSha256, ciphertextSha256: image.secret.hashes.sha256 })) });
        } finally { room.free(); settings.free(); }
      }
      const candidate = LegacyCandidateSchema.parse(await this.api.invoke('POST', '/api/v1/crypto/conversations/:id/legacy/commit', { id: this.conversationId }, pending.payload, signal));
      if (candidate.candidateId !== pending.payload.candidateId || candidate.messageId !== source.messageId || candidate.originalSha256 !== source.originalSha256 || candidate.importerUserId !== this.actorId || candidate.importerDeviceId !== machine.deviceId.toString() ||
        candidate.conversationId !== this.conversationId || candidate.cohortId !== cohortId || candidate.membershipRevision !== context.state.membershipRevision || canonicalJson(candidate.envelope) !== canonicalJson(pending.payload.envelope) || !samePublicRoutingIds(candidate.attachmentIds, source.attachmentIds)) throw new LegacyMigrationError('INVALID_CONTEXT');
      return candidate;
    });
  }
  attest(cohortId: string, candidateId: string): Promise<void> {
    return this.run(async (machine, signal) => {
      const context = await this.context(machine, signal, cohortId); await this.inspect(machine, signal, context);
      const candidate = LegacyCandidateSchema.parse(await this.api.invoke('GET', '/api/v1/crypto/conversations/:id/legacy/candidates/:candidateId', { id: this.conversationId, candidateId }, { cohortId, deviceId: machine.deviceId.toString() }, signal));
      if (candidate.candidateId !== candidateId || candidate.conversationId !== this.conversationId || candidate.cohortId !== cohortId || candidate.membershipRevision !== context.state.membershipRevision || await publicSha256(new TextEncoder().encode(canonicalJson(candidate.envelope))) !== candidate.envelopeSha256.replace(/=+$/, '')) throw new LegacyMigrationError('INVALID_CONTEXT');
      let source: Source | undefined, cursor: string | undefined;
      for (let index = 0; index < 10000; index++) {
        const page = await this.batchNative(machine, signal, cohortId, cursor); source = page.items.find(item => item.messageId === candidate.messageId);
        if (source || !page.hasMore) break;
        if (!page.nextCursor || page.nextCursor === cursor) throw new LegacyMigrationError('INVALID_CONTEXT'); cursor = page.nextCursor;
      }
      if (!source || source.originalSha256 !== candidate.originalSha256) throw new LegacyMigrationError('SOURCE_CHANGED');
      const archive = await decryptLegacyMessage(machine, { id: source.messageId, conversationId: this.conversationId, senderId: source.senderId, clientMessageId: source.sourceManifest.clientMessageId, deviceId: candidate.importerDeviceId, membershipRevision: candidate.membershipRevision, origin: 'LEGACY_IMPORT', createdAt: source.createdAt, attachmentIds: candidate.attachmentIds, envelope: candidate.envelope, importProvenance: { candidateId, cohortId, originalSha256: candidate.originalSha256, importerUserId: candidate.importerUserId, importerDeviceId: candidate.importerDeviceId } }, this.conversationId);
      if (canonicalJson(archive.source) !== canonicalJson(source.sourceManifest)) throw new LegacyMigrationError('SOURCE_CHANGED');
      const attachmentDigests = [];
      for (let index = 0; index < archive.images.length; index++) {
        const image = archive.images[index], original = archive.source.attachments[index];
        const ciphertext = await this.api.downloadLegacyAttachment(this.conversationId, image.attachmentId, { cohortId, deviceId: machine.deviceId.toString() }, signal, candidateId);
        let plaintext: Uint8Array | undefined;
        try {
          plaintext = decryptAttachmentBytes(ciphertext, image.secret);
          const plaintextSha256 = await publicSha256(plaintext), ciphertextSha256 = await publicSha256(ciphertext);
          if (plaintext.length !== original.fileSize || plaintextSha256 !== original.plaintextSha256.replace(/=+$/, '') || ciphertextSha256 !== image.secret.hashes.sha256.replace(/=+$/, '')) throw new LegacyMigrationError('SOURCE_CHANGED');
          attachmentDigests.push({ attachmentId: image.attachmentId, plaintextSha256, ciphertextSha256 });
        } finally { ciphertext.fill(0); plaintext?.fill(0); }
      }
      const payload = { version: 1, type: 'org.fg.legacy_roundtrip.v1', candidateId, messageId: candidate.messageId, conversationId: this.conversationId, cohortId, membershipRevision: candidate.membershipRevision, originalSha256: candidate.originalSha256, envelopeSha256: candidate.envelopeSha256, userId: this.actorId, deviceId: machine.deviceId.toString(), attachmentDigests };
      const signatures = await machine.sign(canonicalJson(payload));
      try {
        const receipt = LegacyRoundtripAttestationSchema.parse({ ...payload, signatures: JSON.parse(signatures.asJSON()) });
        await this.api.invoke('POST', '/api/v1/crypto/conversations/:id/legacy/attest', { id: this.conversationId }, receipt, signal);
      } finally { signatures.free(); }
    });
  }
}
