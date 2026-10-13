import {
  Controller,
  Get,
  Patch,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  UseFilters,
  Req,
  HttpCode,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SessionGuard, AuthenticatedRequest } from '../../common/session.guard.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { ProfilesService } from './profiles.service.js';
import { ProfilesExceptionFilter } from './profiles.exception-filter.js';
import {
  ListGamesQuerySchema,
  UpdateProfileRequestSchema,
  OnboardingRequestSchema,
  UpdateInterestsRequestSchema,
  UpdateGameProfileRequestSchema,
} from '@fg/contracts';

@Controller('api/v1')
@UseFilters(ProfilesExceptionFilter)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('users/:id/profile')
  async getPublicProfile(@Param('id') id: string) {
    return this.profilesService.getPublicProfile(id);
  }

  @Get('games')
  async getGames(@Query() query: unknown) {
    const parsed = ListGamesQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new UnprocessableEntityException('Invalid query parameters');
    }
    return this.profilesService.getGames(parsed.data.search);
  }

  @Patch('me/profile')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard)
  async updateProfile(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = UpdateProfileRequestSchema.strict().safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException('Invalid profile payload');
    }
    return this.profilesService.updateProfile(req.user!.id, parsed.data, req.user!.image);
  }

  @Post('me/onboarding')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard)
  async onboarding(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = OnboardingRequestSchema.strict().safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException('Invalid onboarding payload');
    }
    return this.profilesService.onboarding(req.user!.id, parsed.data, req.user!.image);
  }

  @Put('me/interests')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard)
  async updateInterests(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = UpdateInterestsRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException('Invalid interests payload');
    }
    return this.profilesService.updateInterests(req.user!.id, parsed.data);
  }

  @Put('me/game-profiles/:gameId')
  @HttpCode(200)
  @UseGuards(SessionGuard, CsrfGuard)
  async updateGameProfile(
    @Req() req: AuthenticatedRequest,
    @Param('gameId') gameId: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateGameProfileRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException('Invalid game profile payload');
    }
    return this.profilesService.updateGameProfile(req.user!.id, gameId, parsed.data);
  }
}
