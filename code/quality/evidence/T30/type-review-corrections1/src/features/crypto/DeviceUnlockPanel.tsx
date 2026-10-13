export interface DeviceUnlockPanelProps {
  userId?: string;
  existingDevice: boolean;
  errorCode?: 'OTHER_TAB' | 'STORE_LOCKED' | 'UNSUPPORTED' | 'REVOKED_DEVICE' | 'SERVICE_UNAVAILABLE' | 'ACCESS_DENIED';
  onUnlock: (code: string, selection?: CryptoDeviceSelection) => Promise<void>;
  onCancel: () => void;
}

const errors = {
  OTHER_TAB: 'Thiết bị đang mở trong tab khác. Đóng hoặc khóa tab đó rồi thử lại.',
  STORE_LOCKED: 'Không mở được thiết bị. Kiểm tra mã khôi phục; mật khẩu tài khoản không thay thế mã này.',
  UNSUPPORTED: 'Trình duyệt chưa hỗ trợ kho khóa an toàn. Dùng trình duyệt có IndexedDB và Web Locks qua HTTPS.',
  REVOKED_DEVICE: 'Thiết bị đã bị thu hồi. Cần đăng ký thiết bị mới và xác minh lại với người nhận.',
  SERVICE_UNAVAILABLE: 'Dịch vụ mã hóa chưa sẵn sàng. Giữ mã của bạn và thử lại khi dịch vụ hoạt động.',
  ACCESS_DENIED: 'Phiên đăng nhập hoặc quyền thiết bị không còn hợp lệ. Thiết bị đã được khóa; kiểm tra tài khoản trước khi mở lại.',
};

export function DeviceUnlockPanel({ userId, existingDevice, errorCode, onUnlock, onCancel }: DeviceUnlockPanelProps) {
  const id = useId();
  const [code, setCode] = useState('');
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [newDevice, setNewDevice] = useState(false), [selectedDevice, setSelectedDevice] = useState('');
  const [stores, setStores] = useState<{ owner: string; active: string | null; ids: string[] }>();
  useEffect(() => {
    let alive = true;
    if (userId) void listStoredCryptoDevices(userId).then(value => { if (alive) setStores({ owner: userId, ...value }); }).catch(() => { if (alive) setStores(undefined); });
    return () => { alive = false; };
  }, [userId, existingDevice]);
  const localStores = stores?.owner === userId ? stores : undefined;
  const needsGeneratedCode = !existingDevice || newDevice;
  const attempt = useRef(0);
  const valid = /^[A-Za-z0-9_-]{43}$/.test(code) && (!needsGeneratedCode || (generated && saved));
  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || busy) return;
    const current = ++attempt.current;
    setBusy(true); setVisible(false); setFeedback('');
    try {
      if (newDevice) await onUnlock(code, { newDevice: true });
      else if (selectedDevice) await onUnlock(code, { deviceId: selectedDevice });
      else await onUnlock(code);
      if (current === attempt.current) { setCode(''); setSaved(false); setGenerated(false); }
    } catch {
      if (current === attempt.current) setFeedback(errors.STORE_LOCKED);
    } finally { setBusy(false); }
  }
  function cancel() {
    attempt.current++; setCode(''); setSaved(false); setGenerated(false); setVisible(false); setFeedback(''); setNewDevice(false); setSelectedDevice(''); onCancel();
  }
  function chooseNew(value: boolean) {
    setNewDevice(value); setSelectedDevice(''); setCode(''); setSaved(false); setGenerated(false); setVisible(false); setFeedback('');
  }
  return <section className="fg-crypto-panel" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Mở khóa thiết bị</h2>
    <p className="fg-crypto-help">Mã khôi phục riêng bảo vệ khóa trên thiết bị này. Mật khẩu đăng nhập không mở được lịch sử mã hóa.</p>
    {existingDevice && !newDevice && <button type="button" className="fg-btn fg-btn-outline" disabled={busy} onClick={() => chooseNew(true)}>Tạo thiết bị mới</button>}
    {newDevice && <><p className="fg-crypto-help">Thiết bị mới dùng khóa mới, chưa được người nhận xác minh và không tự đọc được lịch sử cũ. Kho khóa cũ được giữ trên trình duyệt; để khôi phục lịch sử cần bản khôi phục và mã riêng của bản đó.</p><button type="button" className="fg-btn fg-btn-outline" disabled={busy} onClick={() => chooseNew(false)}>Quay lại thiết bị đã lưu</button></>}
    <form onSubmit={unlock}>
      {!newDevice && localStores && localStores.ids.length > 1 && <label>Kho thiết bị đã lưu<select aria-label="Kho thiết bị đã lưu" disabled={busy} value={selectedDevice || localStores.active || ''} onChange={event => { setSelectedDevice(event.target.value); setCode(''); setSaved(false); setGenerated(false); setVisible(false); setFeedback(''); }}>{localStores.ids.map((deviceId, index) => <option key={deviceId} value={deviceId}>Thiết bị {index + 1} · {deviceId.slice(-8)}{deviceId === localStores.active ? ' · gần nhất' : ''}</option>)}</select></label>}
      <label htmlFor={`${id}-code`}>Mã khôi phục</label>
      <div className="fg-crypto-secret">
        <input id={`${id}-code`} type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false} autoCapitalize="none"
          value={code} maxLength={43} required readOnly={needsGeneratedCode} disabled={busy} aria-describedby={`${id}-help`}
          onChange={event => { setCode(event.target.value); setFeedback(''); }}/>
        <button type="button" aria-label={visible ? 'Ẩn mã' : 'Hiện mã'} aria-pressed={visible} disabled={busy} onClick={() => setVisible(!visible)}>
          {visible ? <EyeOff size={20}/> : <Eye size={20}/>}</button>
      </div>
      <p id={`${id}-help`} className="fg-crypto-help">Mã gồm 43 ký tự. FG không lưu mã này và không thể cấp lại khóa đã mất nếu không có bản khôi phục.</p>
      {needsGeneratedCode && <>
        <button className="fg-btn fg-btn-outline" type="button" disabled={busy} onClick={() => { setCode(createRecoveryCode()); setGenerated(true); setSaved(false); setVisible(true); setFeedback(''); }}>Tạo mã khôi phục</button>
        <label className="fg-crypto-check"><input type="checkbox" checked={saved} disabled={busy} onChange={event => setSaved(event.target.checked)}/>Tôi đã lưu mã ở nơi an toàn</label>
      </>}
      {code && <button className="fg-btn fg-btn-outline" type="button" disabled={busy} onClick={async () => {
        try { await navigator.clipboard.writeText(code); setFeedback(''); }
        catch { setFeedback('Không sao chép được mã. Dùng nút Hiện mã để lưu thủ công.'); }
      }}>Sao chép mã</button>}
      {(errorCode || feedback) && <p className="fg-crypto-error" role="alert">{errorCode ? errors[errorCode] : feedback}</p>}
      {busy && <p role="status" className="fg-crypto-help">Đang mở khóa thiết bị…</p>}
      <div className="fg-crypto-actions">
        <button className="fg-btn fg-btn-primary" type="submit" disabled={!valid || busy}>{busy ? 'Đang mở khóa…' : 'Mở khóa thiết bị'}</button>
        <button className="fg-btn fg-btn-outline" type="button" onClick={cancel}>Hủy</button>
      </div>
    </form>
  </section>;
}
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { listStoredCryptoDevices, type CryptoDeviceSelection } from './device-session';
import { Eye, EyeOff } from 'lucide-react';
import { createRecoveryCode } from './recovery';
import './crypto.css';

