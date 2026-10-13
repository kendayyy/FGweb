import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseFilters,
  Req,
  HttpCode,
} from '@nestjs/common';
import { SessionGuard, AuthenticatedRequest } from '../../common/session.guard.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { RequireOnboardedGuard } from '../auth/onboarded.guard.js';
import { SocialService } from './social.service.js';
import { SocialExceptionFilter } from './social.exception-filter.js';
import {
  ListFriendsQuerySchema,
  ListFriendRequestsQuerySchema,
  SendFriendRequestSchema,
  RespondFriendRequestSchema,
  CancelFriendRequestSchema,
  RemoveFriendSchema,
  ListDirectConversationsQuerySchema,
  CreateDirectConversationSchema,
  CreateBlockRequestSchema,
  ErrorCode,
} from '@fg/contracts';
import { socialError } from './social.service.js';

function normalizeQuery(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const res: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  if (res.limit !== undefined && res.limit !== null && res.limit !== '') {
    const num = Number(res.limit);
    if (!isNaN(num)) {
      res.limit = num;
    }
  }
  return res;
}

@Controller('api/v1')
@UseFilters(SocialExceptionFilter)
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Get('friends')
  @UseGuards(SessionGuard, RequireOnboardedGuard)
  async getFriends(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    const normalized = normalizeQuery(query);
    const parsed = ListFriendsQuerySchema.safeParse(normalized);
    if (!parsed.success) {
      socialError(ErrorCode.INVALID_INPUT, 'Invalid list friends query parameters');
    }
    return this.socialService.getFriends(req.user!.id, parsed.data);
  }

  @Get('friends/requests')
  @UseGuards(SessionGuard, RequireOnboardedGuard)
  async getFriendRequests(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    const normalized = normalizeQuery(query);
    const parsed = ListFriendRequestsQuerySchema.safeParse(normalized);
    if (!parsed.success) {
      socialError(ErrorCode.INVALID_INPUT, 'Invalid friend requests query parameters');
    }
    return this.socialService.getFriendRequests(req.user!.id, parsed.data);
  }

  @Post('friends/requests')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
  async sendFriendRequest(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = SendFriendRequestSchema.safeParse(body);
    if (!parsed.success) {
      socialError(ErrorCode.INVALID_INPUT, 'Invalid send friend request payload');
    }
    return this.socialService.sendFriendRequest(req.user!.id, req.session!.id, parsed.data.targetUserId);
  }

  @Patch('friends/requests/:id/respond')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
  async respondFriendRequest(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const parsed = RespondFriendRequestSchema.safeParse(body);
    if (!parsed.success) {
      socialError(ErrorCode.INVALID_INPUT, 'Invalid respond friend request payload');
    }
    return this.socialService.respondFriendRequest(req.user!.id, req.session!.id, id, parsed.data.action);
  }

  @Delete('friends/:userId')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
  async removeFriend(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: unknown
  ) {
    if (body && typeof body === 'object' && Object.keys(body).length > 0) {
      const parsed = RemoveFriendSchema.safeParse(body);
      if (!parsed.success) {
        socialError(ErrorCode.INVALID_INPUT, 'Invalid remove friend payload');
      }
    }
    return this.socialService.removeFriend(req.user!.id, req.session!.id, userId);
  }

  @Delete('friends/requests/:id/cancel')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
  async cancelFriendRequest(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    if (body && typeof body === 'object' && Object.keys(body).length > 0) {
      const parsed = CancelFriendRequestSchema.safeParse(body);
      if (!parsed.success) {
        socialError(ErrorCode.INVALID_INPUT, 'Invalid cancel friend request payload');
      }
    }
    return this.socialService.cancelFriendRequest(req.user!.id, req.session!.id, id);
  }

  @Get('direct-conversations')
  @UseGuards(SessionGuard, RequireOnboardedGuard)
  async getDirectConversations(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    const normalized = normalizeQuery(query);
    const parsed = ListDirectConversationsQuerySchema.safeParse(normalized);
    if (!parsed.success) {
      socialError(ErrorCode.INVALID_INPUT, 'Invalid direct conversations query parameters');
    }
    return this.socialService.getDirectConversations(req.user!.id, parsed.data);
  }

  @Post('direct-conversations')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
  async createDirectConversation(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = CreateDirectConversationSchema.safeParse(body);
    if (!parsed.success) {
      socialError(ErrorCode.INVALID_INPUT, 'Invalid create direct conversation payload');
    }
    return this.socialService.createDirectConversation(req.user!.id, req.session!.id, parsed.data.recipientUserId);
  }

  @Get('blocks')
  @UseGuards(SessionGuard, RequireOnboardedGuard)
  async getBlocks(@Req() req: AuthenticatedRequest) {
    return this.socialService.getBlocks(req.user!.id);
  }

  @Post('blocks')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
  async createBlock(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = CreateBlockRequestSchema.safeParse(body);
    if (!parsed.success) {
      socialError(ErrorCode.INVALID_INPUT, 'Invalid create block payload');
    }
    return this.socialService.createBlock(req.user!.id, req.session!.id, parsed.data.blockedId);
  }

  @Delete('blocks/:userId')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
  async deleteBlock(@Req() req: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.socialService.deleteBlock(req.user!.id, req.session!.id, userId);
  }
}
