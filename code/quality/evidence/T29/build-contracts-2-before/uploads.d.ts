import { z } from 'zod';
/** Browser/HTTP adapters normalize the multipart file into these trusted transport fields;
 * signature, decoded dimensions and ownership are still verified by the server. */
export declare const UploadImageRequestSchema: z.ZodObject<{
    conversationId: z.ZodString;
    file: z.ZodObject<{
        bytes: z.ZodInstanceOf<Uint8Array<ArrayBuffer>>;
        fileName: z.ZodString;
        mimeType: z.ZodEnum<{
            "image/jpeg": "image/jpeg";
            "image/png": "image/png";
            "image/webp": "image/webp";
        }>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type UploadImageRequest = z.infer<typeof UploadImageRequestSchema>;
export declare const AttachmentUrlSchema: z.ZodObject<{
    url: z.ZodString;
}, z.core.$strict>;
export type AttachmentUrl = z.infer<typeof AttachmentUrlSchema>;
/** Raw HTTP response bytes, Content-Type image/webp; this is not a JSON envelope. */
export declare const ImageContentSchema: z.ZodInstanceOf<Uint8Array<ArrayBuffer>>;
export declare const IMAGE_DRAFT_TTL_MS: number;
