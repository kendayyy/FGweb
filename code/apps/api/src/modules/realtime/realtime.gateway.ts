import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket, MessageBody, OnGatewayInit, OnGatewayDisconnect } from '@nestjs/websockets';
import { OnModuleDestroy, Logger, HttpException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { SocketConversationRequestSchema, SocketConversationAck, SocketEventNames, ErrorCode } from '@fg/contracts';
import { ChatService, chatError } from '../chat/chat.service.js';
function originAllowed(origin: unknown) { return typeof origin === 'string' && [process.env.PUBLIC_ORIGIN, process.env.BETTER_AUTH_URL].filter(Boolean).some(value => { try {
    return new URL(value!).origin === origin;
}
catch {
    return false;
} }); }
@WebSocketGateway({ path: '/socket.io', maxHttpBufferSize: 16384, cors: { credentials: true, origin: (origin: string | undefined, done: (error: Error | null, allow?: boolean) => void) => done(originAllowed(origin) ? null : new Error('Origin denied'), originAllowed(origin)) }, allowRequest: (request: IncomingMessage, done: (error: string | null, success: boolean) => void) => done(null, originAllowed(request.headers.origin)) })
export class RealtimeGateway implements OnGatewayInit, OnGatewayDisconnect, OnModuleDestroy {
    @WebSocketServer()
    server!: Server;
    private readonly subscriptions = new Map<string, Set<string>>();
    private readonly logger = new Logger(RealtimeGateway.name);
    private publisher?: Redis;
    private subscriber?: Redis;
    private opening?: Promise<void>;
    private timer?: ReturnType<typeof setInterval>;
    private dispatching?: Promise<void>;
    private closing = false;
    private readonly deliveries = new Set<Promise<void>>();
    private get channel() { return `fg:chat:${createHash('sha256').update(process.env.DATABASE_URL ?? '').digest('hex').slice(0, 24)}`; }
    constructor(private readonly chat: ChatService) { }
    afterInit(server: Server) { server.use((socket, next) => { void this.validate(socket).then(() => this.openBus()).then(() => next()).catch(() => next(new Error('Socket access denied'))); }); }
    private async validate(socket: Socket) { if (!originAllowed(socket.handshake.headers.origin))
        chatError(ErrorCode.FORBIDDEN, 'Origin denied'); return this.chat.actor(socket.handshake.headers); }
    private async openBus() {
        if (this.opening)
            return this.opening;
        this.opening = (async () => {
            if (!process.env.REDIS_URL)
                throw new Error('Redis required');
            const options = { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000, retryStrategy: (times: number) => Math.min(times * 250, 3000) };
            this.publisher = new Redis(process.env.REDIS_URL, options);
            this.subscriber = new Redis(process.env.REDIS_URL, options);
            this.publisher.on('error', () => this.logger.warn('Chat event publisher unavailable'));
            this.subscriber.on('error', () => this.logger.warn('Chat event subscriber unavailable'));
            this.subscriber.on('message', (channel, id) => { if (channel !== this.channel || this.closing)
                return; const delivery = this.deliver(id).catch(() => this.logger.warn('Chat event delivery failed; recover using REST')); this.deliveries.add(delivery); void delivery.finally(() => this.deliveries.delete(delivery)); });
            await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
            await this.subscriber.subscribe(this.channel);
            this.timer = setInterval(() => { if (this.closing || this.dispatching || !this.subscriptions.size)
                return; this.dispatching = this.chat.dispatch(async (id) => { await this.publisher!.publish(this.channel, id); }).catch(() => this.logger.warn('Chat outbox unavailable; durable jobs will retry')).finally(() => { this.dispatching = undefined; }); }, 100);
            this.timer.unref();
        })();
        try {
            await this.opening;
        }
        catch (error) {
            this.publisher?.disconnect();
            this.subscriber?.disconnect();
            this.opening = undefined;
            throw error;
        }
    }
    @SubscribeMessage(SocketEventNames.CONVERSATION_SUBSCRIBE)
    async subscribe(
    @ConnectedSocket()
    socket: Socket, 
    @MessageBody()
    body: unknown): Promise<SocketConversationAck> {
        try {
            const parsed = SocketConversationRequestSchema.safeParse(body);
            if (!parsed.success)
                chatError(ErrorCode.INVALID_INPUT, 'Invalid subscription');
            const actor = await this.validate(socket);
            const id = await this.chat.authorize(parsed.data.conversationId, actor);
            const channels = this.subscriptions.get(socket.id) ?? new Set<string>();
            if (!channels.has(id) && channels.size >= 32)
                chatError(ErrorCode.RATE_LIMITED, 'Subscription limit reached');
            channels.add(id);
            this.subscriptions.set(socket.id, channels);
            return { ok: true, conversationId: id };
        }
        catch (error) {
            return this.denied(error);
        }
    }
    @SubscribeMessage(SocketEventNames.CONVERSATION_UNSUBSCRIBE)
    async unsubscribe(
    @ConnectedSocket()
    socket: Socket, 
    @MessageBody()
    body: unknown): Promise<SocketConversationAck> {
        try {
            const parsed = SocketConversationRequestSchema.safeParse(body);
            if (!parsed.success)
                chatError(ErrorCode.INVALID_INPUT, 'Invalid subscription');
            const actor = await this.validate(socket);
            const id = await this.chat.authorize(parsed.data.conversationId, actor);
            this.subscriptions.get(socket.id)?.delete(id);
            if (!this.subscriptions.get(socket.id)?.size)
                this.subscriptions.delete(socket.id);
            return { ok: true, conversationId: id };
        }
        catch (error) {
            return this.denied(error);
        }
    }
    private denied(error: unknown): SocketConversationAck { const body = error instanceof HttpException ? error.getResponse() : null; const code = typeof body === 'object' && body !== null && 'code' in body ? body.code as ErrorCode : ErrorCode.FORBIDDEN; return { ok: false, error: { code, message: 'Conversation access denied', requestId: randomUUID() } }; }
    handleDisconnect(socket: Socket) { this.subscriptions.delete(socket.id); }
    private async deliver(id: string) {
        const message = await this.chat.committedMessage(id);
        for (const [socketId, channels] of this.subscriptions) {
            if (!channels.has(message.conversationId))
                continue;
            const socket = this.server.sockets.sockets.get(socketId);
            if (!socket?.connected) {
                this.subscriptions.delete(socketId);
                continue;
            }
            try {
                const actor = await this.validate(socket);
                await this.chat.authorize(message.conversationId, actor);
                if (socket.connected && this.subscriptions.get(socketId)?.has(message.conversationId))
                    socket.emit(SocketEventNames.MESSAGE_CREATED, message);
            }
            catch {
                channels.delete(message.conversationId);
                if (!channels.size)
                    this.subscriptions.delete(socketId);
            }
        }
    }
    async onModuleDestroy() { this.closing = true; if (this.timer)
        clearInterval(this.timer); if (this.dispatching)
        await this.dispatching; await Promise.all([...this.deliveries]); this.publisher?.disconnect(); this.subscriber?.disconnect(); this.subscriptions.clear(); }
}
