import { useEffect, useState } from 'react';
import type { LegacyContent } from './legacy';
import { CryptoApi } from './api';
import { decodeLegacyImage } from './images';
const api = new CryptoApi();

export function LegacyImage({ conversationId, image, source, sessionSignal }: { conversationId: string; image: LegacyContent['images'][number]; source: LegacyContent['source']['attachments'][number]; sessionSignal: AbortSignal }) {
  const [result, setResult] = useState<{ id: string; url?: string; failed?: boolean }>();
  useEffect(() => {
    const abort = new AbortController(); let url: string | undefined;
    const close = () => { abort.abort(); if (url) URL.revokeObjectURL(url); setResult(undefined); };
    sessionSignal.addEventListener('abort', close, { once: true }); setResult(undefined);
    void (async () => {
      let bytes: Uint8Array | undefined;
      try {
        if (sessionSignal.aborted || image.attachmentId !== source.id) return;
        bytes = await api.downloadAttachment(conversationId, image.attachmentId, abort.signal);
        const blob = await decodeLegacyImage(bytes, { ...source, secret: image.secret }, abort.signal);
        if (abort.signal.aborted || sessionSignal.aborted) return;
        url = URL.createObjectURL(blob); setResult({ id: image.attachmentId, url });
      } catch { if (!abort.signal.aborted && !sessionSignal.aborted) setResult({ id: image.attachmentId, failed: true }); }
      finally { bytes?.fill(0); }
    })();
    return () => { close(); sessionSignal.removeEventListener('abort', close); };
  }, [conversationId, image, source, sessionSignal]);
  if (sessionSignal.aborted || result?.id !== image.attachmentId) return <p role="status">Đang kiểm tra ảnh từ lịch sử cũ…</p>;
  if (!result.url || result.failed) return <p>Chưa đọc được ảnh lịch sử cũ. Khóa, nguồn hoặc dữ liệu ảnh không hợp lệ.</p>;
  return <img className="fg-private-image" src={result.url} alt="Ảnh lịch sử cũ đã giải mã và kiểm tra nguồn trên thiết bị"/>;
}
