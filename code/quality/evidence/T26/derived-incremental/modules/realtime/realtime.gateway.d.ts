import { OnGatewayInit, OnGatewayDisconnect } from '@nestjs/websockets';
import { OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SocketConversationAck } from '@fg/contracts';
import { ChatService } from '../chat/chat.service.js';
export declare class RealtimeGateway implements OnGatewayInit, OnGatewayDisconnect, OnModuleDestroy {
    private readonly chat;
    server: Server;
    private readonly subscriptions;
    private readonly logger;
    private publisher?;
    private subscriber?;
    private opening?;
    private timer?;
    private dispatching?;
    private closing;
    private readonly deliveries;
    private get channel();
    constructor(chat: ChatService);
    afterInit(server: Server): void;
    private validate;
    private openBus;
    subscribe(socket: Socket, body: unknown): Promise<SocketConversationAck>;
    unsubscribe(socket: Socket, body: unknown): Promise<SocketConversationAck>;
    private denied;
    handleDisconnect(socket: Socket): void;
    private deliver;
    onModuleDestroy(): Promise<void>;
}
