"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RealtimeGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const socket_io_1 = require("socket.io");
const ioredis_1 = require("ioredis");
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("@fg/contracts");
const chat_service_js_1 = require("../chat/chat.service.js");
function originAllowed(origin) {
    return typeof origin === 'string' && [process.env.PUBLIC_ORIGIN, process.env.BETTER_AUTH_URL].filter(Boolean).some(value => {
        try {
            return new URL(value).origin === origin;
        }
        catch {
            return false;
        }
    });
}
let RealtimeGateway = RealtimeGateway_1 = class RealtimeGateway {
    chat;
    server;
    subscriptions = new Map();
    logger = new common_1.Logger(RealtimeGateway_1.name);
    publisher;
    subscriber;
    opening;
    timer;
    dispatching;
    closing = false;
    deliveries = new Set();
    get channel() { return `fg:chat:${(0, node_crypto_1.createHash)('sha256').update(process.env.DATABASE_URL ?? '').digest('hex').slice(0, 24)}`; }
    constructor(chat) {
        this.chat = chat;
    }
    afterInit(server) { server.use((socket, next) => { void this.validate(socket).then(() => this.openBus()).then(() => next()).catch(() => next(new Error('Socket access denied'))); }); }
    async validate(socket) {
        if (!originAllowed(socket.handshake.headers.origin))
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Origin denied');
        return this.chat.actor(socket.handshake.headers);
    }
    async openBus() {
        if (this.opening)
            return this.opening;
        this.opening = (async () => {
            if (!process.env.REDIS_URL)
                throw new Error('Redis required');
            const options = { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000, retryStrategy: (times) => Math.min(times * 250, 3000) };
            this.publisher = new ioredis_1.Redis(process.env.REDIS_URL, options);
            this.subscriber = new ioredis_1.Redis(process.env.REDIS_URL, options);
            this.publisher.on('error', () => this.logger.warn('Chat event publisher unavailable'));
            this.subscriber.on('error', () => this.logger.warn('Chat event subscriber unavailable'));
            this.subscriber.on('message', (channel, id) => {
                if (channel !== this.channel || this.closing)
                    return;
                const delivery = this.deliver(id).catch(() => this.logger.warn('Chat event delivery failed; recover using REST'));
                this.deliveries.add(delivery);
                void delivery.finally(() => this.deliveries.delete(delivery));
            });
            await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
            await this.subscriber.subscribe(this.channel);
            this.timer = setInterval(() => {
                if (this.closing || this.dispatching || !this.subscriptions.size)
                    return;
                this.dispatching = this.chat.dispatch(async (id) => { await this.publisher.publish(this.channel, id); }).catch(() => this.logger.warn('Chat outbox unavailable; durable jobs will retry')).finally(() => { this.dispatching = undefined; });
            }, 100);
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
    async subscribe(socket, body) {
        try {
            const parsed = contracts_1.SocketConversationRequestSchema.safeParse(body);
            if (!parsed.success)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid subscription');
            const actor = await this.validate(socket);
            const id = await this.chat.authorize(parsed.data.conversationId, actor);
            const channels = this.subscriptions.get(socket.id) ?? new Set();
            if (!channels.has(id) && channels.size >= 32)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.RATE_LIMITED, 'Subscription limit reached');
            channels.add(id);
            this.subscriptions.set(socket.id, channels);
            return { ok: true, conversationId: id };
        }
        catch (error) {
            return this.denied(error);
        }
    }
    async unsubscribe(socket, body) {
        try {
            const parsed = contracts_1.SocketConversationRequestSchema.safeParse(body);
            if (!parsed.success)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid subscription');
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
    denied(error) { const body = error instanceof common_1.HttpException ? error.getResponse() : null; const code = typeof body === 'object' && body !== null && 'code' in body ? body.code : contracts_1.ErrorCode.FORBIDDEN; return { ok: false, error: { code, message: 'Conversation access denied', requestId: (0, node_crypto_1.randomUUID)() } }; }
    handleDisconnect(socket) { this.subscriptions.delete(socket.id); }
    async deliver(id) {
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
                    socket.emit(contracts_1.SocketEventNames.MESSAGE_CREATED, message);
            }
            catch {
                channels.delete(message.conversationId);
                if (!channels.size)
                    this.subscriptions.delete(socketId);
            }
        }
    }
    async onModuleDestroy() {
        this.closing = true;
        if (this.timer)
            clearInterval(this.timer);
        if (this.dispatching)
            await this.dispatching;
        await Promise.all([...this.deliveries]);
        this.publisher?.disconnect();
        this.subscriber?.disconnect();
        this.subscriptions.clear();
    }
};
exports.RealtimeGateway = RealtimeGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RealtimeGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)(contracts_1.SocketEventNames.CONVERSATION_SUBSCRIBE),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "subscribe", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(contracts_1.SocketEventNames.CONVERSATION_UNSUBSCRIBE),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "unsubscribe", null);
exports.RealtimeGateway = RealtimeGateway = RealtimeGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ path: '/socket.io', maxHttpBufferSize: 16384, cors: { credentials: true, origin: (origin, done) => done(originAllowed(origin) ? null : new Error('Origin denied'), originAllowed(origin)) }, allowRequest: (request, done) => done(null, originAllowed(request.headers.origin)) }),
    __metadata("design:paramtypes", [chat_service_js_1.ChatService])
], RealtimeGateway);
//# sourceMappingURL=realtime.gateway.js.map