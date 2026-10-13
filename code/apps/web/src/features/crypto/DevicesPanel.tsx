import { useCallback, useEffect, useState } from 'react';
import { CryptoDeviceSchema } from '@fg/contracts';
import type { z } from 'zod';
import { CryptoApi } from './api';
import { useCryptoDevice } from './CryptoDeviceProvider';
const api = new CryptoApi();
type Device = z.infer<typeof CryptoDeviceSchema>;

export function DevicesPanel() {
  const device = useCryptoDevice(), session = device.session;
  const [devices, setDevices] = useState<Device[]>([]), [error, setError] = useState(''), [pending, setPending] = useState<string>();
  const refresh = useCallback(async () => {
    if (!session || session.signal.aborted) return;
    try {
      const response = await api.invoke('GET', '/api/v1/crypto/devices', {}, undefined, session.signal);
      const parsed = CryptoDeviceSchema.array().max(100).parse(response);
      if (!session.signal.aborted) { setDevices(parsed); setError(''); }
    } catch { if (!session.signal.aborted) setError('Chưa tải được danh sách thiết bị của bạn.'); }
  }, [session]);
  useEffect(() => { setDevices([]); void refresh(); }, [refresh]);
  async function revoke(id: string) {
    if (pending || !session || session.signal.aborted) return;
    setPending(id); setError('');
    try {
      await api.invoke('DELETE', '/api/v1/crypto/devices/:deviceId', { deviceId: id }, undefined, session.signal);
      if (id === device.deviceId) await device.lock(); else await refresh();
    } catch { if (!session.signal.aborted) setError('Chưa xác nhận thu hồi thiết bị. Kiểm tra trạng thái và thử lại.'); }
    finally { setPending(undefined); }
  }
  if (!session || session.signal.aborted) return null;
  return <section className="fg-crypto-panel" aria-labelledby="fg-own-devices-title">
    <h2 id="fg-own-devices-title">Thiết bị của bạn</h2>
    <p className="fg-crypto-help">Thu hồi thiết bị bị mất để chặn nhận khóa và tin mới. Thu hồi không xóa bản tin thiết bị đã giữ. Thiết bị mới cần xác minh riêng.</p>
    <button type="button" className="fg-btn fg-btn-outline" disabled={Boolean(pending)} onClick={() => void refresh()}>Tải lại thiết bị</button>
    {devices.map(item => <div key={item.deviceId} className="fg-private-device"><span>{item.deviceId}{item.deviceId === device.deviceId ? ' · thiết bị đang dùng' : ''}<small>{item.revokedAt ? 'Đã thu hồi' : 'Đã đăng ký · không phải xác nhận trust'}</small></span>
      {!item.revokedAt && <button type="button" className="fg-btn fg-btn-outline" aria-label={`Thu hồi ${item.deviceId}`} disabled={Boolean(pending)} onClick={() => void revoke(item.deviceId)}>Thu hồi</button>}</div>)}
    {pending && <p role="status">Đang thu hồi thiết bị…</p>}{error && <p role="alert" className="fg-crypto-error">{error}</p>}
  </section>;
}
