import {PrivateNotificationsService} from '../notifications/private-notifications.service.js';
import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket, MessageBody, OnGatewayInit, OnGatewayDisconnect } from '@nestjs/websockets';
import { OnModuleDestroy, Logger, HttpException, Optional } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { SocketConversationRequestSchema, SocketConversationAck, SocketEventNames, ErrorCode,SocketCryptoConversationRequestSchema,SocketCryptoConversationAck } from '@fg/contracts';
import { ChatService, chatError } from '../chat/chat.service.js';
import {CryptoRelayService} from '../chat-crypto/crypto-relay.service.js';
import {CryptoProtocolWakeSignalSchema,type CryptoProtocolWakeSignal} from '@fg/contracts';
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
    private readonly cryptoSubscriptions = new Map<string,Map<string,{deviceId:string;cohortId?:string}>>();
    private readonly logger = new Logger(RealtimeGateway.name);
    private publisher?: Redis;
    private subscriber?: Redis;
    private opening?: Promise<void>;
    private timer?: ReturnType<typeof setInterval>;
    private dispatching?: Promise<void>;
    private closing = false;
    private readonly noticeSeen=new Map<string,Set<string>>();
    private readonly deliveries = new Set<Promise<void>>();
    private get channel() { return `fg:chat:${createHash('sha256').update(process.env.DATABASE_URL ?? '').digest('hex').slice(0, 24)}`; }
    constructor(private readonly chat: ChatService,@Optional() private readonly crypto?:CryptoRelayService,@Optional() private readonly notices?:PrivateNotificationsService) { }
    afterInit(server: Server) { server.use((socket, next) => { void this.validate(socket).then(actor => { socket.data.fgPrivateUserId=actor?.userId; return this.openBus(); }).then(() => next()).catch(() => next(new Error('Socket access denied'))); }); }
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
                return; if(id.length>512||this.deliveries.size>=64)return;
                let work:Promise<void>;
                if(/^N:[a-f0-9-]{36}$/.test(id))work=this.deliverNotice(id.slice(2));
                else if(/^[a-f0-9-]{36}$/.test(id))work=this.deliver(id);
                else{let input:unknown;try{input=JSON.parse(id);}catch{return;}const signal=CryptoProtocolWakeSignalSchema.safeParse(input);if(!signal.success)return;work=this.deliverProtocol(signal.data);}
                const delivery = work.catch(() => this.logger.warn('Chat event delivery failed; recover using REST')); this.deliveries.add(delivery); void delivery.finally(() => this.deliveries.delete(delivery)); });
            await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
            await this.subscriber.subscribe(this.channel);
            this.timer = setInterval(() => { if (this.closing || this.dispatching || (!this.subscriptions.size&&!this.cryptoSubscriptions.size&&!this.server.sockets.sockets.size))
                return; this.dispatching = this.chat.dispatch(async (id) => { await this.publisher!.publish(this.channel, id); }).then(async()=>{await this.crypto?.dispatchProtocol(async signal=>{await this.publisher!.publish(this.channel,JSON.stringify(signal));});await this.notices?.dispatch(async id=>{await this.publisher!.publish(this.channel,'N:'+id);});}).catch(() => this.logger.warn('Chat outbox unavailable; durable jobs will retry')).finally(() => { this.dispatching = undefined; }); }, 100);
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
            await this.chat.assertLegacyRouteAllowed(id);
            const channels = this.subscriptions.get(socket.id) ?? new Set<string>();
            if (!channels.has(id) && channels.size+(this.cryptoSubscriptions.get(socket.id)?.size??0) >= 32)
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
    @SubscribeMessage(SocketEventNames.CRYPTO_SUBSCRIBE)
    async subscribeCrypto(@ConnectedSocket() socket:Socket,@MessageBody() body:unknown):Promise<SocketCryptoConversationAck>{
        try{
            const parsed=SocketCryptoConversationRequestSchema.safeParse(body);
            if(!parsed.success)chatError(ErrorCode.INVALID_INPUT,'Invalid crypto subscription');
            if(!this.crypto)chatError(ErrorCode.FORBIDDEN,'Encrypted transport unavailable');
            const actor=await this.validate(socket),result=await this.crypto.realtimeSubscription(actor,parsed.data.conversationId,parsed.data.deviceId,parsed.data.cohortId);
            const channels=this.cryptoSubscriptions.get(socket.id)??new Map<string,{deviceId:string;cohortId?:string}>();
            if(!channels.has(result.conversationId)&&channels.size+(this.subscriptions.get(socket.id)?.size??0)>=32)chatError(ErrorCode.RATE_LIMITED,'Subscription limit reached');
            channels.set(result.conversationId,{deviceId:result.deviceId,cohortId:parsed.data.cohortId});this.cryptoSubscriptions.set(socket.id,channels);return result;
        }catch(error){return this.denied(error) as SocketCryptoConversationAck;}
    }
    @SubscribeMessage(SocketEventNames.CRYPTO_UNSUBSCRIBE)
    async unsubscribeCrypto(@ConnectedSocket() socket:Socket,@MessageBody() body:unknown):Promise<SocketCryptoConversationAck>{
        try{
            const parsed=SocketCryptoConversationRequestSchema.safeParse(body);
            if(!parsed.success)chatError(ErrorCode.INVALID_INPUT,'Invalid crypto subscription');
            // Forget before authorization so revoked users can release memory.
            const channels=this.cryptoSubscriptions.get(socket.id);
            if(channels?.get(parsed.data.conversationId)?.deviceId===parsed.data.deviceId&&channels?.get(parsed.data.conversationId)?.cohortId===parsed.data.cohortId)channels.delete(parsed.data.conversationId);
            if(!channels?.size)this.cryptoSubscriptions.delete(socket.id);
            if(!this.crypto)chatError(ErrorCode.FORBIDDEN,'Encrypted transport unavailable');
            return await this.crypto.realtimeSubscription(await this.validate(socket),parsed.data.conversationId,parsed.data.deviceId,parsed.data.cohortId);
        }catch(error){return this.denied(error) as SocketCryptoConversationAck;}
    }
    handleDisconnect(socket: Socket) { this.noticeSeen.delete(socket.id); this.subscriptions.delete(socket.id);this.cryptoSubscriptions.delete(socket.id); }
    private async deliverProtocol(signal:CryptoProtocolWakeSignal){
        if(!this.crypto)return;const conversationId=await this.crypto.committedProtocolConversation(signal);if(!conversationId)return;
        for(const [socketId,channels]of this.cryptoSubscriptions){
            const subscription=channels.get(conversationId);if(!subscription)continue;const {deviceId,cohortId}=subscription;
            const socket=this.server.sockets.sockets.get(socketId);if(!socket?.connected){this.cryptoSubscriptions.delete(socketId);continue;}
            try{
                const hint=await this.crypto.protocolWakeup(await this.validate(socket),deviceId,signal,cohortId);
                if(hint&&socket.connected&&this.cryptoSubscriptions.get(socketId)?.get(conversationId)===subscription)socket.emit(SocketEventNames.CRYPTO_SYNC_AVAILABLE,hint);
            }catch{channels.delete(conversationId);if(!channels.size)this.cryptoSubscriptions.delete(socketId);}
        }
    }
    private async deliverNotice(id:string){
        if(!this.notices)return;const recipient=await this.notices.recipient(id);if(!recipient)return;
        for(const socket of [...this.server.sockets.sockets.values()]){
            if(!socket.connected||socket.data.fgPrivateUserId!==recipient||this.noticeSeen.get(socket.id)?.has(id))continue;
            try{const notice=await this.notices.realtimeNotice(await this.validate(socket),id);if(!notice||!socket.connected||this.noticeSeen.get(socket.id)?.has(id))continue;const seen=this.noticeSeen.get(socket.id)??new Set<string>();seen.add(id);if(seen.size>256)seen.delete(seen.values().next().value!);this.noticeSeen.set(socket.id,seen);socket.emit(SocketEventNames.NOTIFICATION_CREATED,notice);}catch{/* Fresh ACL/session denial suppresses delivery. */}
        }
    }
    private async deliver(id: string) {
        const encrypted=await this.crypto?.committedCiphertext(id);
        if(encrypted){
            for(const [socketId,channels]of this.cryptoSubscriptions){
                const subscription=channels.get(encrypted.conversationId);if(!subscription)continue;const {deviceId,cohortId}=subscription;
                const socket=this.server.sockets.sockets.get(socketId);if(!socket?.connected){this.cryptoSubscriptions.delete(socketId);continue;}
                try{
                    const message=await this.crypto!.realtimeMessage(await this.validate(socket),deviceId,id,cohortId);
                    if(message&&socket.connected&&this.cryptoSubscriptions.get(socketId)?.get(message.conversationId)===subscription)socket.emit(SocketEventNames.CRYPTO_MESSAGE_CREATED,message);
                }catch{
                    channels.delete(encrypted.conversationId);if(!channels.size)this.cryptoSubscriptions.delete(socketId);
                }
            }
            return;
        }
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
        await this.dispatching; await Promise.all([...this.deliveries]); this.publisher?.disconnect(); this.subscriber?.disconnect(); this.subscriptions.clear();this.cryptoSubscriptions.clear();this.noticeSeen.clear(); }
}
