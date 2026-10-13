import type { Request, Response } from 'express';
import { UploadsService } from './uploads.service.js';
import { ChatService } from '../chat/chat.service.js';
export declare class UploadsController {
    private readonly uploads;
    private readonly chat;
    constructor(uploads: UploadsService, chat: ChatService);
    upload(body: unknown, file: Express.Multer.File | undefined, req: Request): Promise<{
        id: string;
        url: string;
        fileName: string;
        fileSize: number;
        mimeType: "image/jpeg" | "image/png" | "image/webp";
    }>;
    metadata(id: string, req: Request, response: Response): Promise<{
        url: string;
    }>;
    content(id: string, req: Request, response: Response): Promise<void>;
}
