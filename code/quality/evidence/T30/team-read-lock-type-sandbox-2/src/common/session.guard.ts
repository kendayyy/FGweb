import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { AuthService } from '../modules/auth/auth.service.js';

export interface UserSessionPayload {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionPayload {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticatedRequest extends Request {
  user?: UserSessionPayload;
  session?: SessionPayload;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const headers = fromNodeHeaders(request.headers);

    const sessionData = await this.authService.getAuthInstance().api.getSession({
      headers,
      query: {
        disableCookieCache: true,
      },
    });

    if (!sessionData || !sessionData.user || !sessionData.session) {
      throw new UnauthorizedException('Session missing or invalid');
    }

    // Live banned-user enforcement
    const isBanned = await this.authService.isUserBanned(sessionData.user.id);
    if (isBanned) {
      throw new ForbiddenException('Account is banned');
    }

    request.user = sessionData.user;
    request.session = sessionData.session;

    return true;
  }
}
