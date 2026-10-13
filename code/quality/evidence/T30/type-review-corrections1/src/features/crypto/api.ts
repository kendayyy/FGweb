import { CryptoApiEndpointRegistry, EncryptedUploadRequestSchema, LegacyEncryptedUploadRequestSchema, LegacyImageQuerySchema, LegacyCandidateQuerySchema, EncryptedAttachmentSchema, MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES } from '@fg/contracts';

export class CryptoApiError extends Error {
  constructor(public readonly status: number, public readonly code: 'HTTP_ERROR' | 'INVALID_RESPONSE' | 'UNSUPPORTED_ENDPOINT') {
    super(code); this.name = 'CryptoApiError';
  }
}

/** JSON transport uses the shared registry for both request and response guards. */
export class CryptoApi {
  constructor(private readonly transport: typeof fetch = fetch) {}

  async uploadLegacyAttachment(conversationId: string, input: unknown, bytes: Uint8Array, signal?: AbortSignal) {
    const metadata = LegacyEncryptedUploadRequestSchema.parse(input);
    if (!conversationId || bytes.byteLength !== metadata.ciphertextSize || !bytes.length || bytes.length > MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES) throw new CryptoApiError(0, 'INVALID_RESPONSE');
    const form = new FormData(); form.append('metadata', JSON.stringify(metadata));
    form.append('file', new Blob([bytes.slice().buffer], { type: 'application/octet-stream' }), 'encrypted.bin');
    const transport = this.transport;
    const response = await transport(`/api/v1/crypto/conversations/${encodeURIComponent(conversationId)}/legacy/uploads`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal, headers: { Accept: 'application/json' }, body: form });
    if (!response.ok) throw new CryptoApiError(response.status, 'HTTP_ERROR');
    try {
      const receipt = EncryptedAttachmentSchema.parse(await response.json());
      if (receipt.conversationId !== conversationId || receipt.ciphertextSize !== metadata.ciphertextSize || receipt.ciphertextSha256 !== metadata.ciphertextSha256) throw new Error();
      return receipt;
    } catch { throw new CryptoApiError(response.status, 'INVALID_RESPONSE'); }
  }

  async downloadLegacyAttachment(conversationId: string, attachmentId: string, input: unknown, signal?: AbortSignal, candidateId?: string) {
    if (!conversationId || !attachmentId) throw new CryptoApiError(0, 'UNSUPPORTED_ENDPOINT');
    const query = candidateId ? LegacyCandidateQuerySchema.parse(input) : LegacyImageQuerySchema.parse(input);
    const suffix = candidateId ? `/candidates/${encodeURIComponent(candidateId)}/attachments/` : '/attachments/';
    const url = `/api/v1/crypto/conversations/${encodeURIComponent(conversationId)}/legacy${suffix}${encodeURIComponent(attachmentId)}?${new URLSearchParams(query).toString()}`;
    const transport = this.transport;
    const response = await transport(url, { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal, headers: { Accept: candidateId ? 'application/octet-stream' : 'image/webp' } });
    if (!response.ok) throw new CryptoApiError(response.status, 'HTTP_ERROR');
    if (response.headers.get('content-type')?.split(';')[0].trim() !== (candidateId ? 'application/octet-stream' : 'image/webp') || !response.body) throw new CryptoApiError(response.status, 'INVALID_RESPONSE');
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES || signal?.aborted) throw new CryptoApiError(response.status, 'INVALID_RESPONSE'); chunks.push(part.value); }
      if (!size) throw new CryptoApiError(response.status, 'INVALID_RESPONSE');
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
    } finally { chunks.forEach(chunk => chunk.fill(0)); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }

  async uploadAttachment(conversationId: string, input: unknown, bytes: Uint8Array, signal?: AbortSignal) {
    const metadata = EncryptedUploadRequestSchema.parse(input);
    if (!conversationId || bytes.byteLength !== metadata.ciphertextSize) throw new CryptoApiError(0, 'INVALID_RESPONSE');
    const form = new FormData();
    form.append('metadata', JSON.stringify(metadata));
    form.append('file', new Blob([new Uint8Array(bytes).buffer], { type: 'application/octet-stream' }), 'encrypted.bin');
    const transport = this.transport;
    const response = await transport(`/api/v1/crypto/conversations/${encodeURIComponent(conversationId)}/attachments`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal, headers: { Accept: 'application/json' }, body: form,
    });
    if (!response.ok) throw new CryptoApiError(response.status, 'HTTP_ERROR');
    try {
      const receipt = EncryptedAttachmentSchema.parse(await response.json());
      if (receipt.conversationId !== conversationId || receipt.ciphertextSize !== metadata.ciphertextSize || receipt.ciphertextSha256 !== metadata.ciphertextSha256) throw new Error('Receipt mismatch');
      return receipt;
    } catch { throw new CryptoApiError(response.status, 'INVALID_RESPONSE'); }
  }

  async downloadAttachment(conversationId: string, attachmentId: string, signal?: AbortSignal): Promise<Uint8Array> {
    if (!conversationId || !attachmentId) throw new CryptoApiError(0, 'UNSUPPORTED_ENDPOINT');
    const transport = this.transport;
    const response = await transport(`/api/v1/crypto/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(attachmentId)}`, {
      method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal, headers: { Accept: 'application/octet-stream' },
    });
    if (!response.ok) throw new CryptoApiError(response.status, 'HTTP_ERROR');
    if (response.headers.get('content-type')?.split(';')[0].trim() !== 'application/octet-stream' || !response.body) throw new CryptoApiError(response.status, 'INVALID_RESPONSE');
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES || signal?.aborted) throw new CryptoApiError(response.status, 'INVALID_RESPONSE');
        chunks.push(part.value);
      }
      if (!size) throw new CryptoApiError(response.status, 'INVALID_RESPONSE');
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return bytes;
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }

  async invoke(method: string, template: string, parameters: Record<string, string> = {}, input?: unknown, signal?: AbortSignal): Promise<unknown> {
    const endpoint = CryptoApiEndpointRegistry.find(entry => entry.method === method && entry.path === template);
    if (!endpoint || endpoint.requestFormat === 'multipart' || endpoint.responseFormat === 'binary') throw new CryptoApiError(0, 'UNSUPPORTED_ENDPOINT');
    const path = template.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_, key: string) => {
      const value = parameters[key];
      if (!value) throw new CryptoApiError(0, 'UNSUPPORTED_ENDPOINT');
      return encodeURIComponent(value);
    });
    const payload = endpoint.requestSchema ? endpoint.requestSchema.parse(input) : undefined;
    let url = path;
    if (method === 'GET' && payload && typeof payload === 'object') {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(payload)) if (value !== undefined) query.set(key, String(value));
      if (query.size) url += `?${query}`;
    }
    // Native browser fetch cannot be invoked with CryptoApi as its receiver.
    const transport = this.transport;
    const response = await transport(url, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      signal, headers: { Accept: 'application/json', ...(method !== 'GET' && payload !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(method !== 'GET' && payload !== undefined ? { body: JSON.stringify(payload) } : {}) });
    if (!response.ok) throw new CryptoApiError(response.status, 'HTTP_ERROR');
    try { return endpoint.responseSchema.parse(await response.json()); }
    catch { throw new CryptoApiError(response.status, 'INVALID_RESPONSE'); }
  }
}
