import { z } from 'zod';
import { IdSchema } from './common.js';
import { AllowedImageMimeTypeSchema, MAX_IMAGE_SIZE_BYTES } from './messages.js';
/** Browser/HTTP adapters normalize the multipart file into these trusted transport fields;
 * signature, decoded dimensions and ownership are still verified by the server. */
export const UploadImageRequestSchema = z.object({
    conversationId: IdSchema,
    file: z.object({ bytes: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength > 0 && bytes.byteLength <= MAX_IMAGE_SIZE_BYTES), fileName: z.string().min(1).max(255), mimeType: AllowedImageMimeTypeSchema }).strict(),
}).strict();
export const AttachmentUrlSchema = z.object({ url: z.string().url() }).strict();
/** Raw HTTP response bytes, Content-Type image/webp; this is not a JSON envelope. */
export const ImageContentSchema = z.instanceof(Uint8Array).refine(bytes => bytes.byteLength > 0 && bytes.byteLength <= MAX_IMAGE_SIZE_BYTES);
export const IMAGE_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
