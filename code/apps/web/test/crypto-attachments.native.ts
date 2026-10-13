import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { decryptAttachmentBytes, encryptAttachmentBytes, MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES, PrivateAttachmentError } from '../src/features/crypto/attachments.ts';
before(() => sdk.initAsync());
const bytes = new TextEncoder().encode('opaque native Matrix v2 bytes; pixel normalization tested separately');
test('native Matrix attachment roundtrip with v2 secret; ciphertext has no source bytes', () => {
  const encrypted = encryptAttachmentBytes(bytes);
  assert.equal(encrypted.secret.v, 'v2'); assert.equal(encrypted.secret.key.alg, 'A256CTR');
  assert.notDeepEqual(encrypted.ciphertext, bytes);
  assert.deepEqual(decryptAttachmentBytes(encrypted.ciphertext, encrypted.secret), bytes);
});
test('same bytes have independent native encryption keys and IVs', () => {
  const first = encryptAttachmentBytes(bytes), second = encryptAttachmentBytes(bytes);
  assert.notEqual(first.secret.key.k, second.secret.key.k); assert.notEqual(first.secret.iv, second.secret.iv);
  assert.notDeepEqual(first.ciphertext, second.ciphertext);
});
test('native integrity rejects changed or truncated encrypted bytes', () => {
  const encrypted = encryptAttachmentBytes(bytes), changed = encrypted.ciphertext.slice(); changed[0] ^= 1;
  assert.throws(() => decryptAttachmentBytes(changed, encrypted.secret), PrivateAttachmentError);
  assert.throws(() => decryptAttachmentBytes(encrypted.ciphertext.subarray(1), encrypted.secret), PrivateAttachmentError);
});
test('attachment limits and strict descriptor reject empty, oversized, plaintext and unknown fields', () => {
  assert.throws(() => encryptAttachmentBytes(new Uint8Array()), PrivateAttachmentError);
  assert.throws(() => encryptAttachmentBytes(new Uint8Array(MAX_PRIVATE_CIPHERTEXT_IMAGE_BYTES + 1)), PrivateAttachmentError);
  const encrypted = sdk.Attachment.encrypt(bytes);
  try {
    const secret = JSON.parse(encrypted.mediaEncryptionInfo!);
    assert.throws(() => decryptAttachmentBytes(encrypted.encryptedData, { ...secret, filename: 'private.png' }), PrivateAttachmentError);
    assert.throws(() => decryptAttachmentBytes(bytes, secret), PrivateAttachmentError);
  } finally { encrypted.free(); }
});
