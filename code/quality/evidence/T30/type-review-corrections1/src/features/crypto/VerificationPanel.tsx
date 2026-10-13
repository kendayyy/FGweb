import { useEffect, useId, useState } from 'react';
import { fetchPublicProfile } from '../profiles/api';
import { CryptoVerificationInbox, type VerificationView } from './verification';

export function VerificationPanel({ inbox, views }: { inbox: CryptoVerificationInbox; views: VerificationView[] }) {
  return <div className="fg-crypto-verifications">{views.map(view => <VerificationFlow key={view.key} inbox={inbox} view={view}/>)}</div>;
}
function VerificationFlow({ inbox, view }: { inbox: CryptoVerificationInbox; view: VerificationView }) {
  const id = useId();
  const [name, setName] = useState(''), [pending, setPending] = useState(false), [confirmed, setConfirmed] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController(); setName('');
    void fetchPublicProfile(view.peerUserId, abort.signal).then(profile => { if (!abort.signal.aborted) setName(profile.displayName); }).catch(() => undefined);
    return () => abort.abort();
  }, [view.peerUserId]);
  async function act(action: Parameters<CryptoVerificationInbox['act']>[1]) {
    if (pending || confirmed && action === 'CONFIRM') return;
    setPending(true); setError(''); if (action === 'CONFIRM') setConfirmed(true);
    try { await inbox.act(view.key, action); }
    catch { setError('Chưa thực hiện được bước xác minh. Kiểm tra kết nối và quyền hội thoại; FG chưa xác nhận thiết bị.'); if (action === 'CONFIRM') setConfirmed(false); }
    finally { setPending(false); }
  }
  const ended = ['VERIFIED', 'CANCELLED', 'EXPIRED', 'STALE'].includes(view.status);
  return <article className="fg-crypto-flow" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Xác minh thiết bị {name ? `của ${name}` : ''}</h3>
    <p className="fg-crypto-help">Thiết bị: {view.peerDeviceId}</p>
    {view.fingerprint && <p className="fg-crypto-fingerprint">Khóa công khai: {view.fingerprint}</p>}
    {view.status === 'REQUESTED' && <><p>Người này đề nghị xác minh thiết bị với bạn.</p><button className="fg-btn fg-btn-primary" disabled={pending} onClick={() => void act('ACCEPT')}>Chấp nhận xác minh</button></>}
    {view.status === 'READY' && view.initiatedHere && <button className="fg-btn fg-btn-primary" disabled={pending} onClick={() => void act('START')}>Bắt đầu so sánh số</button>}
    {view.needsSasAccept && !ended && <button className="fg-btn fg-btn-primary" disabled={pending} onClick={() => void act('ACCEPT_SAS')}>Mở mã so sánh</button>}
    {view.decimals && !ended && <>
      <p className="fg-crypto-help">So sánh cả ba dãy số trực tiếp với người kia qua cuộc gọi hoặc kênh khác. Chỉ xác nhận khi cả hai bên thấy cùng số.</p>
      <div className="fg-crypto-sas" aria-label="Ba dãy số xác minh">{view.decimals.map((value, index) => <strong key={index}>{value}</strong>)}</div>
      {view.status === 'SAS' && <div className="fg-crypto-actions">
        <button className="fg-btn fg-btn-primary" disabled={pending || confirmed} onClick={() => void act('CONFIRM')}>Các số khớp</button>
        <button className="fg-btn fg-btn-outline" disabled={pending || confirmed} onClick={() => void act('MISMATCH')}>Không khớp</button>
      </div>}
    </>}
    {(view.status === 'WAITING' || view.status === 'WAITING_PEER' || view.status === 'READY' && !view.initiatedHere) && <p role="status">{view.status === 'WAITING_PEER' ? 'Bạn đã xác nhận. Đang chờ xác nhận từ thiết bị bên kia…' : 'Đang chờ thiết bị bên kia…'}</p>}
    {view.status === 'VERIFIED' && <p role="status">Đã xác minh bằng SAS trên cả hai thiết bị.</p>}
    {view.status === 'CANCELLED' && <p role="status">Xác minh đã bị hủy. Thiết bị chưa được xác nhận từ lượt này.</p>}
    {view.status === 'EXPIRED' && <p role="status">Lượt xác minh đã hết hạn. Bắt đầu lượt mới trong hội thoại.</p>}
    {view.status === 'STALE' && <p role="alert">Quyền hoặc phiên hội thoại đã thay đổi. Cần bắt đầu xác minh lại.</p>}
    {!ended && <button className="fg-btn fg-btn-outline" disabled={pending} onClick={() => void act('CANCEL')}>Hủy xác minh</button>}
    {pending && <p role="status">Đang gửi bước xác minh…</p>}{error && <p className="fg-crypto-error" role="alert">{error}</p>}
  </article>;
}
