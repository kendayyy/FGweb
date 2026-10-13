import { Controller, Get, Patch, Param, Query, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  ListGameOnlineUsersQuerySchema,
  ListOnlineUsersQuerySchema,
  UpdateCustomStatusRequestSchema,
  UpdateCustomStatusResponseSchema,
  ErrorCode,
} from '@fg/contracts';
import { PresenceService } from './presence.service.js';
import { ChatService, chatError } from '../chat/chat.service.js';
import { PresenceGateway } from './presence.gateway.js';

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

@Controller('api/v1')
export class PresenceController {
  constructor(
    private readonly presenceService: PresenceService,
    private readonly chatService: ChatService,
    private readonly presenceGateway: PresenceGateway
  ) {}

  @Get('games/:id/online')
  async getGameOnlineUsers(@Param('id') id: string, @Query() query: Record<string, unknown>) {
    const rawLimit = query.limit !== undefined ? Number(query.limit) : 50;
    const parsed = ListGameOnlineUsersQuerySchema.safeParse({
      limit: rawLimit,
      cursor: query.cursor !== undefined ? String(query.cursor) : undefined,
    });
    if (!parsed.success) {
      chatError(ErrorCode.INVALID_INPUT, 'Invalid query parameters');
    }
    return this.presenceService.getOnlineUsersForGame(id, parsed.data);
  }

  @Get('online-users')
  async getOnlineUsers(@Query() query: Record<string, unknown>) {
    const rawLimit = query.limit !== undefined ? Number(query.limit) : 50;
    const parsed = ListOnlineUsersQuerySchema.safeParse({
      gameTitle: query.gameTitle !== undefined ? String(query.gameTitle) : undefined,
      limit: rawLimit,
    });
    if (!parsed.success) {
      chatError(ErrorCode.INVALID_INPUT, 'Invalid query parameters');
    }
    return this.presenceService.getOnlineUsersAll(parsed.data);
  }

  @Patch('me/status')
  async updateCustomStatus(@Body() body: unknown, @Req() req: Request) {
    if (!originAllowed(req.headers.origin)) {
      chatError(ErrorCode.FORBIDDEN, 'Origin denied');
    }

    const actor = await this.chatService.actor(req.headers);
    if (!actor) {
      chatError(ErrorCode.LOGIN_REQUIRED, 'Login required');
    }

    const parsed = UpdateCustomStatusRequestSchema.safeParse(body);
    if (!parsed.success) {
      chatError(ErrorCode.INVALID_INPUT, 'Invalid status request');
    }

    const res = await this.presenceService.updateCustomStatus(actor, parsed.data.customStatus);
    await this.presenceGateway.broadcastStatusChange(actor.userId, res.customStatus);

    return UpdateCustomStatusResponseSchema.parse(res);
  }
}
