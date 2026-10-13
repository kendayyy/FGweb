import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class CsrfGuard implements CanActivate {
  public static validateRequestOrigin(request: Request): void {
    const method = request.method.toUpperCase();

    // Enforce CSRF origin checks for state-mutating HTTP requests
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return;
    }

    const origin = request.headers['origin'] as string | undefined;

    if (!origin || origin === 'null') {
      throw new ForbiddenException('CSRF origin header missing or invalid');
    }

    let requestOrigin: string;
    try {
      requestOrigin = new URL(origin).origin;
    } catch {
      throw new ForbiddenException('CSRF origin header malformed');
    }

    const canonicalPublicOrigin = process.env.PUBLIC_ORIGIN;
    const canonicalAuthOrigin = process.env.BETTER_AUTH_URL;

    const allowedOrigins = [canonicalPublicOrigin, canonicalAuthOrigin]
      .filter((val): val is string => Boolean(val))
      .map((urlStr) => {
        try {
          return new URL(urlStr).origin;
        } catch {
          return '';
        }
      })
      .filter(Boolean);

    if (allowedOrigins.length === 0) {
      throw new ForbiddenException('Canonical origin not configured on server');
    }

    const isAllowed = allowedOrigins.includes(requestOrigin);

    if (!isAllowed) {
      throw new ForbiddenException(`CSRF origin validation failed: ${requestOrigin} is not allowed`);
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    CsrfGuard.validateRequestOrigin(request);
    return true;
  }
}
