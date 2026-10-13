import { z } from 'zod';
export declare const AllowedImageMimeTypes: readonly ["image/jpeg", "image/png", "image/webp"];
export type AllowedImageMimeType = (typeof AllowedImageMimeTypes)[number];
export declare const AllowedImageMimeTypeSchema: z.ZodEnum<{
    "image/jpeg": "image/jpeg";
    "image/png": "image/png";
    "image/webp": "image/webp";
}>;
export declare const MAX_IMAGE_SIZE_BYTES: number;
export declare const MAX_IMAGE_MEGAPIXELS = 20;
export declare const MAX_IMAGE_PIXELS: number;
export declare const AttachmentSchema: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodString;
    fileName: z.ZodString;
    fileSize: z.ZodNumber;
    mimeType: z.ZodEnum<{
        "image/jpeg": "image/jpeg";
        "image/png": "image/png";
        "image/webp": "image/webp";
    }>;
}, z.core.$strip>;
export type AttachmentDTO = z.infer<typeof AttachmentSchema>;
export declare const UploadImageMetadataSchema: z.ZodObject<{
    width: z.ZodNumber;
    height: z.ZodNumber;
    mimeType: z.ZodEnum<{
        "image/jpeg": "image/jpeg";
        "image/png": "image/png";
        "image/webp": "image/webp";
    }>;
    fileSize: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type UploadImageMetadata = z.infer<typeof UploadImageMetadataSchema>;
export declare const ChatCursorSchema: z.ZodObject<{
    createdAt: z.ZodString;
    id: z.ZodString;
}, z.core.$strip>;
export type ChatCursor = z.infer<typeof ChatCursorSchema>;
export declare function encodeChatCursor(cursor: ChatCursor): string;
export declare function decodeChatCursor(encoded: string): ChatCursor | null;
export declare const ValidatedChatCursorStringSchema: z.ZodString;
export declare const MessageSchema: z.ZodObject<{
    id: z.ZodString;
    conversationId: z.ZodString;
    senderId: z.ZodString;
    sender: z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>;
    content: z.ZodString;
    attachments: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        url: z.ZodString;
        fileName: z.ZodString;
        fileSize: z.ZodNumber;
        mimeType: z.ZodEnum<{
            "image/jpeg": "image/jpeg";
            "image/png": "image/png";
            "image/webp": "image/webp";
        }>;
    }, z.core.$strip>>>;
    mentions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        displayName: z.ZodString;
        avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        customStatus: z.ZodDefault<z.ZodEnum<{
            LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
            PLAYING: "PLAYING";
            JUST_CHATTING: "JUST_CHATTING";
        }>>;
    }, z.core.$strip>>>;
    mentionedUserIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    replyToId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodString;
    updatedAt: z.ZodOptional<z.ZodString>;
    replyToMessage: z.ZodLazy<z.ZodOptional<z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        conversationId: z.ZodString;
        senderId: z.ZodString;
        sender: z.ZodObject<{
            id: z.ZodString;
            displayName: z.ZodString;
            avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            customStatus: z.ZodDefault<z.ZodEnum<{
                LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
                PLAYING: "PLAYING";
                JUST_CHATTING: "JUST_CHATTING";
            }>>;
        }, z.core.$strip>;
        content: z.ZodString;
        attachments: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            url: z.ZodString;
            fileName: z.ZodString;
            fileSize: z.ZodNumber;
            mimeType: z.ZodEnum<{
                "image/jpeg": "image/jpeg";
                "image/png": "image/png";
                "image/webp": "image/webp";
            }>;
        }, z.core.$strip>>>;
        mentions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            displayName: z.ZodString;
            avatarUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            customStatus: z.ZodDefault<z.ZodEnum<{
                LOOKING_FOR_TEAM: "LOOKING_FOR_TEAM";
                PLAYING: "PLAYING";
                JUST_CHATTING: "JUST_CHATTING";
            }>>;
        }, z.core.$strip>>>;
        mentionedUserIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        replyToId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        createdAt: z.ZodString;
        updatedAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>>;
}, z.core.$strip>;
export type MessageDTO = z.infer<typeof MessageSchema>;
export declare const CreateMessageRequestSchema: z.ZodObject<{
    content: z.ZodString;
    attachmentIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    mentionedUserIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    replyToId: z.ZodOptional<z.ZodString>;
    clientMessageId: z.ZodString;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CreateMessageRequest = z.infer<typeof CreateMessageRequestSchema>;
export declare const ListMessagesQuerySchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;
export declare const LobbyMessagesQuerySchema: z.ZodObject<{
    gameTitle: z.ZodEnum<{
        "Li\u00EAn Minh Huy\u1EC1n Tho\u1EA1i": "Liên Minh Huyền Thoại";
        Valorant: "Valorant";
        "Teamfight Tactics (TFT)": "Teamfight Tactics (TFT)";
        "Dota 2": "Dota 2";
        Roblox: "Roblox";
        "Li\u00EAn Qu\u00E2n Mobile": "Liên Quân Mobile";
        "Free Fire": "Free Fire";
    }>;
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type LobbyMessagesQuery = z.infer<typeof LobbyMessagesQuerySchema>;
