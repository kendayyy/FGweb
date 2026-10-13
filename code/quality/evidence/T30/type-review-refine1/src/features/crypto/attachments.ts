import { MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES, MatrixEncryptedAttachmentSecretSchema } from '@fg/contracts';
import type { z } from 'zod';
import { Attachment, EncryptedAttachment } from '@matrix-org/matrix-sdk-crypto-wasm';

export type PrivateAttachmentSecret = z.infer<typeof MatrixEncryptedAttachmentSecretSchema>;
export class PrivateAttachmentError extends Error {
  constructor() { super('PRIVATE_ATTACHMENT_INVALID'); this.name = 'PrivateAttachmentError'; }
}
export function encryptAttachmentBytes(bytes: Uint8Array): { ciphertext: Uint8Array; secret: PrivateAttachmentSecret } {
  if (!bytes.byteLength || bytes.byteLength > MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES) throw new PrivateAttachmentError();
  let encrypted: EncryptedAttachment | undefined;
  try {
    encrypted = Attachment.encrypt(bytes);
    const secret = MatrixEncryptedAttachmentSecretSchema.parse(JSON.parse(encrypted.mediaEncryptionInfo!));
    const ciphertext = encrypted.encryptedData;
    if (ciphertext.byteLength !== bytes.byteLength) throw new PrivateAttachmentError();
    return { ciphertext, secret };
  } catch { throw new PrivateAttachmentError(); }
  finally { encrypted?.free(); }
}
export function decryptAttachmentBytes(ciphertext: Uint8Array, input: unknown): Uint8Array {
  if (!ciphertext.byteLength || ciphertext.byteLength > MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES) throw new PrivateAttachmentError();
  let encrypted: EncryptedAttachment | undefined;
  try {
    const secret = MatrixEncryptedAttachmentSecretSchema.parse(input);
    encrypted = new EncryptedAttachment(ciphertext, JSON.stringify(secret));
    return Attachment.decrypt(encrypted);
  } catch { throw new PrivateAttachmentError(); }
  finally { encrypted?.free(); }
}
export { MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES };
