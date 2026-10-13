import { MAX_IMAGE_PIXELS, MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES } from '@fg/contracts';
import { encryptAttachmentBytes, decryptAttachmentBytes, PrivateAttachmentError, type PrivateAttachmentSecret } from './attachments';
import { publicSha256 } from './canonical-json';
import { inspectImageHeader } from './image-header';

export interface SealedPrivateImage {
  clientUploadId: string;
  ciphertext: Uint8Array;
  secret: PrivateAttachmentSecret;
  width: number;
  height: number;
}

/** Decode and re-encode locally. Only native encrypted bytes leave this module. */
export async function preparePrivateImage(file: File, signal?: AbortSignal): Promise<SealedPrivateImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES || signal?.aborted) throw new PrivateAttachmentError();
  let bitmap: ImageBitmap | undefined;
  let source: Uint8Array | undefined;
  try {
    source = new Uint8Array(await file.arrayBuffer());
    inspectImageHeader(source, file.type);
    if (signal?.aborted) throw new PrivateAttachmentError();
    bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height || bitmap.width > 10000 || bitmap.height > 10000 || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS || signal?.aborted) throw new PrivateAttachmentError();
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); if (!context) throw new PrivateAttachmentError();
    context.drawImage(bitmap, 0, 0);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new PrivateAttachmentError()), 'image/webp', .9));
      if (blob.type !== 'image/webp' || !blob.size || blob.size > MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES || signal?.aborted) throw new PrivateAttachmentError();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      try {
        const encrypted = encryptAttachmentBytes(bytes);
        return { clientUploadId: crypto.randomUUID(), ...encrypted, width: bitmap.width, height: bitmap.height };
      } finally { bytes.fill(0); }
    } finally { canvas.width = 0; canvas.height = 0; }
  } catch { throw new PrivateAttachmentError(); }
  finally { bitmap?.close(); source?.fill(0); }
}

export async function decodePrivateImage(ciphertext: Uint8Array, image: { secret: PrivateAttachmentSecret; plaintextSize: number; mimeType: string; width: number; height: number }, signal?: AbortSignal): Promise<Blob> {
  const bytes = decryptAttachmentBytes(ciphertext, image.secret);
  let bitmap: ImageBitmap | undefined;
  try {
    if (image.mimeType !== 'image/webp' || bytes.byteLength !== image.plaintextSize || image.width * image.height > MAX_IMAGE_PIXELS || signal?.aborted) throw new PrivateAttachmentError();
    const dimensions = inspectImageHeader(bytes, image.mimeType);
    if (dimensions.width !== image.width || dimensions.height !== image.height) throw new PrivateAttachmentError();
    const blob = new Blob([new Uint8Array(bytes).buffer], { type: 'image/webp' });
    bitmap = await createImageBitmap(blob);
    if (bitmap.width !== image.width || bitmap.height !== image.height || signal?.aborted) throw new PrivateAttachmentError();
    return blob;
  } catch { throw new PrivateAttachmentError(); }
  finally { bitmap?.close(); bytes.fill(0); }
}

/** Preserve the original source digest; re-encode only explicit report previews. */
export async function decodeLegacyImage(ciphertext: Uint8Array, image: { secret: PrivateAttachmentSecret; fileSize: number; mimeType: string; plaintextSha256: string }, signal?: AbortSignal, reportPreview = false): Promise<Blob> {
  const bytes = decryptAttachmentBytes(ciphertext, image.secret);
  let bitmap: ImageBitmap | undefined;
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType) || bytes.byteLength !== image.fileSize || signal?.aborted ||
      await publicSha256(bytes) !== image.plaintextSha256.replace(/=+$/, '')) throw new PrivateAttachmentError();
    inspectImageHeader(bytes, image.mimeType);
    const blob = new Blob([bytes.slice().buffer], { type: image.mimeType });
    bitmap = await createImageBitmap(blob);
    if (!bitmap.width || !bitmap.height || bitmap.width > 10000 || bitmap.height > 10000 || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS || signal?.aborted) throw new PrivateAttachmentError();
    if (!reportPreview || blob.type === 'image/webp') return blob;
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    try {
      const context = canvas.getContext('2d'); if (!context) throw new PrivateAttachmentError();
      context.drawImage(bitmap, 0, 0);
      const preview = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new PrivateAttachmentError()), 'image/webp', .9));
      if (preview.type !== 'image/webp' || !preview.size || preview.size > MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES || signal?.aborted) throw new PrivateAttachmentError();
      return preview;
    } finally { canvas.width = 0; canvas.height = 0; }
  } catch { throw new PrivateAttachmentError(); }
  finally { bitmap?.close(); bytes.fill(0); }
}
