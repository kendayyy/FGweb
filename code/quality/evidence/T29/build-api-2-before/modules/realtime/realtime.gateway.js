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
const private_notifications_service_js_1 = require("../notifications/private-notifications.service.js");
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const socket_io_1 = require("socket.io");
const ioredis_1 = require("ioredis");
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("@fg/contracts");
const chat_service_js_1 = require("../chat/chat.service.js");
const crypto_relay_service_js_1 = require("../chat-crypto/crypto-relay.service.js");
const contracts_2 = require("@fg/contracts");
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
    crypto;
    notices;
    server;
    subscriptions = new Map();
    cryptoSubscriptions = new Map();
    logger = new common_1.Logger(RealtimeGateway_1.name);
    publisher;
    subscriber;
    opening;
    timer;
    dispatching;
    closing = false;
    noticeSeen = new Map();
    deliveries = new Set();
    get channel() { return `fg:chat:${(0, node_crypto_1.createHash)('sha256').update(process.env.DATABASE_URL ?? '').digest('hex').slice(0, 24)}`; }
    constructor(chat, crypto, notices) {
        this.chat = chat;
        this.crypto = crypto;
        this.notices = notices;
    }
    afterInit(server) { server.use((socket, next) => { void this.validate(socket).then(actor => { socket.data.fgPrivateUserId = actor?.userId; return this.openBus(); }).then(() => next()).catch(() => next(new Error('Socket access denied'))); }); }
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
                if (id.length > 512 || this.deliveries.size >= 64)
                    return;
                let work;
                if (/^N:[a-f0-9-]{36}$/.test(id))
                    work = this.deliverNotice(id.slice(2));
                else if (/^[a-f0-9-]{36}$/.test(id))
                    work = this.deliver(id);
                else {
                    let input;
                    try {
                        input = JSON.parse(id);
                    }
                    catch {
                        return;
                    }
                    const signal = contracts_2.CryptoProtocolWakeSignalSchema.safeParse(input);
                    if (!signal.success)
                        return;
                    work = this.deliverProtocol(signal.data);
                }
                const delivery = work.catch(() => this.logger.warn('Chat event delivery failed; recover using REST'));
                this.deliveries.add(delivery);
                void delivery.finally(() => this.deliveries.delete(delivery));
            });
            await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
            await this.subscriber.subscribe(this.channel);
            this.timer = setInterval(() => {
                if (this.closing || this.dispatching || (!this.subscriptions.size && !this.cryptoSubscriptions.size && !this.server.sockets.sockets.size))
                    return;
                this.dispatching = this.chat.dispatch(async (id) => { await this.publisher.publish(this.channel, id); }).then(async () => { await this.crypto?.dispatchProtocol(async (signal) => { await this.publisher.publish(this.channel, JSON.stringify(signal)); }); await this.notices?.dispatch(async (id) => { await this.publisher.publish(this.channel, 'N:' + id); }); }).catch(() => this.logger.warn('Chat outbox unavailable; durable jobs will retry')).finally(() => { this.dispatching = undefined; });
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
            await this.chat.assertLegacyRouteAllowed(id);
            const channels = this.subscriptions.get(socket.id) ?? new Set();
            if (!channels.has(id) && channels.size + (this.cryptoSubscriptions.get(socket.id)?.size ?? 0) >= 32)
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
    async subscribeCrypto(socket, body) {
        try {
            const parsed = contracts_1.SocketCryptoConversationRequestSchema.safeParse(body);
            if (!parsed.success)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid crypto subscription');
            if (!this.crypto)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Encrypted transport unavailable');
            const actor = await this.validate(socket), result = await this.crypto.realtimeSubscription(actor, parsed.data.conversationId, parsed.data.deviceId, parsed.data.cohortId);
            const channels = this.cryptoSubscriptions.get(socket.id) ?? new Map();
            if (!channels.has(result.conversationId) && channels.size + (this.subscriptions.get(socket.id)?.size ?? 0) >= 32)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.RATE_LIMITED, 'Subscription limit reached');
            channels.set(result.conversationId, { deviceId: result.deviceId, cohortId: parsed.data.cohortId });
            this.cryptoSubscriptions.set(socket.id, channels);
            return result;
        }
        catch (error) {
            return this.denied(error);
        }
    }
    async unsubscribeCrypto(socket, body) {
        try {
            const parsed = contracts_1.SocketCryptoConversationRequestSchema.safeParse(body);
            if (!parsed.success)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid crypto subscription');
            const channels = this.cryptoSubscriptions.get(socket.id);
            if (channels?.get(parsed.data.conversationId)?.deviceId === parsed.data.deviceId && channels?.get(parsed.data.conversationId)?.cohortId === parsed.data.cohortId)
                channels.delete(parsed.data.conversationId);
            if (!channels?.size)
                this.cryptoSubscriptions.delete(socket.id);
            if (!this.crypto)
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Encrypted transport unavailable');
            return await this.crypto.realtimeSubscription(await this.validate(socket), parsed.data.conversationId, parsed.data.deviceId, parsed.data.cohortId);
        }
        catch (error) {
            return this.denied(error);
        }
    }
    handleDisconnect(socket) { this.noticeSeen.delete(socket.id); this.subscriptions.delete(socket.id); this.cryptoSubscriptions.delete(socket.id); }
    async deliverProtocol(signal) {
        if (!this.crypto)
            return;
        const conversationId = await this.crypto.committedProtocolConversation(signal);
        if (!conversationId)
            return;
        for (const [socketId, channels] of this.cryptoSubscriptions) {
            const subscription = channels.get(conversationId);
            if (!subscription)
                continue;
            const { deviceId, cohortId } = subscription;
            const socket = this.server.sockets.sockets.get(socketId);
            if (!socket?.connected) {
                this.cryptoSubscriptions.delete(socketId);
                continue;
            }
            try {
                const hint = await this.crypto.protocolWakeup(await this.validate(socket), deviceId, signal, cohortId);
                if (hint && socket.connected && this.cryptoSubscriptions.get(socketId)?.get(conversationId) === subscription)
                    socket.emit(contracts_1.SocketEventNames.CRYPTO_SYNC_AVAILABLE, hint);
            }
            catch {
                channels.delete(conversationId);
                if (!channels.size)
                    this.cryptoSubscriptions.delete(socketId);
            }
        }
    }
    async deliverNotice(id) {
        if (!this.notices)
            return;
        const recipient = await this.notices.recipient(id);
        if (!recipient)
            return;
        for (const socket of [...this.server.sockets.sockets.values()]) {
            if (!socket.connected || socket.data.fgPrivateUserId !== recipient || this.noticeSeen.get(socket.id)?.has(id))
                continue;
            try {
                const notice = await this.notices.realtimeNotice(await this.validate(socket), id);
                if (!notice || !socket.connected || this.noticeSeen.get(socket.id)?.has(id))
                    continue;
                const seen = this.noticeSeen.get(socket.id) ?? new Set();
                seen.add(id);
                if (seen.size > 256)
                    seen.delete(seen.values().next().value);
                this.noticeSeen.set(socket.id, seen);
                socket.emit(contracts_1.SocketEventNames.NOTIFICATION_CREATED, notice);
            }
            catch { }
        }
    }
    async deliver(id) {
        const encrypted = await this.crypto?.committedCiphertext(id);
        if (encrypted) {
            for (const [socketId, channels] of this.cryptoSubscriptions) {
                const subscription = channels.get(encrypted.conversationId);
                if (!subscription)
                    continue;
                const { deviceId, cohortId } = subscription;
                const socket = this.server.sockets.sockets.get(socketId);
                if (!socket?.connected) {
                    this.cryptoSubscriptions.delete(socketId);
                    continue;
                }
                try {
                    const message = await this.crypto.realtimeMessage(await this.validate(socket), deviceId, id, cohortId);
                    if (message && socket.connected && this.cryptoSubscriptions.get(socketId)?.get(message.conversationId) === subscription)
                        socket.emit(contracts_1.SocketEventNames.CRYPTO_MESSAGE_CREATED, message);
                }
                catch {
                    channels.delete(encrypted.conversationId);
                    if (!channels.size)
                        this.cryptoSubscriptions.delete(socketId);
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
        this.cryptoSubscriptions.clear();
        this.noticeSeen.clear();
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
__decorate([
    (0, websockets_1.SubscribeMessage)(contracts_1.SocketEventNames.CRYPTO_SUBSCRIBE),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "subscribeCrypto", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(contracts_1.SocketEventNames.CRYPTO_UNSUBSCRIBE),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RealtimeGateway.prototype, "unsubscribeCrypto", null);
exports.RealtimeGateway = RealtimeGateway = RealtimeGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ path: '/socket.io', maxHttpBufferSize: 16384, cors: { credentials: true, origin: (origin, done) => done(originAllowed(origin) ? null : new Error('Origin denied'), originAllowed(origin)) }, allowRequest: (request, done) => done(null, originAllowed(request.headers.origin)) }),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [chat_service_js_1.ChatService, crypto_relay_service_js_1.CryptoRelayService, private_notifications_service_js_1.PrivateNotificationsService])
], RealtimeGateway);
//# sourceMappingURL=realtime.gateway.js.map