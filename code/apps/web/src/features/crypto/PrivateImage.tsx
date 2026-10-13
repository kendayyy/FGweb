import { useEffect, useState } from 'react';
import type { z } from 'zod';
import type { CryptoDecryptedMessageSchema } from '@fg/contracts';
import { CryptoApi } from './api';
import { decodePrivateImage } from './images';
type Image = Extract<z.infer<typeof CryptoDecryptedMessageSchema>, { msgtype: 'm.image' }>['images'][number];
const api = new CryptoApi();

export function PrivateImage({ conversationId, image, sessionSignal }: { conversationId: string; image: Image; sessionSignal: AbortSignal }) {
  const [result, setResult] = useState<{ id: string; url?: string; failed?: boolean }>();
  useEffect(() => {
    const abort = new AbortController(); let url: string | undefined;
    const close = () => { abort.abort(); if (url) URL.revokeObjectURL(url); setResult(undefined); };
    sessionSignal.addEventListener('abort', close, { once: true }); setResult(undefined);
    void (async () => {
      try {
        if (sessionSignal.aborted) return;
        const ciphertext = await api.downloadAttachment(conversationId, image.attachmentId, abort.signal);
        const blob = await decodePrivateImage(ciphertext, image, abort.signal);
        if (abort.signal.aborted || sessionSignal.aborted) return;
        url = URL.createObjectURL(blob); setResult({ id: image.attachmentId, url });
      } catch { if (!abort.signal.aborted && !sessionSignal.aborted) setResult({ id: image.attachmentId, failed: true }); }
    })();
    return () => { close(); sessionSignal.removeEventListener('abort', close); };
  }, [conversationId, image, sessionSignal]);
  if (sessionSignal.aborted || result?.id !== image.attachmentId) return <p role="status">Đang tải và kiểm tra ảnh mã hóa…</p>;
  if (result.failed || !result.url) return <p>Không đọc được ảnh. Khóa, hash hoặc dữ liệu ảnh không hợp lệ.</p>;
  return <img className="fg-private-image" src={result.url} width={image.width} height={image.height} alt="Ảnh riêng đã giải mã và kiểm tra trên thiết bị"/>;
}
