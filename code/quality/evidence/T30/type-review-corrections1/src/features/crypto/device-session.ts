import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { registerAuthCleanup } from '../auth/lifecycle';
import { matrixIdentifier } from './client';
import { attachRecoveryProvenanceStore } from './recovery';

export class CryptoDeviceError extends Error {
  constructor(public readonly code: 'CLOSED' | 'OTHER_TAB' | 'UNSUPPORTED' | 'STORE_LOCKED' | 'INVALID_CODE') {
    super(code); this.name = 'CryptoDeviceError';
  }
}

export async function hasStoredCryptoDevice(userId: string): Promise<boolean> {
  const matrixId = await matrixIdentifier('user', userId);
  const namespace = `fg-crypto-v1-${matrixId.slice(4, matrixId.indexOf(':'))}`;
  return localStorage.getItem(`${namespace}.device`) !== null;
}
export type CryptoDeviceSelection = { newDevice: true } | { deviceId: string };
const storedDevicePattern = /^FG_[a-f0-9-]{36}$/;
function storedDevices(namespace: string): { active: string | null; ids: string[] } {
  const active = localStorage.getItem(`${namespace}.device`), raw = localStorage.getItem(`${namespace}.previous-devices`);
  const previous: unknown = raw ? JSON.parse(raw) : [];
  if (active && !storedDevicePattern.test(active) || !Array.isArray(previous) || previous.length > 1000 || previous.some(id => typeof id !== 'string' || !storedDevicePattern.test(id))) throw new CryptoDeviceError('STORE_LOCKED');
  return { active, ids: [...new Set([...(active ? [active] : []), ...previous as string[]])] };
}
export async function listStoredCryptoDevices(userId: string): Promise<{ active: string | null; ids: string[] }> {
  const matrixId = await matrixIdentifier('user', userId);
  return storedDevices(`fg-crypto-v1-${matrixId.slice(4, matrixId.indexOf(':'))}`);
}

/** Serial SDK access; closing suppresses pending results before releasing the store. */
export class NativeDeviceSession {
  private queue: Promise<void> = Promise.resolve();
  private closed = false;
  private closing?: Promise<void>;
  private readonly abort = new AbortController();
  private readonly unregister: () => void;
  readonly signal = this.abort.signal;

  constructor(private readonly machine: sdk.OlmMachine, private readonly release: () => void) {
    this.unregister = registerAuthCleanup(() => this.close());
  }

  run<T>(action: (machine: sdk.OlmMachine, signal: AbortSignal) => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      if (this.closed) throw new CryptoDeviceError('CLOSED');
      const value = await action(this.machine, this.signal);
      if (this.closed) throw new CryptoDeviceError('CLOSED');
      return value;
    });
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.abort.abort();
    this.unregister();
    this.closing = this.queue.then(() => {
      try { this.machine.close(); } finally { this.release(); }
    });
    return this.closing;
  }
}

/** Passphrase stays in user custody; only public device/store/recovered-session identifiers persist. */
export async function openCryptoDevice(userId: string, code: string, signal?: AbortSignal, selection?: CryptoDeviceSelection): Promise<NativeDeviceSession> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw new CryptoDeviceError('INVALID_CODE');
  if (!globalThis.isSecureContext || !navigator.locks || !globalThis.indexedDB) throw new CryptoDeviceError('UNSUPPORTED');
  if (signal?.aborted) throw new CryptoDeviceError('CLOSED');
  const matrixId = await matrixIdentifier('user', userId);
  const namespace = `fg-crypto-v1-${matrixId.slice(4, matrixId.indexOf(':'))}`;
  let resolveReady!: (session: NativeDeviceSession) => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<NativeDeviceSession>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const held = navigator.locks.request(namespace, { ifAvailable: true }, async lock => {
    if (!lock) throw new CryptoDeviceError('OTHER_TAB');
    let machine: sdk.OlmMachine | undefined;
    let session: NativeDeviceSession | undefined;
    try {
      const key = `${namespace}.device`;
      const stored = storedDevices(namespace), existing = stored.active;
      if (selection && 'deviceId' in selection && !stored.ids.includes(selection.deviceId)) throw new CryptoDeviceError('STORE_LOCKED');
      if (selection && 'newDevice' in selection && stored.ids.length >= 1000) throw new CryptoDeviceError('STORE_LOCKED');
      const deviceId = selection && 'newDevice' in selection ? `FG_${crypto.randomUUID()}` : selection && 'deviceId' in selection ? selection.deviceId : existing ?? `FG_${crypto.randomUUID()}`;
      await sdk.initAsync();
      const identity = new sdk.UserId(matrixId), device = new sdk.DeviceId(deviceId);
      try {
        machine = await sdk.OlmMachine.initialize(identity, device, `${namespace}-${deviceId}`, code,
          { debug() {}, info() {}, warn() {}, error() {} });
      } finally { identity.free(); device.free(); }
      if (signal?.aborted) throw new CryptoDeviceError('CLOSED');
      attachRecoveryProvenanceStore(machine, localStorage, `${namespace}-${deviceId}.recovered`);
      // A failed unlock never replaces a store. Explicit choices preserve prior store IDs/data.
      if (deviceId !== existing) {
        localStorage.setItem(`${namespace}.previous-devices`, JSON.stringify(stored.ids.filter(id => id !== deviceId)));
        localStorage.setItem(key, deviceId);
      }
      let release!: () => void;
      const untilClosed = new Promise<void>(resolve => { release = resolve; });
      session = new NativeDeviceSession(machine, release);
      const current = session;
      const onAbort = () => { void current.close(); };
      const onPageHide = () => { void current.close(); };
      signal?.addEventListener('abort', onAbort, { once: true });
      window.addEventListener('pagehide', onPageHide, { once: true });
      resolveReady(session);
      try { await untilClosed; }
      finally { signal?.removeEventListener('abort', onAbort); window.removeEventListener('pagehide', onPageHide); }
    } catch (error) {
      if (!session) machine?.close();
      if (error instanceof CryptoDeviceError) throw error;
      throw new CryptoDeviceError('STORE_LOCKED');
    }
  });
  void held.catch(rejectReady);
  return ready;
}
