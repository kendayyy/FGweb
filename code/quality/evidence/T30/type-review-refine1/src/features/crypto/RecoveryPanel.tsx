import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CryptoApi, CryptoApiError } from './api';
import { CryptoRecoveryClient } from './recovery-client';
import { createRecoveryCode } from './recovery';
import type { NativeDeviceSession } from './device-session';

export function RecoveryPanel({ session }: { session: NativeDeviceSession }) {
  const id = useId(), client = useMemo(() => new CryptoRecoveryClient(session, new CryptoApi()), [session]);
  const [version, setVersion] = useState<number>(), [mode, setMode] = useState<'BACKUP' | 'RESTORE'>('BACKUP');
  const [code, setCode] = useState(''), [saved, setSaved] = useState(false), [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  const alive = useRef(true), pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    const clear = () => { setCode(''); setSaved(false); setVisible(false); setSuccess(''); setError(''); };
    session.signal.addEventListener('abort', clear, { once: true });
    void client.current().then(backup => { if (alive.current && !session.signal.aborted) setVersion(backup?.backupVersion ?? 0); })
      .catch(() => { if (alive.current && !session.signal.aborted) setError('Chưa tải được trạng thái bản khôi phục.'); });
    return () => { alive.current = false; session.signal.removeEventListener('abort', clear); };
  }, [client, session]);
  function changeMode(next: 'BACKUP' | 'RESTORE') { setMode(next); setCode(''); setSaved(false); setVisible(false); setError(''); setSuccess(''); }
  async function submit() {
    if (pending.current || session.signal.aborted || !/^[A-Za-z0-9_-]{43}$/.test(code) || mode === 'BACKUP' && (!saved || version === undefined)) return;
    pending.current = true; setBusy(true); setVisible(false); setError(''); setSuccess('');
    try {
      if (mode === 'BACKUP') {
        const stored = await client.backup(code, version!);
        if (alive.current && !session.signal.aborted) { setVersion(stored.backupVersion); setSuccess('Bản khôi phục khóa đã được mã hóa và lưu. Chỉ mã riêng của bạn mở được bản này.'); }
      } else {
        const restored = await client.restore(code);
        if (alive.current && !session.signal.aborted) setSuccess(`Đã kiểm tra ${restored.total} khóa lịch sử, nhập thêm ${restored.imported}. Thiết bị vẫn cần xác minh; lịch sử từ bản khôi phục sẽ được đánh dấu riêng.`);
      }
      if (alive.current && !session.signal.aborted) { setCode(''); setSaved(false); }
    } catch (problem) {
      if (alive.current && !session.signal.aborted) setError(problem instanceof CryptoApiError && problem.status === 409 ? 'Bản khôi phục đã thay đổi trên thiết bị khác. Tải lại trạng thái trước khi thay bản.' : mode === 'RESTORE' ? 'Không khôi phục được. Kiểm tra mã riêng và bản khôi phục; mật khẩu tài khoản không thay thế mã này.' : 'Chưa xác nhận lưu bản khôi phục. Thiết bị cần có khóa lịch sử; giữ mã và kiểm tra kết nối.');
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  if (session.signal.aborted) return null;
  return <section className="fg-crypto-panel" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Khôi phục lịch sử mã hóa</h2>
    <p className="fg-crypto-help">Bản này chứa room keys đã mã hóa, không chứa identity hay trust thiết bị. Mất mọi thiết bị và mã riêng thì không đọc lại được lịch sử cũ. Mật khẩu đăng nhập/reset không mở bản khôi phục.</p>
    <p>{version === undefined ? 'Đang kiểm tra bản khôi phục…' : version ? `Bản khôi phục đang lưu: phiên bản ${version}.` : 'Chưa có bản khôi phục khóa.'}</p>
    <div className="fg-crypto-actions"><button type="button" className="fg-btn fg-btn-outline" disabled={busy} onClick={() => changeMode('BACKUP')}>Sao lưu khóa</button><button type="button" className="fg-btn fg-btn-outline" disabled={busy} onClick={() => changeMode('RESTORE')}>Nhập bản khôi phục</button>
      <button type="button" className="fg-btn fg-btn-outline" disabled={busy} onClick={() => void client.current().then(backup => { if (alive.current && !session.signal.aborted) { setVersion(backup?.backupVersion ?? 0); setError(''); } }).catch(() => setError('Chưa tải được trạng thái bản khôi phục.'))}>Tải lại bản khôi phục</button></div>
    <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label htmlFor={`${id}-code`}>Mã riêng cho bản khôi phục</label>
      <div className="fg-crypto-secret"><input id={`${id}-code`} type={visible ? 'text' : 'password'} value={code} maxLength={43} autoComplete="off" autoCapitalize="none" spellCheck={false} readOnly={mode === 'BACKUP'} disabled={busy} onChange={event => setCode(event.target.value)}/>
        <button type="button" disabled={busy} aria-label={visible ? 'Ẩn mã bản khôi phục' : 'Hiện mã bản khôi phục'} onClick={() => setVisible(!visible)}>{visible ? 'Ẩn' : 'Hiện'}</button></div>
      {mode === 'BACKUP' && <><button type="button" className="fg-btn fg-btn-outline" disabled={busy} onClick={() => { setCode(createRecoveryCode()); setVisible(true); setSaved(false); setSuccess(''); }}>Tạo mã riêng cho bản khôi phục</button>
        <label className="fg-crypto-check"><input type="checkbox" checked={saved} disabled={busy} onChange={event => setSaved(event.target.checked)}/>Tôi đã lưu mã bản khôi phục ở nơi an toàn</label>
        {Boolean(version) && <p className="fg-crypto-help">Lưu sẽ thay bản khôi phục hiện tại. Bản mới dùng mã mới bạn vừa lưu; mã cũ không mở được bản mới.</p>}</>}
      <button type="submit" className="fg-btn fg-btn-primary" disabled={busy || !/^[A-Za-z0-9_-]{43}$/.test(code) || mode === 'BACKUP' && (!saved || version === undefined)}>{mode === 'BACKUP' ? 'Mã hóa và lưu bản khôi phục' : 'Khôi phục khóa lịch sử'}</button>
      {busy && <p role="status">Đang xử lý bản khôi phục…</p>}{success && <p role="status">{success}</p>}{error && <p role="alert" className="fg-crypto-error">{error}</p>}
    </form>
  </section>;
}
