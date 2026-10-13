import { RecoveryBackupSchema } from '@fg/contracts';
import { CryptoApi, CryptoApiError } from './api';
import { NativeDeviceSession } from './device-session';
import { prepareRecoveryBackup, restoreRecoveryBackup, RecoveryError } from './recovery';

export class CryptoRecoveryClient {
  constructor(private readonly session: NativeDeviceSession, private readonly api: CryptoApi) {}
  async current() {
    try { return RecoveryBackupSchema.parse(await this.api.invoke('GET', '/api/v1/crypto/recovery', {}, undefined, this.session.signal)); }
    catch (error) { if (error instanceof CryptoApiError && error.status === 404) return null; throw error; }
  }
  backup(code: string, expectedVersion: number) {
    return this.session.run(async (machine, signal) => {
      const counts = await machine.roomKeyCounts();
      try { if (!counts.total) throw new RecoveryError('RECOVERY_FAILED'); } finally { counts.free(); }
      const payload = await prepareRecoveryBackup(machine, code, expectedVersion);
      try {
        const stored = RecoveryBackupSchema.parse(await this.api.invoke('PUT', '/api/v1/crypto/recovery', {}, payload, signal));
        if (stored.backupVersion !== expectedVersion + 1 || stored.ciphertext !== payload.ciphertext) throw new RecoveryError('RECOVERY_FAILED');
        return stored;
      } catch (error) {
        // A committed backup whose response was lost must be read back exactly.
        const stored = await this.current();
        if (stored?.backupVersion === expectedVersion + 1 && stored.ciphertext === payload.ciphertext) return stored;
        throw error;
      }
    });
  }
  restore(code: string): Promise<{ imported: number; total: number }> {
    return this.session.run(async machine => {
      const backup = await this.current(); if (!backup) throw new RecoveryError('RECOVERY_FAILED');
      const result: unknown = JSON.parse(await restoreRecoveryBackup(machine, backup, code));
      const imported: unknown = result && typeof result === 'object' ? Reflect.get(result, 'imported_count') : undefined;
      const total: unknown = result && typeof result === 'object' ? Reflect.get(result, 'total_count') : undefined;
      if (typeof imported !== 'number' || typeof total !== 'number' || !Number.isSafeInteger(imported) || !Number.isSafeInteger(total) || imported < 0 || total <= 0 || imported > total) throw new RecoveryError('RECOVERY_FAILED');
      return { imported, total };
    });
  }
}
