import { Controller, Get, Post, Param, Query, Body, Req, UseFilters, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ListMessagesQuerySchema, LobbyMessagesQuerySchema, CreateMessageRequestSchema, ErrorCode } from '@fg/contracts';
import { ChatService, chatError } from './chat.service.js';
import { ChatExceptionFilter } from './chat.exception-filter.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { SessionGuard } from '../../common/session.guard.js';
import { RequireOnboardedGuard } from '../auth/onboarded.guard.js';
const normalize = (query: Record<string, unknown>) => ({ ...query, ...(query.limit !== undefined ? { limit: Number(query.limit) } : {}) });
@Controller('api/v1')
@UseFilters(ChatExceptionFilter)
export class ChatController {
    constructor(private readonly chat: ChatService) { }
    @Get('games/:gameId/lobby/messages')
    async game(
    @Param('gameId')
    id: string, 
    @Query()
    query: Record<string, unknown>, 
    @Req()
    request: Request) { const parsed = ListMessagesQuerySchema.strict().safeParse(normalize(query)); if (!parsed.success)
        chatError(ErrorCode.INVALID_INPUT, 'Invalid history query'); return this.chat.history(await this.chat.lobby(id), parsed.data, await this.chat.actor(request.headers)); }
    @Get('lobby/messages')
    async title(
    @Query()
    query: Record<string, unknown>, 
    @Req()
    request: Request) { const parsed = LobbyMessagesQuerySchema.strict().safeParse(normalize(query)); if (!parsed.success)
        chatError(ErrorCode.INVALID_INPUT, 'Invalid Lobby query'); return this.chat.history(await this.chat.lobbyTitle(parsed.data.gameTitle), parsed.data, await this.chat.actor(request.headers)); }
    @Get('conversations/:id/messages')
    async history(
    @Param('id')
    id: string, 
    @Query()
    query: Record<string, unknown>, 
    @Req()
    request: Request) { const actor = await this.chat.actor(request.headers); if (!actor) {
        const conversation = await this.chat.conversation(id);
        if (conversation.kind !== 'LOBBY')
            chatError(ErrorCode.LOGIN_REQUIRED, 'Login required');
    } const parsed = ListMessagesQuerySchema.strict().safeParse(normalize(query)); if (!parsed.success)
        chatError(ErrorCode.INVALID_INPUT, 'Invalid history query'); return this.chat.history(id, parsed.data, actor); }
    @Post('conversations/:id/messages')
    @UseGuards(CsrfGuard, SessionGuard, RequireOnboardedGuard)
    async create(
    @Param('id')
    id: string, 
    @Body()
    body: unknown, 
    @Req()
    request: Request) { const actor = await this.chat.actor(request.headers); if (!actor)
        chatError(ErrorCode.LOGIN_REQUIRED, 'Login required'); const parsed = CreateMessageRequestSchema.safeParse(body); if (!parsed.success)
        chatError(ErrorCode.INVALID_INPUT, 'Invalid message'); return this.chat.create(id, parsed.data, actor); }
}
