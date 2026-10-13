import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionGuard } from '../../common/session.guard.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { RequireAdminGuard } from './admin.guard.js';
import { RequireOnboardedGuard } from './onboarded.guard.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionGuard,
    CsrfGuard,
    RequireAdminGuard,
    RequireOnboardedGuard,
  ],
  exports: [
    AuthService,
    SessionGuard,
    CsrfGuard,
    RequireAdminGuard,
    RequireOnboardedGuard,
  ],
})
export class AuthModule implements NestModule {
  constructor(private readonly authService: AuthService) {}

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req: Request, res: Response) => {
        try {
          CsrfGuard.validateRequestOrigin(req);
        } catch (err: unknown) {
          const errorObj = err as { status?: number; message?: string };
          const status = errorObj.status || 403;
          res.status(status).json({
            statusCode: status,
            message: errorObj.message || 'CSRF origin validation failed',
          });
          return;
        }
        const handler = this.authService.getAuthHandler();
        return handler(req, res);
      })
      .forRoutes(
        { path: 'api/auth/*', method: RequestMethod.ALL },
        { path: 'api/auth', method: RequestMethod.ALL }
      );
  }
}
