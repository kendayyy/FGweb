import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/session.guard.js';
import { AuthService } from './auth.service.js';

@Injectable()
export class RequireOnboardedGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new UnauthorizedException('Session required');
    }

    const isOnboarded = await this.authService.isUserOnboarded(request.user.id);

    if (!isOnboarded) {
      throw new ForbiddenException('Onboarding profile completion required');
    }

    return true;
  }
}
