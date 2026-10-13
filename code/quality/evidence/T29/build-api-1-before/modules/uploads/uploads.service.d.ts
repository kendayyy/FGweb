import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ChatService, ChatActor } from '../chat/chat.service.js';
import { LobbyCipher } from '../chat-crypto/lobby-cipher.js';
export declare class UploadsService implements OnModuleInit, OnModuleDestroy {
    private readonly chat;
    private readonly lobbyCipher;
    private pool;
    private directory;
    private timer?;
    private sweeping?;
    private opening?;
    private readonly logger;
    constructor(chat: ChatService, lobbyCipher: LobbyCipher);
    onModuleInit(): Promise<void>;
    private ready;
    onModuleDestroy(): Promise<void>;
    private file;
    upload(body: unknown, file: Express.Multer.File | undefined, actor: ChatActor): Promise<{
        id: string;
        url: string;
        fileName: string;
        fileSize: number;
        mimeType: "image/jpeg" | "image/png" | "image/webp";
    }>;
    private uploadLobby;
    private lobbyImage;
    image(id: string, actor: ChatActor): Promise<any>;
    content(id: string, actor: ChatActor): Promise<Buffer<ArrayBufferLike>>;
    cleanup(now?: Date): Promise<void>;
}
