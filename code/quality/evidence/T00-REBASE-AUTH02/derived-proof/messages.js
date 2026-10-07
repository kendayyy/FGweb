import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, GameTitleSchema } from './common.js';
import { UserSummarySchema } from './profiles.js';
export const AllowedImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
export const AllowedImageMimeTypeSchema = z.enum(AllowedImageMimeTypes);
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const MAX_IMAGE_MEGAPIXELS = 20;
export const MAX_IMAGE_PIXELS = 20 * 1000 * 1000; // 20 Megapixels
export const AttachmentSchema = z.object({
    id: IdSchema,
    url: z.string().url(),
    fileName: z.string().min(1),
    fileSize: z.number().positive().max(MAX_IMAGE_SIZE_BYTES),
    mimeType: AllowedImageMimeTypeSchema,
});
export const UploadImageMetadataSchema = z
    .object({
    width: z.number().int().positive().max(10000),
    height: z.number().int().positive().max(10000),
    mimeType: AllowedImageMimeTypeSchema,
    fileSize: z.number().positive().max(MAX_IMAGE_SIZE_BYTES).optional(),
})
    .superRefine((data, ctx) => {
    if (data.width * data.height > MAX_IMAGE_PIXELS) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Image resolution exceeds maximum allowed limit of ${MAX_IMAGE_MEGAPIXELS}MP`,
            path: ['width'],
        });
    }
});
export const ChatCursorSchema = z.object({
    createdAt: IsoDateTimeSchema,
    id: IdSchema,
});
export function encodeChatCursor(cursor) {
    const validated = ChatCursorSchema.parse(cursor);
    const jsonStr = JSON.stringify(validated);
    let binary = '';
    if (typeof TextEncoder !== 'undefined') {
        const bytes = new TextEncoder().encode(jsonStr);
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
    }
    else {
        // Portable fallback
        binary = unescape(encodeURIComponent(jsonStr));
    }
    const base64 = typeof btoa !== 'undefined'
        ? btoa(binary)
        : globalThis.Buffer.from(binary, 'binary').toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeChatCursor(encoded) {
    if (!encoded || typeof encoded !== 'string' || encoded.trim().length === 0) {
        return null;
    }
    try {
        let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4 !== 0) {
            base64 += '=';
        }
        let binary = '';
        if (typeof atob !== 'undefined') {
            binary = atob(base64);
        }
        else {
            binary = globalThis.Buffer.from(base64, 'base64').toString('binary');
        }
        let jsonStr = '';
        if (typeof TextDecoder !== 'undefined') {
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            jsonStr = new TextDecoder().decode(bytes);
        }
        else {
            jsonStr = decodeURIComponent(escape(binary));
        }
        const parsed = JSON.parse(jsonStr);
        const res = ChatCursorSchema.safeParse(parsed);
        return res.success ? res.data : null;
    }
    catch {
        return null;
    }
}
export const ValidatedChatCursorStringSchema = z.string().superRefine((val, ctx) => {
    if (val.trim().length === 0 || decodeChatCursor(val) === null) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Invalid base64url encoded chat cursor',
        });
    }
});
const BaseMessageSchema = z.object({
    id: IdSchema,
    conversationId: IdSchema,
    senderId: IdSchema,
    sender: UserSummarySchema,
    content: z.string().max(2000),
    attachments: z.array(AttachmentSchema).default([]),
    mentions: z.array(UserSummarySchema).default([]),
    mentionedUserIds: z.array(IdSchema).default([]),
    replyToId: IdSchema.nullable().optional(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema.optional(),
});
export const MessageSchema = BaseMessageSchema.extend({
    replyToMessage: z.lazy(() => BaseMessageSchema.nullable().optional()),
});
export const CreateMessageRequestSchema = z
    .object({
    content: z.string().max(2000, 'Content exceeds 2000 characters'),
    attachmentIds: z.array(IdSchema).default([]),
    mentionedUserIds: z.array(IdSchema).default([]),
    replyToId: IdSchema.optional(),
    clientMessageId: IdSchema,
    idempotencyKey: z.string().min(1).optional(),
})
    .superRefine((data, ctx) => {
    const trimmed = data.content.trim();
    if (trimmed.length === 0 && data.attachmentIds.length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Message must have non-empty content or at least one image attachment',
            path: ['content'],
        });
    }
});
export const ListMessagesQuerySchema = z.object({
    cursor: ValidatedChatCursorStringSchema.optional(),
    limit: z.number().int().min(1).max(50).default(50),
});
export const LobbyMessagesQuerySchema = z.object({
    gameTitle: GameTitleSchema,
    cursor: ValidatedChatCursorStringSchema.optional(),
    limit: z.number().int().min(1).max(50).default(50),
});
