import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { OnModuleDestroy, Logger, HttpException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  SocketPresenceSubscribeRequestSchema,
  SocketPresenceUnsubscribeRequestSchema,
  SocketPresenceHeartbeatRequestSchema,
  SocketPresenceAck,
  SocketEventNames,
  ErrorCode,
  SocketScopedPresenceChangedPayloadSchema,
  CustomStatus,
} from '@fg/contracts';
import { PresenceService } from './presence.service.js';
import { ChatService, chatError, ChatActor } from '../chat/chat.service.js';

function originAllowed(origin: unknown): boolean {
  if (typeof origin !== 'string') return false;
  return [process.env.PUBLIC_ORIGIN, process.env.BETTER_AUTH_URL]
    .filter(Boolean)
    .some((value) => {
      try {
        return new URL(value!).origin === origin;
      } catch {
        return false;
      }
    });
}

@WebSocketGateway({
  path: '/socket.io',
  namespace: '/presence',
  maxHttpBufferSize: 16384,
  cors: {
    credentials: true,
    origin: (origin: string | undefined, done: (error: Error | null, allow?: boolean) => void) =>
      done(originAllowed(origin) ? null : new Error('Origin denied'), originAllowed(origin)),
  },
  allowRequest: (request: IncomingMessage, done: (error: string | null, success: boolean) => void) =>
    done(null, originAllowed(request.headers.origin)),
})
export class PresenceGateway implements OnGatewayInit, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(PresenceGateway.name);
  private readonly operations = new Map<string, Promise<void>>();
  private readonly subscriptions = new Map<string, Set<string>>();
  private readonly socketActors = new Map<string, ChatActor>();
  private publisher?: Redis;
  private subscriber?: Redis;
  private opening?: Promise<void>;
  private closing = false;
  private readonly deliveries = new Set<Promise<void>>();

  private get channel(): string {
    return `fg:presence:${this.presenceService.ns}:pubsub`;
  }

  constructor(
    private readonly presenceService: PresenceService,
    private readonly chatService: ChatService
  ) {}

  afterInit(server: Server) {
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

  private async validate(socket: Socket): Promise<ChatActor> {
    if (!originAllowed(socket.handshake.headers.origin)) {
      chatError(ErrorCode.FORBIDDEN, 'Origin denied');
    }
    try {
      const actor = await this.chatService.actor(socket.handshake.headers);
      this.socketActors.set(socket.id, actor);
      return actor;
    } catch (error) {
      await this.releaseSocket(socket);
      throw error;
    }
  }

  private async openBus() {
    if (this.opening) return this.opening;
    this.opening = (async () => {
      if (!process.env.REDIS_URL) throw new Error('Redis URL required');
      const options = {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
      };
      this.publisher = new Redis(process.env.REDIS_URL, options);
      this.subscriber = new Redis(process.env.REDIS_URL, options);

      this.publisher.on('error', () => this.logger.warn('Presence pubsub publisher unavailable'));
      this.subscriber.on('error', () => this.logger.warn('Presence pubsub subscriber unavailable'));

      this.subscriber.on('message', (channel, message) => {
        if (channel !== this.channel || this.closing) return;
        const delivery = this.deliverPubsub(message).catch((err) =>
          this.logger.warn(`Presence pubsub delivery failed: ${err.message}`)
        );
        this.deliveries.add(delivery);
        void delivery.finally(() => this.deliveries.delete(delivery));
      });

      await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
      await this.subscriber.subscribe(this.channel);
    })();

    try {
      await this.opening;
    } catch (error) {
      this.publisher?.disconnect();
      this.subscriber?.disconnect();
      this.opening = undefined;
      throw error;
    }
  }

  private denied(error: unknown): SocketPresenceAck {
    const body = error instanceof HttpException ? error.getResponse() : null;
    const code =
      typeof body === 'object' && body !== null && 'code' in body
        ? (body.code as ErrorCode)
        : ErrorCode.FORBIDDEN;
    return {
      ok: false,
      error: {
        code,
        message: 'Presence access denied',
        requestId: randomUUID(),
      },
    };
  }

  @SubscribeMessage(SocketEventNames.PRESENCE_SUBSCRIBE)
  async subscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown
  ): Promise<SocketPresenceAck> {
    return this.serialize(socket, () => this.subscribeNow(socket, body)).catch(error => this.denied(error));
  }

  private async subscribeNow(socket: Socket, body: unknown): Promise<SocketPresenceAck> {
    try {
      const parsed = SocketPresenceSubscribeRequestSchema.safeParse(body);
      if (!parsed.success) {
        chatError(ErrorCode.INVALID_INPUT, 'Invalid presence subscription request');
      }

      const actor = await this.validate(socket);
      const convId = parsed.data.conversationId;

      const authorizedConvId = await this.chatService.authorize(convId, actor);

      const userConvs = this.subscriptions.get(socket.id) ?? new Set<string>();
      userConvs.add(authorizedConvId);
      this.subscriptions.set(socket.id, userConvs);

      socket.join(`presence:${authorizedConvId}`);

      if (actor) {
        const { isOnline, stateChanged } = await this.presenceService.addOrRenewLease(
          authorizedConvId,
          actor.userId,
          socket.id,
          actor
        );

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
    } catch (error) {
      return this.denied(error);
    }
  }

  @SubscribeMessage(SocketEventNames.PRESENCE_UNSUBSCRIBE)
  async unsubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown
  ): Promise<SocketPresenceAck> {
    return this.serialize(socket, () => this.unsubscribeNow(socket, body)).catch(error => this.denied(error));
  }

  private async unsubscribeNow(socket: Socket, body: unknown): Promise<SocketPresenceAck> {
    try {
      const parsed = SocketPresenceUnsubscribeRequestSchema.safeParse(body);
      if (!parsed.success) {
        chatError(ErrorCode.INVALID_INPUT, 'Invalid presence unsubscribe request');
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
        const { isOnline, stateChanged } = await this.presenceService.removeLease(
          authorizedConvId,
          actor.userId,
          socket.id
        );

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
    } catch (error) {
      return this.denied(error);
    }
  }

  @SubscribeMessage(SocketEventNames.PRESENCE_HEARTBEAT)
  async heartbeat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: unknown
  ): Promise<SocketPresenceAck> {
    return this.serialize(socket, () => this.heartbeatNow(socket, body)).catch(error => this.denied(error));
  }

  private async heartbeatNow(socket: Socket, body: unknown): Promise<SocketPresenceAck> {
    try {
      const parsed = SocketPresenceHeartbeatRequestSchema.safeParse(body);
      if (!parsed.success) {
        chatError(ErrorCode.INVALID_INPUT, 'Invalid presence heartbeat request');
      }

      const actor = await this.validate(socket);
      if (!actor) {
        chatError(ErrorCode.FORBIDDEN, 'Guests cannot send presence heartbeats');
      }

      const convId = parsed.data.conversationId;
      const userConvs = this.subscriptions.get(socket.id);

      if (!userConvs || !userConvs.has(convId)) {
        chatError(ErrorCode.FORBIDDEN, 'Socket is not subscribed to this conversation');
      }

      let authorizedConvId: string;
      try {
        authorizedConvId = await this.chatService.authorize(convId, actor);
      } catch (authError) {
        // Revoked session / banned / membership removed: remove socket's lease
        await this.releaseSubscription(socket, convId);
        throw authError;
      }

      const { isOnline, stateChanged } = await this.presenceService.addOrRenewLease(
        authorizedConvId,
        actor.userId,
        socket.id,
        actor
      );

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
    } catch (error) {
      return this.denied(error);
    }
  }

  private serialize<T>(socket: Socket, operation: () => Promise<T>, cleanup = false): Promise<T> {
    const previous = this.operations.get(socket.id) ?? Promise.resolve();
    const result = previous.then(() => {
      if (!cleanup && (this.closing || !socket.connected)) throw new Error('Socket closed');
      return operation();
    });
    const settled = result.then(() => undefined, () => undefined);
    this.operations.set(socket.id, settled);
    void settled.then(() => { if (this.operations.get(socket.id) === settled) this.operations.delete(socket.id); });
    return result;
  }

  private async releaseSubscription(socket: Socket, convId: string) {
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

  private async releaseSocket(socket: Socket) {
    for (const convId of [...(this.subscriptions.get(socket.id) ?? [])]) {
      await this.releaseSubscription(socket, convId);
    }
    this.socketActors.delete(socket.id);
    this.subscriptions.delete(socket.id);
  }

  async handleDisconnect(socket: Socket) {
    try {
      await this.serialize(socket, () => this.releaseSocket(socket), true);
    } catch {
      this.logger.warn('Presence disconnect cleanup unavailable; leases expire at TTL');
    }
  }

  async broadcastStatusChange(userId: string, customStatus: CustomStatus) {
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

  private async publishPresenceChange(event: {
    conversationId: string;
    userId: string;
    customStatus: string;
    isOnline: boolean;
  }) {
    if (this.closing) return;
    await this.openBus();
    await this.publisher!.publish(this.channel, JSON.stringify({ conversationId: event.conversationId, userId: event.userId }));
  }

  private async deliverPubsub(rawMessage: string) {
    let payload: { conversationId: string; userId: string; customStatus: string; isOnline: boolean };
    try {
      payload = JSON.parse(rawMessage);
    } catch {
      return;
    }

    if (typeof payload.conversationId !== 'string' || typeof payload.userId !== 'string') return;
    const customStatus = await this.presenceService.getCustomStatus(payload.userId);
    const isOnline = await this.presenceService.isUserOnlineInConv(payload.conversationId, payload.userId);
    const roomName = `presence:${payload.conversationId}`;
    const roomSockets = await this.server.in(roomName).fetchSockets();

    for (const socket of roomSockets) {
      try {
        const recipientActor = await this.validate(socket as unknown as Socket);
        await this.chatService.authorize(payload.conversationId, recipientActor);

        const validatedPayload = SocketScopedPresenceChangedPayloadSchema.parse({
          conversationId: payload.conversationId,
          userId: payload.userId,
          customStatus,
          isOnline,
        });

        socket.emit(SocketEventNames.PRESENCE_CHANGED, validatedPayload);
      } catch {
        // Recipient authorization failed (revoked, banned, expired) -> leave room & remove lease
        await this.releaseSubscription(socket as unknown as Socket, payload.conversationId);
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
}
