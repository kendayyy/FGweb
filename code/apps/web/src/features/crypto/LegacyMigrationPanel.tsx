import { useEffect, useMemo, useRef, useState } from 'react';
import type { CryptoConversationStateDTO } from '@fg/contracts';
import { CryptoApi, CryptoApiError } from './api';
import { CryptoLegacyMigration, LegacyMigrationError } from './legacy-migration';
import { useCryptoDevice } from './CryptoDeviceProvider';
import { VerificationPanel } from './VerificationPanel';
import type { RecipientDevice } from './conversation';
import { ZodError } from 'zod';
import { PrivateAttachmentError } from './attachments';
import { CryptoTransportError } from './transport';
import { CryptoMessageError } from './client';
const api = new CryptoApi();
type Page = Awaited<ReturnType<CryptoLegacyMigration['batch']>>;

export function LegacyMigrationPanel({ conversationId, actorId, name }: { conversationId: string; actorId: string; name: (id: string) => string }) {
  const device = useCryptoDevice();
  const [state, setState] = useState<CryptoConversationStateDTO>(), [cohortId, setCohortId] = useState('');
  const [recipients, setRecipients] = useState<RecipientDevice[]>([]), [page, setPage] = useState<Page>(), [cursor, setCursor] = useState<string>();
  const [candidates, setCandidates] = useState(new Map<string, string>()), [candidateId, setCandidateId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const pending = useRef(false);
  const client = useMemo(() => device.session ? new CryptoLegacyMigration(device.session, api, conversationId, actorId) : undefined, [device.session, conversationId, actorId, cohortId]);
  useEffect(() => {
    if (!client || !device.session) return;
    let alive = true, working = false, timer: ReturnType<typeof setTimeout> | undefined;
    setRecipients([]); setPage(undefined); setCandidates(new Map()); setCursor(undefined); setCandidateId(''); setStatus(''); setError('');
    setBusy(false);
    function schedule() {
      if (timer) clearTimeout(timer); timer = undefined;
      if (alive && !document.hidden) timer = setTimeout(() => void refresh(), 5000);
    }
    async function refresh() {
      if (!alive) return;
      if (working || pending.current || document.hidden) { schedule(); return; }
      working = true;
      try {
        const current = await client!.state();
        if (!alive) return; setState(current);
        if (cohortId) {
          const devices = await client!.devices(cohortId);
          if (!alive) return; setRecipients(devices);
        }
      } catch { if (alive) { setRecipients([]); setPage(undefined); setError('Chưa kiểm tra được quyền lịch sử hoặc thiết bị. Dừng đối soát; không dùng danh sách thành viên hiện tại để cấp quyền lịch sử.'); } }
      finally { working = false; schedule(); }
    }
    const visible = () => { if (!document.hidden) { if (timer) clearTimeout(timer); void refresh(); } };
    document.addEventListener('visibilitychange', visible); void refresh();
    return () => { alive = false; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', visible); client.close(); };
  }, [client, cohortId]);
  async function act(action: () => Promise<void>) {
    if (!client || pending.current) return;
    const active = client; pending.current = true; setBusy(true); setError(''); setStatus('');
    try { await action(); }
    catch (problem) {
      if (!active.closed && !device.session?.signal.aborted) {
        const detail = problem instanceof LegacyMigrationError ? {
          UNVERIFIED_DEVICE: 'Cần xác minh tất cả thiết bị có quyền lịch sử trước khi chuẩn bị.',
          UNAVAILABLE_DEVICE: 'Một thiết bị thuộc cohort không còn khả dụng.',
          INVALID_CONTEXT: 'Quyền, cohort hoặc phiên hội thoại đã thay đổi.',
          SOURCE_CHANGED: 'Nguồn lịch sử không khớp digest đã đối soát.',
          RETRY_CHANGED: 'Nguồn hoặc revision đã đổi so với bản nhập đang chờ; chưa gửi bản nhập khác.',
          CLOSED: 'Phiên đối soát đã đóng.',
        }[problem.code] : problem instanceof CryptoApiError ? (problem.code === 'INVALID_RESPONSE' ? 'Phản hồi đối soát không đúng định dạng hoặc binding.' : 'Server chưa chấp nhận bước đối soát hoặc kết nối bị gián đoạn.') : problem instanceof ZodError ? 'Dữ liệu đối soát chưa đúng định dạng đã duyệt.' : problem instanceof PrivateAttachmentError ? 'Chưa mã hóa hoặc kiểm tra được ảnh nguồn.' : problem instanceof CryptoTransportError ? 'Chưa trao đổi được khóa trong phạm vi cohort.' : problem instanceof CryptoMessageError ? 'Chưa giải mã lại được bản nhập hoặc xác minh thiết bị nhập.' : 'Chưa thực hiện được bước native hoặc kiểm tra dữ liệu.';
        setError(`Chưa hoàn tất bước đối soát. ${detail} Bản nhập chưa được coi là migration hoàn thành. Khi thử lại trong phiên này, FG giữ cùng bản mã và mã bản nhập.`);
      }
    }
    finally { pending.current = false; if (!active.closed && !device.session?.signal.aborted) setBusy(false); }
  }
  const cohort = state?.legacyCohorts?.find(item => item.cohortId === cohortId);
  if (!client || !device.session) return null;
  return <section className="fg-private-report fg-legacy-migration" aria-label="Đối soát lịch sử cũ">
    <h3>Đối soát lịch sử cũ</h3>
    <p>Chỉ thiết bị có quyền trong cohort lịch sử đã xác minh mới tham gia. Chuẩn bị bản nhập không xóa nguồn cũ hoặc mở chat trước khi server đối soát đầy đủ.</p>
    {state?.historyStatus === 'UNKNOWN' && <p role="alert">Chưa xác định được quyền lịch sử. Cần đối soát quyền trước; FG không tự cấp theo thành viên hiện tại.</p>}
    {state?.legacyCohorts?.map(item => <button type="button" className="fg-btn fg-btn-outline" key={item.cohortId} disabled={busy} onClick={() => setCohortId(item.cohortId)}>Chọn cohort {item.cohortId} · {item.sourceCount} tin chờ đối soát</button>)}
    {cohort && <>
      <p>Cohort đang chọn: {cohort.cohortId}</p>
      <div>{recipients.map(peer => <div key={`${peer.userId}:${peer.deviceId}`} className="fg-crypto-device"><p>{name(peer.userId)} · {peer.deviceId} · {peer.verified ? 'Đã xác minh trên thiết bị này' : 'Chưa xác minh'}</p>{!peer.verified && <button type="button" className="fg-btn fg-btn-outline" disabled={busy} onClick={() => void act(async () => { await device.inbox!.begin(conversationId, peer.userId, peer.deviceId, cohortId); })}>Xác minh lịch sử {name(peer.userId)}</button>}</div>)}</div>
      {device.inbox && <VerificationPanel inbox={device.inbox} views={(device.verificationViews ?? []).filter(view => view.conversationId === conversationId && view.cohortId === cohortId)}/>}
      <button type="button" className="fg-btn fg-btn-outline" disabled={busy} onClick={() => void act(async () => { setPage(await client.batch(cohortId)); setCursor(undefined); })}>Đọc nguồn được phép đối soát</button>
      {page?.items.map(item => <article key={item.messageId} className="fg-private-message"><p>{name(item.senderId)} · nguồn lịch sử trước mã hóa</p><p>{item.content}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('vi-VN')}</time><p>{item.attachmentIds.length} ảnh nguồn</p>
        <button type="button" className="fg-btn fg-btn-primary" disabled={busy} onClick={() => void act(async () => { const receipt = await client.prepare(cohortId, item); setCandidates(previous => new Map(previous).set(item.messageId, receipt.candidateId)); await client.attest(cohortId, receipt.candidateId); setStatus('Đã chuẩn bị và chứng thực trên thiết bị này. Cần các thiết bị thuộc cohort đối soát độc lập và bước kiểm tra server.'); })}>Chuẩn bị bản nhập mã hóa</button>
        {candidates.has(item.messageId) && <p>Mã bản nhập: <code data-legacy-candidate-id={candidates.get(item.messageId)}>{candidates.get(item.messageId)}</code></p>}
      </article>)}
      {page?.hasMore && <button type="button" className="fg-btn fg-btn-outline" disabled={busy || !page.nextCursor || page.nextCursor === cursor} onClick={() => void act(async () => { const next = page.nextCursor!; setPage(await client.batch(cohortId, next)); setCursor(next); })}>Đọc trang nguồn tiếp theo</button>}
      <label>Mã bản nhập cần đối soát<input value={candidateId} maxLength={128} disabled={busy} onChange={event => setCandidateId(event.target.value)}/></label>
      <button type="button" className="fg-btn fg-btn-primary" disabled={busy || !candidateId} onClick={() => void act(async () => { await client.attest(cohortId, candidateId); setStatus('Thiết bị này đã giải mã lại, kiểm tra nguồn/ảnh và gửi chứng thực. Server chưa được coi là hoàn tất migration từ bước này.'); })}>Giải mã lại và chứng thực</button>
    </>}
    {busy && <p role="status">Đang thực hiện bước đối soát thật trên thiết bị…</p>}{error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
  </section>;
}
