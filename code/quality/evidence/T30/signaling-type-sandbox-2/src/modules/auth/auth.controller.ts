import { Controller, Get, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { SessionGuard, AuthenticatedRequest } from '../../common/session.guard.js';
import { AuthService } from './auth.service.js';
import { MeDTO } from '@fg/contracts';

@Controller('api/v1')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(SessionGuard)
  async getMe(@Req() req: AuthenticatedRequest): Promise<MeDTO> {
    if (!req.user) {
      throw new UnauthorizedException('Session user missing');
    }
    return this.authService.getUserMe(req.user.id);
  }
}
