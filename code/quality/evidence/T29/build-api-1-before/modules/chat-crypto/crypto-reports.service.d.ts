import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ChatService, ChatActor } from '../chat/chat.service.js';
import { OpenBaoTransit } from './openbao-transit.js';
import { CryptoRelayService } from './crypto-relay.service.js';
import { AuthService } from '../auth/auth.service.js';
export declare const REPORT_CUSTODY = "FG_REPORT_CUSTODY";
export declare const REPORT_READER = "FG_REPORT_READER";
export type ReportCustody = {
    transit: OpenBaoTransit;
    retentionSeconds: number;
};
export declare class CryptoReportsService implements OnModuleInit, OnModuleDestroy {
    private readonly chat;
    private readonly auth;
    private readonly custody?;
    private readonly reader?;
    private readonly relay?;
    private schemaReady;
    private pool;
    private readonly objects;
    private readonly logger;
    private readonly sweeps;
    constructor(chat: ChatService, auth: AuthService, custody?: ReportCustody | undefined, reader?: {
        transit: OpenBaoTransit;
    } | undefined, relay?: CryptoRelayService | undefined);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    cleanup(): Promise<void>;
    private verifyObject;
    private authorizeAdmin;
    private reportRoot;
    readReport(actor: ChatActor, id: string, input: unknown): Promise<{
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
    readImage(actor: ChatActor, id: string, attachmentId: string): Promise<Buffer<ArrayBufferLike>>;
    disclose(actor: ChatActor, input: unknown): Promise<{
        id: `${string}-${string}-${string}-${string}-${string}`;
    }>;
    private reportSource;
    uploadImage(actor: ChatActor, input: unknown, file?: {
        buffer: Buffer;
        size: number;
        mimetype: string;
    }): Promise<{
        id: string;
        expiresAt: string;
    }>;
}
