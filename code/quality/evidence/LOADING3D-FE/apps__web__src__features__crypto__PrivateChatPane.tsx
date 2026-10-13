import {InitialLoading} from '../../components/ui/InitialLoading.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { EncryptedMessageSchema, SocketCryptoConversationAckSchema, SocketEventNames } from '@fg/contracts';
import { CryptoApi, CryptoApiError } from './api';
import { CryptoConversation, CryptoConversationError, type RecipientDevice, type DecodedCryptoRow } from './conversation';
import { useCryptoDevice } from './CryptoDeviceProvider';
import { VerificationPanel } from './VerificationPanel';
import { preparePrivateImage, type SealedPrivateImage } from './images';
import { PrivateImage } from './PrivateImage';
import { LegacyImage } from './LegacyImage';
import { LegacyMigrationPanel } from './LegacyMigrationPanel';
import { ReportPanel, type ReportSelection } from './ReportPanel';
 
interface Participant { id: string; displayName: string }
type Row = DecodedCryptoRow;
const api = new CryptoApi();

export function PrivateChatPane({ conversationId, actorId, participants, onAccessDenied, onParticipantsChanged, resolveParticipants }: { conversationId: string; actorId: string; participants: Participant[]; onAccessDenied?: () => void; onParticipantsChanged?: () => Promise<void>; resolveParticipants?: (signal: AbortSignal) => Promise<string[]> }) {
  const device = useCryptoDevice();
  const identity = `${actorId}:${conversationId}:${device.deviceId ?? 'locked'}`;
  const [rows, setRows] = useState<Row[]>([]), [recipients, setRecipients] = useState<RecipientDevice[]>([]);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [online, setOnline] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [draft, setDraft] = useState(''), [mentioned, setMentioned] = useState<string[]>([]), [reply, setReply] = useState<Row | null>(null), [sending, setSending] = useState(false);
  const [scope, setScope] = useState(identity);
  const [images, setImages] = useState<SealedPrivateImage[]>([]), [preparingImages, setPreparingImages] = useState(false);
  const [reportIds, setReportIds] = useState<string[]>([]), [reportPreview, setReportPreview] = useState<ReportSelection[] | null>(null);
  const imageDraft = useRef(images); imageDraft.current = images;
  useEffect(() => () => { imageDraft.current.forEach(image => image.ciphertext.fill(0)); imageDraft.current = []; }, []);
  const participantKey = JSON.stringify(participants.map(person => person.id).sort());
  const renderedScope = useRef({ identity, participantKey }); renderedScope.current = { identity, participantKey };
  const lastParticipants = useRef<string | undefined>(undefined);
  const client = useMemo(() => device.session && !device.session.signal.aborted && JSON.parse(participantKey).includes(actorId) ? new CryptoConversation(device.session, api, conversationId, actorId, JSON.parse(participantKey), resolveParticipants) : undefined, [device.session, conversationId, actorId, participantKey, resolveParticipants]);
  const active = useRef(false), pending = useRef(false), cache = useRef(new Map<string, Row>()), retry = useRef<{ input: string; id: string } | null>(null);
  const tail = useRef<string | undefined>(undefined), refresh = useRef<() => Promise<void>>(async () => {});
  const lastIdentity = useRef<string | undefined>(undefined);
  const name = (id: string) => participants.find(person => person.id === id)?.displayName ?? 'Thành viên';
  const denied = useCallback(() => { cache.current.clear(); setRows([]); setRecipients([]); setOnline(false); setReportIds([]); setReportPreview(null); onAccessDenied?.(); }, [onAccessDenied]);
  useEffect(() => {
    active.current = true; cache.current.clear(); tail.current = undefined;
    setMigrationRequired(false);
    setReportIds([]); setReportPreview(null);
    const membershipChanged = lastParticipants.current !== undefined && lastParticipants.current !== participantKey;
    if (membershipChanged) { retry.current = null; setImages(previous => previous.map(image => ({ ...image, clientUploadId: crypto.randomUUID() }))); }
    lastParticipants.current = participantKey;
    if (lastIdentity.current !== identity) { imageDraft.current.forEach(image => image.ciphertext.fill(0)); setImages([]); setPreparingImages(false); retry.current = null; pending.current = false; setDraft(''); setMentioned([]); setReply(null); setSending(false); }
    lastIdentity.current = identity;
    setScope(identity); setRows([]); setRecipients([]); setError(membershipChanged ? 'Thành viên đã thay đổi. Bản nháp được giữ; kiểm tra thiết bị trước khi gửi lại.' : ''); setLoading(true); setOnline(false);
    if (!client || device.status !== 'READY' || !device.session) { setLoading(false); return () => { active.current = false; }; }
    const session = device.session;
    let alive = true, busy = false, timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      if (!alive || busy || document.hidden || session.signal.aborted) return;
      if (timer) clearTimeout(timer); timer = undefined;
      busy = true;
      try {
        const known = await client!.devices();
        let cursor = tail.current;
        for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
          const page = await client!.history(cursor);
          const missing = page.items.filter(message => { const row = cache.current.get(message.id); return !row?.content && !row?.legacy; });
          for (const row of await client!.decodePage(missing)) { if (!alive || session.signal.aborted) return; cache.current.set(row.message.id, row); }
          if (!page.hasMore) break;
          if (!page.nextCursor || page.nextCursor === cursor) throw new CryptoConversationError('INVALID_CONTEXT');
          cursor = page.nextCursor; tail.current = cursor;
        }
        if (alive && !session.signal.aborted) {
          setRecipients(known); setRows([...cache.current.values()].sort((a, b) => a.message.createdAt.localeCompare(b.message.createdAt) || a.message.id.localeCompare(b.message.id)));
          setError(''); setLoading(false); setMigrationRequired(false);
        }
      } catch (problem) {
        if (!alive || session.signal.aborted) return;
        setLoading(false); setOnline(false);
        setMigrationRequired(problem instanceof CryptoConversationError && problem.code === 'MIGRATION_REQUIRED');
        if (problem instanceof CryptoConversationError && problem.code === 'PARTICIPANTS_CHANGED') { setError('Danh sách thành viên hoặc quyền thiết bị đã đổi. Kiểm tra lại danh sách; bản nháp vẫn được giữ.'); await onParticipantsChanged?.().catch(() => { if (alive) setError('Chưa tải lại được danh sách thành viên. Bản nháp vẫn được giữ.'); }); }
        else if (problem instanceof CryptoApiError && [401, 403, 404].includes(problem.status)) { denied(); setError('Không còn quyền đọc hội thoại này. Nội dung trên màn hình đã được xóa.'); }
        else setError(problem instanceof CryptoConversationError && problem.code === 'MIGRATION_REQUIRED' ? 'Lịch sử cũ chưa đối soát mã hóa. FG chưa mở chat riêng và không chuyển sang gửi chữ thường.' : 'Chưa tải được chat mã hóa. Bản nháp vẫn giữ trên thiết bị; kiểm tra kết nối rồi thử lại.');
      } finally { busy = false; if (alive && !document.hidden && !session.signal.aborted) timer = setTimeout(() => void tick(), 5000); }
    }
    refresh.current = tick;
    const socket = io('/', { transports: ['websocket', 'polling'], withCredentials: true });
    socket.on('connect', () => socket.emit(SocketEventNames.CRYPTO_SUBSCRIBE, { conversationId, deviceId: device.deviceId }, (raw: unknown) => {
      const ack = SocketCryptoConversationAckSchema.safeParse(raw);
      if (alive) setOnline(Boolean(ack.success && ack.data.ok)); void tick();
    }));
    socket.on('disconnect', () => { if (alive) setOnline(false); });
    socket.on(SocketEventNames.CRYPTO_MESSAGE_CREATED, (raw: unknown) => {
      const parsed = EncryptedMessageSchema.safeParse(raw);
      if (parsed.success && parsed.data.conversationId === conversationId) void tick();
    });
    function stop() { alive = false; active.current = false; cache.current.clear(); socket.disconnect(); if (timer) clearTimeout(timer); setRows([]); setRecipients([]); if (session.signal.aborted) { imageDraft.current.forEach(image => image.ciphertext.fill(0)); setImages([]); } }
    function visibility() { if (timer) clearTimeout(timer); if (!document.hidden) void tick(); }
    session.signal.addEventListener('abort', stop, { once: true }); document.addEventListener('visibilitychange', visibility); void tick();
    return () => { stop(); session.signal.removeEventListener('abort', stop); document.removeEventListener('visibilitychange', visibility); };
  }, [identity, client, device.status, device.session, device.deviceId, conversationId, denied, onParticipantsChanged, participantKey]);
  async function send() {
    if (!client || pending.current || preparingImages || (!draft && !images.length) || device.status !== 'READY') return;
    const input = { body: draft, ...(mentioned.length ? { mentionedUserIds: mentioned } : {}), ...(reply?.content ? { reply: { messageId: reply.message.id, previewText: reply.content.body } } : {}) };
    const fingerprint = JSON.stringify({ ...input, images: images.map(image => image.clientUploadId) });
    if (!retry.current || retry.current.input !== fingerprint) retry.current = { input: fingerprint, id: crypto.randomUUID() };
    pending.current = true; setSending(true); setError('');
    try {
      if (images.length) await client.sendImages({ ...input, clientMessageId: retry.current.id }, images);
      else await client.sendText({ ...input, clientMessageId: retry.current.id });
      if (active.current && lastIdentity.current === identity && renderedScope.current.participantKey === participantKey && !device.session?.signal.aborted) { images.forEach(image => image.ciphertext.fill(0)); setImages([]); setDraft(''); setMentioned([]); setReply(null); retry.current = null; await refresh.current(); }
    } catch (problem) {
      if (active.current && lastIdentity.current === identity && renderedScope.current.participantKey === participantKey && !device.session?.signal.aborted) {
        if (problem instanceof CryptoApiError && [401, 403, 404].includes(problem.status)) denied();
        if (problem instanceof CryptoConversationError && problem.code === 'PARTICIPANTS_CHANGED') { setError('Danh sách thành viên đã đổi. Bản nháp được giữ; kiểm tra thiết bị trước khi gửi lại.'); await onParticipantsChanged?.().catch(() => { if (active.current) setError('Chưa tải lại được danh sách thành viên. Bản nháp vẫn được giữ.'); }); }
        else if (problem instanceof CryptoConversationError && problem.code === 'REVISION_CHANGED') { retry.current = null; setImages(previous => previous.map(image => ({ ...image, clientUploadId: crypto.randomUUID() }))); setError('Thành viên hoặc thiết bị đã thay đổi. Kiểm tra xác minh rồi gửi lại bản nháp.'); }
        else setError(problem instanceof CryptoConversationError && ['UNVERIFIED_DEVICE', 'NO_RECIPIENT_DEVICE'].includes(problem.code) ? 'Cần thiết bị người nhận đã xác minh trước khi gửi. Bản nháp vẫn giữ trên thiết bị.' : 'Chưa xác nhận gửi thành công. Giữ nguyên bản nháp và thử lại để dùng đúng ciphertext cũ.');
      }
    } finally { if (lastIdentity.current === identity) { pending.current = false; if (active.current) setSending(false); } }
  }
  async function selectImages(files: File[]) {
    if (!device.session || pending.current || preparingImages || !files.length) return;
    if (images.length + files.length > 4) { setError('Mỗi tin tối đa 4 ảnh.'); return; }
    const session = device.session, selected: SealedPrivateImage[] = []; setPreparingImages(true); setError('');
    try {
      for (const file of files) selected.push(await preparePrivateImage(file, session.signal));
      if (active.current && lastIdentity.current === identity && !session.signal.aborted) setImages(previous => [...previous, ...selected]);
      else selected.forEach(image => image.ciphertext.fill(0));
    } catch { selected.forEach(image => image.ciphertext.fill(0)); if (active.current && lastIdentity.current === identity && !session.signal.aborted) setError('Chỉ nhận JPG/PNG/WebP tối đa 5MiB và 20MP. Ảnh chưa được tải lên.'); }
    finally { if (active.current && lastIdentity.current === identity) setPreparingImages(false); }
  }
  if (device.status !== 'READY' || device.session?.signal.aborted || scope !== identity) return <div className="fg-private-locked"><p>Thiết bị đang khóa. Mở khóa riêng để đọc hoặc gửi chat mã hóa.</p><Link className="fg-btn fg-btn-primary" to="/crypto">Mở khóa thiết bị</Link></div>;
  if (!client) return <p role="status">Đang kiểm tra thành viên hội thoại. Chưa mở nội dung riêng.</p>;
  return <div className="fg-private-chat">
    <div className="fg-private-state"><span>{online ? 'Đã kết nối chat mã hóa' : 'Đang dùng đồng bộ; realtime chưa kết nối'}</span><button type="button" className="fg-btn fg-btn-outline" onClick={() => void refresh.current()}>Tải lại</button></div>
    <details className="fg-private-devices"><summary>Thiết bị người nhận và xác minh</summary>{recipients.map(peer => <div className="fg-private-device" key={`${peer.userId}:${peer.deviceId}`}>
      <span>{name(peer.userId)} · {peer.deviceId}<small>{peer.verified ? 'Đã xác minh' : 'Chưa xác minh hoặc khóa đã đổi'}</small></span>
      {!peer.verified && device.inbox && <button type="button" className="fg-btn fg-btn-outline" onClick={() => void device.inbox!.begin(conversationId, peer.userId, peer.deviceId).catch(() => setError('Chưa bắt đầu được xác minh. Kiểm tra kết nối và quyền hội thoại.'))}>Xác minh {name(peer.userId)}</button>}
    </div>)}</details>
    {device.inbox && <VerificationPanel inbox={device.inbox} views={(device.verificationViews ?? []).filter(view => view.conversationId === conversationId && !view.cohortId)}/>}
    {error && <p className="fg-crypto-error" role="alert">{error}</p>}
    <div className="fg-private-messages" aria-label="Tin nhắn mã hóa">
      {migrationRequired && <LegacyMigrationPanel key={identity} conversationId={conversationId} actorId={actorId} name={name}/>}
      {loading && rows.length===0 && !error && <InitialLoading pending layout="chat" label="Đang tải và giải mã trên thiết bị"/>}
      {rows.map(row => <article key={row.message.id} data-message-id={row.message.id} className={row.message.senderId === actorId ? 'fg-private-message fg-private-own' : 'fg-private-message'}>
        <strong>{name(row.message.senderId)}</strong>
        {row.recovered && <p className="fg-crypto-help">Lịch sử từ bản khôi phục · thiết bị gửi chưa được xác minh hiện tại.</p>}
        {row.legacy && <><p className="fg-crypto-help">Lịch sử cũ đã nhập và kiểm tra nguồn · tên tác giả gốc là thông tin lưu trước mã hóa, không phải xác minh SAS của tác giả.</p><p>{row.legacy.source.content}</p><time dateTime={row.legacy.source.createdAt}>{new Date(row.legacy.source.createdAt).toLocaleString('vi-VN')}</time>{row.legacy.images.map((image, index) => <LegacyImage key={image.attachmentId} conversationId={conversationId} image={image} source={row.legacy!.source.attachments[index]} sessionSignal={device.session!.signal}/>)}</>}
        {row.content ? <>{row.content.fg.reply && <blockquote>{row.content.fg.reply.previewText}</blockquote>}<p>{row.content.body}</p>
          {row.content.msgtype === 'm.image' && row.content.images.map(image => <PrivateImage key={image.attachmentId} conversationId={conversationId} image={image} sessionSignal={device.session!.signal}/>)}
          {(row.content.fg.mentionedUserIds ?? []).map(id => <span key={id}>@{name(id)} </span>)}
          <button className="fg-btn fg-btn-outline" type="button" onClick={() => setReply(row)}>Trả lời {name(row.message.senderId)}</button></> : !row.legacy && <p>{row.error}</p>}
        {(row.content || row.legacy) && <label><input type="checkbox" aria-label="Chọn tin để báo cáo" checked={reportIds.includes(row.message.id)} disabled={Boolean(reportPreview) || (!reportIds.includes(row.message.id) && reportIds.length >= 20)} onChange={event => setReportIds(previous => event.target.checked ? [...previous, row.message.id] : previous.filter(id => id !== row.message.id))}/>Chọn báo cáo</label>}
      </article>)}
    </div>
    {reportIds.length > 0 && !reportPreview && <button type="button" className="fg-btn fg-btn-outline" onClick={() => setReportPreview(rows.flatMap(row => reportIds.includes(row.message.id) && (row.content || row.legacy) ? [{ id: row.message.id, content: (row.content ?? row.legacy)! }] : []))}>Xem trước báo cáo ({reportIds.length})</button>}
    {reportPreview && <ReportPanel conversationId={conversationId} selections={reportPreview} sessionSignal={device.session!.signal} onClose={() => { setReportPreview(null); setReportIds([]); }}/>}
    <form className="fg-private-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      {reply?.content && <div className="fg-private-reply"><span>Trả lời {name(reply.message.senderId)}: {reply.content.body}</span><button type="button" className="fg-btn fg-btn-outline" onClick={() => setReply(null)}>Bỏ trả lời</button></div>}
      <label htmlFor={`fg-private-${conversationId}`}>Tin nhắn riêng mã hóa</label>
      <label className="fg-private-file">Ảnh riêng (tối đa 4)<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={sending || preparingImages} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void selectImages(files); }}/></label>
      {preparingImages && <p role="status">Đang kiểm tra, chuyển WebP và mã hóa ảnh trên thiết bị…</p>}
      {images.map((image, index) => <div className="fg-private-reply" key={image.clientUploadId}><span>Ảnh {index + 1} · {image.width} × {image.height} · đã mã hóa trên thiết bị</span><button type="button" className="fg-btn fg-btn-outline" disabled={sending || preparingImages} onClick={() => { image.ciphertext.fill(0); setImages(previous => previous.filter(value => value !== image)); }}>Bỏ ảnh {index + 1}</button></div>)}
      <textarea id={`fg-private-${conversationId}`} value={draft} maxLength={2000} disabled={sending} onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}/>
      <div className="fg-private-compose-actions"><select aria-label="Nhắc tên thành viên" value="" disabled={sending} onChange={event => { const id = event.target.value; if (id && !mentioned.includes(id)) setMentioned(previous => [...previous, id]); }}>
        <option value="">Nhắc tên…</option>{participants.filter(person => person.id !== actorId).map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select>
        <button className="fg-btn fg-btn-primary" type="submit" disabled={migrationRequired || sending || preparingImages || (!draft && !images.length)}>{sending ? 'Đang gửi…' : 'Gửi mã hóa'}</button></div>
      {mentioned.map(id => <button className="fg-btn fg-btn-outline" type="button" key={id} onClick={() => setMentioned(previous => previous.filter(value => value !== id))}>Bỏ nhắc @{name(id)}</button>)}
    </form>
  </div>;
}
