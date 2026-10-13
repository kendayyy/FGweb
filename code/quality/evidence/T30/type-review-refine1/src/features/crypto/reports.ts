import { ReportImageDisclosureSchema, ReportAttachmentReceiptSchema } from '@fg/contracts';
import { CryptoApi, CryptoApiError } from './api';

/** Plaintext leaves the device only through this explicit user-disclosure action. */
export async function discloseReportImage(metadata: unknown, image: Blob, signal: AbortSignal) {
  const parsed = ReportImageDisclosureSchema.parse(metadata);
  if (image.type !== 'image/webp' || image.size !== parsed.plaintextSize || signal.aborted) throw new CryptoApiError(0, 'INVALID_RESPONSE');
  const form = new FormData();
  form.append('metadata', JSON.stringify(parsed));
  form.append('file', image, 'image.webp');
  const response = await fetch('/api/v1/crypto/reports/attachments', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal, body: form, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new CryptoApiError(response.status, 'HTTP_ERROR');
  try { return ReportAttachmentReceiptSchema.parse(await response.json()); }
  catch { throw new CryptoApiError(response.status, 'INVALID_RESPONSE'); }
}

export async function discloseReport(input: unknown, signal: AbortSignal) {
  return new CryptoApi().invoke('POST', '/api/v1/crypto/reports', {}, input, signal);
}
