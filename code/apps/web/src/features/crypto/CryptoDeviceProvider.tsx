import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { registerAuthCleanup } from '../auth/lifecycle';
import { CryptoApi, CryptoApiError } from './api';
import { bootstrapNativeDevice, CryptoBootstrapError } from './bootstrap';
import { CryptoDeviceError, hasStoredCryptoDevice, NativeDeviceSession, openCryptoDevice, type CryptoDeviceSelection } from './device-session';
import { DeviceUnlockPanel, type DeviceUnlockPanelProps } from './DeviceUnlockPanel';
import { CryptoVerificationInbox, type VerificationView } from './verification';
import { VerificationPanel } from './VerificationPanel';

interface CryptoDeviceContext {
  status: 'LOCKED' | 'UNLOCKING' | 'READY';
  existingDevice: boolean;
  errorCode?: DeviceUnlockPanelProps['errorCode'];
  deviceId?: string;
  session?: NativeDeviceSession;
  inbox?: CryptoVerificationInbox;
  verificationViews?: VerificationView[];
  syncError?: string;
  unlock(code: string, selection?: CryptoDeviceSelection): Promise<void>;
  lock(): Promise<void>;
}
const Context = createContext<CryptoDeviceContext | undefined>(undefined);
const api = new CryptoApi();

export function CryptoDeviceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth(), userId = user?.id;
  const [view, setView] = useState<Omit<CryptoDeviceContext, 'unlock' | 'lock'>>({ status: 'LOCKED', existingDevice: false });
  const session = useRef<NativeDeviceSession | undefined>(undefined);
  const pending = useRef<AbortController | undefined>(undefined);
  const epoch = useRef(0);
  const owner = useRef<string | undefined>(undefined);
  const lock = useCallback(async () => {
    epoch.current++; owner.current = undefined; pending.current?.abort(); pending.current = undefined;
    const current = session.current; session.current = undefined;
    setView(previous => ({ status: 'LOCKED', existingDevice: previous.existingDevice }));
    await current?.close();
  }, []);
  useEffect(() => registerAuthCleanup(lock), [lock]);
  useEffect(() => {
    const inbox = view.inbox, currentSession = view.session;
    if (!inbox || !currentSession || view.status !== 'READY') return;
    let active = true, running = false, timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      if (!active || running || document.hidden || currentSession!.signal.aborted) return;
      running = true;
      try {
        const verificationViews = await inbox!.poll();
        if (active && session.current === currentSession) setView(previous => ({ ...previous, verificationViews, syncError: undefined }));
      } catch (error) {
        if (!active || session.current !== currentSession) return;
        if (error instanceof CryptoApiError && (error.status === 401 || error.status === 403)) {
          await lock();
          if (active) setView({ status: 'LOCKED', existingDevice: true, errorCode: 'ACCESS_DENIED' });
        } else setView(previous => ({ ...previous, verificationViews: [], syncError: 'Chưa đồng bộ được khóa và xác minh. Tin riêng chưa đồng bộ có thể chưa đọc được; kiểm tra kết nối rồi thử lại.' }));
      } finally {
        running = false;
        if (active && !document.hidden && !currentSession!.signal.aborted) timer = setTimeout(() => void tick(), 2000);
      }
    }
    function visibility() { if (timer) clearTimeout(timer); if (!document.hidden) void tick(); }
    document.addEventListener('visibilitychange', visibility); void tick();
    return () => { active = false; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [view.inbox, view.session, view.status, lock]);
  useEffect(() => {
    void lock(); const current = epoch.current;
    if (userId) void hasStoredCryptoDevice(userId).then(existingDevice => {
      if (epoch.current === current) setView({ status: 'LOCKED', existingDevice });
    }).catch(() => {
      if (epoch.current === current) setView({ status: 'LOCKED', existingDevice: false, errorCode: 'UNSUPPORTED' });
    });
    else setView({ status: 'LOCKED', existingDevice: false });
    return () => { epoch.current++; pending.current?.abort(); void session.current?.close(); session.current = undefined; };
  }, [userId, lock]);
  const unlock = useCallback(async (code: string, selection?: CryptoDeviceSelection) => {
    if (!userId || pending.current || session.current) throw new CryptoDeviceError('CLOSED');
    const current = ++epoch.current, abort = new AbortController(); pending.current = abort;
    setView(previous => ({ status: 'UNLOCKING', existingDevice: previous.existingDevice }));
    let opened: NativeDeviceSession | undefined;
    try {
      opened = await openCryptoDevice(userId, code, abort.signal, selection);
      const registered = await opened.run((machine, signal) => bootstrapNativeDevice(machine, api, userId, signal));
      if (current !== epoch.current || abort.signal.aborted) throw new CryptoDeviceError('CLOSED');
      session.current = opened;
      owner.current = userId;
      opened.signal.addEventListener('abort', () => {
        if (session.current === opened) { session.current = undefined; setView({ status: 'LOCKED', existingDevice: true }); }
      }, { once: true });
      setView({ status: 'READY', existingDevice: true, deviceId: registered.deviceId, session: opened, inbox: new CryptoVerificationInbox(opened, api, userId), verificationViews: [] });
    } catch (error) {
      await opened?.close();
      if (current === epoch.current) {
        let errorCode: DeviceUnlockPanelProps['errorCode'] = 'SERVICE_UNAVAILABLE';
        if (error instanceof CryptoDeviceError) errorCode = error.code === 'OTHER_TAB' || error.code === 'UNSUPPORTED' ? error.code : 'STORE_LOCKED';
        if (error instanceof CryptoBootstrapError) errorCode = error.code === 'REVOKED_DEVICE' ? 'REVOKED_DEVICE' : 'STORE_LOCKED';
        const existingDevice = await hasStoredCryptoDevice(userId).catch(() => true);
        if (current === epoch.current) setView({ status: 'LOCKED', existingDevice, errorCode });
      }
      throw new Error('DEVICE_UNLOCK_FAILED', { cause: error });
    } finally { if (pending.current === abort) pending.current = undefined; }
  }, [userId]);
  const visible = view.status === 'READY' && owner.current !== userId ? { status: 'LOCKED' as const, existingDevice: false } : view;
  return <Context.Provider value={{ ...visible, unlock, lock }}>{children}</Context.Provider>;
}

export function useCryptoDevice(): CryptoDeviceContext {
  const value = useContext(Context); if (!value) throw new Error('CryptoDeviceProvider required'); return value;
}
export function useOptionalCryptoDevice(): CryptoDeviceContext | undefined { return useContext(Context); }

import { RecoveryPanel } from './RecoveryPanel';
import { DevicesPanel } from './DevicesPanel';
export function CryptoDeviceSettings() {
  const device = useCryptoDevice();
  const { user } = useAuth();
  return <div style={{ padding: 16, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
    {device.status === 'READY' ? <section className="fg-crypto-panel" aria-labelledby="fg-device-title">
      <h2 id="fg-device-title">Thiết bị mã hóa</h2>
      <p role="status">Thiết bị đã mở khóa và đăng ký với FG.</p>
      <p className="fg-crypto-help">ID: {device.deviceId}</p>
      <p className="fg-crypto-help">Cần xác minh thiết bị người nhận trước khi gửi tin riêng. Đăng ký thiết bị không tự xác minh người nhận.</p>
      <button type="button" className="fg-btn fg-btn-outline" onClick={() => void device.lock()}>Khóa thiết bị</button>
      {device.syncError && <p className="fg-crypto-error" role="alert">{device.syncError}</p>}
      {device.inbox && <VerificationPanel inbox={device.inbox} views={device.verificationViews ?? []}/>}
    </section> : <DeviceUnlockPanel key={user?.id ?? 'guest'} userId={user?.id} existingDevice={device.existingDevice} errorCode={device.errorCode}
      onUnlock={device.unlock} onCancel={() => void device.lock()}/>}
    {device.status === 'READY' && device.session && <RecoveryPanel session={device.session}/>}
    {device.status === 'READY' && device.session && <DevicesPanel/>}
  </div>;
}
