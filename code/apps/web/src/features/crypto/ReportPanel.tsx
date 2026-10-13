import { useEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import type { CryptoDecryptedMessageSchema } from '@fg/contracts';
import { CryptoApi } from './api';
import { decodePrivateImage, decodeLegacyImage } from './images';
import { discloseReport, discloseReportImage } from './reports';
import type { LegacyContent } from './legacy';

type Content = z.infer<typeof CryptoDecryptedMessageSchema>;
export interface ReportSelection { id: string; content: Content | LegacyContent }
type ReportImage = { attachmentId: string; live?: Extract<Content, { msgtype: 'm.image' }>['images'][number]; legacy?: LegacyContent['source']['attachments'][number] & LegacyContent['images'][number] };
function reportText(content: ReportSelection['content']): string { return content.msgtype === 'org.fg.legacy_import.v1' ? content.source.content : content.body; }
function reportImages(content: ReportSelection['content']): ReportImage[] {
  if (content.msgtype === 'm.image') return content.images.map(image => ({ attachmentId: image.attachmentId, live: image }));
  if (content.msgtype === 'org.fg.legacy_import.v1') return content.images.map((image, index) => ({ attachmentId: image.attachmentId, legacy: { ...content.source.attachments[index], ...image } }));
  return [];
}
type Prepared = { blob: Blob; url: string; uploadId: string };
const api = new CryptoApi();

export function ReportPanel({ conversationId, selections, sessionSignal, onClose }: { conversationId: string; selections: ReportSelection[]; sessionSignal: AbortSignal; onClose: () => void }) {
  const [selectedImages, setSelectedImages] = useState<string[]>([]), [prepared, setPrepared] = useState(new Map<string, Prepared>());
  const [reason, setReason] = useState(''), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState(false), [uncertain, setUncertain] = useState(false);
  const pending = useRef(false), sendAbort = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    const abort = new AbortController(), urls: string[] = [];
    const close = () => { abort.abort(); sendAbort.current?.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
    sessionSignal.addEventListener('abort', close, { once: true });
    setPrepared(new Map()); setConsent(false); setError('');
    void (async () => {
      const result = new Map<string, Prepared>();
      try {
        for (const selection of selections) {
          for (const image of reportImages(selection.content)) {
            if (!selectedImages.includes(image.attachmentId)) continue;
            if (abort.signal.aborted || sessionSignal.aborted) return;
            const bytes = await api.downloadAttachment(conversationId, image.attachmentId, abort.signal);
            let blob: Blob;
            try { blob = image.live ? await decodePrivateImage(bytes, image.live, abort.signal) : await decodeLegacyImage(bytes, image.legacy!, abort.signal, true); }
            finally { bytes.fill(0); }
            if (abort.signal.aborted || sessionSignal.aborted) return;
            const url = URL.createObjectURL(blob); urls.push(url);
            result.set(image.attachmentId, { blob, url, uploadId: crypto.randomUUID() });
          }
        }
        if (!abort.signal.aborted && !sessionSignal.aborted) setPrepared(result);
      } catch { if (!abort.signal.aborted && !sessionSignal.aborted) setError('Chưa đọc được ảnh đã chọn. Kiểm tra quyền, khóa và kết nối; chưa gửi bằng chứng.'); }
    })();
    return () => { close(); sessionSignal.removeEventListener('abort', close); };
  }, [conversationId, selections, sessionSignal, selectedImages]);
  useEffect(() => () => sendAbort.current?.abort(), []);
  const ready = selectedImages.every(id => prepared.has(id));
  async function submit() {
    if (pending.current || !consent || !ready || !reason.trim() || uncertain || sent || sessionSignal.aborted) return;
    pending.current = true; setBusy(true); setError('');
    const abort = new AbortController(); sendAbort.current = abort;
    const close = () => abort.abort(); sessionSignal.addEventListener('abort', close, { once: true });
    let reportRequested = false;
    try {
      const selectedMessages = [];
      for (const selection of selections) {
        const reportAttachmentIds: string[] = [];
        for (const image of reportImages(selection.content)) {
          if (!selectedImages.includes(image.attachmentId)) continue;
          const value = prepared.get(image.attachmentId); if (!value) throw new Error('Preview not ready');
          const receipt = await discloseReportImage({ consent: true, conversationId, messageId: selection.id, clientUploadId: value.uploadId, plaintextSize: value.blob.size }, value.blob, abort.signal);
          reportAttachmentIds.push(receipt.id);
        }
        selectedMessages.push({ messageId: selection.id, text: reportText(selection.content), source: 'USER_DISCLOSED', reportAttachmentIds });
      }
      reportRequested = true;
      await discloseReport({ consent: true, conversationId, reason, selectedMessages }, abort.signal);
      if (!abort.signal.aborted && !sessionSignal.aborted) { setSent(true); setConsent(false); }
    } catch {
      if (!abort.signal.aborted && !sessionSignal.aborted) {
        setUncertain(reportRequested);
        setError(reportRequested ? 'Chưa xác nhận được kết quả gửi. Báo cáo có thể đã được nhận; không tự gửi lại. Đóng bản xem trước để kiểm tra trước khi tạo báo cáo khác.' : 'Chưa hoàn tất gửi ảnh bằng chứng. Kiểm tra kết nối và quyền trước khi thử lại.');
      }
    } finally { pending.current = false; sessionSignal.removeEventListener('abort', close); if (!abort.signal.aborted && !sessionSignal.aborted) setBusy(false); }
  }
  if (sessionSignal.aborted) return null;
  return <section className="fg-private-report" aria-label="Xem trước bằng chứng báo cáo">
    <h3>Xem trước báo cáo</h3>
    <p>Admin chỉ nhận các tin và ảnh bạn chọn bên dưới. Nội dung này do bạn cung cấp, chưa được xác minh là bằng chứng mật mã.</p>
    <p>Phần trích dẫn của tin trả lời không được gửi kèm. Chọn riêng tin gốc nếu muốn báo cáo nội dung đó.</p>
    {selections.map(selection => <article key={selection.id} className="fg-private-message"><p>{reportText(selection.content)}</p>
      {selection.content.msgtype === 'org.fg.legacy_import.v1' && <p className="fg-crypto-help">Nguồn lịch sử cũ; tác giả gốc chưa được xác thực bằng mã hóa. Ảnh JPG/PNG được chuyển WebP ngay trong bản xem trước này.</p>}
      {reportImages(selection.content).map((image, index) => <div key={image.attachmentId}>
        <label><input type="checkbox" disabled={busy || sent || uncertain} checked={selectedImages.includes(image.attachmentId)} onChange={event => setSelectedImages(previous => event.target.checked ? [...previous, image.attachmentId] : previous.filter(id => id !== image.attachmentId))}/>Gửi ảnh {index + 1} của tin này</label>
        {selectedImages.includes(image.attachmentId) && (prepared.get(image.attachmentId) ? <img className="fg-private-image" src={prepared.get(image.attachmentId)!.url} alt={`Ảnh ${index + 1} được chọn làm bằng chứng`}/> : <p role="status">Đang giải mã ảnh để xem trước…</p>)}
      </div>)}
    </article>)}
    <label>Lý do báo cáo<input value={reason} maxLength={200} disabled={busy || sent || uncertain} onChange={event => { setReason(event.target.value); setConsent(false); }}/></label>
    <label><input type="checkbox" checked={consent} disabled={busy || sent || uncertain || !ready} onChange={event => setConsent(event.target.checked)}/>Tôi đồng ý gửi đúng nội dung và ảnh đã chọn cho admin</label>
    {error && <p role="alert">{error}</p>}{sent && <p role="status">FG đã nhận báo cáo của bạn.</p>}
    <button type="button" className="fg-btn fg-btn-primary" disabled={busy || sent || uncertain || !consent || !ready || !reason.trim()} onClick={() => void submit()}>{busy ? 'Đang gửi bằng chứng…' : 'Gửi bằng chứng cho admin'}</button>
    <button type="button" className="fg-btn fg-btn-outline" onClick={onClose}>Đóng xem trước</button>
  </section>;
}
