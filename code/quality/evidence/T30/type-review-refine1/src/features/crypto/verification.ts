import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { CryptoConversationStateSchema, CryptoSyncResponseSchema, CryptoToDeviceEventSchema } from '@fg/contracts';
import { CryptoApi } from './api';
import { matrixIdentifier } from './client';
import { NativeDeviceSession } from './device-session';
import { NativeCryptoTransport, uploadNativeDevice } from './transport';

interface Binding { conversationId: string; membershipRevision: number; peerUserId: string; peerDeviceId: string; flowId: string; cohortId?: string }
export interface VerificationView extends Binding {
  key: string;
  status: 'REQUESTED' | 'WAITING' | 'READY' | 'SAS' | 'WAITING_PEER' | 'VERIFIED' | 'CANCELLED' | 'EXPIRED' | 'STALE';
  decimals?: number[];
  fingerprint?: string;
  initiatedHere: boolean;
  needsSasAccept: boolean;
}
export class CryptoVerificationError extends Error {
  constructor(public readonly code: 'UNKNOWN_FLOW' | 'FLOW_CONTEXT_CHANGED' | 'DEVICE_UNAVAILABLE' | 'SAS_NOT_READY' | 'FLOW_LIMIT') { super(code); this.name = 'CryptoVerificationError'; }
}

/** Public flow bindings only. Native SAS remains the sole source of trust. */
export class CryptoVerificationInbox {
  private readonly bindings = new Map<string, Binding>();
  private readonly completed = new Map<string, { fingerprint: string; initiatedHere: boolean }>();
  private readonly cancelled = new Set<string>();
  constructor(private readonly session: NativeDeviceSession, private readonly api: CryptoApi, private readonly actorId: string) {
    session.signal.addEventListener('abort', () => { this.bindings.clear(); this.completed.clear(); this.cancelled.clear(); }, { once: true });
  }
  private key(peer: string, flow: string): string { return JSON.stringify([peer, flow]); }
  private bind(value: Binding): string {
    const key = this.key(value.peerUserId, value.flowId), existing = this.bindings.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(value)) throw new CryptoVerificationError('FLOW_CONTEXT_CHANGED');
    if (!existing && this.bindings.size >= 1000) throw new CryptoVerificationError('FLOW_LIMIT');
    this.bindings.set(key, value); return key;
  }
  private async adapter(machine: sdk.OlmMachine, signal: AbortSignal, binding: Binding): Promise<NativeCryptoTransport> {
    const state = CryptoConversationStateSchema.parse(await this.api.invoke('GET', '/api/v1/crypto/conversations/:id/state', { id: binding.conversationId }, undefined, signal));
    const cohort = binding.cohortId ? state.legacyCohorts?.find(item => item.cohortId === binding.cohortId) : undefined;
    const migrationAllowed = Boolean(cohort && state.historyStatus === 'KNOWN' && ['LEGACY_PENDING', 'MIGRATING'].includes(state.migrationState) &&
      cohort.members.find(member => member.userId === this.actorId)?.deviceIds.includes(machine.deviceId.toString()) &&
      cohort.members.find(member => member.userId === binding.peerUserId)?.deviceIds.includes(binding.peerDeviceId));
    if (state.conversationId !== binding.conversationId || state.mode !== 'E2EE' || (binding.cohortId ? !migrationAllowed : state.migrationState !== 'RECONCILED') ||
      state.membershipRevision !== binding.membershipRevision || state.matrixUserId !== machine.userId.toString() ||
      !state.eligibleDeviceIds.includes(machine.deviceId.toString()) || state.matrixRoomId !== await matrixIdentifier('room', binding.conversationId)) throw new CryptoVerificationError('FLOW_CONTEXT_CHANGED');
    return NativeCryptoTransport.create(machine, this.api, { conversationId: binding.conversationId, membershipRevision: binding.membershipRevision, userIds: [this.actorId, binding.peerUserId], ...(binding.cohortId ? { cohortId: binding.cohortId } : {}) });
  }
  async begin(conversationId: string, peerUserId: string, peerDeviceId: string, cohortId?: string): Promise<string> {
    return this.session.run(async (machine, signal) => {
      const state = CryptoConversationStateSchema.parse(await this.api.invoke('GET', '/api/v1/crypto/conversations/:id/state', { id: conversationId }, undefined, signal));
      const pending: Binding = { conversationId, membershipRevision: state.membershipRevision, peerUserId, peerDeviceId, flowId: '', ...(cohortId ? { cohortId } : {}) };
      const adapter = await this.adapter(machine, signal, pending);
      const query = machine.queryKeysForUsers([new sdk.UserId(await matrixIdentifier('user', peerUserId))]);
      try { await adapter.send(query, signal); } finally { query.free(); }
      const user = new sdk.UserId(await matrixIdentifier('user', peerUserId)), id = new sdk.DeviceId(peerDeviceId);
      const device = await machine.getDevice(user, id);
      try {
        if (!device || device.isDeleted()) throw new CryptoVerificationError('DEVICE_UNAVAILABLE');
        const [request, outgoing] = device.requestVerification([sdk.VerificationMethod.SasV1]);
        try {
          const key = this.bind({ ...pending, flowId: request.flowId });
          await adapter.send(outgoing, signal); return key;
        } finally { request.free(); outgoing.free(); }
      } finally { device?.free(); user.free(); id.free(); }
    });
  }
  async poll(): Promise<VerificationView[]> {
    return this.session.run(async (machine, signal) => {
      const input = CryptoSyncResponseSchema.parse(await this.api.invoke('GET', '/api/v1/crypto/sync', {}, { deviceId: machine.deviceId.toString(), limit: 100 }, signal));
      const encrypted = CryptoToDeviceEventSchema.array().max(100).parse(input.encrypted.items);
      for (const item of input.verification) {
        const flowId = Reflect.get(item.event.content, 'transaction_id');
        if (typeof flowId === 'string') this.bind({ conversationId: item.conversationId, membershipRevision: item.membershipRevision, peerUserId: item.senderUserId, peerDeviceId: item.senderDeviceId, flowId, ...(item.cohortId ? { cohortId: item.cohortId } : {}) });
      }
      const sources = new Map<string, Binding>();
      for (const item of [...encrypted, ...input.verification]) {
        const binding = { conversationId: item.conversationId, membershipRevision: item.membershipRevision, peerUserId: item.senderUserId, peerDeviceId: item.senderDeviceId, flowId: '', ...(item.cohortId ? { cohortId: item.cohortId } : {}) };
        sources.set(JSON.stringify([binding.conversationId, binding.membershipRevision, binding.peerUserId]), binding);
      }
      // Incoming SAS/Olm must see current native-validated sender device keys.
      for (const binding of sources.values()) {
        const adapter = await this.adapter(machine, signal, binding);
        const query = machine.queryKeysForUsers([new sdk.UserId(await matrixIdentifier('user', binding.peerUserId))]);
        try { await adapter.send(query, signal); } finally { query.free(); }
      }
      const events = [];
      for (const item of encrypted) events.push({ sender: await matrixIdentifier('user', item.senderUserId), type: 'm.room.encrypted', content: item.content });
      for (const item of input.verification) events.push({ sender: await matrixIdentifier('user', item.senderUserId), type: item.event.eventType, content: item.event.content });
      const lists = new sdk.DeviceLists();
      // Hold native handles through sync: the SDK may remove terminal flows
      // immediately. Retain only cancellation observed on a native SAS/request.
      const held: { key: string; user: sdk.UserId; request: sdk.VerificationRequest; sas?: sdk.Sas | sdk.Qr }[] = [];
      try {
        for (const [key, binding] of this.bindings) {
          const user = new sdk.UserId(await matrixIdentifier('user', binding.peerUserId));
          const request = machine.getVerificationRequest(user, binding.flowId);
          if (request) held.push({ key, user, request, sas: request.getVerification() });
          else user.free();
        }
        await machine.receiveSyncChanges(JSON.stringify(events), lists, new Map(Object.entries(input.oneTimeKeyCounts)));
        for (const item of held) if (item.request.isCancelled() || item.sas?.isCancelled()) this.cancelled.add(item.key);
      } finally {
        for (const item of held) { item.sas?.free(); item.request.free(); item.user.free(); }
        lists.free();
      }
      const ids = [...encrypted, ...input.verification].map(item => item.id);
      for (let start = 0; start < ids.length; start += 100) await this.api.invoke('POST', '/api/v1/crypto/sync/ack', {}, { deviceId: machine.deviceId.toString(), eventIds: ids.slice(start, start + 100) }, signal);
      for (const request of await machine.outgoingRequests()) {
        try {
          if (request.type === sdk.RequestType.KeysUpload) { await uploadNativeDevice(machine, this.api, request, signal); continue; }
          if (request.type === sdk.RequestType.SignatureUpload) {
            await this.api.invoke('POST', '/api/v1/crypto/signatures', {}, { signedKeys: JSON.parse(request.body) }, signal);
            if (!request.id || signal.aborted) throw new CryptoVerificationError('UNKNOWN_FLOW');
            await machine.markRequestAsSent(request.id, request.type, JSON.stringify({ failures: {} })); continue;
          }
          if (request.type !== sdk.RequestType.ToDevice) continue;
          const body = JSON.parse(request.body);
          // Scoped room-key uploads are retried by the conversation client.
          if (body.event_type === 'm.room.encrypted') continue;
          let selected: Binding | undefined;
          for (const [matrixUser, devices] of Object.entries(body.messages as Record<string, Record<string, { transaction_id?: string }>>)) {
            for (const [deviceId, content] of Object.entries(devices)) {
              const match = [...this.bindings.values()].find(value => value.peerDeviceId === deviceId && value.flowId === content.transaction_id);
              if (!match || await matrixIdentifier('user', match.peerUserId) !== matrixUser || selected && (selected.conversationId !== match.conversationId || selected.membershipRevision !== match.membershipRevision)) throw new CryptoVerificationError('UNKNOWN_FLOW');
              selected = match;
            }
          }
          if (!selected) throw new CryptoVerificationError('UNKNOWN_FLOW');
          try { await (await this.adapter(machine, signal, selected)).send(request, signal); }
          catch (error) { if (!(error instanceof CryptoVerificationError && error.code === 'FLOW_CONTEXT_CHANGED')) throw error; }
        } finally { request.free(); }
      }
      return this.views(machine, signal);
    });
  }
  private async views(machine: sdk.OlmMachine, signal: AbortSignal): Promise<VerificationView[]> {
    const result: VerificationView[] = [];
    for (const [key, binding] of this.bindings) {
      const identity = new sdk.UserId(await matrixIdentifier('user', binding.peerUserId));
      const request = machine.getVerificationRequest(identity, binding.flowId);
      let sas: sdk.Sas | sdk.Qr | undefined;
      try {
        let status: VerificationView['status'] = this.cancelled.has(key) ? 'CANCELLED' : 'EXPIRED';
        let decimals: number[] | undefined, fingerprint: string | undefined, needsSasAccept = false;
        if (request) {
          status = request.weStarted() ? 'WAITING' : 'REQUESTED';
          if (request.isReady()) status = 'READY';
          if (request.isCancelled() || this.cancelled.has(key)) { status = 'CANCELLED'; this.cancelled.add(key); }
          else if (request.timedOut()) status = 'EXPIRED';
          else {
            sas = request.getVerification();
            if (sas instanceof sdk.Sas) {
              if (sas.isCancelled()) { this.cancelled.add(key); status = 'CANCELLED'; }
              needsSasAccept = !sas.hasBeenAccepted();
              if (!sas.isCancelled()) {
                if (sas.canBePresented()) { decimals = Array.from(sas.decimals() ?? []); status = sas.haveWeConfirmed() ? 'WAITING_PEER' : 'SAS'; }
                else status = 'WAITING';
              }
            }
            const id = new sdk.DeviceId(binding.peerDeviceId), device = await machine.getDevice(identity, id);
            try {
              fingerprint = device?.ed25519Key?.toBase64();
              if (request.isDone() && device?.isVerified() && !device.isDeleted() && fingerprint) {
                status = 'VERIFIED'; this.completed.set(key, { fingerprint, initiatedHere: request.weStarted() });
              }
            }
            finally { device?.free(); id.free(); }
          }
        }
        // Native SDK can discard a finished flow. Retain its public completion
        // only while the current native device still has the same trusted key.
        const completed = this.completed.get(key);
        if (status === 'EXPIRED' && completed) {
          const id = new sdk.DeviceId(binding.peerDeviceId), device = await machine.getDevice(identity, id);
          try {
            fingerprint = device?.ed25519Key?.toBase64();
            if (fingerprint === completed.fingerprint && device?.isVerified() && !device.isDeleted()) status = 'VERIFIED';
            else this.completed.delete(key);
          } finally { device?.free(); id.free(); }
        }
        try { await this.adapter(machine, signal, binding); } catch (error) { if (error instanceof CryptoVerificationError) status = 'STALE'; else throw error; }
        result.push({ ...binding, key, status, ...(decimals ? { decimals } : {}), ...(fingerprint ? { fingerprint } : {}), initiatedHere: request?.weStarted() ?? completed?.initiatedHere ?? false, needsSasAccept });
      } finally { sas?.free(); request?.free(); identity.free(); }
    }
    return result;
  }
  act(key: string, action: 'ACCEPT' | 'START' | 'ACCEPT_SAS' | 'CONFIRM' | 'MISMATCH' | 'CANCEL'): Promise<void> {
    return this.session.run(async (machine, signal) => {
      const binding = this.bindings.get(key); if (!binding) throw new CryptoVerificationError('UNKNOWN_FLOW');
      const adapter = await this.adapter(machine, signal, binding), user = new sdk.UserId(await matrixIdentifier('user', binding.peerUserId));
      const request = machine.getVerificationRequest(user, binding.flowId); let sas: sdk.Sas | sdk.Qr | undefined;
      try {
        if (!request || request.timedOut()) throw new CryptoVerificationError('UNKNOWN_FLOW');
        const send = async (outgoing: sdk.OutgoingVerificationRequest | undefined) => { if (outgoing) { try { await adapter.send(outgoing, signal); } finally { outgoing.free(); } } };
        if (action === 'ACCEPT') { await send(request.acceptWithMethods([sdk.VerificationMethod.SasV1])); return; }
        if (action === 'CANCEL') {
          const outgoing = request.cancel();
          if (request.isCancelled()) this.cancelled.add(key);
          await send(outgoing); return;
        }
        if (action === 'START') {
          const started = await request.startSas(); if (!started) throw new CryptoVerificationError('SAS_NOT_READY');
          try { await send(started[1]); } finally { started[0].free(); } return;
        }
        sas = request.getVerification(); if (!(sas instanceof sdk.Sas)) throw new CryptoVerificationError('SAS_NOT_READY');
        if (action === 'ACCEPT_SAS') { await send(sas.accept()); return; }
        if (action === 'MISMATCH') {
          const outgoing = sas.cancelWithCode('m.mismatched_sas');
          if (sas.isCancelled()) this.cancelled.add(key);
          await send(outgoing); return;
        }
        if (!sas.canBePresented() || sas.haveWeConfirmed()) throw new CryptoVerificationError('SAS_NOT_READY');
        for (const outgoing of await sas.confirm()) await send(outgoing);
      } finally { sas?.free(); request?.free(); user.free(); }
    });
  }
}
