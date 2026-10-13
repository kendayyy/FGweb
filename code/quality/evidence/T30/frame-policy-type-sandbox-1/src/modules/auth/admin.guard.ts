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
export class RequireAdminGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new UnauthorizedException('Session required for admin access');
    }

    const isAdmin = await this.authService.isUserAdmin(request.user.id);

    if (!isAdmin) {
      throw new ForbiddenException('Admin role required');
    }

    return true;
  }
}
