import { OlmMachine } from '@matrix-org/matrix-sdk-crypto-wasm';
import { PutRecoveryBackupSchema, RecoveryBackupSchema } from '@fg/contracts';
import { z } from 'zod';
const recoveredSessions = new WeakMap<OlmMachine, Set<string>>();
const recoveredStores = new WeakMap<OlmMachine, { storage: Pick<Storage, 'getItem' | 'setItem'>; key: string }>();
const sessionKey = (room: string, sender: string, id: string) => JSON.stringify([room, sender, id]);
const publicId = z.string().min(1).max(256);
const manifestSchema = z.object({ version: z.literal(1), sessions: z.array(z.tuple([publicId, publicId, publicId])).max(10000) }).strict();
const maximumManifestLength = 4 * 1024 * 1024;

/** Untrusted public metadata; attach only after the encrypted native store opens. */
export function attachRecoveryProvenanceStore(machine: OlmMachine, storage: Pick<Storage, 'getItem' | 'setItem'>, key: string): void {
  recoveredStores.set(machine, { storage, key });
  const sessions = new Set<string>();
  try {
    const raw = storage.getItem(key);
    if (raw && raw.length <= maximumManifestLength) for (const tuple of manifestSchema.parse(JSON.parse(raw)).sessions) sessions.add(sessionKey(...tuple));
  } catch { /* Corrupt/unavailable metadata never grants recovered read or native trust. */ }
  recoveredSessions.set(machine, sessions);
}

/** Public provenance only; this never changes native device trust. */
export async function hasExplicitRecoveredSession(machine: OlmMachine, room: string, sender: string, id: string): Promise<boolean> {
  if (!recoveredSessions.get(machine)?.has(sessionKey(room, sender, id))) return false;
  let found = false;
  // Returning false prevents private room keys from being exported to JS.
  await machine.exportRoomKeys(session => {
    const nativeRoom = session.roomId, nativeSender = session.senderKey;
    try { if (session.hasBeenImported() && nativeRoom.toString() === room && nativeSender.toBase64() === sender && session.sessionId === id) found = true; }
    finally { nativeRoom.free(); nativeSender.free(); }
    return false;
  });
  return found;
}

export class RecoveryError extends Error {
  constructor(public readonly code: 'INVALID_RECOVERY_CODE' | 'RECOVERY_FAILED') {
    super(code);
    this.name = 'RecoveryError';
  }
}

export function createRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  try { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  finally { bytes.fill(0); }
}

function requireCode(code: string): void {
  // This is a generated independent 256-bit code, never a password or reset token.
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw new RecoveryError('INVALID_RECOVERY_CODE');
}

export async function prepareRecoveryBackup(machine: OlmMachine, code: string, expectedVersion: number): Promise<z.infer<typeof PutRecoveryBackupSchema>> {
  requireCode(code);
  try {
    const exported = await machine.exportRoomKeys(() => true);
    return PutRecoveryBackupSchema.parse({ version: 1, format: 'MATRIX_ENCRYPTED_EXPORT',
      ciphertext: OlmMachine.encryptExportedRoomKeys(exported, code, 100_000), expectedVersion });
  } catch { throw new RecoveryError('RECOVERY_FAILED'); }
}

/** Imports historical room keys only. Never marks a device/identity verified. */
export async function restoreRecoveryBackup(machine: OlmMachine, input: unknown, code: string): Promise<string> {
  requireCode(code);
  try {
    const backup = RecoveryBackupSchema.parse(input);
    const exported = OlmMachine.decryptExportedRoomKeys(backup.ciphertext, code);
    const result = await machine.importRoomKeys(exported, () => undefined);
    const keys: unknown = JSON.parse(exported), sessions = new Set(recoveredSessions.get(machine) ?? []);
    if (!Array.isArray(keys)) throw new RecoveryError('RECOVERY_FAILED');
    for (const key of keys) {
      if (!key || typeof key !== 'object') continue;
      const room: unknown = Reflect.get(key, 'room_id'), sender: unknown = Reflect.get(key, 'sender_key'), id: unknown = Reflect.get(key, 'session_id');
      if ([room, sender, id].every(value => typeof value === 'string' && value.length > 0 && value.length <= 256)) sessions.add(sessionKey(room as string, sender as string, id as string));
    }
    const store = recoveredStores.get(machine);
    if (store) {
      const manifest = manifestSchema.parse({ version: 1, sessions: [...sessions].map(value => JSON.parse(value)) });
      const encoded = JSON.stringify(manifest);
      if (encoded.length > maximumManifestLength) throw new RecoveryError('RECOVERY_FAILED');
      store.storage.setItem(store.key, encoded);
    }
    recoveredSessions.set(machine, sessions);
    return result;
  } catch { throw new RecoveryError('RECOVERY_FAILED'); }
}
