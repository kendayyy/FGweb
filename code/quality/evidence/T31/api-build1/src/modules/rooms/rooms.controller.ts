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
import { RoomsService } from './rooms.service.js';
import { RoomsExceptionFilter } from './rooms.exception-filter.js';
import {
  CreateRoomRequestSchema,
  UpdateRoomSettingsRequestSchema,
  UpdateHelperPermissionsRequestSchema,
  TransferRoomOwnerSchema,
  ListOwnRoomsQuerySchema,
  ErrorCode,
} from '@fg/contracts';
import { roomError } from './rooms.service.js';

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
@UseFilters(RoomsExceptionFilter)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get('rooms')
  @UseGuards(SessionGuard, RequireOnboardedGuard)
  async listRooms(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    const normalized = normalizeQuery(query);
    const parsed = ListOwnRoomsQuerySchema.safeParse(normalized);
    if (!parsed.success) {
      roomError(ErrorCode.INVALID_INPUT, 'Invalid list rooms query parameters');
    }
    return this.roomsService.listOwnRooms(req.user!.id, req.session!.id, parsed.data);
  }

  @Get('rooms/own')
  @UseGuards(SessionGuard, RequireOnboardedGuard)
  async listOwnRooms(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    const normalized = normalizeQuery(query);
    const parsed = ListOwnRoomsQuerySchema.safeParse(normalized);
    if (!parsed.success) {
      roomError(ErrorCode.INVALID_INPUT, 'Invalid list own rooms query parameters');
    }
    return this.roomsService.listOwnRooms(req.user!.id, req.session!.id, parsed.data);
  }

  @Post('rooms')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
  async createRoom(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = CreateRoomRequestSchema.safeParse(body);
    if (!parsed.success) {
      roomError(ErrorCode.INVALID_INPUT, 'Invalid create room payload');
    }
    return this.roomsService.createRoom(req.user!.id, req.session!.id, parsed.data);
  }

  @Get('rooms/:id')
  @UseGuards(SessionGuard, RequireOnboardedGuard)
  async getRoomDetail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.roomsService.getRoomDetail(req.user!.id, req.session!.id, id);
  }

  @Get('rooms/:id/members')
  @UseGuards(SessionGuard, RequireOnboardedGuard)
  async listRoomMembers(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.roomsService.listRoomMembers(req.user!.id, req.session!.id, id);
  }

  @Patch('rooms/:id/settings')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
  async updateRoomSettings(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const parsed = UpdateRoomSettingsRequestSchema.safeParse(body);
    if (!parsed.success) {
      roomError(ErrorCode.INVALID_INPUT, 'Invalid update room settings payload');
    }
    return this.roomsService.updateSettings(req.user!.id, req.session!.id, id, parsed.data);
  }

  @Patch('rooms/:id/helpers/:userId')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
  async updateHelperPermissions(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body() body: unknown
  ) {
    const parsed = UpdateHelperPermissionsRequestSchema.safeParse(body);
    if (!parsed.success) {
      roomError(ErrorCode.INVALID_INPUT, 'Invalid update helper permissions payload');
    }
    return this.roomsService.updateHelperPermissions(req.user!.id, req.session!.id, id, targetUserId, parsed.data);
  }

  @Post('rooms/:id/transfer-owner')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
  async transferOwner(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const parsed = TransferRoomOwnerSchema.safeParse(body);
    if (!parsed.success) {
      roomError(ErrorCode.INVALID_INPUT, 'Invalid transfer room owner payload');
    }
    return this.roomsService.transferOwner(req.user!.id, req.session!.id, id, parsed.data);
  }

  @Delete('rooms/:id/members/:userId')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
  async leaveOrRemoveMember(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('userId') targetUserId: string
  ) {
    return this.roomsService.leaveOrRemoveMember(req.user!.id, req.session!.id, id, targetUserId);
  }

  @Delete('rooms/:id')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard, RequireOnboardedGuard)
  async dissolveRoom(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.roomsService.dissolveRoom(req.user!.id, req.session!.id, id);
  }
}
