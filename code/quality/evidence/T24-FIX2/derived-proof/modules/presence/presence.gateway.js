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
var PresenceGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PresenceGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const socket_io_1 = require("socket.io");
const ioredis_1 = require("ioredis");
const node_crypto_1 = require("node:crypto");
const contracts_1 = require("@fg/contracts");
const presence_service_js_1 = require("./presence.service.js");
const chat_service_js_1 = require("../chat/chat.service.js");
function originAllowed(origin) {
    if (typeof origin !== 'string')
        return false;
    return [process.env.PUBLIC_ORIGIN, process.env.BETTER_AUTH_URL]
        .filter(Boolean)
        .some((value) => {
        try {
            return new URL(value).origin === origin;
        }
        catch {
            return false;
        }
    });
}
let PresenceGateway = PresenceGateway_1 = class PresenceGateway {
    presenceService;
    chatService;
    server;
    logger = new common_1.Logger(PresenceGateway_1.name);
    operations = new Map();
    subscriptions = new Map();
    socketActors = new Map();
    publisher;
    subscriber;
    opening;
    closing = false;
    deliveries = new Set();
    get channel() {
        return `fg:presence:${this.presenceService.ns}:pubsub`;
    }
    constructor(presenceService, chatService) {
        this.presenceService = presenceService;
        this.chatService = chatService;
    }
    afterInit(server) {
        server.use((socket, next) => {
            void this.validate(socket)
                .then(() => this.openBus())
                .then(() => next())
                .catch(() => next(new Error('Socket access denied')));
        });
        this.presenceService.setPubsubCallback(async (event) => {
            const customStatus = await this.presenceService.getCustomStatus(event.userId);
            await this.publishPresenceChange({
                conversationId: event.conversationId,
                userId: event.userId,
                customStatus,
                isOnline: event.isOnline,
            });
        });
    }
    async validate(socket) {
        if (!originAllowed(socket.handshake.headers.origin)) {
            (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Origin denied');
        }
        try {
            const actor = await this.chatService.actor(socket.handshake.headers);
            this.socketActors.set(socket.id, actor);
            return actor;
        }
        catch (error) {
            await this.releaseSocket(socket);
            throw error;
        }
    }
    async openBus() {
        if (this.opening)
            return this.opening;
        this.opening = (async () => {
            if (!process.env.REDIS_URL)
                throw new Error('Redis URL required');
            const options = {
                lazyConnect: true,
                maxRetriesPerRequest: 1,
                connectTimeout: 3000,
            };
            this.publisher = new ioredis_1.Redis(process.env.REDIS_URL, options);
            this.subscriber = new ioredis_1.Redis(process.env.REDIS_URL, options);
            this.publisher.on('error', () => this.logger.warn('Presence pubsub publisher unavailable'));
            this.subscriber.on('error', () => this.logger.warn('Presence pubsub subscriber unavailable'));
            this.subscriber.on('message', (channel, message) => {
                if (channel !== this.channel || this.closing)
                    return;
                const delivery = this.deliverPubsub(message).catch((err) => this.logger.warn(`Presence pubsub delivery failed: ${err.message}`));
                this.deliveries.add(delivery);
                void delivery.finally(() => this.deliveries.delete(delivery));
            });
            await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
            await this.subscriber.subscribe(this.channel);
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
    denied(error) {
        const body = error instanceof common_1.HttpException ? error.getResponse() : null;
        const code = typeof body === 'object' && body !== null && 'code' in body
            ? body.code
            : contracts_1.ErrorCode.FORBIDDEN;
        return {
            ok: false,
            error: {
                code,
                message: 'Presence access denied',
                requestId: (0, node_crypto_1.randomUUID)(),
            },
        };
    }
    async subscribe(socket, body) {
        return this.serialize(socket, () => this.subscribeNow(socket, body)).catch(error => this.denied(error));
    }
    async subscribeNow(socket, body) {
        try {
            const parsed = contracts_1.SocketPresenceSubscribeRequestSchema.safeParse(body);
            if (!parsed.success) {
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid presence subscription request');
            }
            const actor = await this.validate(socket);
            const convId = parsed.data.conversationId;
            const authorizedConvId = await this.chatService.authorize(convId, actor);
            const userConvs = this.subscriptions.get(socket.id) ?? new Set();
            userConvs.add(authorizedConvId);
            this.subscriptions.set(socket.id, userConvs);
            socket.join(`presence:${authorizedConvId}`);
            if (actor) {
                const { isOnline, stateChanged } = await this.presenceService.addOrRenewLease(authorizedConvId, actor.userId, socket.id, actor);
                if (stateChanged) {
                    const customStatus = await this.presenceService.getCustomStatus(actor.userId);
                    await this.publishPresenceChange({
                        conversationId: authorizedConvId,
                        userId: actor.userId,
                        customStatus,
                        isOnline,
                    });
                }
            }
            return { ok: true, conversationId: authorizedConvId };
        }
        catch (error) {
            return this.denied(error);
        }
    }
    async unsubscribe(socket, body) {
        return this.serialize(socket, () => this.unsubscribeNow(socket, body)).catch(error => this.denied(error));
    }
    async unsubscribeNow(socket, body) {
        try {
            const parsed = contracts_1.SocketPresenceUnsubscribeRequestSchema.safeParse(body);
            if (!parsed.success) {
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid presence unsubscribe request');
            }
            const actor = await this.validate(socket);
            const convId = parsed.data.conversationId;
            const authorizedConvId = await this.chatService.authorize(convId, actor);
            const userConvs = this.subscriptions.get(socket.id);
            if (userConvs) {
                userConvs.delete(authorizedConvId);
                if (!userConvs.size) {
                    this.subscriptions.delete(socket.id);
                }
            }
            socket.leave(`presence:${authorizedConvId}`);
            if (actor) {
                const { isOnline, stateChanged } = await this.presenceService.removeLease(authorizedConvId, actor.userId, socket.id);
                if (stateChanged) {
                    const customStatus = await this.presenceService.getCustomStatus(actor.userId);
                    await this.publishPresenceChange({
                        conversationId: authorizedConvId,
                        userId: actor.userId,
                        customStatus,
                        isOnline,
                    });
                }
            }
            return { ok: true, conversationId: authorizedConvId };
        }
        catch (error) {
            return this.denied(error);
        }
    }
    async heartbeat(socket, body) {
        return this.serialize(socket, () => this.heartbeatNow(socket, body)).catch(error => this.denied(error));
    }
    async heartbeatNow(socket, body) {
        try {
            const parsed = contracts_1.SocketPresenceHeartbeatRequestSchema.safeParse(body);
            if (!parsed.success) {
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.INVALID_INPUT, 'Invalid presence heartbeat request');
            }
            const actor = await this.validate(socket);
            if (!actor) {
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Guests cannot send presence heartbeats');
            }
            const convId = parsed.data.conversationId;
            const userConvs = this.subscriptions.get(socket.id);
            if (!userConvs || !userConvs.has(convId)) {
                (0, chat_service_js_1.chatError)(contracts_1.ErrorCode.FORBIDDEN, 'Socket is not subscribed to this conversation');
            }
            let authorizedConvId;
            try {
                authorizedConvId = await this.chatService.authorize(convId, actor);
            }
            catch (authError) {
                await this.releaseSubscription(socket, convId);
                throw authError;
            }
            const { isOnline, stateChanged } = await this.presenceService.addOrRenewLease(authorizedConvId, actor.userId, socket.id, actor);
            if (stateChanged) {
                const customStatus = await this.presenceService.getCustomStatus(actor.userId);
                await this.publishPresenceChange({
                    conversationId: authorizedConvId,
                    userId: actor.userId,
                    customStatus,
                    isOnline,
                });
            }
            return { ok: true, conversationId: authorizedConvId };
        }
        catch (error) {
            return this.denied(error);
        }
    }
    serialize(socket, operation, cleanup = false) {
        const previous = this.operations.get(socket.id) ?? Promise.resolve();
        const result = previous.then(() => {
            if (!cleanup && (this.closing || !socket.connected))
                throw new Error('Socket closed');
            return operation();
        });
        const settled = result.then(() => undefined, () => undefined);
        this.operations.set(socket.id, settled);
        void settled.then(() => { if (this.operations.get(socket.id) === settled)
            this.operations.delete(socket.id); });
        return result;
    }
    async releaseSubscription(socket, convId) {
        const actor = this.socketActors.get(socket.id);
        if (actor) {
            const result = await this.presenceService.removeLease(convId, actor.userId, socket.id);
            if (result.stateChanged) {
                await this.publishPresenceChange({
                    conversationId: convId, userId: actor.userId,
                    customStatus: await this.presenceService.getCustomStatus(actor.userId),
                    isOnline: result.isOnline,
                });
            }
        }
        await socket.leave(`presence:${convId}`);
        this.subscriptions.get(socket.id)?.delete(convId);
    }
    async releaseSocket(socket) {
        for (const convId of [...(this.subscriptions.get(socket.id) ?? [])]) {
            await this.releaseSubscription(socket, convId);
        }
        this.socketActors.delete(socket.id);
        this.subscriptions.delete(socket.id);
    }
    async handleDisconnect(socket) {
        try {
            await this.serialize(socket, () => this.releaseSocket(socket), true);
        }
        catch {
            this.logger.warn('Presence disconnect cleanup unavailable; leases expire at TTL');
        }
    }
    async broadcastStatusChange(userId, customStatus) {
        const activeConvs = await this.presenceService.getUserActiveConversations(userId);
        const isOnline = await this.presenceService.isUserOnlineAnywhere(userId);
        for (const convId of activeConvs) {
            await this.publishPresenceChange({
                conversationId: convId,
                userId,
                customStatus,
                isOnline,
            });
        }
    }
    async publishPresenceChange(event) {
        if (this.closing)
            return;
        await this.openBus();
        await this.publisher.publish(this.channel, JSON.stringify({ conversationId: event.conversationId, userId: event.userId }));
    }
    async deliverPubsub(rawMessage) {
        let payload;
        try {
            payload = JSON.parse(rawMessage);
        }
        catch {
            return;
        }
        if (typeof payload.conversationId !== 'string' || typeof payload.userId !== 'string')
            return;
        const customStatus = await this.presenceService.getCustomStatus(payload.userId);
        const isOnline = await this.presenceService.isUserOnlineInConv(payload.conversationId, payload.userId);
        const roomName = `presence:${payload.conversationId}`;
        const roomSockets = await this.server.in(roomName).fetchSockets();
        for (const socket of roomSockets) {
            try {
                const recipientActor = await this.validate(socket);
                await this.chatService.authorize(payload.conversationId, recipientActor);
                const validatedPayload = contracts_1.SocketScopedPresenceChangedPayloadSchema.parse({
                    conversationId: payload.conversationId,
                    userId: payload.userId,
                    customStatus,
                    isOnline,
                });
                socket.emit(contracts_1.SocketEventNames.PRESENCE_CHANGED, validatedPayload);
            }
            catch {
                await this.releaseSubscription(socket, payload.conversationId);
            }
        }
    }
    async onModuleDestroy() {
        this.closing = true;
        await Promise.all([...this.operations.values()]);
        await Promise.all([...this.deliveries]);
        this.publisher?.disconnect();
        this.subscriber?.disconnect();
        this.subscriptions.clear();
        this.socketActors.clear();
    }
};
exports.PresenceGateway = PresenceGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], PresenceGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)(contracts_1.SocketEventNames.PRESENCE_SUBSCRIBE),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PresenceGateway.prototype, "subscribe", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(contracts_1.SocketEventNames.PRESENCE_UNSUBSCRIBE),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PresenceGateway.prototype, "unsubscribe", null);
__decorate([
    (0, websockets_1.SubscribeMessage)(contracts_1.SocketEventNames.PRESENCE_HEARTBEAT),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], PresenceGateway.prototype, "heartbeat", null);
exports.PresenceGateway = PresenceGateway = PresenceGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        path: '/socket.io',
        namespace: '/presence',
        maxHttpBufferSize: 16384,
        cors: {
            credentials: true,
            origin: (origin, done) => done(originAllowed(origin) ? null : new Error('Origin denied'), originAllowed(origin)),
        },
        allowRequest: (request, done) => done(null, originAllowed(request.headers.origin)),
    }),
    __metadata("design:paramtypes", [presence_service_js_1.PresenceService,
        chat_service_js_1.ChatService])
], PresenceGateway);
//# sourceMappingURL=presence.gateway.js.map