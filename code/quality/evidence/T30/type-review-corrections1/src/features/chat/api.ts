import { AttachmentSchema, AttachmentUrlSchema, AllowedImageMimeTypeSchema, MAX_IMAGE_SIZE_BYTES, AttachmentDTO } from '@fg/contracts';
export function uploadImage(conversationId: string, file: File, onProgress: (percent: number | null) => void, signal: AbortSignal): Promise<AttachmentDTO> {
    if (file.size === 0 || file.size > MAX_IMAGE_SIZE_BYTES || !AllowedImageMimeTypeSchema.safeParse(file.type).success)
        return Promise.reject(new Error('Chọn ảnh JPEG, PNG hoặc WebP tối đa 5 MiB.'));
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest(), data = new FormData();
        data.append('conversationId', conversationId);
        data.append('file', file);
        xhr.open('POST', '/api/v1/uploads/images');
        xhr.withCredentials = true;
        xhr.setRequestHeader('Accept', 'application/json');
        const abort = () => xhr.abort();
        const done = () => signal.removeEventListener('abort', abort);
        signal.addEventListener('abort', abort, { once: true });
        xhr.upload.onprogress = event => onProgress(event.lengthComputable ? Math.min(100, Math.round(event.loaded / event.total * 100)) : null);
        xhr.onload = () => { done(); try {
            if (xhr.status < 200 || xhr.status >= 300)
                throw new Error(`Không tải được ảnh (HTTP ${xhr.status}).`);
            resolve(AttachmentSchema.parse(JSON.parse(xhr.responseText)));
        }
        catch (error) {
            reject(error);
        } };
        xhr.onerror = () => { done(); reject(new Error('Mất kết nối khi tải ảnh.')); };
        xhr.onabort = () => { done(); reject(new DOMException('Aborted', 'AbortError')); };
        if (signal.aborted) {
            done();
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }
        onProgress(null);
        xhr.send(data);
    });
}
export async function downloadImage(id: string, signal: AbortSignal): Promise<Blob> {
    const expected = `/api/v1/attachments/${encodeURIComponent(id)}/content`;
    const meta = await fetch(`/api/v1/attachments/${encodeURIComponent(id)}`, { credentials: 'include', signal, headers: { Accept: 'application/json' } });
    if (!meta.ok)
        throw new Error(`Không xem được ảnh (HTTP ${meta.status}).`);
    const { url } = AttachmentUrlSchema.parse(await meta.json());
    const actual = new URL(url, window.location.origin);
    if (actual.origin !== window.location.origin || actual.pathname !== expected || actual.search || actual.hash)
        throw new Error('Đường dẫn ảnh không hợp lệ.');
    const response = await fetch(expected, { credentials: 'include', signal, cache: 'no-store' });
    if (!response.ok)
        throw new Error(`Không xem được ảnh (HTTP ${response.status}).`);
    if (response.headers.get('content-type')?.split(';')[0] !== 'image/webp')
        throw new Error('Định dạng ảnh không hợp lệ.');
    return response.blob();
}
