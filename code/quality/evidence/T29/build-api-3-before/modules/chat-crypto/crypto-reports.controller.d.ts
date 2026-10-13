import type { Request, Response } from 'express';
import { ChatService } from '../chat/chat.service.js';
import { CryptoReportsService } from './crypto-reports.service.js';
export declare class CryptoReportsController {
    private readonly chat;
    private readonly reports;
    constructor(chat: ChatService, reports: CryptoReportsService);
    disclose(req: Request, body: unknown): Promise<{
        id: `${string}-${string}-${string}-${string}-${string}`;
    }>;
    read(req: Request, id: string, body: unknown): Promise<{
        id: string;
        selectedMessages: {
            evidenceId: string;
            messageId: string;
            conversationId: string;
            text: string;
            reason: string;
            source: "USER_DISCLOSED";
            authenticity: "USER_SUPPLIED_UNVERIFIED";
            reportAttachmentIds: string[];
        }[];
    }>;
    readImage(req: Request, id: string, attachmentId: string, res: Response): Promise<void>;
    image(req: Request, body: Record<string, unknown>, file?: {
        buffer: Buffer;
        size: number;
        mimetype: string;
    }): Promise<{
        id: string;
        expiresAt: string;
    }>;
}
